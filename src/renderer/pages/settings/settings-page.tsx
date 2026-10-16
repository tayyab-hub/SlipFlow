import { useEffect, useState } from 'react'
import {
  DEFAULT_SETTINGS,
  type AppSettings,
  type BackupInfo,
  type SellerAccount
} from '@shared/delivery'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

export function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS),
    [sellers, setSellers] = useState<SellerAccount[]>([]),
    [backups, setBackups] = useState<BackupInfo[]>([])
  const [backupError, setBackupError] = useState('')
  const [name, setName] = useState(''),
    [platform, setPlatform] = useState('tiktok'),
    [editing, setEditing] = useState<number | undefined>(),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false)
  async function refresh() {
    const [s, a, b, error] = await Promise.all([
      window.stitchflow.getSettings(),
      window.stitchflow.listSellers(),
      window.stitchflow.listBackups(),
      window.stitchflow.backupStatus()
    ])
    setSettings(s)
    setSellers(a)
    setBackups(b)
    setBackupError(error)
  }
  useEffect(() => {
    void refresh().catch((e) => setNotice(String(e)))
  }, [])
  async function run(work: () => Promise<unknown>, message: string) {
    setBusy(true)
    try {
      const result = await work()
      await refresh()
      setNotice(typeof result === 'string' ? result : message)
    } catch (e) {
      setNotice(String(e))
    } finally {
      setBusy(false)
    }
  }
  function pref<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    setSettings((s) => ({ ...s, [key]: value }))
  }
  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Settings and recovery</h2>
      {notice && (
        <p role="status" className="rounded border bg-muted p-3 text-sm">
          {notice}
        </p>
      )}
      <Card className="space-y-4 p-5">
        <h3 className="font-semibold">Factory preferences</h3>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-sm">
            Factory display name
            <input
              className="mt-1 w-full rounded border p-2"
              value={settings.factoryName}
              onChange={(e) => pref('factoryName', e.target.value)}
            />
          </label>
          <label className="text-sm">
            Print layout
            <select
              className="mt-1 w-full rounded border p-2"
              value={settings.printLayout}
              onChange={(e) => pref('printLayout', e.target.value as AppSettings['printLayout'])}
            >
              <option value="standard">Standard A4</option>
              <option value="grouped">Grouped by SKU</option>
            </select>
          </label>
          <label className="text-sm">
            Default sorting
            <select
              className="mt-1 w-full rounded border p-2"
              value={settings.defaultSort}
              onChange={(e) => pref('defaultSort', e.target.value as AppSettings['defaultSort'])}
            >
              {['sku', 'size', 'colour', 'quantity'].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Date format
            <select
              className="mt-1 w-full rounded border p-2"
              value={settings.dateFormat}
              onChange={(e) => pref('dateFormat', e.target.value as AppSettings['dateFormat'])}
            >
              <option value="en-GB">DD/MM/YYYY</option>
              <option value="en-US">MM/DD/YYYY</option>
              <option value="iso">YYYY-MM-DD</option>
            </select>
          </label>
          <label className="text-sm">
            Automatic backup interval (minutes, 0 disables)
            <input
              type="number"
              min={0}
              max={1440}
              className="mt-1 w-full rounded border p-2"
              value={settings.backupMinutes}
              onChange={(e) => pref('backupMinutes', Number(e.target.value))}
            />
          </label>
          <label className="text-sm">
            Automatic backups to retain
            <input
              type="number"
              min={1}
              max={100}
              className="mt-1 w-full rounded border p-2"
              value={settings.backupRetention}
              onChange={(e) => pref('backupRetention', Number(e.target.value))}
            />
          </label>
        </div>
        <Button
          disabled={busy}
          onClick={() =>
            void run(() => window.stitchflow.saveSettings(settings), 'Preferences saved.')
          }
        >
          Save preferences
        </Button>
      </Card>
      <Card className="space-y-4 p-5">
        <h3 className="font-semibold">Seller accounts</h3>
        <p className="text-sm text-muted-foreground">
          One account per marketplace shop. Renaming keeps its identity and order history.
          Deactivation preserves existing records.
        </p>
        <div className="flex flex-wrap gap-3">
          <input
            aria-label="Seller name"
            placeholder="Shop / seller name"
            className="flex-1 rounded border p-2"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <select
            aria-label="Seller marketplace"
            className="rounded border p-2"
            value={platform}
            disabled={editing !== undefined}
            onChange={(e) => setPlatform(e.target.value)}
          >
            {['tiktok', 'shopee', 'lazada', 'unknown'].map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
          <Button
            disabled={busy || !name.trim()}
            onClick={() =>
              void run(async () => {
                await window.stitchflow.saveSeller({ id: editing, name, platform })
                setName('')
                setEditing(undefined)
              }, 'Seller saved.')
            }
          >
            {editing ? 'Save seller' : 'Add seller'}
          </Button>
          {editing && (
            <Button
              variant="ghost"
              onClick={() => {
                setEditing(undefined)
                setName('')
              }}
            >
              Cancel
            </Button>
          )}
        </div>
        <div className="divide-y">
          {sellers.map((s) => (
            <div key={s.id} className="flex items-center gap-3 py-2 text-sm">
              <span className="mr-auto">
                {s.platform} / <strong>{s.name}</strong> · {s.active ? 'Active' : 'Inactive'}
              </span>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  setEditing(s.id)
                  setName(s.name)
                  setPlatform(s.platform)
                }}
              >
                Rename
              </Button>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() =>
                  void run(
                    () => window.stitchflow.saveSeller({ ...s, active: !s.active }),
                    'Seller updated.'
                  )
                }
              >
                {s.active ? 'Deactivate' : 'Activate'}
              </Button>
            </div>
          ))}
        </div>
      </Card>
      <Card className="space-y-4 p-5">
        <h3 className="font-semibold">Backups and restoration</h3>
        {backupError && (
          <p role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-sm">
            {backupError}
          </p>
        )}
        <p className="text-sm text-muted-foreground">
          Backups use a verified SQLite snapshot while the application runs. Manual and recovery
          snapshots are retained. Copy backups to another drive for protection against disk failure.
        </p>
        <div className="flex gap-3">
          <Button
            disabled={busy}
            onClick={() => void run(() => window.stitchflow.createBackup(), 'Backup complete.')}
          >
            Create verified backup
          </Button>
          <Button
            disabled={busy}
            variant="secondary"
            onClick={() => void run(() => window.stitchflow.restoreBackup(null), 'Restored.')}
          >
            Restore from file
          </Button>
        </div>
        <div className="max-h-64 divide-y overflow-auto">
          {backups.map((b) => (
            <div className="flex items-center gap-3 py-3 text-xs" key={b.name}>
              <span className="mr-auto break-all">
                {b.name}
                <small className="block text-muted-foreground">
                  {Math.ceil(b.size / 1024)} KiB · {b.modifiedAt}
                </small>
              </span>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => void run(() => window.stitchflow.restoreBackup(b.name), 'Restored.')}
              >
                Restore
              </Button>
            </div>
          ))}
          {!backups.length && (
            <p className="text-sm text-muted-foreground">
              No backups yet. Create your first snapshot.
            </p>
          )}
        </div>
      </Card>
    </div>
  )
}
