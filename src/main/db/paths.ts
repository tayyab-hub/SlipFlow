import { app } from 'electron'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

export const DATABASE_FILE_NAME = 'stitchflow.db'

/**
 * Absolute path to the live database: `%APPDATA%\StitchFlow\stitchflow.db` on Windows.
 *
 * Depends on the app name, so `applyAppIdentity()` must have run first.
 */
export function resolveDatabasePath(): string {
  return join(app.getPath('userData'), DATABASE_FILE_NAME)
}

/**
 * Where daily backups go (Phase 7). Defined here so there is a single place that knows
 * the app's data layout.
 */
export function resolveBackupDirectory(): string {
  return join(app.getPath('userData'), 'backups')
}

/** Creates a directory if it isn't there. `userData` itself is created by Electron. */
export function ensureDirectory(directory: string): void {
  mkdirSync(directory, { recursive: true })
}
