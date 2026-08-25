import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { FileUp, Plus, Trash2, Upload as UploadIcon } from 'lucide-react'
import type { NewSkuMapping, SkuMapping } from '@shared/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import type { Navigate } from '@/App'

interface SkuMappingPageProps {
  onNavigate: Navigate
}

const EMPTY_FORM: NewSkuMapping = {
  incomingSku: '',
  factorySku: '',
  incomingVariation: '',
  platform: '',
  factoryColour: '',
  factorySize: '',
  notes: ''
}

const FIELDS: { key: keyof NewSkuMapping; label: string; required?: boolean }[] = [
  { key: 'incomingSku', label: 'Incoming SKU', required: true },
  { key: 'incomingVariation', label: 'Variation (blank = any)' },
  { key: 'platform', label: 'Platform (blank = any)' },
  { key: 'factorySku', label: 'Factory SKU', required: true },
  { key: 'factoryColour', label: 'Factory Colour' },
  { key: 'factorySize', label: 'Factory Size' },
  { key: 'notes', label: 'Notes' }
]

export function SkuMappingPage({ onNavigate }: SkuMappingPageProps) {
  const [mappings, setMappings] = useState<SkuMapping[]>([])
  const [form, setForm] = useState<NewSkuMapping>(EMPTY_FORM)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async () => {
    setMappings(await window.stitchflow.listSkuMappings())
  }, [])

  useEffect(() => {
    void load().catch((error: unknown) => {
      console.error('Could not list SKU mappings', error)
    })
  }, [load])

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (form.incomingSku.trim() === '' || form.factorySku.trim() === '') return

    setBusy(true)
    setNotice(null)
    try {
      await window.stitchflow.createSkuMapping(form)
      setNotice(`Saved mapping for "${form.incomingSku}".`)
      setForm(EMPTY_FORM)
      await load()
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'That mapping could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  async function remove(mapping: SkuMapping): Promise<void> {
    setBusy(true)
    try {
      await window.stitchflow.removeSkuMapping(mapping.id)
      setMappings((current) => current.filter((item) => item.id !== mapping.id))
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'That mapping could not be removed.')
    } finally {
      setBusy(false)
    }
  }

  async function bulkImport(): Promise<void> {
    setBusy(true)
    setNotice(null)
    try {
      const result = await window.stitchflow.bulkImportSkuMappings()
      if (!result) return

      await load()
      const imported = `Imported ${result.imported} mapping${result.imported === 1 ? '' : 's'} from "${result.fileName}".`
      const skipped =
        result.errors.length > 0
          ? ` ${result.errors.length} row${result.errors.length === 1 ? '' : 's'} skipped — ${result.errors
              .slice(0, 3)
              .map((error) => (error.rowNumber === 0 ? error.reason : `row ${error.rowNumber}: ${error.reason}`))
              .join('; ')}${result.errors.length > 3 ? '…' : ''}`
          : ''
      setNotice(imported + skipped)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'That file could not be imported.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-tight">SKU Mappings</h2>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Teach StitchFlow which incoming SKU is which factory SKU, colour and size. One
            mapping covers every platform and however that platform writes the variation —
            leave Platform and Variation blank to match by SKU alone.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="secondary" onClick={() => onNavigate('upload')} disabled={busy}>
            <UploadIcon />
            Upload Orders
          </Button>
          <Button variant="secondary" onClick={() => void bulkImport()} disabled={busy}>
            <FileUp />
            Bulk import
          </Button>
        </div>
      </div>

      {notice && (
        <p
          role="status"
          className="rounded-lg border border-border bg-muted px-4 py-2.5 text-sm text-muted-foreground"
        >
          {notice}
        </p>
      )}

      <Card className="space-y-3 p-5">
        <h3 className="text-sm font-semibold">Add a mapping</h3>
        <form onSubmit={(event) => void submit(event)} className="grid gap-3 sm:grid-cols-4">
          {FIELDS.map(({ key, label, required }) => (
            <label key={key} className="block space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                {label}
                {required && <span className="text-destructive"> *</span>}
              </span>
              <input
                value={form[key] ?? ''}
                onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))}
                disabled={busy}
                className="h-9 w-full rounded-lg border border-input bg-card px-3 text-sm outline-none focus-visible:border-ring disabled:opacity-50"
              />
            </label>
          ))}
          <div className="flex items-end">
            <Button
              type="submit"
              disabled={busy || form.incomingSku.trim() === '' || form.factorySku.trim() === ''}
              className="w-full"
            >
              <Plus />
              Add
            </Button>
          </div>
        </form>
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="border-b border-border px-5 py-3">
          <h3 className="text-sm font-semibold">
            {mappings.length} mapping{mappings.length === 1 ? '' : 's'}
          </h3>
        </div>

        {mappings.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">
            No SKU mappings yet. Add one above, or bulk import a spreadsheet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/60 text-xs text-muted-foreground">
                  <th className="px-4 py-2 font-semibold">Incoming</th>
                  <th className="px-4 py-2 font-semibold">Platform</th>
                  <th className="px-4 py-2 font-semibold">Factory SKU</th>
                  <th className="px-4 py-2 font-semibold">Colour</th>
                  <th className="px-4 py-2 font-semibold">Size</th>
                  <th className="px-4 py-2 font-semibold">Notes</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {mappings.map((mapping) => (
                  <tr key={mapping.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2">
                      <span className="font-medium">{mapping.incomingSku}</span>
                      {mapping.incomingVariation && (
                        <span className="ml-1.5 text-xs text-muted-foreground">
                          ({mapping.incomingVariation})
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      {mapping.platform ? (
                        <Badge>{mapping.platform}</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">any</span>
                      )}
                    </td>
                    <td className="px-4 py-2 font-medium">{mapping.factorySku}</td>
                    <td className="px-4 py-2 text-muted-foreground">{mapping.factoryColour || '—'}</td>
                    <td className="px-4 py-2 text-muted-foreground">{mapping.factorySize || '—'}</td>
                    <td className="max-w-[220px] truncate px-4 py-2 text-muted-foreground" title={mapping.notes}>
                      {mapping.notes || '—'}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Button
                        size="icon"
                        variant="ghost"
                        title="Remove this mapping"
                        onClick={() => void remove(mapping)}
                        disabled={busy}
                      >
                        <Trash2 />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
