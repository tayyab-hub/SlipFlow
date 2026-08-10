import { contextBridge, ipcRenderer } from 'electron'
import { IpcChannels } from '@shared/ipc-channels'
import type { AppInfo } from '@shared/types'

/**
 * The ONLY door between main and renderer. Every capability the UI needs is an
 * explicit, narrow function here — never expose `ipcRenderer` itself, and never
 * expose a generic `invoke(channel, ...args)` passthrough.
 */
const api = {
  getAppInfo: (): Promise<AppInfo> => ipcRenderer.invoke(IpcChannels.appInfo)
}

export type StitchFlowApi = typeof api

contextBridge.exposeInMainWorld('stitchflow', api)
