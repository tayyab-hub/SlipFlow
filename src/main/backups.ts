import { DatabaseSync } from 'node:sqlite'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync
} from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import {
  closeDatabase,
  getDatabase,
  initialiseDatabase,
  openDatabase,
  type StitchFlowDatabase
} from './db'
import type { BackupInfo } from '@shared/delivery'
import { getSettings } from './settings'

export function verifyBackup(filePath: string): void {
  const info = statSync(filePath)
  if (!info.isFile() || info.size > 1024 * 1024 * 1024)
    throw new Error('Backup must be a database file smaller than 1 GiB.')
  const raw = new DatabaseSync(filePath, { readOnly: true })
  try {
    raw.exec('PRAGMA trusted_schema=OFF')
    if (raw.prepare("SELECT name FROM sqlite_master WHERE type IN ('trigger','view')").all().length)
      throw new Error(
        'Unexpected executable schema in backup. Restore only an original SlipFlow snapshot.'
      )
    const integrity = raw.prepare('PRAGMA integrity_check').all()
    if (integrity.length !== 1 || Object.values(integrity[0]!)[0] !== 'ok')
      throw new Error('Backup failed SQLite integrity verification.')
    if (raw.prepare('PRAGMA foreign_key_check').all().length)
      throw new Error('Backup has broken relationships.')
    const migrations = raw.prepare('SELECT id,name FROM schema_migrations ORDER BY id').all()
    if (
      !migrations.length ||
      migrations.some((r) => Number(r.id) > 2) ||
      migrations[0]?.name !== '0001_init'
    )
      throw new Error('This backup is not a supported SlipFlow database.')
    for (const table of [
      'settings',
      'batches',
      'imported_orders',
      'import_files',
      'sku_mappings',
      'production_items'
    ])
      raw.prepare(`SELECT COUNT(*) FROM ${table}`).get()
  } finally {
    raw.close()
  }
}

export function createBackup(
  db: StitchFlowDatabase,
  directory: string,
  kind: 'manual' | 'auto' | 'recovery' = 'manual'
): string {
  mkdirSync(directory, { recursive: true })
  const name = `slipflow-${kind}-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}.db`
  const destination = join(directory, name)
  // VACUUM INTO takes a consistent snapshot including committed WAL contents.
  db.raw.prepare('VACUUM INTO ?').run(destination)
  verifyBackup(destination)
  if (kind === 'auto') {
    const keep = getSettings(db).backupRetention
    for (const file of listBackups(directory)
      .filter((f) => f.name.startsWith('slipflow-auto-'))
      .slice(keep))
      rmSync(join(directory, file.name))
  }
  return destination
}
export function listBackups(directory: string): BackupInfo[] {
  if (!existsSync(directory)) return []
  return readdirSync(directory)
    .filter((n) => /^slipflow-(manual|auto|recovery)-[\w-]+\.db$/.test(n))
    .map((name) => {
      const info = statSync(join(directory, name))
      return { name, size: info.size, modifiedAt: info.mtime.toISOString() }
    })
    .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt))
}

/** Stages and migrates a verified copy before touching the active database. Keeps a recovery snapshot. */
export function restoreBackup(source: string, directory: string): string {
  const current = getDatabase()
  if (resolve(source) === resolve(current.filePath))
    throw new Error('The active database is not a restore source.')
  verifyBackup(source)
  const live = current.filePath
  const staged = join(dirname(live), `restore-${randomUUID()}.db`)
  copyFileSync(source, staged)
  try {
    const check = openDatabase(staged)
    check.close()
    verifyBackup(staged)
    const recovery = createBackup(current, directory, 'recovery')
    closeDatabase()
    const previous = `${live}.before-restore-${randomUUID()}`
    try {
      renameSync(live, previous)
      renameSync(staged, live)
      initialiseDatabase(live)
      rmSync(previous)
      return recovery
    } catch (error) {
      closeDatabase()
      if (existsSync(previous)) {
        if (existsSync(live)) rmSync(live)
        for (const suffix of ['-wal', '-shm']) if (existsSync(live + suffix)) rmSync(live + suffix)
        renameSync(previous, live)
      }
      initialiseDatabase(live)
      throw error
    }
  } finally {
    for (const suffix of ['', '-wal', '-shm'])
      if (existsSync(staged + suffix)) rmSync(staged + suffix)
  }
}
export function backupPath(directory: string, name: string): string {
  if (basename(name) !== name || !listBackups(directory).some((b) => b.name === name))
    throw new Error('Select a known backup.')
  return join(directory, name)
}
