import type { DatabaseSync } from 'node:sqlite'
import type { Setting } from '@shared/types'
import { nowIso, readText, type DbRow } from '../rows'

function toSetting(row: DbRow): Setting {
  return {
    key: readText(row, 'key'),
    value: readText(row, 'value'),
    updatedAt: readText(row, 'updated_at')
  }
}

export interface SettingsRepository {
  get(key: string): string | null
  getWithDefault(key: string, fallback: string): string
  getAll(): Setting[]
  /** Insert or overwrite. */
  set(key: string, value: string): Setting
  setMany(entries: Record<string, string>): void
  remove(key: string): boolean
}

export function createSettingsRepository(db: DatabaseSync): SettingsRepository {
  const selectOne = db.prepare('SELECT * FROM settings WHERE key = ?')
  const selectAll = db.prepare('SELECT * FROM settings ORDER BY key')
  const upsert = db.prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES ($key, $value, $updated_at)
    ON CONFLICT (key) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at
  `)
  const deleteOne = db.prepare('DELETE FROM settings WHERE key = ?')

  function set(key: string, value: string): Setting {
    const updatedAt = nowIso()
    upsert.run({ $key: key, $value: value, $updated_at: updatedAt })
    return { key, value, updatedAt }
  }

  return {
    get(key) {
      const row = selectOne.get(key)
      return row ? toSetting(row).value : null
    },

    getWithDefault(key, fallback) {
      const row = selectOne.get(key)
      return row ? toSetting(row).value : fallback
    },

    getAll() {
      return selectAll.all().map(toSetting)
    },

    set,

    setMany(entries) {
      for (const [key, value] of Object.entries(entries)) set(key, value)
    },

    remove(key) {
      return Number(deleteOne.run(key).changes) > 0
    }
  }
}
