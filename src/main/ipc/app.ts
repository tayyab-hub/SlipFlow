import { ipcMain } from './trusted-ipc'
import { app } from 'electron'
import { IpcChannels } from '@shared/ipc-channels'
import type { AppInfo, DashboardSummary } from '@shared/types'
import { getDatabase } from '../db'

export function registerAppHandlers(): void {
  ipcMain.handle(IpcChannels.appInfo, (): AppInfo => {
    return {
      appVersion: app.getVersion(),
      electronVersion: process.versions.electron,
      platform: process.platform,
      packaged: app.isPackaged
    }
  })

  ipcMain.handle(IpcChannels.appDashboardSummary, (): DashboardSummary => {
    const db = getDatabase()
    const today = new Date().toISOString().slice(0, 10)
    const production = db.productionItems.globalTotals()

    return {
      ordersImported: db.importedOrders.count(),
      pendingOrders: db.importFiles
        .listUnassigned()
        .reduce(
          (sum, file) =>
            sum + db.importedOrders.listByFile(file.id).filter((o) => !o.isDuplicate).length,
          0
        ),
      activeBatches: db.batches.list().filter((b) => b.status === 'draft' || b.status === 'ready')
        .length,
      itemsToProduce: production.units,
      needsReview: production.unresolved,
      batchesToday: db.batches.countCreatedOn(today)
    }
  })
}
