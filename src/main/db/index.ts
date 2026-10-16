import { DatabaseSync } from 'node:sqlite'
import { dirname, join } from 'node:path'
import { runMigrations } from './migrations'
import { ensureDirectory } from './paths'
import { createBatchesRepository, type BatchesRepository } from './repositories/batches'
import {
  createColumnMappingsRepository,
  type ColumnMappingsRepository
} from './repositories/column-mappings'
import {
  createImportFilesRepository,
  type ImportFilesRepository
} from './repositories/import-files'
import {
  createImportedOrdersRepository,
  type ImportedOrdersRepository
} from './repositories/imported-orders'
import {
  createProductionItemsRepository,
  type ProductionItemsRepository
} from './repositories/production-items'
import {
  createSkuMappingsRepository,
  type SkuMappingsRepository
} from './repositories/sku-mappings'
import { createSettingsRepository, type SettingsRepository } from './repositories/settings'

/**
 * The database handle plus one repository per table.
 *
 * Uses Node's built-in `node:sqlite` rather than a native addon: it needs no compiler,
 * no rebuild against Electron's ABI, and nothing unpacked from the installer. See
 * PROGRESS.md for why that choice was made.
 */
export interface StitchFlowDatabase {
  readonly filePath: string
  /** Escape hatch for one-off SQL. Prefer a repository — see CLAUDE.md §3. */
  readonly raw: DatabaseSync
  readonly schemaVersion: number

  readonly settings: SettingsRepository
  readonly columnMappings: ColumnMappingsRepository
  readonly batches: BatchesRepository
  readonly importFiles: ImportFilesRepository
  readonly importedOrders: ImportedOrdersRepository
  readonly skuMappings: SkuMappingsRepository
  readonly productionItems: ProductionItemsRepository

  /**
   * Run `work` in a transaction, rolling back if it throws. Nested calls join the
   * transaction already in progress rather than starting a second one.
   */
  transaction<T>(work: () => T): T
  close(): void
}

/**
 * Open (creating if needed) the database at `filePath`, apply any outstanding
 * migrations, and return the repositories.
 */
export function openDatabase(filePath: string): StitchFlowDatabase {
  if (filePath !== ':memory:') ensureDirectory(dirname(filePath))

  const raw = new DatabaseSync(filePath, {
    enableForeignKeyConstraints: true,
    // A second window or a backup job should wait rather than fail instantly.
    timeout: 5000
  })

  // WAL survives a hard power cut mid-write far better than the rollback journal,
  // which matters on a factory PC that may just get switched off.
  raw.exec('PRAGMA journal_mode = WAL')
  raw.exec('PRAGMA synchronous = NORMAL')

  let migration: ReturnType<typeof runMigrations>
  try {
    const prior = raw
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'")
      .get()
    if (prior && filePath !== ':memory:') {
      const version = Number(
        raw.prepare('SELECT MAX(id) AS version FROM schema_migrations').get()?.version ?? 0
      )
      if (version === 1) {
        const directory = join(dirname(filePath), 'backups')
        ensureDirectory(directory)
        raw
          .prepare('VACUUM INTO ?')
          .run(join(directory, `slipflow-recovery-schema1-${Date.now()}.db`))
      }
    }
    migration = runMigrations(raw)
  } catch (error) {
    raw.close()
    throw error
  }

  function transaction<T>(work: () => T): T {
    if (raw.isTransaction) return work()

    raw.exec('BEGIN')
    try {
      const result = work()
      raw.exec('COMMIT')
      return result
    } catch (error) {
      raw.exec('ROLLBACK')
      throw error
    }
  }

  return {
    filePath,
    raw,
    schemaVersion: migration.version,

    settings: createSettingsRepository(raw),
    columnMappings: createColumnMappingsRepository(raw),
    batches: createBatchesRepository(raw),
    importFiles: createImportFilesRepository(raw),
    importedOrders: createImportedOrdersRepository(raw),
    skuMappings: createSkuMappingsRepository(raw),
    productionItems: createProductionItemsRepository(raw),

    transaction,

    close() {
      // Collapse the WAL back into the main file so a copy of the .db alone is complete.
      try {
        raw.exec('PRAGMA wal_checkpoint(TRUNCATE)')
      } catch {
        // Nothing useful to do while shutting down.
      }
      raw.close()
    }
  }
}

// ---------------------------------------------------------------------------
// App-wide handle. The app opens one database on startup and closes it on quit.
// ---------------------------------------------------------------------------

let currentDatabase: StitchFlowDatabase | null = null

export function initialiseDatabase(filePath: string): StitchFlowDatabase {
  if (currentDatabase) return currentDatabase
  currentDatabase = openDatabase(filePath)
  return currentDatabase
}

export function getDatabase(): StitchFlowDatabase {
  if (!currentDatabase) {
    throw new Error('Database has not been opened yet — call initialiseDatabase() first')
  }
  return currentDatabase
}

export function closeDatabase(): void {
  currentDatabase?.close()
  currentDatabase = null
}
