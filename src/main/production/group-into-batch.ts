import type { ImportedOrder, NewProductionItem, ProductionIssueType } from '@shared/types'
import type { SkuMappingsRepository } from '../db/repositories/sku-mappings'
import type { StitchFlowDatabase } from '../db'
import type { BatchTotals } from '../db/repositories/production-items'

/** A production line before it's attached to a batch — the caller supplies `batchId`. */
export type DraftProductionItem = Omit<NewProductionItem, 'batchId'>

export interface GroupedOrders {
  items: DraftProductionItem[]
  /** Non-duplicate, resolved rows whose colour/size came from auto-splitting the raw
   *  variation text rather than an explicit `sku_mappings` row. Informational, not a
   *  problem — see the "auto-split" note on `classify()`. */
  autoSplitCount: number
  /** Rows excluded from every group because `is_duplicate` was already set. */
  duplicateRowsExcluded: number
}

interface DraftItem {
  factorySku: string
  colour: string
  size: string
  quantity: number
  platforms: Set<string>
  issueType: ProductionIssueType
  issueNote: string
  /** False when colour/size came from splitting raw_variation, not an explicit mapping. */
  viaMapping: boolean
}

/**
 * Sums order lines into production lines: one per factory SKU + colour + size, no
 * matter which platform an order line came from.
 *
 * Pure function: takes the orders and a mapping lookup, returns what to insert. The
 * caller owns the transaction and the batch itself.
 */
export function groupOrdersForBatch(
  orders: readonly ImportedOrder[],
  skuMappings: SkuMappingsRepository
): GroupedOrders {
  const groups = new Map<string, DraftItem>()
  let duplicateRowsExcluded = 0

  for (const order of orders) {
    if (order.isDuplicate) {
      duplicateRowsExcluded += 1
      continue
    }

    const { key, draft } = classify(order, skuMappings)

    const existing = groups.get(key)
    if (existing) {
      existing.quantity += draft.quantity
      for (const platform of draft.platforms) existing.platforms.add(platform)
    } else {
      groups.set(key, draft)
    }
  }

  // Counted post-grouping so repeated lines for the same SKU+variation count once, not
  // once per order line.
  const autoSplitCount = [...groups.values()].filter(
    (draft) => !draft.viaMapping && draft.issueType === ''
  ).length

  let sortOrder = 0
  const items: DraftProductionItem[] = [...groups.values()]
    .sort((a, b) => {
      const key = (item: DraftItem): string => `${item.issueType ? '1' : '0'}${item.factorySku}${item.colour}${item.size}`
      return key(a).localeCompare(key(b))
    })
    .map((draft) => ({
      factorySku: draft.factorySku,
      colour: draft.colour,
      size: draft.size,
      quantity: draft.quantity,
      sourcePlatforms: [...draft.platforms].sort().join(','),
      issueType: draft.issueType,
      issueNote: draft.issueNote,
      isResolved: draft.issueType === '',
      isManual: false,
      sortOrder: sortOrder++
    }))

  return { items, autoSplitCount, duplicateRowsExcluded }
}

/**
 * Splits a raw "Colour, Size" variation string. Tries comma, then slash, then colon —
 * the three separators seen across TikTok/Shopee/Lazada exports — using the LAST
 * occurrence so a multi-word colour ("Navy Blue", "Aesh Grey") stays intact. A
 * variation with no separator at all is treated as size-only (colour left blank) —
 * the common case for single-attribute products.
 */
function splitVariation(variation: string): { colour: string; size: string } {
  const trimmed = variation.trim()
  if (trimmed === '') return { colour: '', size: '' }

  for (const separator of [',', '/', ':']) {
    const index = trimmed.lastIndexOf(separator)
    if (index !== -1) {
      return {
        colour: trimmed.slice(0, index).trim(),
        size: trimmed.slice(index + 1).trim()
      }
    }
  }

  return { colour: '', size: trimmed }
}

function classify(
  order: ImportedOrder,
  skuMappings: SkuMappingsRepository
): { key: string; draft: DraftItem } {
  const platforms = new Set([order.platform])

  if (order.rawSku.trim() === '') {
    return {
      key: `missing-sku:${order.id}`,
      draft: {
        factorySku: '',
        colour: '',
        size: '',
        quantity: order.quantity,
        platforms,
        issueType: 'missing_sku',
        issueNote: `Row ${order.rowNumber} of the uploaded file has no SKU.`,
        viaMapping: false
      }
    }
  }

  // An explicit mapping (added by hand, or via bulk import) always wins when one
  // exists — it's how an operator overrides a specific product's auto-split, or gives
  // it a cleaner factory-facing name. Without one, colour/size are read straight from
  // the marketplace's own variation text, so nothing is ever blocked on mapping setup
  // — see PROGRESS.md's Phase 6 follow-up note for why this replaced the earlier
  // "always require a mapping" rule.
  const mapping = skuMappings.findBestMatch({
    incomingSku: order.rawSku,
    incomingVariation: order.rawVariation,
    platform: order.platform
  })

  const resolved = mapping
    ? { factorySku: mapping.factorySku, colour: mapping.factoryColour, size: mapping.factorySize }
    : { factorySku: order.rawSku, ...splitVariation(order.rawVariation) }

  const issueType: ProductionIssueType = order.quantity <= 0 ? 'invalid_quantity' : ''
  const issueNote =
    issueType === 'invalid_quantity'
      ? `Row ${order.rowNumber} of the uploaded file has an unreadable or zero quantity.`
      : ''

  return {
    key: `resolved:${resolved.factorySku.toLowerCase()}|${resolved.colour.toLowerCase()}|${resolved.size.toLowerCase()}`,
    draft: {
      factorySku: resolved.factorySku,
      colour: resolved.colour,
      size: resolved.size,
      quantity: order.quantity,
      platforms,
      issueType,
      issueNote,
      viaMapping: mapping !== null
    }
  }
}

/** Timestamp-based placeholder — Phase 7 owns real batch numbering (see PROGRESS.md). */
function generateBatchNumber(): string {
  return `B${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, '').replace('T', '-')}`
}

export interface CreateBatchResult {
  batchId: number
  totals: BatchTotals
  autoSplitCount: number
  duplicateRowsExcluded: number
}

/**
 * Groups every currently-pending import file (or a specific subset) into one new
 * batch. Wrapped in a single transaction: the batch, its production items, and the
 * reassignment of the source files/orders all commit together or not at all.
 */
export function createBatchFromPendingFiles(
  db: StitchFlowDatabase,
  importFileIds?: readonly number[]
): CreateBatchResult {
  const fileIds = importFileIds ?? db.importFiles.listUnassigned().map((file) => file.id)

  return db.transaction(() => {
    const orders = fileIds.flatMap((fileId) => db.importedOrders.listByFile(fileId))
    const grouped = groupOrdersForBatch(orders, db.skuMappings)

    const batch = db.batches.create({ batchNumber: generateBatchNumber() })

    db.productionItems.createMany(
      grouped.items.map((item) => ({ ...item, batchId: batch.id }))
    )

    for (const fileId of fileIds) {
      db.importFiles.update(fileId, { batchId: batch.id })
      db.importedOrders.assignToBatch(fileId, batch.id)
    }

    const totals = db.productionItems.totalsForBatch(batch.id)
    db.batches.update(batch.id, {
      totalItems: totals.items,
      totalUnits: totals.units,
      unresolvedCount: totals.unresolved
    })

    return {
      batchId: batch.id,
      totals,
      autoSplitCount: grouped.autoSplitCount,
      duplicateRowsExcluded: grouped.duplicateRowsExcluded
    }
  })
}
