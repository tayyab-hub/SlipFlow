import type { DatabaseSync } from 'node:sqlite'
import type { NewSkuMapping, SkuMapping, SkuMappingUpdate } from '@shared/types'
import { nowIso, readInteger, readText, type DbRow } from '../rows'
import { createUpdate } from '../update-builder'

function toSkuMapping(row: DbRow): SkuMapping {
  return {
    id: readInteger(row, 'id'),
    incomingSku: readText(row, 'incoming_sku'),
    incomingVariation: readText(row, 'incoming_variation'),
    platform: readText(row, 'platform'),
    factorySku: readText(row, 'factory_sku'),
    factoryColour: readText(row, 'factory_colour'),
    factorySize: readText(row, 'factory_size'),
    notes: readText(row, 'notes'),
    createdAt: readText(row, 'created_at'),
    updatedAt: readText(row, 'updated_at')
  }
}

export interface SkuMappingLookup {
  incomingSku: string
  incomingVariation?: string
  platform?: string
}

export interface SkuMappingsRepository {
  create(input: NewSkuMapping): SkuMapping
  /** Insert, or overwrite the factory side of an existing incoming key. For bulk import. */
  upsert(input: NewSkuMapping): SkuMapping
  upsertMany(inputs: readonly NewSkuMapping[]): number
  getById(id: number): SkuMapping | null
  /**
   * Best match for an incoming order line.
   *
   * A row whose platform/variation matches exactly wins over a wildcard (`''`) row, so a
   * platform-specific override beats the general mapping. Matching is case-insensitive
   * (COLLATE NOCASE on the columns).
   */
  findBestMatch(lookup: SkuMappingLookup): SkuMapping | null
  list(options?: { search?: string; limit?: number }): SkuMapping[]
  listByFactorySku(factorySku: string): SkuMapping[]
  update(id: number, changes: SkuMappingUpdate): SkuMapping | null
  count(): number
  remove(id: number): boolean
}

export function createSkuMappingsRepository(db: DatabaseSync): SkuMappingsRepository {
  const insert = db.prepare(`
    INSERT INTO sku_mappings (
      incoming_sku, incoming_variation, platform,
      factory_sku, factory_colour, factory_size, notes,
      created_at, updated_at
    ) VALUES (
      $incoming_sku, $incoming_variation, $platform,
      $factory_sku, $factory_colour, $factory_size, $notes,
      $created_at, $updated_at
    )
  `)
  const upsertStatement = db.prepare(`
    INSERT INTO sku_mappings (
      incoming_sku, incoming_variation, platform,
      factory_sku, factory_colour, factory_size, notes,
      created_at, updated_at
    ) VALUES (
      $incoming_sku, $incoming_variation, $platform,
      $factory_sku, $factory_colour, $factory_size, $notes,
      $created_at, $updated_at
    )
    ON CONFLICT (incoming_sku, incoming_variation, platform) DO UPDATE SET
      factory_sku    = excluded.factory_sku,
      factory_colour = excluded.factory_colour,
      factory_size   = excluded.factory_size,
      notes          = excluded.notes,
      updated_at     = excluded.updated_at
  `)
  const selectById = db.prepare('SELECT * FROM sku_mappings WHERE id = ?')
  const selectByIncoming = db.prepare(`
    SELECT * FROM sku_mappings
    WHERE incoming_sku = $incoming_sku
      AND incoming_variation IN ($incoming_variation, '')
      AND platform IN ($platform, '')
    ORDER BY
      (platform = $platform) DESC,
      (incoming_variation = $incoming_variation) DESC,
      id
    LIMIT 1
  `)
  const selectByFactorySku = db.prepare(
    'SELECT * FROM sku_mappings WHERE factory_sku = ? ORDER BY incoming_sku'
  )
  const countAll = db.prepare('SELECT COUNT(*) AS total FROM sku_mappings')
  const deleteById = db.prepare('DELETE FROM sku_mappings WHERE id = ?')

  function bind(input: NewSkuMapping): Record<string, string> {
    return {
      $incoming_sku: input.incomingSku,
      $incoming_variation: input.incomingVariation ?? '',
      $platform: input.platform ?? '',
      $factory_sku: input.factorySku,
      $factory_colour: input.factoryColour ?? '',
      $factory_size: input.factorySize ?? '',
      $notes: input.notes ?? '',
      $created_at: nowIso(),
      $updated_at: nowIso()
    }
  }

  function getById(id: number): SkuMapping | null {
    const row = selectById.get(id)
    return row ? toSkuMapping(row) : null
  }

  function findBestMatch(lookup: SkuMappingLookup): SkuMapping | null {
    const row = selectByIncoming.get({
      $incoming_sku: lookup.incomingSku,
      $incoming_variation: lookup.incomingVariation ?? '',
      $platform: lookup.platform ?? ''
    })
    return row ? toSkuMapping(row) : null
  }

  function upsert(input: NewSkuMapping): SkuMapping {
    upsertStatement.run(bind(input))

    const saved = findBestMatch({
      incomingSku: input.incomingSku,
      incomingVariation: input.incomingVariation ?? '',
      platform: input.platform ?? ''
    })
    if (!saved) throw new Error('SKU mapping was upserted but could not be read back')
    return saved
  }

  return {
    create(input) {
      const result = insert.run(bind(input))
      const created = getById(Number(result.lastInsertRowid))
      if (!created) throw new Error('SKU mapping was inserted but could not be read back')
      return created
    },

    upsert,

    upsertMany(inputs) {
      let written = 0
      for (const input of inputs) {
        upsertStatement.run(bind(input))
        written += 1
      }
      return written
    },

    getById,

    findBestMatch,

    list(options = {}) {
      const where = options.search
        ? 'WHERE incoming_sku LIKE $search OR factory_sku LIKE $search'
        : ''
      const limit = options.limit ? 'LIMIT $limit' : ''
      const statement = db.prepare(
        `SELECT * FROM sku_mappings ${where} ORDER BY incoming_sku, incoming_variation ${limit}`
      )

      const params: Record<string, string | number> = {}
      if (options.search) params['$search'] = `%${options.search}%`
      if (options.limit) params['$limit'] = options.limit

      return statement.all(params).map(toSkuMapping)
    },

    listByFactorySku(factorySku) {
      return selectByFactorySku.all(factorySku).map(toSkuMapping)
    },

    update(id, changes) {
      const patch = createUpdate()
        .set('incoming_sku', changes.incomingSku)
        .set('incoming_variation', changes.incomingVariation)
        .set('platform', changes.platform)
        .set('factory_sku', changes.factorySku)
        .set('factory_colour', changes.factoryColour)
        .set('factory_size', changes.factorySize)
        .set('notes', changes.notes)

      if (patch.isEmpty()) return getById(id)

      db.prepare(
        `UPDATE sku_mappings SET ${patch.assignments()}, updated_at = $updated_at WHERE id = $id`
      ).run({ ...patch.params(), $updated_at: nowIso(), $id: id })

      return getById(id)
    },

    count() {
      const row = countAll.get()
      return row ? readInteger(row, 'total') : 0
    },

    remove(id) {
      return Number(deleteById.run(id).changes) > 0
    }
  }
}
