import { ipcMain } from 'electron'
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

function assertInteger(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new TypeError(`${label} must be an integer`)
  }
  return value
}

function assertNewProductionItem(value: unknown): NewProductionItem {
  if (typeof value !== 'object' || value === null) {
    throw new TypeError('A production item is required')
  }

  const input = value as Partial<NewProductionItem>
  const batchId = assertInteger(input.batchId, 'batchId')

  return {
    batchId,
    factorySku: typeof input.factorySku === 'string' ? input.factorySku : '',
    colour: typeof input.colour === 'string' ? input.colour : '',
    size: typeof input.size === 'string' ? input.size : '',
    quantity: typeof input.quantity === 'number' ? input.quantity : 0,
    sourcePlatforms: typeof input.sourcePlatforms === 'string' ? input.sourcePlatforms : '',
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
  return { id: assertInteger(request.id, 'id'), changes: (request.changes ?? {}) as ProductionItemUpdate }
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

  return { batchId, ids: request.ids as number[] }
}

export function registerProductionHandlers(): void {
  ipcMain.handle(IpcChannels.batchesCreateFromPending, (): BatchGroupingResult => {
    const db = getDatabase()

    const pending = db.importFiles.listUnassigned()
    if (pending.length === 0) {
      throw new Error('There are no uploaded files waiting to be grouped into a batch.')
    }

    const result = createBatchFromPendingFiles(db)
    const batch = db.batches.getById(result.batchId)
    if (!batch) throw new Error('Batch was created but could not be read back')

    return {
      batch,
      itemsCreated: result.totals.items,
      unitsTotal: result.totals.units,
      unresolvedCount: result.totals.unresolved,
      autoSplitCount: result.autoSplitCount,
      duplicateRowsExcluded: result.duplicateRowsExcluded
    }
  })

  ipcMain.handle(IpcChannels.batchesList, (_event, options: unknown): Batch[] => {
    const opts = (options ?? {}) as { limit?: unknown }
    const limit = typeof opts.limit === 'number' ? opts.limit : undefined
    return getDatabase().batches.list({ limit })
  })

  ipcMain.handle(IpcChannels.batchesGetById, (_event, id: unknown): Batch | null => {
    return getDatabase().batches.getById(assertInteger(id, 'id'))
  })

  ipcMain.handle(IpcChannels.batchesMarkPrinted, (_event, id: unknown): Batch | null => {
    return getDatabase().batches.markPrinted(assertInteger(id, 'id'))
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

      const updated = db.transaction(() => {
        const result = db.productionItems.update(id, changes)
        recomputeBatchTotals(db, existing.batchId)
        return result
      })
      return updated
    }
  )

  ipcMain.handle(
    IpcChannels.productionItemsCreate,
    (_event, input: unknown): ProductionItem => {
      const db = getDatabase()
      const newItem = assertNewProductionItem(input)

      return db.transaction(() => {
        const created = db.productionItems.create(newItem)
        recomputeBatchTotals(db, newItem.batchId)
        return created
      })
    }
  )

  ipcMain.handle(IpcChannels.productionItemsRemove, (_event, id: unknown): boolean => {
    const db = getDatabase()
    const itemId = assertInteger(id, 'id')

    const existing = db.productionItems.getById(itemId)
    if (!existing) return false

    return db.transaction(() => {
      const removed = db.productionItems.remove(itemId)
      recomputeBatchTotals(db, existing.batchId)
      return removed
    })
  })

  ipcMain.handle(
    IpcChannels.productionItemsMerge,
    (_event, request: unknown): ProductionItem => {
      const { batchId, ids } = assertMergeRequest(request)
      return mergeProductionItems(getDatabase(), batchId, ids)
    }
  )
}
