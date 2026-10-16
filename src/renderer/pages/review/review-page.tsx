import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CircleCheck,
  Inbox,
  Merge,
  Pencil,
  Plus,
  Printer,
  Trash2,
  TriangleAlert,
  X
} from 'lucide-react'
import type {
  Batch,
  ProductionIssueType,
  ProductionItem,
  ProductionItemUpdate
} from '@shared/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { compareSizes } from '@/lib/sort-size'
import type { Navigate } from '@/App'
import { quantityFromText } from '@shared/validation'
import type { SourceOrder } from '@shared/delivery'

interface ReviewPageProps {
  /** No id — falls back to the most recently created batch. */
  batchId?: number
  onNavigate: Navigate
}

type StatusFilter = 'all' | 'needs-review' | 'resolved'
type SortKey = 'sku' | 'colour' | 'size' | 'quantity'

interface EditDraft {
  targetId: number | 'new'
  factorySku: string
  colour: string
  size: string
  quantity: string
}

const ISSUE_LABELS: Record<Exclude<ProductionIssueType, ''>, string> = {
  missing_sku: 'Missing SKU',
  missing_colour: 'Missing colour',
  missing_size: 'Missing size',
  invalid_quantity: 'Invalid quantity',
  unknown_mapping: 'Unmapped SKU',
  duplicate: 'Duplicate'
}

/** Matches the repository's own definition (`listUnresolved`'s WHERE clause). */
function isUnresolved(item: ProductionItem): boolean {
  return !item.isResolved || item.issueType !== ''
}

function emptyDraft(): EditDraft {
  return { targetId: 'new', factorySku: '', colour: '', size: '', quantity: '1' }
}

function draftFromItem(item: ProductionItem): EditDraft {
  return {
    targetId: item.id,
    factorySku: item.factorySku,
    colour: item.colour,
    size: item.size,
    quantity: String(item.quantity)
  }
}

