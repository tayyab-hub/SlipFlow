import { DEFAULT_SETTINGS, type AppSettings } from '@shared/delivery'
import { boundedText } from '@shared/validation'
import type { StitchFlowDatabase } from './db'

export function getSettings(db: StitchFlowDatabase): AppSettings {
  const stored = db.settings.get('appPreferences')
  if (!stored) return { ...DEFAULT_SETTINGS }
  try {
    return validateSettings(JSON.parse(stored))
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}
export function validateSettings(value: unknown): AppSettings {
  if (!value || typeof value !== 'object') throw new Error('Settings must be an object.')
  const s = value as AppSettings
  if (
    !['standard', 'grouped'].includes(s.printLayout) ||
    !['sku', 'size', 'colour', 'quantity'].includes(s.defaultSort) ||
    !['en-GB', 'en-US', 'iso'].includes(s.dateFormat)
  )
    throw new Error('Choose valid print, sorting and date preferences.')
  if (
    !Number.isInteger(s.backupMinutes) ||
    (s.backupMinutes !== 0 && (s.backupMinutes < 5 || s.backupMinutes > 1440))
  )
    throw new Error('Backup interval must be 0 (off), or 5 to 1440 minutes.')
  if (!Number.isInteger(s.backupRetention) || s.backupRetention < 1 || s.backupRetention > 100)
    throw new Error('Keep between 1 and 100 automatic backups.')
  return {
    factoryName: boundedText(s.factoryName, 'Factory name', true, 120),
    printLayout: s.printLayout,
    defaultSort: s.defaultSort,
    dateFormat: s.dateFormat,
    backupMinutes: s.backupMinutes,
    backupRetention: s.backupRetention
  }
}
