/**
 * Canonical IPC channel names. Never inline a raw channel string anywhere else —
 * main, preload and renderer all import from here so a rename can't half-apply.
 */
export const IpcChannels = {
  appInfo: 'app:info',
  appDashboardSummary: 'app:dashboard-summary',

  uploadPickFiles: 'upload:pick-files',
  uploadImportFiles: 'upload:import-files',
  uploadApplyMapping: 'upload:apply-mapping',
  uploadListPending: 'upload:list-pending',
  uploadRemoveFile: 'upload:remove-file',
  uploadUnmarkDuplicates: 'upload:unmark-duplicates',

  skuMappingsList: 'sku-mappings:list',
  skuMappingsCreate: 'sku-mappings:create',
  skuMappingsUpdate: 'sku-mappings:update',
  skuMappingsRemove: 'sku-mappings:remove',
  skuMappingsBulkImport: 'sku-mappings:bulk-import',

  batchesCreateFromPending: 'batches:create-from-pending'
} as const

export type IpcChannel = (typeof IpcChannels)[keyof typeof IpcChannels]