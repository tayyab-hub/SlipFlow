import { createHash } from 'node:crypto'
import type {
  DetectionStatus,
  FieldMapping,
  NewImportedOrder,
  UploadResult
} from '@shared/types'
import type { StitchFlowDatabase } from '../db'
import { detectColumns, resolveColumnIndexes } from './detect-columns'
import { detectPlatform } from './detect-platform'
import { buildHeaderSignature } from './header-signature'
import { readSpreadsheet, SpreadsheetReadError, type SpreadsheetContents } from './read-workbook'

/** How many rows the manual-mapping screen shows as a preview. */
const PREVIEW_ROWS = 5

export interface ImportOptions {
  /** Supplied by the manual-mapping screen; skips auto-detection entirely. */
  mapping?: FieldMapping
  /** Save `mapping` against this file's header signature for reuse. */
  remember?: boolean
  mappingName?: string
  /** Operator's platform choice, when they corrected the guess. */
  platform?: string
}

/**
 * Reads a spreadsheet, works out its columns, and stores its order lines.
 *
 * Three outcomes, and only one of them writes anything:
 *   * `imported`      — rows are in the database
 *   * `needs_mapping` — nothing written; the caller shows the mapping screen
 *   * `failed`        — nothing written; the file could not be read
 *
 * The write is one transaction covering the `import_files` row and every
 * `imported_orders` row, so a failure part-way cannot leave a half-imported file
 * behind (CLAUDE.md §5.10).
 */
export async function importSpreadsheet(
  db: StitchFlowDatabase,
  filePath: string,
  options: ImportOptions = {}
): Promise<UploadResult> {
  let contents: SpreadsheetContents

  try {
    contents = await readSpreadsheet(filePath)
  } catch (error) {
    const message =
      error instanceof SpreadsheetReadError
        ? error.message
        : `That file could not be read: ${error instanceof Error ? error.message : String(error)}`
    return failure(filePath, message)
  }

  const { headers, rows } = contents
  const signature = buildHeaderSignature(headers)
  const platformGuess = detectPlatform(headers, contents.fileName)
  const platform = options.platform ?? platformGuess.platform

  const detection = detectColumns(headers)
  const savedMapping = options.mapping ? null : db.columnMappings.findBySignature(signature)

  // Precedence: what the operator just chose, then what they chose last time for this
  // layout, then automatic detection.
  let mapping: FieldMapping
  let detectionStatus: DetectionStatus
  let columnMappingId: number | null = null
  let usedSavedMapping = false

  if (options.mapping) {
    mapping = options.mapping
    detectionStatus = 'manual'
  } else if (savedMapping) {
    mapping = {
      orderId: savedMapping.orderIdColumn,
      sku: savedMapping.skuColumn,
      variation: savedMapping.variationColumn,
      colour: savedMapping.colourColumn,
      size: savedMapping.sizeColumn,
      quantity: savedMapping.quantityColumn
    }
    detectionStatus = 'manual'
    columnMappingId = savedMapping.id
    usedSavedMapping = true
    db.columnMappings.recordUse(savedMapping.id)
  } else if (detection.ok) {
    mapping = detection.mapping
    detectionStatus = 'auto'
  } else {
    return {
      ...base(contents, platform, platformGuess.confidence),
      status: 'needs_mapping',
      rowCount: rows.length,
      detectionStatus: 'failed',
      mapping: detection.mapping,
      preview: {
        headers,
        sampleRows: rows.slice(0, PREVIEW_ROWS),
        suggested: detection.mapping,
        reason: detection.reason
      },
      message: detection.reason
    }
  }

  const indexes = resolveColumnIndexes(headers, mapping)
  if (indexes.sku === -1 || indexes.quantity === -1) {
    // A saved mapping can go stale if the marketplace renames a column.
    return {
      ...base(contents, platform, platformGuess.confidence),
      status: 'needs_mapping',
      rowCount: rows.length,
      detectionStatus: 'failed',
      mapping: detection.mapping,
      preview: {
        headers,
        sampleRows: rows.slice(0, PREVIEW_ROWS),
        suggested: detection.mapping,
        reason:
          'The saved column layout for this kind of file no longer matches its columns. Please check the mapping.'
      },
      message: 'Saved column mapping no longer fits this file.'
    }
  }

  let invalidQuantityRows = 0

  const orders: NewImportedOrder[] = rows.map((row, position) => {
    const cell = (index: number): string => (index === -1 ? '' : (row[index] ?? ''))

    const orderId = cell(indexes.orderId)
    const rawSku = cell(indexes.sku)
    const rawVariation = cell(indexes.variation)
    const rawColour = cell(indexes.colour)
    const rawSize = cell(indexes.size)

    const quantityText = cell(indexes.quantity)
    const quantity = parseQuantity(quantityText)
    if (quantity === null) invalidQuantityRows += 1

    return {
      importFileId: 0, // replaced once the import_files row exists
      rowNumber: position + 1,
      orderId,
      platform,
      rawSku,
      rawVariation,
      rawColour,
      rawSize,
      quantity: quantity ?? 0,
      duplicateHash: buildDuplicateHash({ orderId, rawSku, rawVariation, quantity: quantity ?? 0 })
    }
  })

  // Reported, not acted on: the Ignore / Import Anyway prompt belongs to Phase 4.
  const duplicateRows = countKnownDuplicates(db, orders)

  const { importFileId, mappingRemembered } = db.transaction(() => {
    let savedMappingId = columnMappingId

    if (options.mapping && options.remember) {
      const existing = db.columnMappings.findBySignature(signature)
      const fields = {
        platform,
        skuColumn: mapping.sku,
        variationColumn: mapping.variation,
        colourColumn: mapping.colour,
        sizeColumn: mapping.size,
        quantityColumn: mapping.quantity,
        orderIdColumn: mapping.orderId
      }

      savedMappingId = existing
        ? (db.columnMappings.update(existing.id, fields)?.id ?? existing.id)
        : db.columnMappings.create({
            name: options.mappingName?.trim() || defaultMappingName(contents.fileName, platform),
            headerSignature: signature,
            ...fields
          }).id
    }

    const importFile = db.importFiles.create({
      fileName: contents.fileName,
      filePath: contents.filePath,
      fileHash: contents.fileHash,
      fileSize: contents.fileSize,
      sheetName: contents.sheetName,
      platform,
      rowCount: orders.length,
      detectionStatus,
      columnMappingId: savedMappingId
    })

    db.importedOrders.createMany(
      orders.map((order) => ({ ...order, importFileId: importFile.id }))
    )

    return {
      importFileId: importFile.id,
      mappingRemembered: Boolean(options.mapping && options.remember)
    }
  })

  return {
    ...base(contents, platform, platformGuess.confidence),
    status: 'imported',
    rowCount: orders.length,
    invalidQuantityRows,
    duplicateRows,
    detectionStatus,
    importFileId,
    mapping,
    usedSavedMapping,
    mappingRemembered,
    message: describeSuccess(orders.length, usedSavedMapping, detectionStatus)
  }
}

