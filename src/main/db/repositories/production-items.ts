import type { DatabaseSync } from 'node:sqlite'
import type {
  NewProductionItem,
  ProductionIssueType,
  ProductionItem,
  ProductionItemUpdate
} from '@shared/types'
import { nowIso, readBoolean, readInteger, readText, toDbBoolean, type DbRow } from '../rows'
import { createUpdate, placeholders } from '../update-builder'

function toProductionItem(row: DbRow): ProductionItem {
  return {
    id: readInteger(row, 'id'),
    batchId: readInteger(row, 'batch_id'),
    factorySku: readText(row, 'factory_sku'),
    colour: readText(row, 'colour'),
    size: readText(row, 'size'),
    quantity: readInteger(row, 'quantity'),
    sourcePlatforms: readText(row, 'source_platforms'),
    issueType: readText(row, 'issue_type') as ProductionIssueType,
    issueNote: readText(row, 'issue_note'),
    isResolved: readBoolean(row, 'is_resolved'),
    isManual: readBoolean(row, 'is_manual'),
    sortOrder: readInteger(row, 'sort_order'),
    createdAt: readText(row, 'created_at'),
    updatedAt: readText(row, 'updated_at')
  }
}

export interface BatchTotals {
  /** Number of production lines. */
  items: number
  /** Sum of quantities. */
  units: number
  /** Lines still held back from printing. */
  unresolved: number
}

export interface ProductionItemsRepository {
  create(input: NewProductionItem): ProductionItem
  /** Bulk insert. Wrap in a transaction — see CLAUDE.md §5.10. */
  createMany(inputs: readonly NewProductionItem[]): number
  getById(id: number): ProductionItem | null
  listByBatch(batchId: number): ProductionItem[]
  /** Only the rows that may be printed: resolved and issue-free. */
  listPrintable(batchId: number): ProductionItem[]
  listUnresolved(batchId: number): ProductionItem[]
  update(id: number, changes: ProductionItemUpdate): ProductionItem | null
  resolve(id: number): ProductionItem | null
  /** Totals for the batch, for the counters stored on `batches`. */
  totalsForBatch(batchId: number): BatchTotals
  /** Totals across every batch — the dashboard isn't scoped to one batch. */
  globalTotals(): BatchTotals
  remove(id: number): boolean
  removeMany(ids: readonly number[]): number
  deleteByBatch(batchId: number): number
}