export function ReviewPage({ batchId, onNavigate }: ReviewPageProps) {
  const [batch, setBatch] = useState<Batch | null>(null)
  const [items, setItems] = useState<ProductionItem[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [filterInitialised, setFilterInitialised] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>('sku')
  const [draft, setDraft] = useState<EditDraft | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [sources, setSources] = useState<SourceOrder[] | null>(null)

  const load = useCallback(async (targetBatchId: number | undefined, keepFilter: boolean) => {
    setLoading(true)
    setNotice(null)
    try {
      const resolvedBatch = targetBatchId
        ? await window.stitchflow.getBatch(targetBatchId)
        : ((await window.stitchflow.listBatches({ limit: 1 }))[0] ?? null)

      setBatch(resolvedBatch)

      const nextItems = resolvedBatch
        ? await window.stitchflow.listProductionItems(resolvedBatch.id)
        : []
      setItems(nextItems)

      if (!keepFilter) {
        setStatusFilter(nextItems.some(isUnresolved) ? 'needs-review' : 'all')
        setFilterInitialised(true)
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not load this batch.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load(batchId, false)
    void window.stitchflow
      .getSettings()
      .then((s) => setSortKey(s.defaultSort))
      .catch(() => {})
  }, [batchId, load])

  async function refreshAfterMutation(): Promise<void> {
    if (!batch) return
    await load(batch.id, filterInitialised)
  }

  async function saveDraft(): Promise<void> {
    if (!draft || !batch) return

    const quantity = quantityFromText(draft.quantity)
    if (draft.factorySku.trim() === '') {
      setNotice('Factory SKU is required.')
      return
    }
    if (quantity === null || !draft.colour.trim() || !draft.size.trim()) {
      setNotice(
        'Enter a positive whole quantity and confirm colour and size. Use N/A only when verified.'
      )
      return
    }

    setBusy(true)
    setNotice(null)
    try {
      if (draft.targetId === 'new') {
        await window.stitchflow.createProductionItem({
          batchId: batch.id,
          factorySku: draft.factorySku.trim(),
          colour: draft.colour.trim(),
          size: draft.size.trim(),
          quantity
        })
      } else {
        const changes: ProductionItemUpdate = {
          factorySku: draft.factorySku.trim(),
          colour: draft.colour.trim(),
          size: draft.size.trim(),
          quantity,
          issueType: '',
          issueNote: '',
          isResolved: true
        }
        await window.stitchflow.updateProductionItem(draft.targetId, changes)
      }
      setDraft(null)
      await refreshAfterMutation()
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'That change could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  async function removeItem(item: ProductionItem): Promise<void> {
    if (
      !window.confirm(
        'Remove this production item? Its source orders remain in history and a reconciliation note may be required.'
      )
    )
      return
    setBusy(true)
    setNotice(null)
    try {
      await window.stitchflow.removeProductionItem(item.id)
      setSelected((current) => {
        const next = new Set(current)
        next.delete(item.id)
        return next
      })
      if (draft?.targetId === item.id) setDraft(null)
      await refreshAfterMutation()
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'That row could not be removed.')
    } finally {
      setBusy(false)
    }
  }

  async function mergeSelected(): Promise<void> {
    if (!batch || selected.size < 2) return

    setBusy(true)
    setNotice(null)
    try {
      await window.stitchflow.mergeProductionItems(batch.id, [...selected])
      setSelected(new Set())
      await refreshAfterMutation()
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Those rows could not be merged.')
    } finally {
      setBusy(false)
    }
  }

  function toggleSelected(id: number): void {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const visibleItems = useMemo(() => {
    const term = search.trim().toLowerCase()

    const filtered = items.filter((item) => {
      if (statusFilter === 'needs-review' && !isUnresolved(item)) return false
      if (statusFilter === 'resolved' && isUnresolved(item)) return false
      if (
        term &&
        !`${item.factorySku} ${item.colour} ${item.size} ${item.issueNote}`
          .toLowerCase()
          .includes(term)
      )
        return false
      return true
    })

    return [...filtered].sort((a, b) => {
      switch (sortKey) {
        case 'colour':
          return (
            a.colour.localeCompare(b.colour) ||
            a.factorySku.localeCompare(b.factorySku) ||
            compareSizes(a.size, b.size)
          )
        case 'size':
          return compareSizes(a.size, b.size) || a.factorySku.localeCompare(b.factorySku)
        case 'quantity':
          return b.quantity - a.quantity
        default:
          return (
            a.factorySku.localeCompare(b.factorySku) ||
            compareSizes(a.size, b.size) ||
            a.colour.localeCompare(b.colour)
          )
      }
    })
  }, [items, search, statusFilter, sortKey])

  const unresolvedCount = items.filter(isUnresolved).length
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
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-tight">Batch {batch.batchNumber}</h2>
          <p className="text-sm text-muted-foreground">
            {items.length} line{items.length === 1 ? '' : 's'} · {totalUnits} units
            {unresolvedCount > 0 &&
              ` · ${unresolvedCount} need${unresolvedCount === 1 ? 's' : ''} review`}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button size="sm" onClick={() => onNavigate('history', batch.id)}>
            Reconcile / approve
          </Button>
          {selected.size >= 2 && (
            <Button size="sm" onClick={() => void mergeSelected()} disabled={busy}>
              <Merge />
              Merge selected ({selected.size})
            </Button>
          )}
          <Button
            size="sm"
            variant="secondary"
            onClick={() => onNavigate('print', batch.id)}
            disabled={busy}
          >
            <Printer />
            Print this batch
          </Button>
        </div>
      </div>

      {batch.status !== 'draft' && (
        <p className="rounded border bg-muted p-3 text-sm">
          This {batch.status} batch is locked. Ready batches can return to draft in History.
        </p>
      )}
      {sources && (
        <Card className="space-y-2 p-4">
          <div className="flex justify-between">
            <h3 className="font-semibold">Item source records</h3>
            <Button variant="ghost" onClick={() => setSources(null)}>
              Close
            </Button>
          </div>
          {sources.length ? (
            sources.map((o) => (
              <p key={o.id} className="text-xs">
                {o.fileName} · worksheet {o.sheetName} · row {o.rowNumber} · {o.platform}/
                {o.sellerName} · order {o.orderId} · {o.rawSku} · quantity {o.rawQuantity}
              </p>
            ))
          ) : (
            <p className="text-sm">
              Manual or legacy item. Batch source records remain available in History.
            </p>
          )}
        </Card>
      )}

      {notice && (
        <p
          role="status"
          className="rounded-lg border border-border bg-muted px-4 py-2.5 text-sm text-muted-foreground"
        >
          {notice}
        </p>
      )}

      <Card className="flex flex-wrap items-center gap-3 p-4">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search factory SKU…"
          className="h-9 min-w-[200px] flex-1 rounded-lg border border-input bg-card px-3 text-sm outline-none focus-visible:border-ring"
        />
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
          className="h-9 rounded-lg border border-input bg-card px-3 text-sm outline-none focus-visible:border-ring"
        >
          <option value="all">All statuses</option>
          <option value="needs-review">Needs review</option>
          <option value="resolved">Resolved</option>
        </select>
        <select
          value={sortKey}
          onChange={(event) => setSortKey(event.target.value as SortKey)}
          className="h-9 rounded-lg border border-input bg-card px-3 text-sm outline-none focus-visible:border-ring"
        >
          <option value="sku">Sort: SKU</option>
          <option value="colour">Sort: Colour</option>
          <option value="size">Sort: Size</option>
          <option value="quantity">Sort: Quantity</option>
        </select>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setDraft(emptyDraft())}
          disabled={busy || batch.status !== 'draft' || draft?.targetId === 'new'}
        >
          <Plus />
          Add row
        </Button>
      </Card>

      {draft?.targetId === 'new' && (
        <DraftForm
          draft={draft}
          setDraft={setDraft}
          onSave={saveDraft}
          onCancel={() => setDraft(null)}
          busy={busy}
        />
      )}

      <Card className="overflow-hidden p-0">
        {visibleItems.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">
            {items.length === 0
              ? 'No production lines in this batch.'
              : 'Nothing matches that filter.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/60 text-xs text-muted-foreground">
                  <th className="w-8 px-4 py-2" />
                  <th className="px-2 py-2 font-semibold">Factory SKU</th>
                  <th className="px-2 py-2 font-semibold">Colour</th>
                  <th className="px-2 py-2 font-semibold">Size</th>
                  <th className="px-2 py-2 font-semibold">Qty</th>
                  <th className="px-2 py-2 font-semibold">Platforms</th>
                  <th className="px-2 py-2 font-semibold">Status</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {visibleItems.map((item) =>
                  draft?.targetId === item.id ? (
                    <DraftRow
                      key={item.id}
                      draft={draft}
                      setDraft={setDraft}
                      onSave={saveDraft}
                      onCancel={() => setDraft(null)}
                      busy={busy}
                    />
                  ) : (
                    <tr
                      key={item.id}
                      className={`border-b border-border last:border-0 ${isUnresolved(item) ? 'bg-warning-muted/40' : ''}`}
                    >
                      <td className="px-4 py-2">
                        <input
                          type="checkbox"
                          checked={selected.has(item.id)}
                          onChange={() => toggleSelected(item.id)}
                          disabled={busy}
                          className="size-4 accent-[var(--color-primary)]"
                        />
                      </td>
                      <td className="px-2 py-2 font-medium">{item.factorySku || '—'}</td>
                      <td className="px-2 py-2 text-muted-foreground">{item.colour || '—'}</td>
                      <td className="px-2 py-2 text-muted-foreground">{item.size || '—'}</td>
                      <td className="px-2 py-2 tabular">{item.quantity}</td>
                      <td className="px-2 py-2 text-xs text-muted-foreground">
                        {item.sourcePlatforms || (item.isManual ? 'manual' : '—')}
                      </td>
                      <td className="px-2 py-2">
                        {isUnresolved(item) ? (
                          <div className="space-y-0.5">
                            <Badge tone="warning">
                              <TriangleAlert />
                              {item.issueType ? ISSUE_LABELS[item.issueType] : 'Unresolved'}
                            </Badge>
                            {item.issueNote && (
                              <p
                                className="max-w-[220px] truncate text-xs text-muted-foreground"
                                title={item.issueNote}
                              >
                                {item.issueNote}
                              </p>
                            )}
                          </div>
                        ) : (
                          <Badge tone="success">
                            <CircleCheck />
                            Resolved
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              void window.stitchflow
                                .itemSources(item.id)
                                .then(setSources)
                                .catch((e) => setNotice(String(e)))
                            }
                          >
                            Source
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            title={isUnresolved(item) ? 'Fix this row' : 'Edit this row'}
                            onClick={() => setDraft(draftFromItem(item))}
                            disabled={busy || batch.status !== 'draft'}
                          >
                            <Pencil />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Remove this row"
                            onClick={() => void removeItem(item)}
                            disabled={busy || batch.status !== 'draft'}
                          >
                            <Trash2 />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}

interface DraftFormProps {
  draft: EditDraft
  setDraft: (draft: EditDraft) => void
  onSave: () => void
  onCancel: () => void
  busy: boolean
}

/** The "Add row" form — same fields as `DraftRow`, laid out as a standalone card. */
function DraftForm({ draft, setDraft, onSave, onCancel, busy }: DraftFormProps) {
  return (
    <Card className="space-y-3 p-4">
      <div className="grid gap-3 sm:grid-cols-5">
        <Field
          label="Factory SKU"
          value={draft.factorySku}
          onChange={(v) => setDraft({ ...draft, factorySku: v })}
          disabled={busy}
        />
        <Field
          label="Colour"
          value={draft.colour}
          onChange={(v) => setDraft({ ...draft, colour: v })}
          disabled={busy}
        />
        <Field
          label="Size"
          value={draft.size}
          onChange={(v) => setDraft({ ...draft, size: v })}
          disabled={busy}
        />
        <Field
          label="Quantity"
          value={draft.quantity}
          onChange={(v) => setDraft({ ...draft, quantity: v })}
          disabled={busy}
          type="number"
        />
        <div className="flex items-end gap-2">
          <Button onClick={onSave} disabled={busy} className="flex-1">
            Save
          </Button>
          <Button variant="ghost" size="icon" onClick={onCancel} disabled={busy}>
            <X />
          </Button>
        </div>
      </div>
    </Card>
  )
}

/** Same edit form, laid out as inline table cells for an existing row. */
function DraftRow({ draft, setDraft, onSave, onCancel, busy }: DraftFormProps) {
  return (
    <tr className="border-b border-border bg-primary-muted/30 last:border-0">
      <td className="px-4 py-2" />
      <td className="px-2 py-2">
        <input
          value={draft.factorySku}
          onChange={(event) => setDraft({ ...draft, factorySku: event.target.value })}
          disabled={busy}
          className="h-8 w-full rounded-md border border-input bg-card px-2 text-sm outline-none focus-visible:border-ring"
        />
      </td>
      <td className="px-2 py-2">
        <input
          value={draft.colour}
          onChange={(event) => setDraft({ ...draft, colour: event.target.value })}
          disabled={busy}
          className="h-8 w-full rounded-md border border-input bg-card px-2 text-sm outline-none focus-visible:border-ring"
        />
      </td>
      <td className="px-2 py-2">
        <input
          value={draft.size}
          onChange={(event) => setDraft({ ...draft, size: event.target.value })}
          disabled={busy}
          className="h-8 w-full rounded-md border border-input bg-card px-2 text-sm outline-none focus-visible:border-ring"
        />
      </td>
      <td className="px-2 py-2">
        <input
          type="number"
          value={draft.quantity}
          onChange={(event) => setDraft({ ...draft, quantity: event.target.value })}
          disabled={busy}
          className="h-8 w-20 rounded-md border border-input bg-card px-2 text-sm outline-none focus-visible:border-ring"
        />
      </td>
      <td className="px-2 py-2" colSpan={2} />
      <td className="px-4 py-2">
        <div className="flex justify-end gap-1">
          <Button size="icon" variant="ghost" title="Save" onClick={onSave} disabled={busy}>
            <CircleCheck />
          </Button>
          <Button size="icon" variant="ghost" title="Cancel" onClick={onCancel} disabled={busy}>
            <X />
          </Button>
        </div>
      </td>
    </tr>
  )
}

interface FieldProps {
  label: string
  value: string
  onChange: (value: string) => void
  disabled: boolean
  type?: string
}

function Field({ label, value, onChange, disabled, type = 'text' }: FieldProps) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className="h-9 w-full rounded-lg border border-input bg-card px-3 text-sm outline-none focus-visible:border-ring disabled:opacity-50"
      />
    </label>
  )
}
