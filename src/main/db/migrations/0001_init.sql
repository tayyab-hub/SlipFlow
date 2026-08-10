-- ===========================================================================
-- 0001_init — StitchFlow initial schema
--
-- APPEND-ONLY. Once this migration has run against a real database, never edit
-- this file: add 0002_<description>.sql instead. See CLAUDE.md §5.1.
--
-- Conventions
--   * snake_case tables and columns; camelCase only in TypeScript
--   * timestamps are ISO-8601 UTC TEXT, e.g. '2026-08-10T09:15:00.000Z'
--   * booleans are INTEGER 0/1 with a CHECK constraint
--   * every table is STRICT, so SQLite rejects a value of the wrong type instead
--     of silently storing it — worth having when the input is spreadsheets
--   * optional TEXT columns are NOT NULL DEFAULT '' rather than nullable when
--     they take part in a UNIQUE index: SQLite treats NULLs as distinct, so two
--     NULL rows would both be accepted and the constraint would not hold
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- settings — key/value user preferences (factory name, paper size, sorting…).
-- Surfaced by the Settings screen in Phase 7.
-- ---------------------------------------------------------------------------
CREATE TABLE settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

-- ---------------------------------------------------------------------------
-- column_mappings — a remembered answer to "which column is the SKU?".
--
-- header_signature is a normalised fingerprint of the file's header row. When a
-- file with the same fingerprint is uploaded again, its saved mapping is reused
-- and the operator is not asked twice (Phase 3).
-- ---------------------------------------------------------------------------
CREATE TABLE column_mappings (
  id               INTEGER PRIMARY KEY,
  name             TEXT NOT NULL,
  platform         TEXT NOT NULL DEFAULT '',
  header_signature TEXT NOT NULL,
  sku_column       TEXT NOT NULL DEFAULT '',
  variation_column TEXT NOT NULL DEFAULT '',
  colour_column    TEXT NOT NULL DEFAULT '',
  size_column      TEXT NOT NULL DEFAULT '',
  quantity_column  TEXT NOT NULL DEFAULT '',
  order_id_column  TEXT NOT NULL DEFAULT '',
  times_used       INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
) STRICT;

CREATE UNIQUE INDEX idx_column_mappings_signature
  ON column_mappings (header_signature);

-- ---------------------------------------------------------------------------
-- batches — one saved production run. total_* and unresolved_count are stored
-- rather than derived so the history list (Phase 7) needs no aggregate queries.
-- ---------------------------------------------------------------------------
CREATE TABLE batches (
  id               INTEGER PRIMARY KEY,
  batch_number     TEXT NOT NULL,
  name             TEXT NOT NULL DEFAULT '',
  status           TEXT NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft', 'ready', 'printed', 'archived')),
  total_items      INTEGER NOT NULL DEFAULT 0,
  total_units      INTEGER NOT NULL DEFAULT 0,
  unresolved_count INTEGER NOT NULL DEFAULT 0,
  notes            TEXT NOT NULL DEFAULT '',
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL,
  printed_at       TEXT
) STRICT;

CREATE UNIQUE INDEX idx_batches_batch_number ON batches (batch_number);
CREATE INDEX idx_batches_created_at ON batches (created_at DESC);

-- ---------------------------------------------------------------------------
-- import_files — one row per uploaded spreadsheet.
--
-- file_hash is the content hash, so re-uploading the identical file can be
-- recognised before any parsing (Phase 4 duplicate handling).
-- ---------------------------------------------------------------------------
CREATE TABLE import_files (
  id                INTEGER PRIMARY KEY,
  batch_id          INTEGER REFERENCES batches (id) ON DELETE CASCADE,
  column_mapping_id INTEGER REFERENCES column_mappings (id) ON DELETE SET NULL,
  file_name         TEXT NOT NULL,
  file_path         TEXT NOT NULL DEFAULT '',
  file_hash         TEXT NOT NULL DEFAULT '',
  file_size         INTEGER NOT NULL DEFAULT 0,
  sheet_name        TEXT NOT NULL DEFAULT '',
  platform          TEXT NOT NULL DEFAULT 'unknown',
  row_count         INTEGER NOT NULL DEFAULT 0,
  detection_status  TEXT NOT NULL DEFAULT 'pending'
                      CHECK (detection_status IN ('pending', 'auto', 'manual', 'failed')),
  imported_at       TEXT NOT NULL
) STRICT;

CREATE INDEX idx_import_files_batch ON import_files (batch_id);
CREATE INDEX idx_import_files_hash ON import_files (file_hash);

