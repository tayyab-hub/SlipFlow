import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { IpcChannels } from '@shared/ipc-channels'
import type {
  AppInfo,
  ApplyMappingRequest,
  Batch,
  BatchGroupingResult,
  BulkImportSkuMappingsResult,
  DashboardSummary,
  ImportFile,
  NewProductionItem,
  NewSkuMapping,
  ProductionItem,
  ProductionItemUpdate,
  SkuMapping,
  SkuMappingUpdate,
  UploadResult
} from '@shared/types'

/**
 * The ONLY door between main and renderer. Every capability the UI needs is an
 * explicit, narrow function here — never expose `ipcRenderer` itself, and never
 * expose a generic `invoke(channel, ...args)` passthrough.
 */
const api = {
  getAppInfo: (): Promise<AppInfo> => ipcRenderer.invoke(IpcChannels.appInfo),

  getDashboardSummary: (): Promise<DashboardSummary> =>
    ipcRenderer.invoke(IpcChannels.appDashboardSummary),

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

  /** "Import Anyway" for a file's rows that matched an existing duplicate hash. */
  unmarkDuplicates: (importFileId: number): Promise<number> =>
    ipcRenderer.invoke(IpcChannels.uploadUnmarkDuplicates, importFileId),

  listSkuMappings: (): Promise<SkuMapping[]> => ipcRenderer.invoke(IpcChannels.skuMappingsList),

  createSkuMapping: (input: NewSkuMapping): Promise<SkuMapping> =>
    ipcRenderer.invoke(IpcChannels.skuMappingsCreate, input),

  updateSkuMapping: (id: number, changes: SkuMappingUpdate): Promise<SkuMapping | null> =>
    ipcRenderer.invoke(IpcChannels.skuMappingsUpdate, { id, changes }),

  removeSkuMapping: (id: number): Promise<boolean> =>
    ipcRenderer.invoke(IpcChannels.skuMappingsRemove, id),

  /** Opens a file picker and imports the chosen spreadsheet. `null` if cancelled. */
  bulkImportSkuMappings: (): Promise<BulkImportSkuMappingsResult | null> =>
    ipcRenderer.invoke(IpcChannels.skuMappingsBulkImport),

  /** Groups every currently-pending upload into one new production batch. */
  createBatchFromPending: (): Promise<BatchGroupingResult> =>
    ipcRenderer.invoke(IpcChannels.batchesCreateFromPending),

  listBatches: (options?: { limit?: number }): Promise<Batch[]> =>
    ipcRenderer.invoke(IpcChannels.batchesList, options ?? {}),

  getBatch: (id: number): Promise<Batch | null> =>
    ipcRenderer.invoke(IpcChannels.batchesGetById, id),

  listProductionItems: (batchId: number): Promise<ProductionItem[]> =>
    ipcRenderer.invoke(IpcChannels.productionItemsListByBatch, batchId),

  updateProductionItem: (id: number, changes: ProductionItemUpdate): Promise<ProductionItem | null> =>
    ipcRenderer.invoke(IpcChannels.productionItemsUpdate, { id, changes }),

  createProductionItem: (input: NewProductionItem): Promise<ProductionItem> =>
    ipcRenderer.invoke(IpcChannels.productionItemsCreate, input),

  removeProductionItem: (id: number): Promise<boolean> =>
    ipcRenderer.invoke(IpcChannels.productionItemsRemove, id),

  mergeProductionItems: (batchId: number, ids: number[]): Promise<ProductionItem> =>
    ipcRenderer.invoke(IpcChannels.productionItemsMerge, { batchId, ids }),

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