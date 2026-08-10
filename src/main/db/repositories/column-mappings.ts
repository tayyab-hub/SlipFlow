import type { DatabaseSync } from 'node:sqlite'
import type { ColumnMapping, ColumnMappingUpdate, NewColumnMapping } from '@shared/types'
import { nowIso, readInteger, readText, type DbRow } from '../rows'
import { createUpdate } from '../update-builder'

function toColumnMapping(row: DbRow): ColumnMapping {
  return {
    id: readInteger(row, 'id'),
    name: readText(row, 'name'),
    platform: readText(row, 'platform'),
    headerSignature: readText(row, 'header_signature'),
    skuColumn: readText(row, 'sku_column'),
    variationColumn: readText(row, 'variation_column'),
    colourColumn: readText(row, 'colour_column'),
    sizeColumn: readText(row, 'size_column'),
    quantityColumn: readText(row, 'quantity_column'),
    orderIdColumn: readText(row, 'order_id_column'),
    timesUsed: readInteger(row, 'times_used'),
    createdAt: readText(row, 'created_at'),
    updatedAt: readText(row, 'updated_at')
  }
}

export interface ColumnMappingsRepository {
  create(input: NewColumnMapping): ColumnMapping
  getById(id: number): ColumnMapping | null
  /** The lookup that stops the operator being asked to map the same format twice. */
  findBySignature(headerSignature: string): ColumnMapping | null
  list(): ColumnMapping[]
  update(id: number, changes: ColumnMappingUpdate): ColumnMapping | null
  recordUse(id: number): void
  remove(id: number): boolean
}

export function createColumnMappingsRepository(db: DatabaseSync): ColumnMappingsRepository {
  const insert = db.prepare(`
    INSERT INTO column_mappings (
      name, platform, header_signature, sku_column, variation_column,
      colour_column, size_column, quantity_column, order_id_column,
      times_used, created_at, updated_at
    ) VALUES (
      $name, $platform, $header_signature, $sku_column, $variation_column,
      $colour_column, $size_column, $quantity_column, $order_id_column,
      0, $created_at, $updated_at
    )
  `)
  const selectById = db.prepare('SELECT * FROM column_mappings WHERE id = ?')
  const selectBySignature = db.prepare(
    'SELECT * FROM column_mappings WHERE header_signature = ?'
  )
  const selectAll = db.prepare(
    'SELECT * FROM column_mappings ORDER BY times_used DESC, name'
  )
  const bumpUsage = db.prepare(
    'UPDATE column_mappings SET times_used = times_used + 1, updated_at = ? WHERE id = ?'
  )
  const deleteById = db.prepare('DELETE FROM column_mappings WHERE id = ?')

  function getById(id: number): ColumnMapping | null {
    const row = selectById.get(id)
    return row ? toColumnMapping(row) : null
  }

  return {
    create(input) {
      const timestamp = nowIso()
      const result = insert.run({
        $name: input.name,
        $platform: input.platform ?? '',
        $header_signature: input.headerSignature,
        $sku_column: input.skuColumn ?? '',
        $variation_column: input.variationColumn ?? '',
        $colour_column: input.colourColumn ?? '',
        $size_column: input.sizeColumn ?? '',
        $quantity_column: input.quantityColumn ?? '',
        $order_id_column: input.orderIdColumn ?? '',
        $created_at: timestamp,
        $updated_at: timestamp
      })

      const created = getById(Number(result.lastInsertRowid))
      if (!created) throw new Error('Column mapping was inserted but could not be read back')
      return created
    },

    getById,

    findBySignature(headerSignature) {
      const row = selectBySignature.get(headerSignature)
      return row ? toColumnMapping(row) : null
    },

    list() {
      return selectAll.all().map(toColumnMapping)
    },

    update(id, changes) {
      const patch = createUpdate()
        .set('name', changes.name)
        .set('platform', changes.platform)
        .set('header_signature', changes.headerSignature)
        .set('sku_column', changes.skuColumn)
        .set('variation_column', changes.variationColumn)
        .set('colour_column', changes.colourColumn)
        .set('size_column', changes.sizeColumn)
        .set('quantity_column', changes.quantityColumn)
        .set('order_id_column', changes.orderIdColumn)
        .set('times_used', changes.timesUsed)

      if (patch.isEmpty()) return getById(id)

      db.prepare(
        `UPDATE column_mappings SET ${patch.assignments()}, updated_at = $updated_at WHERE id = $id`
      ).run({ ...patch.params(), $updated_at: nowIso(), $id: id })

      return getById(id)
    },

    recordUse(id) {
      bumpUsage.run(nowIso(), id)
    },

    remove(id) {
      return Number(deleteById.run(id).changes) > 0
    }
  }
}
