import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { IpcChannels } from '@shared/ipc-channels'
import type {
  AppSettings,
  BackupInfo,
  BatchEvidence,
  SellerAccount,
  SourceOrder
} from '@shared/delivery'
import type {
  AppInfo,
  ApplyMappingRequest,
  Batch,
  BatchGroupingResult,
  BulkImportSkuMappingsResult,
  DashboardSummary,
  ImportFile,
  ImportedOrder,
  NewProductionItem,
  NewSkuMapping,
  ProductionItem,
  ProductionItemUpdate,
  SavePdfResult,
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
  listSellers: (): Promise<SellerAccount[]> => ipcRenderer.invoke(IpcChannels.sellersList),
  saveSeller: (seller: {
    id?: number
    name: string
    platform: string
    active?: boolean
  }): Promise<SellerAccount[]> => ipcRenderer.invoke(IpcChannels.sellersSave, seller),
  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke(IpcChannels.settingsGet),
  saveSettings: (settings: AppSettings): Promise<AppSettings> =>
    ipcRenderer.invoke(IpcChannels.settingsSave, settings),
  batchEvidence: (id: number): Promise<BatchEvidence> =>
    ipcRenderer.invoke(IpcChannels.batchEvidence, id),
  itemSources: (id: number): Promise<SourceOrder[]> =>
    ipcRenderer.invoke(IpcChannels.itemSources, id),
  updateBatch: (input: {
    id: number
    name: string
    notes: string
    status: string
  }): Promise<Batch> => ipcRenderer.invoke(IpcChannels.batchUpdate, input),
  listBackups: (): Promise<BackupInfo[]> => ipcRenderer.invoke(IpcChannels.backupsList),
  backupStatus: (): Promise<string> => ipcRenderer.invoke(IpcChannels.backupStatus),
  createBackup: (): Promise<string> => ipcRenderer.invoke(IpcChannels.backupCreate),
  restoreBackup: (name: string | null): Promise<string> =>
    ipcRenderer.invoke(IpcChannels.backupRestore, name),
  nativePrint: (batchId: number, layout: string): Promise<string> =>
    ipcRenderer.invoke(IpcChannels.printNative, { batchId, layout }),
  printPreview: (batchId: number, layout: string): Promise<string> =>
    ipcRenderer.invoke(IpcChannels.printPreview, { batchId, layout }),
  getAppInfo: (): Promise<AppInfo> => ipcRenderer.invoke(IpcChannels.appInfo),

  getDashboardSummary: (): Promise<DashboardSummary> =>
    ipcRenderer.invoke(IpcChannels.appDashboardSummary),

  /** Opens the native file picker. Returns `[]` if the operator cancels. */
  pickOrderFiles: (): Promise<string[]> => ipcRenderer.invoke(IpcChannels.uploadPickFiles),

  importOrderFiles: (
    filePaths: string[],
    sellerAccountId: number,
    sheetName?: string
  ): Promise<UploadResult[]> =>
    ipcRenderer.invoke(IpcChannels.uploadImportFiles, { filePaths, sellerAccountId, sheetName }),

  applyColumnMapping: (request: ApplyMappingRequest): Promise<UploadResult> =>
    ipcRenderer.invoke(IpcChannels.uploadApplyMapping, request),

  listPendingImports: (): Promise<ImportFile[]> =>
    ipcRenderer.invoke(IpcChannels.uploadListPending),
  pendingOrderRows: (fileId: number): Promise<ImportedOrder[]> =>
    ipcRenderer.invoke(IpcChannels.uploadPendingRows, fileId),

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
  createBatchFromPending: (
    fileIds: number[],
    name: string,
    orderIds?: number[]
  ): Promise<BatchGroupingResult> =>
    ipcRenderer.invoke(IpcChannels.batchesCreateFromPending, { fileIds, name, orderIds }),

  listBatches: (options?: { limit?: number }): Promise<Batch[]> =>
    ipcRenderer.invoke(IpcChannels.batchesList, options ?? {}),

  getBatch: (id: number): Promise<Batch | null> =>
    ipcRenderer.invoke(IpcChannels.batchesGetById, id),

  markBatchPrinted: (id: number): Promise<Batch | null> =>
    ipcRenderer.invoke(IpcChannels.batchesMarkPrinted, id),

  listProductionItems: (batchId: number): Promise<ProductionItem[]> =>
    ipcRenderer.invoke(IpcChannels.productionItemsListByBatch, batchId),

  /** Resolved, issue-free rows only — what the print sheet shows. */
  listPrintableItems: (batchId: number): Promise<ProductionItem[]> =>
    ipcRenderer.invoke(IpcChannels.productionItemsListPrintable, batchId),

  updateProductionItem: (
    id: number,
    changes: ProductionItemUpdate
  ): Promise<ProductionItem | null> =>
    ipcRenderer.invoke(IpcChannels.productionItemsUpdate, { id, changes }),

  createProductionItem: (input: NewProductionItem): Promise<ProductionItem> =>
    ipcRenderer.invoke(IpcChannels.productionItemsCreate, input),

  removeProductionItem: (id: number): Promise<boolean> =>
    ipcRenderer.invoke(IpcChannels.productionItemsRemove, id),

  mergeProductionItems: (batchId: number, ids: number[]): Promise<ProductionItem> =>
    ipcRenderer.invoke(IpcChannels.productionItemsMerge, { batchId, ids }),

  /** Opens a save dialog and writes the current page as a PDF. `saved: false` if cancelled. */
  savePrintPdf: (batchId: number, layout: string): Promise<SavePdfResult> =>
    ipcRenderer.invoke(IpcChannels.printSaveAsPdf, { batchId, layout }),

  /**
   * Resolves a dropped `File` to its path on disk.
   *
   * `File.path` was removed from Electron, and `webUtils` only works in this context —
   * hence the thin wrapper. It returns a path, not file contents, so the renderer still
   * never reads from disk itself.
   */
  pathForDroppedFile: (file: File): string => {
    const path = webUtils.getPathForFile(file)
    if (path) ipcRenderer.send(IpcChannels.uploadDroppedFile, path)
    return path
  }
}

export type StitchFlowApi = typeof api

contextBridge.exposeInMainWorld('stitchflow', api)
