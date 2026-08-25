import { useCallback, useEffect, useMemo, useState } from 'react'
import { FileDown, Inbox, Printer, TriangleAlert } from 'lucide-react'
import type { Batch, ProductionItem } from '@shared/types'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import type { Navigate } from '@/App'

interface PrintPageProps {
  /** No id — falls back to the most recently created batch. */
  batchId?: number
  onNavigate: Navigate
}

type LayoutMode = 'standard' | 'grouped'

/**
 * Rows-per-page heuristic for the on-screen "~N pages" estimate — not a real
 * pagination engine, just enough to warn the operator before they print 40 pages by
 * accident. Grouped layout adds a heading row per SKU, so it fits fewer lines per page.
 */
const ROWS_PER_PAGE = 32

function estimatePages(rowCount: number, layout: LayoutMode): number {
  if (rowCount === 0) return 1
  const effective = layout === 'grouped' ? rowCount * 1.15 : rowCount
  return Math.max(1, Math.ceil(effective / ROWS_PER_PAGE))
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

interface SkuGroup {
  factorySku: string
  units: number
  rows: ProductionItem[]
}

function groupBySku(items: readonly ProductionItem[]): SkuGroup[] {
  const groups = new Map<string, SkuGroup>()
  for (const item of items) {
    const key = item.factorySku || '(no SKU)'
    const existing = groups.get(key)
    if (existing) {
      existing.units += item.quantity
      existing.rows.push(item)
    } else {
      groups.set(key, { factorySku: key, units: item.quantity, rows: [item] })
    }
  }
  return [...groups.values()]
}

export function PrintPage({ batchId, onNavigate }: PrintPageProps) {
  const [batch, setBatch] = useState<Batch | null>(null)
  const [items, setItems] = useState<ProductionItem[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [layout, setLayout] = useState<LayoutMode>('standard')

  const load = useCallback(async (targetBatchId: number | undefined) => {
    setLoading(true)
    setNotice(null)
    try {
      const resolvedBatch = targetBatchId
        ? await window.stitchflow.getBatch(targetBatchId)
        : ((await window.stitchflow.listBatches({ limit: 1 }))[0] ?? null)

      setBatch(resolvedBatch)
      setItems(resolvedBatch ? await window.stitchflow.listPrintableItems(resolvedBatch.id) : [])
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not load this batch.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load(batchId)
  }, [batchId, load])

  async function handlePrint(): Promise<void> {
    if (!batch) return
    window.print()
    try {
      await window.stitchflow.markBatchPrinted(batch.id)
    } catch {
      // Non-fatal — the sheet already went to the printer either way.
    }
  }

  async function handleSavePdf(): Promise<void> {
    if (!batch) return
    setBusy(true)
    setNotice(null)
    try {
      const result = await window.stitchflow.savePrintPdf(`${batch.batchNumber}.pdf`)
      if (result.saved) {
        await window.stitchflow.markBatchPrinted(batch.id)
        setNotice(`Saved to ${result.filePath}`)
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'That PDF could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  const groups = useMemo(() => groupBySku(items), [items])
  const pages = estimatePages(items.length, layout)
  const totalUnits = items.reduce((sum, item) => sum + item.quantity, 0)

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>
  }

  if (!batch) {
    return (
      <Card className="flex flex-col items-center gap-2 px-6 py-10 text-center">
        <div className="flex size-11 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
          <Inbox className="size-5" />
        </div>
        <p className="text-sm font-medium">No batches yet</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          Upload order files and group them into a production batch first.
        </p>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <Card className="no-print flex flex-wrap items-center gap-3 p-4">
        <select
          value={layout}
          onChange={(event) => setLayout(event.target.value as LayoutMode)}
          className="h-9 rounded-lg border border-input bg-card px-3 text-sm outline-none focus-visible:border-ring"
        >
          <option value="standard">Standard table</option>
          <option value="grouped">Grouped by SKU</option>
        </select>
        <span className="text-xs text-muted-foreground">
          ~{pages} page{pages === 1 ? '' : 's'} (estimate)
        </span>
        <div className="ml-auto flex gap-2">
          <Button
            variant="secondary"
            onClick={() => void handleSavePdf()}
            disabled={busy || items.length === 0}
          >
            <FileDown />
            Save PDF
          </Button>
          <Button onClick={() => void handlePrint()} disabled={busy || items.length === 0}>
            <Printer />
            Print
          </Button>
        </div>
      </Card>

      {notice && (
        <p
          role="status"
          className="no-print rounded-lg border border-border bg-muted px-4 py-2.5 text-sm text-muted-foreground"
        >
          {notice}
        </p>
      )}

      {batch.unresolvedCount > 0 && (
        <Card className="no-print flex items-center gap-3 border-warning/30 bg-warning-muted p-4 text-sm">
          <TriangleAlert className="size-4.5 shrink-0 text-warning" />
          <p className="text-warning">
            {batch.unresolvedCount} item{batch.unresolvedCount === 1 ? '' : 's'} still need
            review and {batch.unresolvedCount === 1 ? "isn't" : "aren't"} on this sheet.
          </p>
          <Button
            size="sm"
            variant="secondary"
            className="ml-auto shrink-0"
            onClick={() => onNavigate('review', batch.id)}
          >
            Go to Review
          </Button>
        </Card>
      )}

      {items.length === 0 ? (
        <Card className="no-print flex flex-col items-center gap-2 px-6 py-10 text-center">
          <p className="text-sm font-medium">Nothing to print</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Every line in this batch still needs review.
          </p>
        </Card>
      ) : (
        <div className="print-sheet mx-auto max-w-3xl space-y-6 rounded-2xl border border-border bg-card p-8 shadow-sm print:m-0 print:max-w-none print:rounded-none print:border-0 print:bg-transparent print:p-0 print:shadow-none">
          <header className="space-y-1 border-b border-border pb-4">
            <div className="flex items-baseline justify-between gap-4">
              <h1 className="text-lg font-semibold tracking-tight">
                StitchFlow — Production Sheet
              </h1>
              <span className="text-xs text-muted-foreground">Factory name not set</span>
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
              <span>
                Batch <strong className="text-foreground">{batch.batchNumber}</strong>
              </span>
              {batch.name && <span>{batch.name}</span>}
              <span>Created {formatDate(batch.createdAt)}</span>
              <span>Printed {formatDate(new Date().toISOString())}</span>
              <span>
                {items.length} line{items.length === 1 ? '' : 's'} · {totalUnits} units
              </span>
            </div>
          </header>

          {layout === 'standard' ? (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="py-2 pr-3 font-semibold">#</th>
                  <th className="py-2 pr-3 font-semibold">Factory SKU</th>
                  <th className="py-2 pr-3 font-semibold">Colour</th>
                  <th className="py-2 pr-3 font-semibold">Size</th>
                  <th className="py-2 pl-3 text-right font-semibold">Qty</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => (
                  <tr key={item.id} className="border-b border-border/60">
                    <td className="py-1.5 pr-3 text-muted-foreground">{index + 1}</td>
                    <td className="py-1.5 pr-3 font-medium">{item.factorySku}</td>
                    <td className="py-1.5 pr-3">{item.colour || '—'}</td>
                    <td className="py-1.5 pr-3">{item.size || '—'}</td>
                    <td className="py-1.5 pl-3 text-right tabular">{item.quantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="space-y-5">
              {groups.map((group) => (
                <div key={group.factorySku}>
                  <div className="flex items-baseline justify-between border-b border-border pb-1">
                    <h2 className="font-semibold">{group.factorySku}</h2>
                    <span className="text-xs text-muted-foreground">{group.units} units</span>
                  </div>
                  <table className="w-full text-left text-sm">
                    <tbody>
                      {group.rows.map((row) => (
                        <tr key={row.id} className="border-b border-border/40">
                          <td className="py-1.5 pr-3 text-muted-foreground">
                            {row.colour || '—'}
                          </td>
                          <td className="py-1.5 pr-3 text-muted-foreground">
                            {row.size || '—'}
                          </td>
                          <td className="py-1.5 pl-3 text-right tabular">{row.quantity}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
