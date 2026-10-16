import { ipcMain } from './trusted-ipc'

import { IpcChannels } from '@shared/ipc-channels'
import type {
  Batch,
  BatchGroupingResult,
  NewProductionItem,
  ProductionItem,
  ProductionItemUpdate
} from '@shared/types'
import { getDatabase } from '../db'
import { createBatchFromPendingFiles } from '../production/group-into-batch'
import { mergeProductionItems, recomputeBatchTotals } from '../production/review-items'
import { boundedText, positiveId, validQuantity } from '@shared/validation'
import { requireDraft, requirePrintable } from '../production/batch-policy'
import { audit } from '../db/repositories/delivery'

function assertInteger(value: unknown, label: string): number {
  return positiveId(value, label)
}

function assertNewProductionItem(value: unknown): NewProductionItem {
  if (typeof value !== 'object' || value === null) {
    throw new TypeError('A production item is required')
  }

  const input = value as Partial<NewProductionItem>
  const batchId = assertInteger(input.batchId, 'batchId')
  if (!validQuantity(input.quantity))
    throw new Error('Quantity must be a positive whole number, at most one billion.')

  return {
    batchId,
    factorySku: boundedText(input.factorySku, 'Factory SKU', true),
    colour: boundedText(input.colour, 'Colour (or N/A)', true),
    size: boundedText(input.size, 'Size (or N/A)', true),
    quantity: typeof input.quantity === 'number' ? input.quantity : 0,
    sourcePlatforms: '',
    issueType: '',
    issueNote: '',
    isResolved: true,
    isManual: true
  }
}

function assertUpdateRequest(value: unknown): { id: number; changes: ProductionItemUpdate } {
  if (typeof value !== 'object' || value === null) {
    throw new TypeError('An update request is required')
  }

  const request = value as { id?: unknown; changes?: unknown }
  if (typeof request.changes !== 'object' || request.changes === null)
    throw new Error('Changes are required.')
  const input = request.changes as Record<string, unknown>
  const allowed = [
    'factorySku',
    'colour',
    'size',
    'quantity',
    'sourcePlatforms',
    'isResolved',
    'issueType',
    'issueNote',
    'isManual'
  ]
  if (Object.keys(input).some((key) => !allowed.includes(key)))
    throw new Error('Unsupported production field.')
  const changes: ProductionItemUpdate = {
    isResolved: true,
    isManual: true,
    issueType: '',
    issueNote: ''
  }
  for (const key of ['factorySku', 'colour', 'size'] as const)
    if (key in input) changes[key] = boundedText(input[key], key, true)
  if ('quantity' in input) {
    if (!validQuantity(input.quantity))
      throw new Error('Quantity must be a positive whole number, at most one billion.')
    changes.quantity = input.quantity
  }
  return { id: assertInteger(request.id, 'id'), changes }
}

function assertMergeRequest(value: unknown): { batchId: number; ids: number[] } {
  if (typeof value !== 'object' || value === null) {
    throw new TypeError('A merge request is required')
  }

  const request = value as { batchId?: unknown; ids?: unknown }
  const batchId = assertInteger(request.batchId, 'batchId')

  if (!Array.isArray(request.ids) || request.ids.some((id) => typeof id !== 'number')) {
    throw new TypeError('ids must be an array of integers')
  }

  return { batchId, ids: request.ids.map((id) => positiveId(id)) }
}

