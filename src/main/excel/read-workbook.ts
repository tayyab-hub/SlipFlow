import { readFile, stat } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { basename, extname } from 'node:path'
import * as XLSX from 'xlsx'
import { detectColumns } from './detect-columns'

/** Extensions the upload flow accepts. */
export const SUPPORTED_EXTENSIONS = ['.xlsx', '.xls', '.csv'] as const

export class SpreadsheetReadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SpreadsheetReadError'
  }
}

export interface SpreadsheetContents {
  fileName: string
  filePath: string
  fileSize: number
  /** sha256 of the file bytes — identifies a byte-identical re-upload. */
  fileHash: string
  sheetName: string
  /** Every sheet in the workbook, so the UI can say which one was used. */
  sheetNames: string[]
  /** Raw header row, exactly as written in the file. */
  headers: string[]
  /** Data rows below the header, fully blank rows removed. */
  rows: string[][]
  rowNumbers: number[]
  blankRowsSkipped: number
}

/**
 * How far down to look for the header row. Marketplace exports sometimes put a title or
 * a "generated on …" note above it.
 */
const HEADER_SEARCH_DEPTH = 10
export const MAX_FILE_BYTES = 20 * 1024 * 1024
export const MAX_ROWS = 50_000
const MAX_COLUMNS = 150

function isBlank(value: unknown): boolean {
  return value === null || value === undefined || String(value).trim() === ''
}

function countFilled(row: readonly unknown[]): number {
  return row.reduce<number>((total, cell) => (isBlank(cell) ? total : total + 1), 0)
}

/**
 * Picks the sheet that actually holds the orders: the one with the most rows. A workbook
 * whose first sheet is a cover page or summary would otherwise parse as empty.
 */
function chooseSheet(workbook: XLSX.WorkBook): string {
  let best = ''
  let bestRows = -1

  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name]
    if (!sheet) continue

    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      blankrows: false,
      defval: ''
    })
    if (rows.length > bestRows) {
      best = name
      bestRows = rows.length
    }
  }

  return best
}

/**
 * Finds the header row: within the first few rows, the one with the most filled cells.
 * Ties go to the earliest row.
 */
function findHeaderRow(rows: readonly unknown[][]): number {
  let bestIndex = 0
  let bestCount = -1

  for (let index = 0; index < Math.min(rows.length, HEADER_SEARCH_DEPTH); index += 1) {
    if (detectColumns((rows[index] ?? []).map((c) => String(c ?? '').trim())).ok) return index
    const count = countFilled(rows[index] ?? [])
    if (count > bestCount) {
      bestIndex = index
      bestCount = count
    }
  }

  return bestCount <= 0 ? -1 : bestIndex
}

/**
 * Reads a spreadsheet into a header row plus data rows.
 *
 * Everything here treats the file as untrusted (CLAUDE.md §5.10): failures raise
 * `SpreadsheetReadError` with a message fit to show an operator, and nothing is written to
 * the database from this module.
 */