function base(
  contents: SpreadsheetContents,
  platform: string,
  platformConfidence: number
): UploadResult {
  return {
    status: 'failed',
    fileName: contents.fileName,
    filePath: contents.filePath,
    sheetName: contents.sheetName,
    sheetNames: contents.sheetNames,
    platform,
    platformConfidence,
    rowCount: 0,
    blankRowsSkipped: contents.blankRowsSkipped,
    invalidQuantityRows: 0,
    duplicateRows: 0,
    detectionStatus: 'pending',
    importFileId: null,
    mapping: {
      orderId: '',
      sku: '',
      variation: '',
      colour: '',
      size: '',
      quantity: ''
    },
    usedSavedMapping: false,
    mappingRemembered: false,
    preview: null,
    message: ''
  }
}

function failure(filePath: string, message: string): UploadResult {
  const fileName = filePath.split(/[\\/]/).pop() ?? filePath
  return {
    status: 'failed',
    fileName,
    filePath,
    sheetName: '',
    sheetNames: [],
    platform: 'unknown',
    platformConfidence: 0,
    rowCount: 0,
    blankRowsSkipped: 0,
    invalidQuantityRows: 0,
    duplicateRows: 0,
    detectionStatus: 'failed',
    importFileId: null,
    mapping: {
      orderId: '',
      sku: '',
      variation: '',
      colour: '',
      size: '',
      quantity: ''
    },
    usedSavedMapping: false,
    mappingRemembered: false,
    preview: null,
    message
  }
}

/**
 * Reads a quantity cell. Returns `null` when the text isn't a usable number, so the
 * caller can count it — the row is still stored, with quantity 0, for Phase 5 to flag.
 */
export function parseQuantity(text: string): number | null {
  const trimmed = text.trim()
  if (trimmed === '') return null

  // Tolerates "2 pcs", "1,000" and "3.0"; rejects anything with no digits.
  const cleaned = trimmed.replace(/[^\d.-]/g, '')
  if (cleaned === '' || !/\d/.test(cleaned)) return null

  const value = Number(cleaned)
  if (!Number.isFinite(value)) return null

  const whole = Math.trunc(value)
  return whole < 0 ? null : whole
}

/** order ID + SKU + variation + quantity, per the spec's duplicate rule. */
export function buildDuplicateHash(parts: {
  orderId: string
  rawSku: string
  rawVariation: string
  quantity: number
}): string {
  const key = [
    parts.orderId.trim().toLowerCase(),
    parts.rawSku.trim().toLowerCase(),
    parts.rawVariation.trim().toLowerCase(),
    String(parts.quantity)
  ].join('|')

  return createHash('sha256').update(key).digest('hex')
}

function countKnownDuplicates(
  db: StitchFlowDatabase,
  orders: readonly NewImportedOrder[]
): number {
  const hashes = orders.map((order) => order.duplicateHash ?? '').filter((hash) => hash !== '')
  if (hashes.length === 0) return 0

  const existing = db.importedOrders.findExistingHashes(hashes)
  return hashes.filter((hash) => existing.has(hash)).length
}

function defaultMappingName(fileName: string, platform: string): string {
  const label = platform === 'unknown' ? 'Custom layout' : `${platform} layout`
  return `${label} (${fileName})`
}

function describeSuccess(
  rowCount: number,
  usedSavedMapping: boolean,
  detectionStatus: DetectionStatus
): string {
  const rows = `${rowCount} order ${rowCount === 1 ? 'line' : 'lines'}`

  if (usedSavedMapping) return `${rows} read using the saved column layout.`
  if (detectionStatus === 'manual') return `${rows} read using the columns you chose.`
  return `${rows} read. Columns detected automatically.`
}