export function registerProductionHandlers(): void {
  ipcMain.handle(
    IpcChannels.batchesCreateFromPending,
    (_event, value: unknown): BatchGroupingResult => {
      if (value !== undefined && (value === null || typeof value !== 'object'))
        throw new Error('Batch selection must be an object.')
      const input = value as { fileIds?: unknown; name?: unknown; orderIds?: unknown } | undefined
      const db = getDatabase()

      const pending = db.importFiles.listUnassigned()
      if (pending.length === 0) {
        throw new Error('There are no uploaded files waiting to be grouped into a batch.')
      }

      if (input?.fileIds !== undefined && !Array.isArray(input.fileIds))
        throw new Error('Select pending files.')
      const ids = Array.isArray(input?.fileIds)
        ? input.fileIds.map((id) => positiveId(id))
        : undefined
      if (
        input?.orderIds !== undefined &&
        (!Array.isArray(input.orderIds) || input.orderIds.length > 50_000)
      )
        throw new Error('Select at most 50,000 pending order lines.')
      const orderIds = Array.isArray(input?.orderIds)
        ? input.orderIds.map((id) => positiveId(id))
        : undefined
      const result = createBatchFromPendingFiles(
        db,
        ids,
        boundedText(input?.name ?? '', 'Batch name'),
        orderIds
      )
      const batch = db.batches.getById(result.batchId)
      if (!batch) throw new Error('Batch was created but could not be read back')

      return {
        batch,
        itemsCreated: result.totals.items,
        unitsTotal: result.totals.units,
        unresolvedCount: result.totals.unresolved,
        autoSplitCount: result.autoSplitCount,
        unmappedSkuCount: result.unmappedSkuCount,
        duplicateRowsExcluded: result.duplicateRowsExcluded
      }
    }
  )

  ipcMain.handle(IpcChannels.batchesList, (_event, options: unknown): Batch[] => {
    const opts = (options ?? {}) as { limit?: unknown }
    const limit =
      opts.limit === undefined ? undefined : Math.min(500, positiveId(opts.limit, 'limit'))
    return getDatabase().batches.list({ limit })
  })

  ipcMain.handle(IpcChannels.batchesGetById, (_event, id: unknown): Batch | null => {
    return getDatabase().batches.getById(assertInteger(id, 'id'))
  })

  ipcMain.handle(IpcChannels.batchesMarkPrinted, (_event, id: unknown): Batch | null => {
    const db = getDatabase()
    const batchId = assertInteger(id, 'id')
    requirePrintable(db, batchId)
    return db.transaction(() => {
      audit(db, batchId, 'print-confirmed', 'Operator confirmed physical print completion')
      return db.batches.markPrinted(batchId)
    })
  })

  ipcMain.handle(
    IpcChannels.productionItemsListByBatch,
    (_event, batchId: unknown): ProductionItem[] => {
      return getDatabase().productionItems.listByBatch(assertInteger(batchId, 'batchId'))
    }
  )

  ipcMain.handle(
    IpcChannels.productionItemsListPrintable,
    (_event, batchId: unknown): ProductionItem[] => {
      return getDatabase().productionItems.listPrintable(assertInteger(batchId, 'batchId'))
    }
  )

  ipcMain.handle(
    IpcChannels.productionItemsUpdate,
    (_event, request: unknown): ProductionItem | null => {
      const { id, changes } = assertUpdateRequest(request)
      const db = getDatabase()

      const existing = db.productionItems.getById(id)
      if (!existing) return null
      requireDraft(db, existing.batchId)
      const candidate = { ...existing, ...changes }
      if (
        !validQuantity(candidate.quantity) ||
        !candidate.factorySku.trim() ||
        !candidate.colour.trim() ||
        !candidate.size.trim()
      )
        throw new Error('Confirm SKU, colour, size and a positive whole quantity before saving.')

      const updated = db.transaction(() => {
        const result = db.productionItems.update(id, changes)
        audit(
          db,
          existing.batchId,
          'item-edited',
          JSON.stringify({
            id,
            before: {
              sku: existing.factorySku,
              colour: existing.colour,
              size: existing.size,
              quantity: existing.quantity
            },
            after: changes
          })
        )
        recomputeBatchTotals(db, existing.batchId)
        return result
      })
      return updated
    }
  )

  ipcMain.handle(IpcChannels.productionItemsCreate, (_event, input: unknown): ProductionItem => {
    const db = getDatabase()
    const newItem = assertNewProductionItem(input)
    requireDraft(db, newItem.batchId)

    return db.transaction(() => {
      const created = db.productionItems.create(newItem)
      audit(
        db,
        newItem.batchId,
        'item-added',
        `Manual item ${created.id}; quantity ${created.quantity}`
      )
      recomputeBatchTotals(db, newItem.batchId)
      return created
    })
  })

  ipcMain.handle(IpcChannels.productionItemsRemove, (_event, id: unknown): boolean => {
    const db = getDatabase()
    const itemId = assertInteger(id, 'id')

    const existing = db.productionItems.getById(itemId)
    if (!existing) return false
    requireDraft(db, existing.batchId)

    return db.transaction(() => {
      const removed = db.productionItems.remove(itemId)
      audit(
        db,
        existing.batchId,
        'item-removed',
        `Item ${itemId}; ${existing.factorySku}; quantity ${existing.quantity}`
      )
      recomputeBatchTotals(db, existing.batchId)
      return removed
    })
  })

  ipcMain.handle(IpcChannels.productionItemsMerge, (_event, request: unknown): ProductionItem => {
    const { batchId, ids } = assertMergeRequest(request)
    return mergeProductionItems(getDatabase(), batchId, ids)
  })
}
