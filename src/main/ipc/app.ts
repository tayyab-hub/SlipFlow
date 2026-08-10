import { app, ipcMain } from 'electron'
import { IpcChannels } from '@shared/ipc-channels'
import type { AppInfo } from '@shared/types'

export function registerAppHandlers(): void {
  ipcMain.handle(IpcChannels.appInfo, (): AppInfo => {
    return {
      appVersion: app.getVersion(),
      electronVersion: process.versions.electron,
      platform: process.platform,
      packaged: app.isPackaged
    }
  })
}