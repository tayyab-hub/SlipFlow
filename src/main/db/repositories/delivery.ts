import type { StitchFlowDatabase } from '..'
import type { BatchEvidence, SellerAccount, SourceOrder } from '@shared/delivery'
import type { KnownPlatform, NewImportedOrder } from '@shared/types'
import { nowIso } from '../rows'

export function listSellers(db: StitchFlowDatabase): SellerAccount[] {
  return db.raw
    .prepare('SELECT * FROM seller_accounts ORDER BY platform,name')
    .all()
    .map((r) => ({
      id: Number(r.id),
      name: String(r.name),
      platform: String(r.platform) as KnownPlatform,
      active: r.active === 1
    }))
}
export function saveSeller(
  db: StitchFlowDatabase,
  name: string,
  platform: string,
  id?: number,
  active = true
): void {
  if (id)
    db.raw
      .prepare('UPDATE seller_accounts SET name=?,active=? WHERE id=?')
      .run(name, Number(active), id)
  else
    db.raw
      .prepare('INSERT INTO seller_accounts(name,platform,created_at) VALUES(?,?,?)')
      .run(name, platform, nowIso())
}
export function audit(
  db: StitchFlowDatabase,
  batchId: number | null,
  action: string,
  detail: string
): void {
  db.raw
    .prepare('INSERT INTO audit_events(batch_id,action,detail,created_at) VALUES(?,?,?,?)')
    .run(batchId, action, detail, nowIso())
}
export function linkSources(
  db: StitchFlowDatabase,
  itemId: number,
  orderIds: readonly number[]
): void {
  const insert = db.raw.prepare('INSERT OR IGNORE INTO production_sources VALUES(?,?)')
  for (const orderId of orderIds) insert.run(itemId, orderId)
}
export function mergeSources(db: StitchFlowDatabase, target: number, source: number): void {
  db.raw
    .prepare(
      'INSERT OR IGNORE INTO production_sources SELECT ?,imported_order_id FROM production_sources WHERE production_item_id=?'
    )
    .run(target, source)
}
export function sourceOrders(
  db: StitchFlowDatabase,
  batchId: number,
  itemId?: number
): SourceOrder[] {
  const sellers = new Map(listSellers(db).map((s) => [s.id, s.name]))
  const linked = itemId
    ? new Set(
        db.raw
          .prepare('SELECT imported_order_id FROM production_sources WHERE production_item_id=?')
          .all(itemId)
          .map((r) => Number(r.imported_order_id))
      )
    : null
  return db.importedOrders
    .listByBatch(batchId)
    .filter((o) => !linked || linked.has(o.id))
    .map((order) => {
      const file = db.importFiles.getById(order.importFileId)!
      return {
        ...order,
        fileName: file.fileName,
        sheetName: file.sheetName,
        sellerName: sellers.get(order.sellerAccountId ?? 0) ?? 'Legacy / unassigned'
      }
    })
}
export function batchEvidence(db: StitchFlowDatabase, batchId: number): BatchEvidence {
  const orders = sourceOrders(db, batchId)
  const included = orders.filter((o) => !o.isDuplicate)
  return {
    orders,
    sourceUnits: included.reduce((s, o) => s + o.quantity, 0),
    productionUnits: db.productionItems.totalsForBatch(batchId).units,
    invalidSourceRows: included.filter((o) => o.quantity <= 0 || o.validationNote).length,
    duplicateRows: orders.length - included.length,
    events: db.raw
      .prepare(
        'SELECT action,detail,created_at FROM audit_events WHERE batch_id=? ORDER BY id DESC'
      )
      .all(batchId)
      .map((r) => ({
        action: String(r.action),
        detail: String(r.detail),
        createdAt: String(r.created_at)
      }))
  }
}

export function duplicateDecision(
  db: StitchFlowDatabase,
  order: NewImportedOrder,
  fileHash: string,
  sheetName: string
): 'new' | 'duplicate' | 'review' {
  const candidates = db.raw
    .prepare(`SELECT o.*, f.file_hash, f.sheet_name FROM imported_orders o JOIN import_files f ON f.id=o.import_file_id
    WHERE o.duplicate_hash=? OR (o.seller_account_id IS NULL AND o.platform=? AND o.order_id<>'' AND o.order_id=? AND o.raw_sku=?)`)
    .all(order.duplicateHash ?? '', order.platform ?? '', order.orderId ?? '', order.rawSku ?? '')
  if (!candidates.length) return 'new'
  const equal = candidates.some(
    (r) =>
      Number(r.quantity) === order.quantity &&
      String(r.raw_sku) === order.rawSku &&
      String(r.raw_variation) === order.rawVariation &&
      String(r.raw_colour) === order.rawColour &&
      String(r.raw_size) === order.rawSize &&
      r.seller_account_id === (order.sellerAccountId ?? null) &&
      (String(r.order_line_id) !== '' || (r.file_hash === fileHash && r.sheet_name === sheetName))
  )
  return equal ? 'duplicate' : 'review'
}
