import { useEffect, useState } from 'react'
import type { ApplyMappingRequest, ImportFile, ImportedOrder, UploadResult } from '@shared/types'
import type { SellerAccount } from '@shared/delivery'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { DropZone } from '@/components/upload/drop-zone'
import { ManualMapping } from './manual-mapping'
import type { Navigate } from '@/App'

export function UploadPage({ onNavigate }: { onNavigate: Navigate }) {
  const [sellers, setSellers] = useState<SellerAccount[]>([])
  const [sellerId, setSellerId] = useState(0)
  const [files, setFiles] = useState<ImportFile[]>([])
  const [selected, setSelected] = useState<number[]>([])
  const [previews, setPreviews] = useState<UploadResult[]>([])
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [name, setName] = useState('')
  const [sellerFilter, setSellerFilter] = useState(0)
  const [rows, setRows] = useState<Record<number, ImportedOrder[]>>({})
  const [rowSelection, setRowSelection] = useState<Record<number, number[]>>({})
  const [expanded, setExpanded] = useState(0),
    [search, setSearch] = useState('')
  async function refresh() {
    const [f, s] = await Promise.all([
      window.stitchflow.listPendingImports(),
      window.stitchflow.listSellers()
    ])
    setFiles(f)
    setSellers(s)
    setSelected(f.map((x) => x.id))
    setRows({})
    setRowSelection({})
    setExpanded(0)
  }
  async function inspect(id: number) {
    setBusy(true)
    try {
      const orders = await window.stitchflow.pendingOrderRows(id)
      setRows((r) => ({ ...r, [id]: orders }))
      setRowSelection((r) => ({ ...r, [id]: r[id] ?? orders.map((o) => o.id) }))
      setExpanded(id)
      setSearch('')
    } catch (e) {
      setNotice(String(e))
    } finally {
      setBusy(false)
    }
  }
  useEffect(() => {
    void refresh().catch((e) => setNotice(String(e)))
  }, [])
  async function upload(paths: string[]) {
    if (!sellerId) {
      setNotice('Choose a seller account before selecting files.')
      return
    }
    setBusy(true)
    setNotice('')
    try {
      const results = await window.stitchflow.importOrderFiles(paths, sellerId)
      setPreviews(results.filter((r) => r.status === 'needs_mapping'))
      setNotice(
        results
          .filter((r) => r.status === 'failed')
          .map((r) => `${r.fileName}: ${r.message}`)
          .join('\n')
      )
    } catch (e) {
      setNotice(String(e))
    } finally {
      setBusy(false)
    }
  }
  async function apply(request: ApplyMappingRequest) {
    setBusy(true)
    try {
      const result = await window.stitchflow.applyColumnMapping({
        ...request,
        sellerAccountId: sellerId,
        sheetName: previews[0]?.sheetName
      })
      if (result.status === 'imported') {
        setPreviews((p) => p.slice(1))
        setNotice(
          `${result.fileName}: ${result.rowCount} rows imported, ${result.invalidQuantityRows} invalid quantities, ${result.duplicateRows} duplicates excluded.`
        )
        await refresh()
      } else setNotice(result.message)
    } catch (e) {
      setNotice(String(e))
    } finally {
      setBusy(false)
    }
  }
  async function worksheet(sheetName: string) {
    if (!previews[0]) return
    setBusy(true)
    try {
      const [r] = await window.stitchflow.importOrderFiles(
        [previews[0].filePath],
        sellerId,
        sheetName
      )
      if (r?.status === 'needs_mapping') setPreviews((p) => [r, ...p.slice(1)])
      else setNotice(r?.message ?? 'Could not preview worksheet.')
    } catch (e) {
      setNotice(String(e))
    } finally {
      setBusy(false)
    }
  }
  async function group() {
    setBusy(true)
    try {
      const custom = Object.keys(rowSelection).length > 0
      const orderIds = custom
        ? (
            await Promise.all(
              selected.map(
                async (id) =>
                  rowSelection[id] ??
                  (await window.stitchflow.pendingOrderRows(id)).map((o) => o.id)
              )
            )
          ).flat()
        : undefined
      const r = await window.stitchflow.createBatchFromPending(selected, name, orderIds)
      onNavigate('review', r.batch.id)
    } catch (e) {
      setNotice(String(e))
    } finally {
      setBusy(false)
    }
  }
  async function remove(id: number) {
    if (!window.confirm('Remove this pending import and its source rows?')) return
    setBusy(true)
    try {
      await window.stitchflow.removeImport(id)
      await refresh()
    } catch (e) {
      setNotice(String(e))
    } finally {
      setBusy(false)
    }
  }
  if (previews[0])
    return (
      <div className="space-y-4">
        <p className="text-sm">
          Seller: <strong>{sellers.find((s) => s.id === sellerId)?.name}</strong> ·{' '}
          {previews.length} file previews remaining
        </p>
        {notice && (
          <p role="alert" className="rounded border p-3 text-sm">
            {notice}
          </p>
        )}
        <label className="text-sm">
          Worksheet{' '}
          <select
            className="ml-2 rounded border p-2"
            value={previews[0].sheetName}
            onChange={(e) => void worksheet(e.target.value)}
            disabled={busy}
          >
            {previews[0].sheetNames.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <ManualMapping
          key={`${previews[0].filePath}:${previews[0].sheetName}`}
          result={previews[0]}
          busy={busy}
          onCancel={() => setPreviews((p) => p.slice(1))}
          onSubmit={(r) => void apply(r)}
        />
      </div>
    )
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Import orders</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose the seller, preview each worksheet, then select files or individual order lines for
          a production batch.
        </p>
      </div>
      <Card className="flex flex-wrap items-center gap-4 p-4">
        <label className="text-sm font-medium">
          Seller account{' '}
          <select
            aria-label="Seller account"
            className="ml-2 min-w-56 rounded border p-2"
            value={sellerId}
            disabled={busy}
            onChange={(e) => setSellerId(Number(e.target.value))}
          >
            <option value={0}>Select seller</option>
            {sellers
              .filter((s) => s.active)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.platform} / {s.name}
                </option>
              ))}
          </select>
        </label>
        <Button variant="secondary" onClick={() => onNavigate('settings')}>
          Manage sellers
        </Button>
        <Button variant="secondary" onClick={() => onNavigate('sku-mapping')}>
          SKU mappings
        </Button>
      </Card>
      <DropZone
        busy={busy || !sellerId}
        onFiles={(paths) => void upload(paths)}
        onRejected={(names) => setNotice(`Unsupported files: ${names.join(', ')}`)}
      />
      {notice && (
        <p role="status" className="whitespace-pre-line rounded border bg-muted p-4 text-sm">
          {notice}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="mr-auto font-semibold">Pending imports</h3>
        <label className="text-sm">
          Filter seller{' '}
          <select
            className="rounded border p-2"
            value={sellerFilter}
            onChange={(e) => setSellerFilter(Number(e.target.value))}
          >
            <option value={0}>All sellers</option>
            {sellers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <Card className="overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="p-3">Batch</th>
              <th>File / worksheet</th>
              <th>Seller</th>
              <th>Rows</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {files
              .filter((f) => !sellerFilter || f.sellerAccountId === sellerFilter)
              .map((f) => (
                <tr key={f.id} className="border-t">
                  <td className="p-3">
                    <input
                      type="checkbox"
                      aria-label={`Select ${f.fileName}`}
                      checked={selected.includes(f.id)}
                      onChange={(e) =>
                        setSelected((ids) =>
                          e.target.checked ? [...ids, f.id] : ids.filter((id) => id !== f.id)
                        )
                      }
                    />
                  </td>
                  <td className="py-3">
                    {f.fileName}
                    <small className="block text-muted-foreground">{f.sheetName}</small>
                  </td>
                  <td>
                    {f.platform} /{' '}
                    {sellers.find((s) => s.id === f.sellerAccountId)?.name ?? 'Legacy'}
                  </td>
                  <td>{f.rowCount}</td>
                  <td>
                    <Button variant="ghost" disabled={busy} onClick={() => void inspect(f.id)}>
                      Choose rows
                    </Button>
                    <Button variant="ghost" disabled={busy} onClick={() => void remove(f.id)}>
                      Remove
                    </Button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
        {files.length === 0 && (
          <p className="p-8 text-center text-muted-foreground">
            No pending files. Select a seller and add an order export.
          </p>
        )}
      </Card>
      {expanded > 0 && rows[expanded] && (
        <Card className="space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="mr-auto font-semibold">
              Order lines: {files.find((f) => f.id === expanded)?.fileName}
            </h3>
            <Button variant="ghost" onClick={() => setExpanded(0)}>
              Close rows
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            {rowSelection[expanded]?.length} of {rows[expanded].length} pending rows selected.
            Unselected rows remain pending. Exact duplicates never add production units.
          </p>
          <div className="flex gap-3">
            <input
              aria-label="Search pending orders"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search order, SKU or variation"
              className="flex-1 rounded border p-2 text-sm"
            />
            <Button
              variant="secondary"
              onClick={() =>
                setRowSelection((r) => ({ ...r, [expanded]: rows[expanded]!.map((o) => o.id) }))
              }
            >
              Select all rows
            </Button>
            <Button
              variant="secondary"
              onClick={() => setRowSelection((r) => ({ ...r, [expanded]: [] }))}
            >
              Clear rows
            </Button>
          </div>
          <div className="max-h-80 overflow-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  <th className="p-2">Include</th>
                  <th>Source row / order</th>
                  <th>SKU / variant</th>
                  <th>Quantity</th>
                  <th>Validation</th>
                </tr>
              </thead>
              <tbody>
                {rows[expanded]
                  .filter((o) =>
                    `${o.orderId} ${o.rawSku} ${o.rawVariation}`
                      .toLowerCase()
                      .includes(search.toLowerCase())
                  )
                  .map((o) => (
                    <tr key={o.id} className="border-t">
                      <td className="p-2">
                        <input
                          type="checkbox"
                          aria-label={`Include source row ${o.rowNumber}`}
                          checked={rowSelection[expanded]?.includes(o.id) ?? false}
                          onChange={(e) =>
                            setRowSelection((r) => ({
                              ...r,
                              [expanded]: e.target.checked
                                ? [...(r[expanded] ?? []), o.id]
                                : (r[expanded] ?? []).filter((id) => id !== o.id)
                            }))
                          }
                        />
                      </td>
                      <td>
                        {o.rowNumber} / {o.orderId || 'Missing ID'}
                      </td>
                      <td>
                        {o.rawSku || 'Missing SKU'}
                        <small className="block">
                          {o.rawVariation || `${o.rawColour} ${o.rawSize}`}
                        </small>
                      </td>
                      <td>{o.rawQuantity}</td>
                      <td>
                        {o.isDuplicate
                          ? 'Duplicate excluded'
                          : o.validationNote ||
                            (!o.quantity ? 'Invalid quantity' : 'Review mapping in batch')}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      <div className="flex flex-wrap gap-3">
        <input
          aria-label="Batch name"
          placeholder="Batch name (optional)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={500}
          className="min-w-72 rounded border p-2 text-sm"
        />
        <Button disabled={busy || !selected.length} onClick={() => void group()}>
          Create batch from {selected.length} files
        </Button>
      </div>
    </div>
  )
}
