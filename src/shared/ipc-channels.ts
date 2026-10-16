/**
 * Canonical IPC channel names. Never inline a raw channel string anywhere else —
 * main, preload and renderer all import from here so a rename can't half-apply.
 */
export const IpcChannels = {
  sellersList: 'sellers:list',
  sellersSave: 'sellers:save',
  settingsGet: 'settings:get',
  settingsSave: 'settings:save',
  batchUpdate: 'batches:update-details',
  batchEvidence: 'batches:evidence',
  itemSources: 'items:sources',
  backupsList: 'backups:list',
  backupCreate: 'backups:create',
  backupRestore: 'backups:restore',
  uploadDroppedFile: 'upload:dropped-file',
  printNative: 'print:native',
  printPreview: 'print:preview',
  appInfo: 'app:info',
  appDashboardSummary: 'app:dashboard-summary',

  uploadPickFiles: 'upload:pick-files',
  uploadImportFiles: 'upload:import-files',
  uploadApplyMapping: 'upload:apply-mapping',
  uploadListPending: 'upload:list-pending',
  uploadPendingRows: 'upload:pending-rows',
  backupStatus: 'backups:status',
  uploadRemoveFile: 'upload:remove-file',
  uploadUnmarkDuplicates: 'upload:unmark-duplicates',

  skuMappingsList: 'sku-mappings:list',
  skuMappingsCreate: 'sku-mappings:create',
  skuMappingsUpdate: 'sku-mappings:update',
  skuMappingsRemove: 'sku-mappings:remove',
  skuMappingsBulkImport: 'sku-mappings:bulk-import',

  batchesCreateFromPending: 'batches:create-from-pending',
  batchesList: 'batches:list',
  batchesGetById: 'batches:get-by-id',
  batchesMarkPrinted: 'batches:mark-printed',

  productionItemsListByBatch: 'production-items:list-by-batch',
  productionItemsListPrintable: 'production-items:list-printable',
  productionItemsUpdate: 'production-items:update',
  productionItemsCreate: 'production-items:create',
  productionItemsRemove: 'production-items:remove',
  productionItemsMerge: 'production-items:merge',

  printSaveAsPdf: 'print:save-as-pdf'
} as const

export type IpcChannel = (typeof IpcChannels)[keyof typeof IpcChannels]
