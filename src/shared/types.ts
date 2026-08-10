/**
 * Domain models and IPC payload shapes shared by main and renderer.
 * Defined once here and imported by both sides — never redeclared per side.
 */

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
 * Phase 1 renders placeholder zeros only — nothing populates this yet. Real values
 * arrive once the database (Phase 2) and batches (Phase 7) exist.
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
