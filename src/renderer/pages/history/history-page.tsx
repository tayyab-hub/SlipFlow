import { useEffect, useState } from 'react'
import type { Batch } from '@shared/types'
import type { BatchEvidence } from '@shared/delivery'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import type { Navigate } from '@/App'

export function HistoryPage({ onNavigate, batchId }: { onNavigate: Navigate; batchId?: number }) {
  const [batches, setBatches] = useState<Batch[]>([]),
    [search, setSearch] = useState(''),
    [filter, setFilter] = useState('all')
  const [selected, setSelected] = useState<Batch | null>(null),
    [evidence, setEvidence] = useState<BatchEvidence | null>(null)
  const [name, setName] = useState(''),
    [notes, setNotes] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false)
  async function open(batch: Batch) {
    setSelected(batch)
    setName(batch.name)
    setNotes(batch.notes)
    setEvidence(await window.stitchflow.batchEvidence(batch.id))
  }
  async function refresh(id?: number) {
    const rows = await window.stitchflow.listBatches()
    setBatches(rows)
    if (id) {
      const b = rows.find((b) => b.id === id)
      if (b) await open(b)
    }
  }
  useEffect(() => {
    void refresh(batchId).catch((e) => setNotice(String(e)))
  }, [batchId])
  async function save(status: string) {
    if (!selected) return
    setBusy(true)
    setNotice('')
    try {
      await window.stitchflow.updateBatch({ id: selected.id, name, notes, status })
      await refresh(selected.id)
    } catch (e) {
      setNotice(String(e))
    } finally {
      setBusy(false)
    }
  }
  async function confirmPrinted() {
    if (
      !selected ||
      !window.confirm(
        'Have you checked that every page physically printed correctly? This locks the production quantities.'
      )
    )
      return
    setBusy(true)
    try {
      await window.stitchflow.markBatchPrinted(selected.id)
      await refresh(selected.id)
    } catch (e) {
      setNotice(String(e))
    } finally {
      setBusy(false)
    }
  }
  const visible = batches.filter(
    (b) =>
      (filter === 'all' || b.status === filter) &&
      `${b.batchNumber} ${b.name}`.toLowerCase().includes(search.toLowerCase())
  )
  const locked = selected && ['printed', 'archived'].includes(selected.status)
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold">Batch history</h2>
        <p className="text-sm text-muted-foreground">
          {batches.length} batches · {batches.reduce((s, b) => s + b.totalUnits, 0)} historical
          units
        </p>
      </div>
      {notice && (
        <p role="alert" className="rounded border bg-muted p-3 text-sm">
          {notice}
        </p>
      )}
      <div className="flex gap-3">
        <input
          aria-label="Search batches"
          placeholder="Search batch number or name"
          className="flex-1 rounded border p-2"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          aria-label="Batch status"
          className="rounded border p-2"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          {['all', 'draft', 'ready', 'printed', 'archived'].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </div>
      <Card className="overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="p-3">Batch</th>
              <th>Status</th>
              <th>Units</th>
              <th>Review</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((b) => (
              <tr className="border-t" key={b.id}>
                <td className="p-3 font-medium">
                  {b.name || b.batchNumber}
                  <small className="block font-normal text-muted-foreground">{b.batchNumber}</small>
                </td>
                <td>{b.status}</td>
                <td>{b.totalUnits}</td>
                <td>{b.unresolvedCount}</td>
                <td>
                  <Button
                    variant="ghost"
                    onClick={() => void open(b).catch((e) => setNotice(String(e)))}
                  >
                    Open
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!visible.length && <p className="p-8 text-center">No batches match this view.</p>}
      </Card>
      {selected && (
        <Card className="space-y-4 p-5">
          <h3 className="font-semibold">
            {selected.batchNumber} · {selected.status}
          </h3>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm">
              Batch name
              <input
                className="mt-1 w-full rounded border p-2"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={!!locked}
              />
            </label>
            <label className="text-sm">
              Reconciliation notes
              <textarea
                className="mt-1 w-full rounded border p-2"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={!!locked}
                placeholder="Explain any corrected, added or removed quantities"
              />
            </label>
          </div>
          {evidence && (
            <p className="text-sm">
              Source: <strong>{evidence.sourceUnits} units</strong> · Production:{' '}
              <strong>{evidence.productionUnits} units</strong> · {evidence.invalidSourceRows}{' '}
              source rows needed validation · {evidence.duplicateRows} duplicates excluded
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => onNavigate('review', selected.id)}>
              Review items
            </Button>
            <Button variant="secondary" onClick={() => onNavigate('print', selected.id)}>
              Preview / print
            </Button>
            {!locked && (
              <Button disabled={busy} onClick={() => void save(selected.status)}>
                Save details
              </Button>
            )}
            {selected.status === 'draft' && (
              <Button disabled={busy} onClick={() => void save('ready')}>
                Approve as ready
              </Button>
            )}
            {selected.status === 'ready' && (
              <Button variant="secondary" disabled={busy} onClick={() => void save('draft')}>
                Return to draft
              </Button>
            )}
            {['ready', 'printed'].includes(selected.status) && (
              <Button disabled={busy} onClick={() => void confirmPrinted()}>
                Confirm physical print
              </Button>
            )}
            {selected.status !== 'archived' ? (
              <Button variant="secondary" disabled={busy} onClick={() => void save('archived')}>
                Archive
              </Button>
            ) : (
              <Button
                disabled={busy}
                onClick={() => void save(selected.printedAt ? 'printed' : 'draft')}
              >
                Restore from archive
              </Button>
            )}
          </div>
          <details>
            <summary className="cursor-pointer text-sm font-medium">
              Source orders and activity
            </summary>
            <div className="mt-3 max-h-72 overflow-auto text-xs">
              <table className="w-full text-left">
                <thead>
                  <tr>
                    <th>File / row</th>
                    <th>Seller / order</th>
                    <th>SKU</th>
                    <th>Qty</th>
                    <th>Validation</th>
                  </tr>
                </thead>
                <tbody>
                  {evidence?.orders.map((o) => (
                    <tr key={o.id} className="border-t">
                      <td className="py-2">
                        {o.fileName} / {o.rowNumber}
                      </td>
                      <td>
                        {o.sellerName} / {o.orderId}
                      </td>
                      <td>{o.rawSku}</td>
                      <td>{o.rawQuantity}</td>
                      <td>
                        {o.isDuplicate ? 'Duplicate excluded' : o.validationNote || 'Imported'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="mt-3 space-y-1 text-xs">
              {evidence?.events.map((e, i) => (
                <li key={i}>
                  {e.createdAt} · {e.action}: {e.detail}
                </li>
              ))}
            </ul>
          </details>
        </Card>
      )}
    </div>
  )
}
