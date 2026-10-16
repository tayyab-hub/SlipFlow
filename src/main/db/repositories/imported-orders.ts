import type { DatabaseSync } from 'node:sqlite'
import type { ImportedOrder, NewImportedOrder } from '@shared/types'
import {
  nowIso,
  readBoolean,
  readInteger,
  readNullableInteger,
  readText,
  toDbBoolean,
  type DbRow
} from '../rows'
import { placeholders } from '../update-builder'

function toImportedOrder(row: DbRow): ImportedOrder {
  return {
    id: readInteger(row, 'id'),
    sellerAccountId: readNullableInteger(row, 'seller_account_id'),
    rawQuantity: readText(row, 'raw_quantity'),
    orderLineId: readText(row, 'order_line_id'),
    validationNote: readText(row, 'validation_note'),
    productName: readText(row, 'product_name'),
    importFileId: readInteger(row, 'import_file_id'),
    batchId: readNullableInteger(row, 'batch_id'),
    rowNumber: readInteger(row, 'row_number'),
    orderId: readText(row, 'order_id'),
    platform: readText(row, 'platform'),
    rawSku: readText(row, 'raw_sku'),
    rawVariation: readText(row, 'raw_variation'),
    rawColour: readText(row, 'raw_colour'),
    rawSize: readText(row, 'raw_size'),
    quantity: readInteger(row, 'quantity'),
    duplicateHash: readText(row, 'duplicate_hash'),
    isDuplicate: readBoolean(row, 'is_duplicate'),
    createdAt: readText(row, 'created_at')
  }
}

export interface ImportedOrdersRepository {
  create(input: NewImportedOrder): ImportedOrder
  /**
   * Bulk insert. Caller is expected to wrap this in a transaction so a bad row can't
   * leave a half-imported file behind (CLAUDE.md §5.10).
   */
  createMany(inputs: readonly NewImportedOrder[]): number
  getById(id: number): ImportedOrder | null
  listByFile(importFileId: number): ImportedOrder[]
  listByBatch(batchId: number): ImportedOrder[]
  /** Which of these duplicate hashes are already stored — the Phase 4 duplicate check. */
  findExistingHashes(hashes: readonly string[]): Set<string>
  markDuplicates(ids: readonly number[]): number
  /** "Import anyway" — clears the flag so a later grouping pass includes this file's rows. */
  clearDuplicateForFile(importFileId: number): number
  assignToBatch(importFileId: number, batchId: number): number
  deleteByFile(importFileId: number): number
  /** Total order lines ever imported, for the dashboard's "Orders Imported" counter. */
  count(): number
}

export function createImportedOrdersRepository(db: DatabaseSync): ImportedOrdersRepository {
  const insert = db.prepare(`
    INSERT INTO imported_orders (
      import_file_id, batch_id, row_number, order_id, platform,
      raw_sku, raw_variation, raw_colour, raw_size, quantity,
      duplicate_hash, is_duplicate, created_at, seller_account_id, raw_quantity, order_line_id, validation_note, product_name
    ) VALUES (
      $import_file_id, $batch_id, $row_number, $order_id, $platform,
      $raw_sku, $raw_variation, $raw_colour, $raw_size, $quantity,
      $duplicate_hash, $is_duplicate, $created_at, $seller_account_id, $raw_quantity, $order_line_id, $validation_note, $product_name
    )
  `)
  const selectById = db.prepare('SELECT * FROM imported_orders WHERE id = ?')
  const selectByFile = db.prepare(
    'SELECT * FROM imported_orders WHERE import_file_id = ? ORDER BY row_number, id'
  )
  const selectByBatch = db.prepare(
    'SELECT * FROM imported_orders WHERE batch_id = ? ORDER BY import_file_id, row_number, id'
  )
  const assign = db.prepare('UPDATE imported_orders SET batch_id = ? WHERE import_file_id = ?')
  const clearDuplicate = db.prepare(
    'UPDATE imported_orders SET is_duplicate = 0 WHERE import_file_id = ?'
  )
  const deleteByFileId = db.prepare('DELETE FROM imported_orders WHERE import_file_id = ?')
  const countAll = db.prepare('SELECT COUNT(*) AS total FROM imported_orders')

  function bind(input: NewImportedOrder): Record<string, string | number | null> {
    return {
      $import_file_id: input.importFileId,
      $seller_account_id: input.sellerAccountId ?? null,
      $raw_quantity: input.rawQuantity ?? String(input.quantity ?? 0),
      $order_line_id: input.orderLineId ?? '',
      $validation_note: input.validationNote ?? '',
      $product_name: input.productName ?? '',
      $batch_id: input.batchId ?? null,
      $row_number: input.rowNumber ?? 0,
      $order_id: input.orderId ?? '',
      $platform: input.platform ?? 'unknown',
      $raw_sku: input.rawSku ?? '',
      $raw_variation: input.rawVariation ?? '',
      $raw_colour: input.rawColour ?? '',
      $raw_size: input.rawSize ?? '',
      $quantity: input.quantity ?? 0,
      $duplicate_hash: input.duplicateHash ?? '',
      $is_duplicate: toDbBoolean(input.isDuplicate ?? false),
      $created_at: nowIso()
    }
  }

  function getById(id: number): ImportedOrder | null {
    const row = selectById.get(id)
    return row ? toImportedOrder(row) : null
  }

  return {
    create(input) {
      const result = insert.run(bind(input))
      const created = getById(Number(result.lastInsertRowid))
      if (!created) throw new Error('Imported order was inserted but could not be read back')
      return created
    },

    createMany(inputs) {
      let inserted = 0
      for (const input of inputs) {
        insert.run(bind(input))
        inserted += 1
      }
      return inserted
    },

    getById,

    listByFile(importFileId) {
      return selectByFile.all(importFileId).map(toImportedOrder)
    },

    listByBatch(batchId) {
      return selectByBatch.all(batchId).map(toImportedOrder)
    },

    findExistingHashes(hashes) {
      const candidates = hashes.filter((hash) => hash !== '')
      if (candidates.length === 0) return new Set()

      const found = new Set<string>()
      // Chunked to stay well clear of SQLite's bound-parameter limit on big imports.
      const chunkSize = 400
      for (let start = 0; start < candidates.length; start += chunkSize) {
        const chunk = candidates.slice(start, start + chunkSize)
        const rows = db
          .prepare(
            `SELECT DISTINCT duplicate_hash FROM imported_orders
             WHERE duplicate_hash IN (${placeholders(chunk.length)})`
          )
          .all(...chunk)
        for (const row of rows) found.add(readText(row, 'duplicate_hash'))
      }
      return found
    },

    markDuplicates(ids) {
      if (ids.length === 0) return 0
      const result = db
        .prepare(
          `UPDATE imported_orders SET is_duplicate = 1 WHERE id IN (${placeholders(ids.length)})`
        )
        .run(...ids)
      return Number(result.changes)
    },

    clearDuplicateForFile(importFileId) {
      return Number(clearDuplicate.run(importFileId).changes)
    },

    assignToBatch(importFileId, batchId) {
      return Number(assign.run(batchId, importFileId).changes)
    },

    deleteByFile(importFileId) {
      return Number(deleteByFileId.run(importFileId).changes)
    },

    count() {
      const row = countAll.get()
      return row ? readInteger(row, 'total') : 0
    }
  }
}
