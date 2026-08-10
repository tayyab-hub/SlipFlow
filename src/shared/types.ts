/**
 * Domain models and IPC payload shapes shared by main and renderer.
 * Defined once here and imported by both sides — never redeclared per side.
 *
 * Records mirror the tables in src/main/db/migrations/0001_init.sql. DB columns are
 * snake_case; these are camelCase, and the repositories map between them.
 */

// ---------------------------------------------------------------------------
// App / UI
// ---------------------------------------------------------------------------

/** Static app/environment info, surfaced in the status bar. */
export interface AppInfo {
  appVersion: string
  electronVersion: string
  platform: string
  /** True when running from a packaged build rather than `npm run dev`. */
  packaged: boolean
}

/**
 * The four dashboard counters.
 *
 * Still placeholder zeros in the UI — nothing queries the database for these yet.
 */
export interface DashboardSummary {
  /** Orders read from uploaded marketplace files. */
  ordersImported: number
  /** Total units to sew, after grouping by factory SKU + colour + size. */
  itemsToProduce: number
  /** Rows with unresolved issues — excluded from print until fixed. */
  needsReview: number
  /** Production batches saved today. */
  batchesToday: number
}

export const EMPTY_DASHBOARD_SUMMARY: DashboardSummary = {
  ordersImported: 0,
  itemsToProduce: 0,
  needsReview: 0,
  batchesToday: 0
}

// ---------------------------------------------------------------------------
// Enumerations (these match CHECK constraints in the schema — keep in sync)
// ---------------------------------------------------------------------------

export type BatchStatus = 'draft' | 'ready' | 'printed' | 'archived'

export type DetectionStatus = 'pending' | 'auto' | 'manual' | 'failed'

/** `''` means the row is clean. */
export type ProductionIssueType =
  | ''
  | 'missing_sku'
  | 'missing_colour'
  | 'missing_size'
  | 'invalid_quantity'
  | 'unknown_mapping'
  | 'duplicate'

/**
 * Marketplace ids we know about. Platform columns are stored as free text so
 * adding a marketplace never needs a migration — this list is for the UI.
 */
export const KNOWN_PLATFORMS = ['tiktok', 'shopee', 'lazada', 'unknown'] as const
export type KnownPlatform = (typeof KNOWN_PLATFORMS)[number]

// ---------------------------------------------------------------------------
// settings
// ---------------------------------------------------------------------------

export interface Setting {
  key: string
  value: string
  updatedAt: string
}

// ---------------------------------------------------------------------------
// column_mappings
// ---------------------------------------------------------------------------

export interface ColumnMapping {
  id: number
  /** Human label, e.g. "Lazada export (Aug 2026)". */
  name: string
  platform: string
  /** Normalised fingerprint of the file's header row — how a format is recognised again. */
  headerSignature: string
  skuColumn: string
  variationColumn: string
  colourColumn: string
  sizeColumn: string
  quantityColumn: string
  orderIdColumn: string
  timesUsed: number
  createdAt: string
  updatedAt: string
}

export interface NewColumnMapping {
  name: string
  headerSignature: string
  platform?: string
  skuColumn?: string
  variationColumn?: string
  colourColumn?: string
  sizeColumn?: string
  quantityColumn?: string
  orderIdColumn?: string
}

export type ColumnMappingUpdate = Partial<Omit<ColumnMapping, 'id' | 'createdAt' | 'updatedAt'>>

// ---------------------------------------------------------------------------
// batches
// ---------------------------------------------------------------------------

export interface Batch {
  id: number
  /** Human reference shown on the printed sheet, e.g. "2026-08-10-001". */
  batchNumber: string
  name: string
  status: BatchStatus
  totalItems: number
  totalUnits: number
  unresolvedCount: number
  notes: string
  createdAt: string
  updatedAt: string
  printedAt: string | null
}

export interface NewBatch {
  batchNumber: string
  name?: string
  status?: BatchStatus
  totalItems?: number
  totalUnits?: number
  unresolvedCount?: number
  notes?: string
}

export type BatchUpdate = Partial<Omit<Batch, 'id' | 'createdAt' | 'updatedAt'>>

// ---------------------------------------------------------------------------
// import_files
// ---------------------------------------------------------------------------

export interface ImportFile {
  id: number
  batchId: number | null
  columnMappingId: number | null
  fileName: string
  filePath: string
  /** Content hash, so an identical re-upload is recognised before parsing. */
  fileHash: string
  fileSize: number
  sheetName: string
  platform: string
  rowCount: number
  detectionStatus: DetectionStatus
  importedAt: string
}

export interface NewImportFile {
  fileName: string
  batchId?: number | null
  columnMappingId?: number | null
  filePath?: string
  fileHash?: string
  fileSize?: number
  sheetName?: string
  platform?: string
  rowCount?: number
  detectionStatus?: DetectionStatus
}

export type ImportFileUpdate = Partial<Omit<ImportFile, 'id' | 'importedAt'>>

// ---------------------------------------------------------------------------
// imported_orders
// ---------------------------------------------------------------------------

export interface ImportedOrder {
  id: number
  importFileId: number
  batchId: number | null
  /** Line number in the source file, for "row 42 is broken" messages. */
  rowNumber: number
  orderId: string
  platform: string
  rawSku: string
  rawVariation: string
  rawColour: string
  rawSize: string
  quantity: number
  /** hash(orderId + sku + variation + quantity) — the duplicate key. */
  duplicateHash: string
  isDuplicate: boolean
  createdAt: string
}

