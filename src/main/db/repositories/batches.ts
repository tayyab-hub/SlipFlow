import type { DatabaseSync } from 'node:sqlite'
import type { Batch, BatchStatus, BatchUpdate, NewBatch } from '@shared/types'
import {
  nowIso,
  readInteger,
  readNullableText,
  readText,
  type DbRow
} from '../rows'
import { createUpdate } from '../update-builder'

function toBatch(row: DbRow): Batch {
  return {
    id: readInteger(row, 'id'),
    batchNumber: readText(row, 'batch_number'),
    name: readText(row, 'name'),
    status: readText(row, 'status') as BatchStatus,
    totalItems: readInteger(row, 'total_items'),
    totalUnits: readInteger(row, 'total_units'),
    unresolvedCount: readInteger(row, 'unresolved_count'),
    notes: readText(row, 'notes'),
    createdAt: readText(row, 'created_at'),
    updatedAt: readText(row, 'updated_at'),
    printedAt: readNullableText(row, 'printed_at')
  }
}

export interface BatchesRepository {
  create(input: NewBatch): Batch
  getById(id: number): Batch | null
  findByNumber(batchNumber: string): Batch | null
  list(options?: { limit?: number; status?: BatchStatus }): Batch[]
  update(id: number, changes: BatchUpdate): Batch | null
  markPrinted(id: number): Batch | null
  /** @param date `YYYY-MM-DD`. Backs the "Batches Today" dashboard counter. */
  countCreatedOn(date: string): number
  remove(id: number): boolean
}

export function createBatchesRepository(db: DatabaseSync): BatchesRepository {
  const insert = db.prepare(`
    INSERT INTO batches (
      batch_number, name, status, total_items, total_units,
      unresolved_count, notes, created_at, updated_at
    ) VALUES (
      $batch_number, $name, $status, $total_items, $total_units,
      $unresolved_count, $notes, $created_at, $updated_at
    )
  `)
  const selectById = db.prepare('SELECT * FROM batches WHERE id = ?')
  const selectByNumber = db.prepare('SELECT * FROM batches WHERE batch_number = ?')
  const countByDate = db.prepare(
    "SELECT COUNT(*) AS total FROM batches WHERE substr(created_at, 1, 10) = ?"
  )
  const deleteById = db.prepare('DELETE FROM batches WHERE id = ?')

  function getById(id: number): Batch | null {
    const row = selectById.get(id)
    return row ? toBatch(row) : null
  }

  function update(id: number, changes: BatchUpdate): Batch | null {
    const patch = createUpdate()
      .set('batch_number', changes.batchNumber)
      .set('name', changes.name)
      .set('status', changes.status)
      .set('total_items', changes.totalItems)
      .set('total_units', changes.totalUnits)
      .set('unresolved_count', changes.unresolvedCount)
      .set('notes', changes.notes)
      .set('printed_at', changes.printedAt)

    if (patch.isEmpty()) return getById(id)

    db.prepare(
      `UPDATE batches SET ${patch.assignments()}, updated_at = $updated_at WHERE id = $id`
    ).run({ ...patch.params(), $updated_at: nowIso(), $id: id })

    return getById(id)
  }

  return {
    create(input) {
      const timestamp = nowIso()
      const result = insert.run({
        $batch_number: input.batchNumber,
        $name: input.name ?? '',
        $status: input.status ?? 'draft',
        $total_items: input.totalItems ?? 0,
        $total_units: input.totalUnits ?? 0,
        $unresolved_count: input.unresolvedCount ?? 0,
        $notes: input.notes ?? '',
        $created_at: timestamp,
        $updated_at: timestamp
      })

      const created = getById(Number(result.lastInsertRowid))
      if (!created) throw new Error('Batch was inserted but could not be read back')
      return created
    },

    getById,

    findByNumber(batchNumber) {
      const row = selectByNumber.get(batchNumber)
      return row ? toBatch(row) : null
    },

    list(options = {}) {
      const conditions = options.status ? 'WHERE status = $status' : ''
      const limit = options.limit ? 'LIMIT $limit' : ''
      const statement = db.prepare(
        `SELECT * FROM batches ${conditions} ORDER BY created_at DESC, id DESC ${limit}`
      )

      const params: Record<string, string | number> = {}
      if (options.status) params['$status'] = options.status
      if (options.limit) params['$limit'] = options.limit

      return statement.all(params).map(toBatch)
    },

    update,

    markPrinted(id) {
      return update(id, { status: 'printed', printedAt: nowIso() })
    },

    countCreatedOn(date) {
      const row = countByDate.get(date)
      return row ? readInteger(row, 'total') : 0
    },

    remove(id) {
      return Number(deleteById.run(id).changes) > 0
    }
  }
}
