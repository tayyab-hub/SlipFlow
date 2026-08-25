import type { ImportedOrder, NewProductionItem, ProductionIssueType } from '@shared/types'
import type { SkuMappingsRepository } from '../db/repositories/sku-mappings'
import type { StitchFlowDatabase } from '../db'
import type { BatchTotals } from '../db/repositories/production-items'

/** A production line before it's attached to a batch — the caller supplies `batchId`. */
export type DraftProductionItem = Omit<NewProductionItem, 'batchId'>

export interface GroupedOrders {
  items: DraftProductionItem[]
  /** Non-duplicate rows whose SKU matched nothing in `sku_mappings`. */
  unmappedSkuCount: number
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
}

/**
 * Sums order lines into production lines: one per factory SKU + colour + size, no
 * matter which platform (or which of the sample files' three variation separators) an
 * order line came from — see PROGRESS.md's Phase 4 notes on why colour/size come from
 * the mapping table rather than from parsing `raw_variation`.
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

  // Counted post-grouping so repeated lines for the same unrecognised SKU count once,
  // not once per order line.
  const unmappedSkuCount = [...groups.values()].filter(
    (draft) => draft.issueType === 'unknown_mapping'
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

  return { items, unmappedSkuCount, duplicateRowsExcluded }
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
        issueNote: `Row ${order.rowNumber} of the uploaded file has no SKU.`
      }
    }
  }

  const mapping = skuMappings.findBestMatch({
    incomingSku: order.rawSku,
    incomingVariation: order.rawVariation,
    platform: order.platform
  })

  if (!mapping) {
    return {
      key: `unmapped:${order.rawSku.toLowerCase()}|${order.rawVariation.toLowerCase()}`,
      draft: {
        factorySku: '',
        colour: '',
        size: '',
        quantity: order.quantity,
        platforms,
        issueType: 'unknown_mapping',
        issueNote: `No SKU mapping for "${order.rawSku}"${
          order.rawVariation ? ` (${order.rawVariation})` : ''
        } from ${order.platform}.`
      }
    }
  }

  const issueType: ProductionIssueType = order.quantity <= 0 ? 'invalid_quantity' : ''
  const issueNote =
    issueType === 'invalid_quantity'
      ? `Row ${order.rowNumber} of the uploaded file has an unreadable or zero quantity.`
      : ''

  return {
    key: `mapped:${mapping.factorySku}|${mapping.factoryColour}|${mapping.factorySize}`,
    draft: {
      factorySku: mapping.factorySku,
      colour: mapping.factoryColour,
      size: mapping.factorySize,
      quantity: order.quantity,
      platforms,
      issueType,
      issueNote
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
  unmappedSkuCount: number
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
      unmappedSkuCount: grouped.unmappedSkuCount,
      duplicateRowsExcluded: grouped.duplicateRowsExcluded
    }
  })
}
