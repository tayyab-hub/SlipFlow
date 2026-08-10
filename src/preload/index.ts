import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { IpcChannels } from '@shared/ipc-channels'
import type { AppInfo, ApplyMappingRequest, ImportFile, UploadResult } from '@shared/types'

/**
 * The ONLY door between main and renderer. Every capability the UI needs is an
 * explicit, narrow function here — never expose `ipcRenderer` itself, and never
 * expose a generic `invoke(channel, ...args)` passthrough.
 */
const api = {
  getAppInfo: (): Promise<AppInfo> => ipcRenderer.invoke(IpcChannels.appInfo),

  /** Opens the native file picker. Returns `[]` if the operator cancels. */
  pickOrderFiles: (): Promise<string[]> => ipcRenderer.invoke(IpcChannels.uploadPickFiles),

  importOrderFiles: (filePaths: string[]): Promise<UploadResult[]> =>
    ipcRenderer.invoke(IpcChannels.uploadImportFiles, filePaths),

  applyColumnMapping: (request: ApplyMappingRequest): Promise<UploadResult> =>
    ipcRenderer.invoke(IpcChannels.uploadApplyMapping, request),

  listPendingImports: (): Promise<ImportFile[]> =>
    ipcRenderer.invoke(IpcChannels.uploadListPending),

  removeImport: (importFileId: number): Promise<boolean> =>
    ipcRenderer.invoke(IpcChannels.uploadRemoveFile, importFileId),

  /**
   * Resolves a dropped `File` to its path on disk.
   *
   * `File.path` was removed from Electron, and `webUtils` only works in this context —
   * hence the thin wrapper. It returns a path, not file contents, so the renderer still
   * never reads from disk itself.
   */
  pathForDroppedFile: (file: File): string => webUtils.getPathForFile(file)
}

export type StitchFlowApi = typeof api

contextBridge.exposeInMainWorld('stitchflow', api)