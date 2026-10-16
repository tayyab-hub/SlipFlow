import { ipcMain } from './trusted-ipc'
import { dialog } from 'electron'
import { IpcChannels } from '@shared/ipc-channels'
import { boundedText, positiveId } from '@shared/validation'
import { KNOWN_PLATFORMS } from '@shared/types'
import { getDatabase } from '../db'
import {
  audit,
  batchEvidence,
  listSellers,
  saveSeller,
  sourceOrders
} from '../db/repositories/delivery'
import { assertComplete } from '../production/batch-policy'
import { getSettings, validateSettings } from '../settings'
import { backupPath, createBackup, listBackups, restoreBackup, verifyBackup } from '../backups'
import { resolveBackupDirectory } from '../db/paths'

export function registerDeliveryHandlers(): void {
  ipcMain.handle(IpcChannels.sellersList, () => listSellers(getDatabase()))
  ipcMain.handle(IpcChannels.sellersSave, (_event, input: unknown) => {
    if (!input || typeof input !== 'object') throw new Error('Seller details are required.')
    const s = input as { id?: unknown; name?: unknown; platform?: unknown; active?: unknown }
    if (s.active !== undefined && typeof s.active !== 'boolean')
      throw new Error('Active must be true or false.')
    if (!KNOWN_PLATFORMS.includes(s.platform as never)) throw new Error('Select a marketplace.')
    saveSeller(
      getDatabase(),
      boundedText(s.name, 'Seller name', true, 100),
      String(s.platform),
      s.id === undefined ? undefined : positiveId(s.id),
      s.active !== false
    )
    return listSellers(getDatabase())
  })
  ipcMain.handle(IpcChannels.settingsGet, () => getSettings(getDatabase()))
  ipcMain.handle(IpcChannels.settingsSave, (_event, value: unknown) => {
    const settings = validateSettings(value)
    getDatabase().settings.set('appPreferences', JSON.stringify(settings))
    return settings
  })
  ipcMain.handle(IpcChannels.batchEvidence, (_event, id: unknown) =>
    batchEvidence(getDatabase(), positiveId(id))
  )
  ipcMain.handle(IpcChannels.itemSources, (_event, id: unknown) => {
    const db = getDatabase(),
      item = db.productionItems.getById(positiveId(id))
    if (!item) throw new Error('Item no longer exists.')
    return sourceOrders(db, item.batchId, item.id)
  })
  ipcMain.handle(IpcChannels.batchUpdate, (_event, input: unknown) => {
    if (!input || typeof input !== 'object') throw new Error('Batch update is required.')
    const r = input as { id: unknown; name: unknown; notes: unknown; status: unknown }
    const db = getDatabase(),
      id = positiveId(r.id),
      batch = db.batches.getById(id)
    if (!batch) throw new Error('Batch no longer exists.')
    const status = String(r.status)
    const transitions: Record<string, string[]> = {
      draft: ['draft', 'ready', 'archived'],
      ready: ['draft', 'ready', 'archived'],
      printed: ['printed', 'archived'],
      archived: ['archived', batch.printedAt ? 'printed' : 'draft']
    }
    if (!transitions[batch.status]?.includes(status))
      throw new Error('That status transition is not allowed.')
    const name = boundedText(r.name, 'Batch name'),
      notes = boundedText(r.notes, 'Batch notes', false, 2000)
    if (
      (batch.status === 'printed' || batch.status === 'archived') &&
      (name !== batch.name || notes !== batch.notes)
    )
      throw new Error('Historical batch details are locked.')
    return db.transaction(() => {
      db.batches.update(id, { name, notes })
      if (status === 'ready') assertComplete(db, id)
      const saved = db.batches.update(id, { status: status as typeof batch.status })
      audit(
        db,
        id,
        'batch-updated',
        `Status ${batch.status} to ${status}; name and reconciliation notes saved`
      )
      return saved
    })
  })
  ipcMain.handle(IpcChannels.backupsList, () => listBackups(resolveBackupDirectory()))
  ipcMain.handle(
    IpcChannels.backupStatus,
    () => getDatabase().settings.get('backupLastError') ?? ''
  )
  ipcMain.handle(IpcChannels.backupCreate, async () => {
    const snapshot = createBackup(getDatabase(), resolveBackupDirectory())
    getDatabase().settings.set('backupLastError', '')
    return `Verified backup saved: ${snapshot}`
  })
  ipcMain.handle(IpcChannels.backupRestore, async (_event, name: unknown) => {
    let path: string
    if (name === null) {
      const chosen = await dialog.showOpenDialog({
        title: 'Choose a SlipFlow backup',
        properties: ['openFile'],
        filters: [{ name: 'SQLite backup', extensions: ['db'] }]
      })
      if (chosen.canceled || !chosen.filePaths[0]) return 'Restore cancelled.'
      path = chosen.filePaths[0]
    } else path = backupPath(resolveBackupDirectory(), boundedText(name, 'Backup name'))
    verifyBackup(path)
    const confirmation = await dialog.showMessageBox({
      type: 'warning',
      title: 'Restore database',
      message: 'Replace current SlipFlow data with this verified backup?',
      detail:
        'A recovery snapshot of your current data will be kept. Changes since the selected backup will not appear after restoration.',
      buttons: ['Cancel', 'Restore backup'],
      defaultId: 0,
      cancelId: 0
    })
    if (confirmation.response !== 1) return 'Restore cancelled.'
    const recovery = restoreBackup(path, resolveBackupDirectory())
    return `Restored and verified. Previous data is recoverable from ${recovery}`
  })
}

export function startAutomaticBackups(): NodeJS.Timeout {
  let last = Date.now()
  return setInterval(() => {
    try {
      const db = getDatabase(),
        minutes = getSettings(db).backupMinutes
      if (minutes && Date.now() - last >= minutes * 60_000) {
        createBackup(db, resolveBackupDirectory(), 'auto')
        db.settings.set('backupLastError', '')
        last = Date.now()
      }
    } catch {
      getDatabase().settings.set(
        'backupLastError',
        'Automatic backup failed. Check disk space and make a manual backup.'
      )
    }
  }, 60_000)
}