export interface NewImportedOrder {
  importFileId: number
  batchId?: number | null
  rowNumber?: number
  orderId?: string
  platform?: string
  rawSku?: string
  rawVariation?: string
  rawColour?: string
  rawSize?: string
  quantity?: number
  duplicateHash?: string
  isDuplicate?: boolean
}

// ---------------------------------------------------------------------------
// sku_mappings
// ---------------------------------------------------------------------------

export interface SkuMapping {
  id: number
  incomingSku: string
  /** `''` when the mapping is by SKU alone. */
  incomingVariation: string
  /** `''` means "applies to every platform". */
  platform: string
  factorySku: string
  factoryColour: string
  factorySize: string
  notes: string
  createdAt: string
  updatedAt: string
}

export interface NewSkuMapping {
  incomingSku: string
  factorySku: string
  incomingVariation?: string
  platform?: string
  factoryColour?: string
  factorySize?: string
  notes?: string
}

export type SkuMappingUpdate = Partial<Omit<SkuMapping, 'id' | 'createdAt' | 'updatedAt'>>

// ---------------------------------------------------------------------------
// production_items
// ---------------------------------------------------------------------------

export interface ProductionItem {
  id: number
  batchId: number
  factorySku: string
  colour: string
  size: string
  quantity: number
  /** Comma-separated platform ids the quantity came from, for reference. */
  sourcePlatforms: string
  issueType: ProductionIssueType
  issueNote: string
  /** Unresolved rows are excluded from the printed sheet. */
  isResolved: boolean
  /** True when the operator added or edited the row by hand. */
  isManual: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface NewProductionItem {
  batchId: number
  factorySku?: string
  colour?: string
  size?: string
  quantity?: number
  sourcePlatforms?: string
  issueType?: ProductionIssueType
  issueNote?: string
  isResolved?: boolean
  isManual?: boolean
  sortOrder?: number
}

export type ProductionItemUpdate = Partial<
  Omit<ProductionItem, 'id' | 'batchId' | 'createdAt' | 'updatedAt'>
>

// ---------------------------------------------------------------------------
// Upload + column detection (Phase 3)
// ---------------------------------------------------------------------------

/**
 * Which column in a file holds which field. Values are header names exactly as they
 * appear in the file; `''` means "this file doesn't have that column".
 */
export interface FieldMapping {
  orderId: string
  sku: string
  variation: string
  colour: string
  size: string
  quantity: string
}

export const EMPTY_FIELD_MAPPING: FieldMapping = {
  orderId: '',
  sku: '',
  variation: '',
  colour: '',
  size: '',
  quantity: ''
}

/** Display order for the manual-mapping screen. */
export const MAPPABLE_FIELDS = [
  'sku',
  'variation',
  'colour',
  'size',
  'quantity',
  'orderId'
] as const satisfies readonly (keyof FieldMapping)[]

export type MappableField = (typeof MAPPABLE_FIELDS)[number]

export const FIELD_LABELS: Record<MappableField, string> = {
  sku: 'SKU',
  variation: 'Variation',
  colour: 'Colour',
  size: 'Size',
  quantity: 'Quantity',
  orderId: 'Order ID'
}

/** Without these two a file cannot be imported at all. */
export const REQUIRED_MAPPING_FIELDS = ['sku', 'quantity'] as const satisfies readonly MappableField[]

export const FIELD_HINTS: Record<MappableField, string> = {
  sku: 'The product code the factory recognises',
  variation: 'Colour and size together, e.g. "Black,M" — split later',
  colour: 'Only if the file has a separate colour column',
  size: 'Only if the file has a separate size column',
  quantity: 'How many units were ordered',
  orderId: 'Used to spot the same order imported twice'
}

/** What the manual-mapping screen needs in order to ask the operator. */
export interface FilePreview {
  headers: string[]
  /** First few data rows, so the operator can see what's in each column. */
  sampleRows: string[][]
  /** Whatever detection did manage to work out — pre-fills the dropdowns. */
  suggested: FieldMapping
  /** Plain-language reason detection wasn't enough. */
  reason: string
}

export type UploadStatus =
  /** Rows are in the database. */
  | 'imported'
  /** Nothing was written; the operator has to map the columns. */
  | 'needs_mapping'
  /** Could not read the file at all. */
  | 'failed'

export interface UploadResult {
  status: UploadStatus
  fileName: string
  filePath: string
  /** Which sheet was used, and what else was in the workbook. */
  sheetName: string
  sheetNames: string[]
  platform: string
  platformConfidence: number
  /** Order lines written (or that would be written) — the "detected rows" count. */
  rowCount: number
  blankRowsSkipped: number
  /** Rows whose quantity could not be read as a number; stored as 0 for Phase 5 to flag. */
  invalidQuantityRows: number
  /**
   * Rows whose duplicate hash already exists in the database. Reported only — Phase 4
   * owns the Ignore / Import Anyway decision.
   */
  duplicateRows: number
  detectionStatus: DetectionStatus
  importFileId: number | null
  mapping: FieldMapping
  /** True when a previously saved mapping recognised this file's layout. */
  usedSavedMapping: boolean
  /** True when this upload saved a new mapping for reuse. */
  mappingRemembered: boolean
  /** Present only when `status === 'needs_mapping'`. */
  preview: FilePreview | null
  message: string
}

/** Sent when the operator finishes the manual-mapping screen. */
export interface ApplyMappingRequest {
  filePath: string
  mapping: FieldMapping
  /** Save the mapping so files with the same layout are recognised next time. */
  remember: boolean
  /** Label for the saved mapping; ignored when `remember` is false. */
  mappingName: string
  platform: string
}
