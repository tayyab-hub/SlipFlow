import type {
  BulkImportSkuMappingsResult,
  NewSkuMapping,
  SkuMappingImportError
} from '@shared/types'
import type { StitchFlowDatabase } from '../db'
import { readSpreadsheet, SpreadsheetReadError } from './read-workbook'

/**
 * Header names this parser accepts, case-insensitively. Unlike marketplace order files
 * (`column-aliases.ts`), this is StitchFlow's *own* format — the operator fills it in
 * for this tool specifically — so it needs no alias/fuzzy matching, just an exact
 * (case-insensitive) header name.
 */
const HEADER_MAP: Record<string, keyof RowFields> = {
  'incoming sku': 'incomingSku',
  'incoming variation': 'incomingVariation',
  platform: 'platform',
  'factory sku': 'factorySku',
  'factory colour': 'factoryColour',
  'factory color': 'factoryColour',
  'factory size': 'factorySize',
  notes: 'notes'
}

const REQUIRED_HEADERS: (keyof RowFields)[] = ['incomingSku', 'factorySku']

interface RowFields {
  incomingSku: string
  incomingVariation: string
  platform: string
  factorySku: string
  factoryColour: string
  factorySize: string
  notes: string
}

/**
 * Reads a bulk SKU-mapping spreadsheet and writes every valid row in one transaction —
 * a bad row is reported, never partially written (CLAUDE.md §5.10, same rule as order
 * imports).
 */
export async function importSkuMappings(
  db: StitchFlowDatabase,
  filePath: string
): Promise<BulkImportSkuMappingsResult> {
  let contents: Awaited<ReturnType<typeof readSpreadsheet>>

  try {
    contents = await readSpreadsheet(filePath)
  } catch (error) {
    const message =
      error instanceof SpreadsheetReadError
        ? error.message
        : `That file could not be read: ${error instanceof Error ? error.message : String(error)}`
    return {
      fileName: filePath.split(/[\\/]/).pop() ?? filePath,
      imported: 0,
      errors: [{ rowNumber: 0, reason: message }]
    }
  }

  const columnFor = new Map<keyof RowFields, number>()
  contents.headers.forEach((header, index) => {
    const field = HEADER_MAP[header.trim().toLowerCase()]
    if (field && !columnFor.has(field)) columnFor.set(field, index)
  })

  const missingHeaders = REQUIRED_HEADERS.filter((field) => !columnFor.has(field))
  if (missingHeaders.length > 0) {
    return {
      fileName: contents.fileName,
      imported: 0,
      errors: [
        {
          rowNumber: 0,
          reason: `Missing required column${missingHeaders.length > 1 ? 's' : ''}: ${missingHeaders
            .map((field) => (field === 'incomingSku' ? 'Incoming SKU' : 'Factory SKU'))
            .join(', ')}.`
        }
      ]
    }
  }

  function cell(row: string[], field: keyof RowFields): string {
    const index = columnFor.get(field)
    return index === undefined ? '' : (row[index] ?? '').trim()
  }

  const valid: NewSkuMapping[] = []
  const errors: SkuMappingImportError[] = []

  contents.rows.forEach((row, position) => {
    const rowNumber = contents.rowNumbers[position] ?? position + 1
    const incomingSku = cell(row, 'incomingSku')
    const factorySku = cell(row, 'factorySku')

    if (incomingSku === '' || factorySku === '') {
      errors.push({
        rowNumber,
        reason: incomingSku === '' ? 'Incoming SKU is blank.' : 'Factory SKU is blank.'
      })
      return
    }

    if (!['', 'tiktok', 'shopee', 'lazada', 'unknown'].includes(cell(row, 'platform'))) {
      errors.push({
        rowNumber,
        reason: 'Unknown marketplace. Use tiktok, shopee, lazada, unknown, or blank.'
      })
      return
    }
    valid.push({
      incomingSku,
      factorySku,
      incomingVariation: cell(row, 'incomingVariation'),
      platform: cell(row, 'platform'),
      factoryColour: cell(row, 'factoryColour'),
      factorySize: cell(row, 'factorySize'),
      notes: cell(row, 'notes')
    })
  })

  let imported = 0
  db.transaction(() => {
    for (const input of valid) {
      try {
        db.skuMappings.create(input)
        imported++
      } catch (error) {
        if (String(error).includes('UNIQUE constraint'))
          errors.push({
            rowNumber: 0,
            reason: `Mapping conflict for ${input.incomingSku}. Edit the existing mapping explicitly; no mapping was overwritten.`
          })
        else throw error
      }
    }
  })

  return { fileName: contents.fileName, imported, errors }
}
