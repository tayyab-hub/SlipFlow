import type { ImportedOrder, KnownPlatform } from './types'
export interface SellerAccount {
  id: number
  name: string
  platform: KnownPlatform
  active: boolean
}
export interface AppSettings {
  factoryName: string
  printLayout: 'standard' | 'grouped'
  defaultSort: 'sku' | 'size' | 'colour' | 'quantity'
  dateFormat: 'en-GB' | 'en-US' | 'iso'
  backupMinutes: number
  backupRetention: number
}
export const DEFAULT_SETTINGS: AppSettings = {
  factoryName: 'My Factory',
  printLayout: 'standard',
  defaultSort: 'size',
  dateFormat: 'en-GB',
  backupMinutes: 60,
  backupRetention: 14
}
export interface SourceOrder extends ImportedOrder {
  fileName: string
  sellerName: string
  sheetName: string
}
export interface BatchEvidence {
  orders: SourceOrder[]
  sourceUnits: number
  productionUnits: number
  invalidSourceRows: number
  duplicateRows: number
  events: { action: string; detail: string; createdAt: string }[]
}
export interface BackupInfo {
  name: string
  size: number
  modifiedAt: string
}
