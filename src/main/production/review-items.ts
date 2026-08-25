import type { ProductionItem } from '@shared/types'
import type { StitchFlowDatabase } from '../db'

/**
 * Writes `total_items` / `total_units` / `unresolved_count` back onto the batch row.
 * Every mutation to a batch's production items must call this — the totals are stored,
 * not derived, per the rule established in Phase 4's `createBatchFromPendingFiles`.
 */
export function recomputeBatchTotals(db: StitchFlowDatabase, batchId: number): void {
  const totals = db.productionItems.totalsForBatch(batchId)
  db.batches.update(batchId, {
    totalItems: totals.items,
    totalUnits: totals.units,
    unresolvedCount: totals.unresolved
  })
}

/**
 * Combines several production lines into one: quantities sum, the earliest (by
 * `sort_order`) row's factory SKU/colour/size wins, source platforms union. The merged
 * row is clean only if every row going into it was already clean — otherwise it carries
 * the first issue forward, so a problem is never silently merged away.
 */
export function mergeProductionItems(
  db: StitchFlowDatabase,
  batchId: number,
  ids: readonly number[]
): ProductionItem {
  if (ids.length < 2) {
    throw new Error('Merging needs at least two production items')
  }

  return db.transaction(() => {
    const items = ids.map((id) => {
      const item = db.productionItems.getById(id)
      if (!item) throw new Error(`Production item ${id} was not found`)
      if (item.batchId !== batchId) {
        throw new Error(`Production item ${id} does not belong to batch ${batchId}`)
      }
      return item
    })

    const [primary, ...rest] = [...items].sort((a, b) => a.sortOrder - b.sortOrder)
    if (!primary) throw new Error('Nothing to merge')

    const quantity = items.reduce((sum, item) => sum + item.quantity, 0)
    const platforms = new Set<string>()
    for (const item of items) {
      for (const platform of item.sourcePlatforms.split(',')) {
        if (platform) platforms.add(platform)
      }
    }

    const firstIssue = items.find((item) => item.issueType !== '')

    const merged = db.productionItems.update(primary.id, {
      quantity,
      sourcePlatforms: [...platforms].sort().join(','),
      issueType: firstIssue?.issueType ?? '',
      issueNote: firstIssue?.issueNote ?? '',
      isResolved: !firstIssue,
      isManual: true
    })
    if (!merged) throw new Error('Merged production item could not be read back')

    db.productionItems.removeMany(rest.map((item) => item.id))
    recomputeBatchTotals(db, batchId)

    return merged
  })
}
