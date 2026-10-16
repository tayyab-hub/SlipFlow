import { createHash } from 'node:crypto'
import { quantityFromText } from '@shared/validation'
import { listSellers, duplicateDecision } from '../db/repositories/delivery'
import type { DetectionStatus, FieldMapping, NewImportedOrder, UploadResult } from '@shared/types'
import type { StitchFlowDatabase } from '../db'
import { detectColumns, resolveColumnIndexes } from './detect-columns'
import { detectPlatform } from './detect-platform'
import { buildHeaderSignature } from './header-signature'
import { readSpreadsheet, SpreadsheetReadError, type SpreadsheetContents } from './read-workbook'

/** How many rows the manual-mapping screen shows as a preview. */
const PREVIEW_ROWS = 5

export interface ImportOptions {
  sellerAccountId?: number
  sheetName?: string
  previewOnly?: boolean
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
    contents = await readSpreadsheet(filePath, options.sheetName)
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
  const seller = options.sellerAccountId
    ? listSellers(db).find((s) => s.id === options.sellerAccountId && s.active)
    : undefined
  if (options.sellerAccountId && !seller)
    return failure(filePath, 'Select an active seller account.')
  const platform = seller?.platform ?? options.platform ?? platformGuess.platform
  if (
    seller &&
    platformGuess.confidence >= 0.8 &&
    platformGuess.platform !== 'unknown' &&
    seller.platform !== platformGuess.platform
  )
    return failure(
      filePath,
      'The selected seller marketplace conflicts with this file. Select the correct seller.'
    )

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
  const occurrences = new Map<string, number>()
  const lineColumn = headers.findIndex((h) =>
    /^(order line id|order item id|orderitemid|sub order id)$/i.test(h.trim())
  )
  const nameColumn = headers.findIndex((h) =>
    /^(product name|productname|item name)$/i.test(h.trim())
  )

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

    const orderLineId = cell(lineColumn)
    const identity = JSON.stringify([orderId, rawSku, rawVariation, rawColour, rawSize])
    const occurrence = (occurrences.get(identity) ?? 0) + 1
    occurrences.set(identity, occurrence)
    return {
      importFileId: 0, // replaced once the import_files row exists
      sellerAccountId: options.sellerAccountId ?? null,
      rawQuantity: quantityText,
      orderLineId,
      productName: cell(nameColumn),
      validationNote:
        quantity === null
          ? `Invalid quantity: "${quantityText}". Enter a positive whole number.`
          : !orderId
            ? 'Missing order identity. Compare with previous exports before approving production.'
            : '',
      rowNumber: contents.rowNumbers[position] ?? position + 1,
      orderId,
      platform,
      rawSku,
      rawVariation,
      rawColour,
      rawSize,
      quantity: quantity ?? 0,
      duplicateHash: buildDuplicateHash({
        orderId,
        rawSku,
        rawVariation,
        quantity: quantity ?? 0,
        platform,
        sellerAccountId: options.sellerAccountId,
        orderLineId,
        rawColour,
        rawSize,
        occurrence,
        fileHash: contents.fileHash,
        sheetName: contents.sheetName
      })
    }
  })

  // Rows matching a hash already in the database are flagged now, at insert time. This
  // is the "Ignore Duplicates" default: grouping (Phase 4) simply excludes flagged rows
  // from its sums. "Import Anyway" clears the flag later via
  // importedOrders.clearDuplicateForFile, it never re-runs this detection.
  const seenLineIds = new Set<string>()
  const flaggedOrders = orders.map((order) => {
    let decision = duplicateDecision(db, order, contents.fileHash, contents.sheetName)
    if (order.orderLineId) {
      const key = JSON.stringify([order.orderId, order.orderLineId])
      if (seenLineIds.has(key)) decision = 'review'
      seenLineIds.add(key)
    }
    return {
      ...order,
      isDuplicate: decision === 'duplicate',
      validationNote:
        decision === 'review'
          ? 'Possible repeated or changed order line. Compare source history before approving or removing this production row.'
          : order.validationNote
    }
  })
  const duplicateRows = flaggedOrders.filter((o) => o.isDuplicate).length

  if (options.previewOnly)
    return {
      ...base(contents, platform, platformGuess.confidence),
      status: 'needs_mapping',
      rowCount: orders.length,
      invalidQuantityRows,
      duplicateRows,
      mapping,
      usedSavedMapping,
      detectionStatus,
      preview: {
        headers,
        sampleRows: rows.slice(0, 10),
        suggested: mapping,
        reason: `Preview only. ${orders.length} rows, ${invalidQuantityRows} invalid quantities, ${duplicateRows} duplicates. Confirm the worksheet, marketplace and columns before importing.`
      },
      message: 'Review the preview and confirm import. Nothing has been saved.'
    }
  if (orders.length === 0) return failure(filePath, 'There are no order rows below the headings.')

  const { importFileId, mappingRemembered } = db.transaction(() => {
    if (usedSavedMapping && columnMappingId) db.columnMappings.recordUse(columnMappingId)
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
      sellerAccountId: options.sellerAccountId ?? null,
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
      flaggedOrders.map((order) => ({ ...order, importFileId: importFile.id }))
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
  return quantityFromText(text)
}

/** order ID + SKU + variation + quantity, per the spec's duplicate rule. */
export function buildDuplicateHash(parts: {
  orderId: string
  rawSku: string
  rawVariation: string
  quantity: number
  platform?: string
  sellerAccountId?: number
  orderLineId?: string
  rawColour?: string
  rawSize?: string
  occurrence?: number
  fileHash?: string
  sheetName?: string
}): string {
  const key = JSON.stringify([
    'v2',
    parts.platform ?? 'unknown',
    parts.sellerAccountId ?? null,
    parts.orderId.trim(),
    parts.orderLineId?.trim() || '',
    ...(parts.orderLineId
      ? []
      : [
          parts.rawSku.trim(),
          parts.rawVariation.trim(),
          parts.rawColour ?? '',
          parts.rawSize ?? '',
          parts.occurrence ?? 1
        ]),
    ...(parts.orderId ? [] : [parts.fileHash ?? '', parts.sheetName ?? ''])
  ])

  return createHash('sha256').update(key).digest('hex')
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