export async function readSpreadsheet(
  filePath: string,
  selectedSheet?: string
): Promise<SpreadsheetContents> {
  const fileName = basename(filePath)
  const extension = extname(filePath).toLowerCase()

  if (!SUPPORTED_EXTENSIONS.includes(extension as (typeof SUPPORTED_EXTENSIONS)[number])) {
    throw new SpreadsheetReadError(
      `"${fileName}" is a ${extension || 'file with no'} extension. StitchFlow reads .xlsx, .xls and .csv files.`
    )
  }

  let bytes: Buffer
  let fileSize: number
  try {
    const info = await stat(filePath)
    if (!info.isFile() || info.size > MAX_FILE_BYTES)
      throw new SpreadsheetReadError('Choose a regular file smaller than 20 MiB.')
    fileSize = info.size
    bytes = await readFile(filePath)
    if (bytes.length > MAX_FILE_BYTES)
      throw new SpreadsheetReadError('File exceeds the 20 MiB limit.')
  } catch (error) {
    if (error instanceof SpreadsheetReadError) throw error
    throw new SpreadsheetReadError(
      `"${fileName}" could not be opened. It may have been moved or is in use.`
    )
  }

  if (bytes.length === 0) {
    throw new SpreadsheetReadError(`"${fileName}" is empty.`)
  }
  if (extension === '.xlsx') validateZipBudget(bytes)

  let workbook: XLSX.WorkBook
  try {
    workbook = XLSX.read(bytes, {
      type: 'buffer',
      cellDates: false,
      raw: true,
      sheetRows: MAX_ROWS + 12,
      cellFormula: true
    })
  } catch {
    throw new SpreadsheetReadError(
      `"${fileName}" could not be read as a spreadsheet. It may be corrupted or password protected.`
    )
  }

  if (workbook.SheetNames.length === 0) {
    throw new SpreadsheetReadError(`"${fileName}" has no sheets in it.`)
  }
  if (workbook.SheetNames.length > 25)
    throw new SpreadsheetReadError('At most 25 worksheets are supported.')
  for (const name of workbook.SheetNames) {
    const candidate = workbook.Sheets[name]
    const range = XLSX.utils.decode_range(candidate?.['!fullref'] ?? candidate?.['!ref'] ?? 'A1')
    if (range.e.r >= MAX_ROWS + 10 || range.e.c >= MAX_COLUMNS)
      throw new SpreadsheetReadError(
        'Worksheet exceeds 50,000 rows or 150 columns. Split the export first.'
      )
    for (const [address, cell] of Object.entries(candidate ?? {})) {
      if (!address.startsWith('!') && cell && typeof cell === 'object' && 'f' in cell)
        throw new SpreadsheetReadError(
          'Formula cells are not accepted. Export values only and try again.'
        )
    }
  }

  const sheetName = selectedSheet ?? chooseSheet(workbook)
  const sheet = sheetName ? workbook.Sheets[sheetName] : undefined
  if (!sheet) {
    throw new SpreadsheetReadError(`"${fileName}" has no readable sheet.`)
  }

  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    blankrows: true,
    defval: ''
  })

  const headerIndex = findHeaderRow(grid)
  if (headerIndex < 0) {
    throw new SpreadsheetReadError(
      `"${fileName}" has no column headings, so StitchFlow cannot tell what the columns mean.`
    )
  }

  const headers = (grid[headerIndex] ?? []).map((cell) => String(cell ?? '').trim())
  const namedHeaders = headers.filter(Boolean).map((h) => h.toLowerCase())
  if (new Set(namedHeaders).size !== namedHeaders.length)
    throw new SpreadsheetReadError(
      'Duplicate column headings are ambiguous. Give every column a unique heading.'
    )

  const dataRows: string[][] = []
  const rowNumbers: number[] = []
  let blankRowsSkipped = 0

  for (let index = headerIndex + 1; index < grid.length; index += 1) {
    const row = grid[index] ?? []
    if (countFilled(row) === 0) {
      blankRowsSkipped += 1
      continue
    }
    // Normalise every row to the header width so column indexes are always valid.
    if (row.some((cell) => String(cell ?? '').length > 2000))
      throw new SpreadsheetReadError('A cell exceeds the 2,000 character limit.')
    rowNumbers.push(index + 1)
    dataRows.push(
      Array.from({ length: headers.length }, (_, column) => String(row[column] ?? '').trim())
    )
  }

  return {
    fileName,
    filePath,
    fileSize,
    fileHash: createHash('sha256').update(bytes).digest('hex'),
    sheetName,
    sheetNames: [...workbook.SheetNames],
    headers,
    rows: dataRows,
    rowNumbers,
    blankRowsSkipped
  }
}

/** Bound declared expanded XLSX content before SheetJS decompresses it. ZIP64 is intentionally unsupported. */
function validateZipBudget(bytes: Buffer): void {
  let end = -1
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (bytes.readUInt32LE(i) === 0x06054b50) {
      end = i
      break
    }
  }
  if (end < 0) throw new SpreadsheetReadError('This XLSX file is not a valid ZIP workbook.')
  const count = bytes.readUInt16LE(end + 10),
    start = bytes.readUInt32LE(end + 16)
  if (count === 65535 || count > 3000 || start >= bytes.length)
    throw new SpreadsheetReadError('Workbook archive exceeds supported limits.')
  let offset = start,
    expanded = 0
  for (let i = 0; i < count; i++) {
    if (offset + 46 > bytes.length || bytes.readUInt32LE(offset) !== 0x02014b50)
      throw new SpreadsheetReadError('Workbook archive directory is malformed.')
    expanded += bytes.readUInt32LE(offset + 24)
    if (expanded > 100 * 1024 * 1024)
      throw new SpreadsheetReadError('Expanded workbook exceeds 100 MiB. Split the export first.')
    offset +=
      46 +
      bytes.readUInt16LE(offset + 28) +
      bytes.readUInt16LE(offset + 30) +
      bytes.readUInt16LE(offset + 32)
  }
}
