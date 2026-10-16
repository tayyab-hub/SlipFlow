import type { DatabaseSync } from 'node:sqlite'
import { nowIso } from '../rows'
import initSql from './0001_init.sql?raw'
import deliverySql from './0002_delivery.sql?raw'

/**
 * Migration registry.
 *
 * **Append-only.** Add a new entry with the next id and a new .sql file; never edit an
 * entry or a .sql file that has already shipped, and never remove one. See CLAUDE.md
 * §5.1. The SQL is inlined into the bundle at build time via Vite's `?raw`, so there is
 * no file to locate at runtime and packaging can't break it.
 */
interface Migration {
  id: number
  name: string
  sql: string
}

const MIGRATIONS: readonly Migration[] = [
  { id: 1, name: '0001_init', sql: initSql },
  { id: 2, name: '0002_delivery', sql: deliverySql }
]

/** Applied-migration bookkeeping. Infrastructure, not a domain table. */
const MIGRATIONS_TABLE = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    id         INTEGER PRIMARY KEY,
    name       TEXT NOT NULL,
    applied_at TEXT NOT NULL
  ) STRICT
`

export interface MigrationResult {
  /** Ids applied by this call — empty when the database was already current. */
  applied: number[]
  /** Highest migration id present after this call. */
  version: number
}

/**
 * Bring the database up to the latest schema. Safe to call on every start.
 *
 * Each migration runs inside its own transaction, so a failing migration leaves the
 * database exactly as it was rather than half-migrated.
 */
export function runMigrations(db: DatabaseSync): MigrationResult {
  db.exec(MIGRATIONS_TABLE)

  const appliedIds = new Set(
    db
      .prepare('SELECT id FROM schema_migrations')
      .all()
      .map((row) => Number(row['id']))
  )

  const applied: number[] = []
  if ([...appliedIds].some(id=>id > MIGRATIONS.length)) throw new Error('This database was created by a newer SlipFlow version. Upgrade the application before opening it.')
  const record = db.prepare(
    'INSERT INTO schema_migrations (id, name, applied_at) VALUES (?, ?, ?)'
  )

  for (const migration of MIGRATIONS) {
    if (appliedIds.has(migration.id)) continue

    db.exec('BEGIN')
    try {
      db.exec(migration.sql)
      record.run(migration.id, migration.name, nowIso())
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw new Error(
        `Migration ${migration.name} failed: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error }
      )
    }

    applied.push(migration.id)
  }

  return {
    applied,
    version: MIGRATIONS.reduce((highest, m) => Math.max(highest, m.id), 0)
  }
}
