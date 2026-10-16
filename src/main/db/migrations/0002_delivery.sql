-- Additive delivery migration. Existing source records and legacy paths are preserved.
CREATE TABLE seller_accounts (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL COLLATE NOCASE,
  platform TEXT NOT NULL CHECK(platform IN ('tiktok','shopee','lazada','unknown')),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_at TEXT NOT NULL,
  UNIQUE(platform,name)
) STRICT;
ALTER TABLE import_files ADD COLUMN seller_account_id INTEGER REFERENCES seller_accounts(id);
ALTER TABLE imported_orders ADD COLUMN seller_account_id INTEGER REFERENCES seller_accounts(id);
ALTER TABLE imported_orders ADD COLUMN raw_quantity TEXT NOT NULL DEFAULT '';
ALTER TABLE imported_orders ADD COLUMN order_line_id TEXT NOT NULL DEFAULT '';
ALTER TABLE imported_orders ADD COLUMN validation_note TEXT NOT NULL DEFAULT '';
ALTER TABLE imported_orders ADD COLUMN product_name TEXT NOT NULL DEFAULT '';
CREATE INDEX idx_orders_identity ON imported_orders(platform,seller_account_id,order_id);
CREATE TABLE production_sources (
  production_item_id INTEGER NOT NULL REFERENCES production_items(id) ON DELETE CASCADE,
  imported_order_id INTEGER NOT NULL REFERENCES imported_orders(id) ON DELETE RESTRICT,
  PRIMARY KEY(production_item_id,imported_order_id)
) STRICT;
CREATE TABLE audit_events (
  id INTEGER PRIMARY KEY,
  batch_id INTEGER REFERENCES batches(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  detail TEXT NOT NULL,
  created_at TEXT NOT NULL
) STRICT;
UPDATE imported_orders SET raw_quantity=CAST(quantity AS TEXT);
-- Existing unfinished batches must be reviewed under the stricter release policy.
UPDATE batches SET status='draft' WHERE status='ready';
UPDATE production_items SET is_resolved=0, issue_type='unknown_mapping',
  issue_note='Legacy unfinished batch: confirm SKU, variant and quantity under the SlipFlow release validation policy.'
  WHERE batch_id IN (SELECT id FROM batches WHERE status='draft');
UPDATE batches SET unresolved_count=(SELECT COUNT(*) FROM production_items WHERE batch_id=batches.id AND (is_resolved=0 OR issue_type<>'')) WHERE status='draft';