export function createProductionItemsRepository(db: DatabaseSync): ProductionItemsRepository {
  const insert = db.prepare(`
    INSERT INTO production_items (
      batch_id, factory_sku, colour, size, quantity, source_platforms,
      issue_type, issue_note, is_resolved, is_manual, sort_order,
      created_at, updated_at
    ) VALUES (
      $batch_id, $factory_sku, $colour, $size, $quantity, $source_platforms,
      $issue_type, $issue_note, $is_resolved, $is_manual, $sort_order,
      $created_at, $updated_at
    )
  `)
  const selectById = db.prepare('SELECT * FROM production_items WHERE id = ?')
  const selectByBatch = db.prepare(
    'SELECT * FROM production_items WHERE batch_id = ? ORDER BY sort_order, id'
  )
  const selectPrintable = db.prepare(`
    SELECT * FROM production_items
    WHERE batch_id = ? AND is_resolved = 1 AND issue_type = ''
    ORDER BY sort_order, factory_sku, colour, size, id
  `)
  const selectUnresolved = db.prepare(`
    SELECT * FROM production_items
    WHERE batch_id = ? AND (is_resolved = 0 OR issue_type <> '')
    ORDER BY sort_order, id
  `)
  const selectTotals = db.prepare(`
    SELECT
      COUNT(*) AS items,
      COALESCE(SUM(quantity), 0) AS units,
      COALESCE(SUM(CASE WHEN is_resolved = 0 OR issue_type <> '' THEN 1 ELSE 0 END), 0) AS unresolved
    FROM production_items
    WHERE batch_id = ?
  `)
  const selectGlobalTotals = db.prepare(`
    SELECT
      COUNT(*) AS items,
      COALESCE(SUM(quantity), 0) AS units,
      COALESCE(SUM(CASE WHEN is_resolved = 0 OR issue_type <> '' THEN 1 ELSE 0 END), 0) AS unresolved
    FROM production_items WHERE batch_id IN (SELECT id FROM batches WHERE status IN ('draft','ready'))
  `)
  const deleteById = db.prepare('DELETE FROM production_items WHERE id = ?')
  const deleteByBatchId = db.prepare('DELETE FROM production_items WHERE batch_id = ?')

  function bind(input: NewProductionItem): Record<string, string | number> {
    const timestamp = nowIso()
    return {
      $batch_id: input.batchId,
      $factory_sku: input.factorySku ?? '',
      $colour: input.colour ?? '',
      $size: input.size ?? '',
      $quantity: input.quantity ?? 0,
      $source_platforms: input.sourcePlatforms ?? '',
      $issue_type: input.issueType ?? '',
      $issue_note: input.issueNote ?? '',
      $is_resolved: toDbBoolean(input.isResolved ?? true),
      $is_manual: toDbBoolean(input.isManual ?? false),
      $sort_order: input.sortOrder ?? 0,
      $created_at: timestamp,
      $updated_at: timestamp
    }
  }

  function getById(id: number): ProductionItem | null {
    const row = selectById.get(id)
    return row ? toProductionItem(row) : null
  }

  function update(id: number, changes: ProductionItemUpdate): ProductionItem | null {
    const patch = createUpdate()
      .set('factory_sku', changes.factorySku)
      .set('colour', changes.colour)
      .set('size', changes.size)
      .set('quantity', changes.quantity)
      .set('source_platforms', changes.sourcePlatforms)
      .set('issue_type', changes.issueType)
      .set('issue_note', changes.issueNote)
      .setBoolean('is_resolved', changes.isResolved)
      .setBoolean('is_manual', changes.isManual)
      .set('sort_order', changes.sortOrder)

    if (patch.isEmpty()) return getById(id)

    db.prepare(
      `UPDATE production_items SET ${patch.assignments()}, updated_at = $updated_at WHERE id = $id`
    ).run({ ...patch.params(), $updated_at: nowIso(), $id: id })

    return getById(id)
  }

  return {
    create(input) {
      const result = insert.run(bind(input))
      const created = getById(Number(result.lastInsertRowid))
      if (!created) throw new Error('Production item was inserted but could not be read back')
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

    listByBatch(batchId) {
      return selectByBatch.all(batchId).map(toProductionItem)
    },

    listPrintable(batchId) {
      return selectPrintable.all(batchId).map(toProductionItem)
    },

    listUnresolved(batchId) {
      return selectUnresolved.all(batchId).map(toProductionItem)
    },

    update,

    resolve(id) {
      return update(id, { isResolved: true, issueType: '', issueNote: '' })
    },

    totalsForBatch(batchId) {
      const row = selectTotals.get(batchId)
      if (!row) return { items: 0, units: 0, unresolved: 0 }
      return {
        items: readInteger(row, 'items'),
        units: readInteger(row, 'units'),
        unresolved: readInteger(row, 'unresolved')
      }
    },

    globalTotals() {
      const row = selectGlobalTotals.get()
      if (!row) return { items: 0, units: 0, unresolved: 0 }
      return {
        items: readInteger(row, 'items'),
        units: readInteger(row, 'units'),
        unresolved: readInteger(row, 'unresolved')
      }
    },

    remove(id) {
      return Number(deleteById.run(id).changes) > 0
    },

    removeMany(ids) {
      if (ids.length === 0) return 0
      const result = db
        .prepare(`DELETE FROM production_items WHERE id IN (${placeholders(ids.length)})`)
        .run(...ids)
      return Number(result.changes)
    },

    deleteByBatch(batchId) {
      return Number(deleteByBatchId.run(batchId).changes)
    }
  }
}
