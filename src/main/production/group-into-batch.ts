import { randomUUID } from 'node:crypto'
import type { ImportedOrder, NewProductionItem, ProductionIssueType } from '@shared/types'
import { MAX_QUANTITY, validQuantity } from '@shared/validation'
import type { SkuMappingsRepository } from '../db/repositories/sku-mappings'
import type { StitchFlowDatabase } from '../db'
import type { BatchTotals } from '../db/repositories/production-items'
import { audit, linkSources } from '../db/repositories/delivery'

export type DraftProductionItem = Omit<NewProductionItem, 'batchId'> & { sourceIds: number[] }
export interface GroupedOrders {
  items: DraftProductionItem[]
  autoSplitCount: number
  unmappedSkuCount: number
  duplicateRowsExcluded: number
}

/** Variation parsing is a suggestion only. An explicit mapping or operator approval is required. */
function suggestVariation(value: string): { colour: string; size: string } {
  const match = /^(.*)[,/:]([^,/:]+)$/.exec(value.trim())
  return match
    ? { colour: match[1]!.trim(), size: match[2]!.trim() }
    : { colour: '', size: value.trim() }
}

export function groupOrdersForBatch(
  orders: readonly ImportedOrder[],
  mappings: SkuMappingsRepository
): GroupedOrders {
  const groups = new Map<string, DraftProductionItem>()
  let duplicateRowsExcluded = 0
  for (const order of orders) {
    if (order.isDuplicate) {
      duplicateRowsExcluded++
      continue
    }
    const mapping = mappings.findBestMatch({
      incomingSku: order.rawSku,
      incomingVariation: order.rawVariation,
      platform: order.platform
    })
    const suggestion = suggestVariation(order.rawVariation)
    const factorySku = mapping?.factorySku ?? order.rawSku
    const colour = mapping?.factoryColour ?? (order.rawColour || suggestion.colour)
    const size = mapping?.factorySize ?? (order.rawSize || suggestion.size)
    let issueType: ProductionIssueType = ''
    let issueNote = ''
    if (!validQuantity(order.quantity)) {
      issueType = 'invalid_quantity'
      issueNote = `Source row ${order.rowNumber}: invalid quantity "${order.rawQuantity}". Correct this row separately.`
    } else if (order.validationNote) {
      issueType = 'duplicate'
      issueNote = order.validationNote
    } else if (!order.rawSku) {
      issueType = 'missing_sku'
      issueNote = 'Source SKU is missing. Identify and approve the correct product.'
    } else if (!mapping) {
      issueType = 'unknown_mapping'
      issueNote = `Unverified SKU ${order.rawSku}. Colour and size are suggestions. Confirm an explicit factory mapping.`
    } else if (!colour) {
      issueType = 'missing_colour'
      issueNote = 'Confirm colour, or explicitly enter N/A.'
    } else if (!size) {
      issueType = 'missing_size'
      issueNote = 'Confirm size, or explicitly enter N/A.'
    }
    const key = JSON.stringify([
      factorySku,
      colour,
      size,
      issueType,
      !mapping ? [order.platform, order.sellerAccountId] : '',
      ['invalid_quantity', 'duplicate', 'missing_sku'].includes(issueType) ? order.id : ''
    ])
    const existing = groups.get(key)
    if (existing) {
      const quantity = (existing.quantity ?? 0) + order.quantity
      if (!Number.isSafeInteger(quantity) || quantity > MAX_QUANTITY)
        throw new Error('A grouped quantity exceeds one billion units. Split the batch.')
      existing.quantity = quantity
      existing.sourceIds.push(order.id)
      existing.sourcePlatforms = [
        ...new Set([...(existing.sourcePlatforms ?? '').split(','), order.platform])
      ]
        .sort()
        .join(',')
    } else
      groups.set(key, {
        factorySku,
        colour,
        size,
        quantity: validQuantity(order.quantity) ? order.quantity : 0,
        issueType,
        issueNote,
        isResolved: issueType === '',
        isManual: false,
        sourcePlatforms: order.platform,
        sourceIds: [order.id],
        sortOrder: groups.size
      })
  }
  const items = [...groups.values()]
  return {
    items,
    autoSplitCount: 0,
    unmappedSkuCount: items.filter((i) => i.issueType === 'unknown_mapping').length,
    duplicateRowsExcluded
  }
}

export interface CreateBatchResult {
  batchId: number
  totals: BatchTotals
  autoSplitCount: number
  unmappedSkuCount: number
  duplicateRowsExcluded: number
}
export function createBatchFromPendingFiles(
  db: StitchFlowDatabase,
  importFileIds?: readonly number[],
  name = '',
  orderIds?: readonly number[]
): CreateBatchResult {
  return db.transaction(() => {
    const fileIds = importFileIds ?? db.importFiles.listUnassigned().map((file) => file.id)
    if (!fileIds.length || new Set(fileIds).size !== fileIds.length)
      throw new Error('Select distinct pending files for the batch.')
    for (const id of fileIds) {
      const file = db.importFiles.getById(id)
      if (!file || file.batchId !== null)
        throw new Error('A selected file is missing or has already been batched.')
    }
    const pending = fileIds
      .flatMap((id) => db.importedOrders.listByFile(id))
      .filter((order) => order.batchId === null)
    if (orderIds && (!orderIds.length || new Set(orderIds).size !== orderIds.length))
      throw new Error('Select distinct pending order lines.')
    const selectedIds = orderIds ? new Set(orderIds) : null
    if (
      orderIds &&
      pending.filter((order) => selectedIds!.has(order.id)).length !== orderIds.length
    )
      throw new Error('An order line is missing, already batched, or outside the selected files.')
    // Exact duplicates contribute zero units and are attached for the exclusion audit.
    const orders = pending.filter(
      (order) => !selectedIds || selectedIds.has(order.id) || order.isDuplicate
    )
    const grouped = groupOrdersForBatch(orders, db.skuMappings)
    if (!grouped.items.length)
      throw new Error('These files contain no new production rows. All rows may be duplicates.')
    const batch = db.batches.create({
      batchNumber: `SF-${new Date().toISOString().slice(0, 10)}-${randomUUID().slice(0, 8).toUpperCase()}`,
      name
    })
    for (const item of grouped.items) {
      const saved = db.productionItems.create({ ...item, batchId: batch.id })
      linkSources(db, saved.id, item.sourceIds)
    }
    const assign = db.raw.prepare(
      'UPDATE imported_orders SET batch_id=? WHERE id=? AND batch_id IS NULL'
    )
    for (const order of orders) assign.run(batch.id, order.id)
    for (const id of fileIds)
      if (!db.importedOrders.listByFile(id).some((order) => order.batchId === null))
        db.importFiles.update(id, { batchId: batch.id })
    const totals = db.productionItems.totalsForBatch(batch.id)
    db.batches.update(batch.id, {
      totalItems: totals.items,
      totalUnits: totals.units,
      unresolvedCount: totals.unresolved
    })
    audit(
      db,
      batch.id,
      'created',
      `${orders.length} source rows; ${grouped.duplicateRowsExcluded} duplicates excluded; ${totals.units} units`
    )
    return {
      batchId: batch.id,
      totals,
      autoSplitCount: 0,
      unmappedSkuCount: grouped.unmappedSkuCount,
      duplicateRowsExcluded: grouped.duplicateRowsExcluded
    }
  })
}
