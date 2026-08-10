import { readFile, stat } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { basename, extname } from 'node:path'
import * as XLSX from 'xlsx'

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
  blankRowsSkipped: number
}

/**
 * How far down to look for the header row. Marketplace exports sometimes put a title or
 * a "generated on …" note above it.
 */
const HEADER_SEARCH_DEPTH = 10

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
export async function readSpreadsheet(filePath: string): Promise<SpreadsheetContents> {
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
    bytes = await readFile(filePath)
    fileSize = (await stat(filePath)).size
  } catch {
    throw new SpreadsheetReadError(`"${fileName}" could not be opened. It may have been moved or is in use.`)
  }

  if (bytes.length === 0) {
    throw new SpreadsheetReadError(`"${fileName}" is empty.`)
  }

  let workbook: XLSX.WorkBook
  try {
    workbook = XLSX.read(bytes, { type: 'buffer', cellDates: false, raw: true })
  } catch {
    throw new SpreadsheetReadError(
      `"${fileName}" could not be read as a spreadsheet. It may be corrupted or password protected.`
    )
  }

  if (workbook.SheetNames.length === 0) {
    throw new SpreadsheetReadError(`"${fileName}" has no sheets in it.`)
  }

  const sheetName = chooseSheet(workbook)
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

  const dataRows: string[][] = []
  let blankRowsSkipped = 0

  for (let index = headerIndex + 1; index < grid.length; index += 1) {
    const row = grid[index] ?? []
    if (countFilled(row) === 0) {
      blankRowsSkipped += 1
      continue
    }
    // Normalise every row to the header width so column indexes are always valid.
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
    blankRowsSkipped
  }
}