-- ---------------------------------------------------------------------------
-- imported_orders — order lines exactly as read from the file, before any SKU
-- mapping or grouping. Kept as the audit trail: it answers "where did this
-- production line come from?" and is what duplicate detection compares against.
--
-- duplicate_hash = hash(order_id + sku + variation + quantity), per the spec.
-- ---------------------------------------------------------------------------
CREATE TABLE imported_orders (
  id             INTEGER PRIMARY KEY,
  import_file_id INTEGER NOT NULL REFERENCES import_files (id) ON DELETE CASCADE,
  batch_id       INTEGER REFERENCES batches (id) ON DELETE CASCADE,
  row_number     INTEGER NOT NULL DEFAULT 0,
  order_id       TEXT NOT NULL DEFAULT '',
  platform       TEXT NOT NULL DEFAULT 'unknown',
  raw_sku        TEXT NOT NULL DEFAULT '',
  raw_variation  TEXT NOT NULL DEFAULT '',
  raw_colour     TEXT NOT NULL DEFAULT '',
  raw_size       TEXT NOT NULL DEFAULT '',
  quantity       INTEGER NOT NULL DEFAULT 0,
  duplicate_hash TEXT NOT NULL DEFAULT '',
  is_duplicate   INTEGER NOT NULL DEFAULT 0 CHECK (is_duplicate IN (0, 1)),
  created_at     TEXT NOT NULL
) STRICT;

CREATE INDEX idx_imported_orders_file ON imported_orders (import_file_id);
CREATE INDEX idx_imported_orders_batch ON imported_orders (batch_id);
CREATE INDEX idx_imported_orders_duplicate_hash ON imported_orders (duplicate_hash);

-- ---------------------------------------------------------------------------
-- sku_mappings — incoming marketplace SKU → factory SKU / colour / size.
--
-- COLLATE NOCASE on the matching columns: marketplace exports are inconsistent
-- about case, and 'ABC-01' and 'abc-01' are the same product. This makes both
-- the unique index and ordinary WHERE comparisons case-insensitive.
--
-- platform = '' means "applies to every platform"; a platform-specific row is
-- the more specific match and Phase 4 should prefer it.
-- ---------------------------------------------------------------------------
CREATE TABLE sku_mappings (
  id                 INTEGER PRIMARY KEY,
  incoming_sku       TEXT NOT NULL COLLATE NOCASE,
  incoming_variation TEXT NOT NULL DEFAULT '' COLLATE NOCASE,
  platform           TEXT NOT NULL DEFAULT '' COLLATE NOCASE,
  factory_sku        TEXT NOT NULL,
  factory_colour     TEXT NOT NULL DEFAULT '',
  factory_size       TEXT NOT NULL DEFAULT '',
  notes              TEXT NOT NULL DEFAULT '',
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
) STRICT;

CREATE UNIQUE INDEX idx_sku_mappings_incoming
  ON sku_mappings (incoming_sku, incoming_variation, platform);
CREATE INDEX idx_sku_mappings_factory ON sku_mappings (factory_sku);

-- ---------------------------------------------------------------------------
-- production_items — the grouped lines that get printed: one row per
-- factory SKU + colour + size, with quantities already summed.
--
-- issue_type '' means clean. is_resolved = 0 holds a row back from printing
-- until the operator confirms it (Phase 5).
--
-- Deliberately NOT unique on (batch_id, factory_sku, colour, size): Phase 5
-- lets the operator add and merge rows by hand, and a unique constraint would
-- block legitimate edits. Grouping is enforced in code at insert time.
-- ---------------------------------------------------------------------------
CREATE TABLE production_items (
  id               INTEGER PRIMARY KEY,
  batch_id         INTEGER NOT NULL REFERENCES batches (id) ON DELETE CASCADE,
  factory_sku      TEXT NOT NULL DEFAULT '',
  colour           TEXT NOT NULL DEFAULT '',
  size             TEXT NOT NULL DEFAULT '',
  quantity         INTEGER NOT NULL DEFAULT 0,
  source_platforms TEXT NOT NULL DEFAULT '',
  issue_type       TEXT NOT NULL DEFAULT ''
                     CHECK (issue_type IN (
                       '', 'missing_sku', 'missing_colour', 'missing_size',
                       'invalid_quantity', 'unknown_mapping', 'duplicate'
                     )),
  issue_note       TEXT NOT NULL DEFAULT '',
  is_resolved      INTEGER NOT NULL DEFAULT 1 CHECK (is_resolved IN (0, 1)),
  is_manual        INTEGER NOT NULL DEFAULT 0 CHECK (is_manual IN (0, 1)),
  sort_order       INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
) STRICT;

CREATE INDEX idx_production_items_batch ON production_items (batch_id, sort_order);
CREATE INDEX idx_production_items_resolved ON production_items (batch_id, is_resolved);
