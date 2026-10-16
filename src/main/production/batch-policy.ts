import type { StitchFlowDatabase } from '../db'
import { validQuantity } from '@shared/validation'
import { batchEvidence } from '../db/repositories/delivery'

export function requireDraft(db: StitchFlowDatabase, batchId: number): void {
  const batch = db.batches.getById(batchId)
  if (!batch || batch.status !== 'draft')
    throw new Error(
      'Only draft batches can be changed. Return a ready batch to draft first. Printed and archived batches are locked.'
    )
}
export function assertComplete(db: StitchFlowDatabase, batchId: number): void {
  const items = db.productionItems.listByBatch(batchId)
  if (!items.length) throw new Error('An empty batch cannot be released.')
  if (
    items.some(
      (i) =>
        !i.isResolved ||
        i.issueType ||
        !i.factorySku.trim() ||
        !i.colour.trim() ||
        !i.size.trim() ||
        !validQuantity(i.quantity)
    )
  ) {
    throw new Error(
      'Resolve every item before release: factory SKU, colour, size and a valid quantity are required. Use N/A only when explicitly verified.'
    )
  }
  const evidence = batchEvidence(db, batchId)
  const batch = db.batches.getById(batchId)!
  if (
    (evidence.sourceUnits !== evidence.productionUnits || evidence.invalidSourceRows > 0) &&
    batch.notes.trim().length < 10
  ) {
    throw new Error(
      'Source and production quantities require reconciliation. Enter an explanation of at least 10 characters in the batch notes before release.'
    )
  }
  if (!Number.isSafeInteger(evidence.productionUnits))
    throw new Error('Batch total exceeds the supported integer range.')
}
export function requirePrintable(db: StitchFlowDatabase, batchId: number): void {
  assertComplete(db, batchId)
  const status = db.batches.getById(batchId)?.status
  if (status !== 'ready' && status !== 'printed')
    throw new Error(
      'Approve the batch as ready before printing. Archived batches must be restored to history first.'
    )
}
