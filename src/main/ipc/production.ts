import { ipcMain } from 'electron'
import { IpcChannels } from '@shared/ipc-channels'
import type { BatchGroupingResult } from '@shared/types'
import { getDatabase } from '../db'
import { createBatchFromPendingFiles } from '../production/group-into-batch'

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
      unmappedSkuCount: result.unmappedSkuCount,
      duplicateRowsExcluded: result.duplicateRowsExcluded
    }
  })
}
