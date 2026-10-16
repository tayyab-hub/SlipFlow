import { useEffect, useState } from 'react'
import type { Batch } from '@shared/types'
import { Button } from '@/components/ui/button'
import type { Navigate } from '@/App'

export function PrintPage({ batchId, onNavigate }: { batchId?: number; onNavigate: Navigate }) {
  const [batch, setBatch] = useState<Batch | null>(null)
  const [layout, setLayout] = useState('standard')
  const [html, setHtml] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    void Promise.all([
      batchId
        ? window.stitchflow.getBatch(batchId)
        : window.stitchflow.listBatches({ limit: 1 }).then((b) => b[0] ?? null),
      window.stitchflow.getSettings()
    ])
      .then(([b, s]) => {
        setBatch(b)
        setLayout(s.printLayout)
      })
      .catch((e) => setNotice(String(e)))
  }, [batchId])
  useEffect(() => {
    if (batch)
      void window.stitchflow
        .printPreview(batch.id, layout)
        .then(setHtml)
        .catch((e) => setNotice(String(e)))
  }, [batch, layout])
  async function output(pdf: boolean) {
    if (!batch) return
    setBusy(true)
    setNotice('')
    try {
      if (pdf) {
        const r = await window.stitchflow.savePrintPdf(batch.id, layout)
        setNotice(r.saved ? `PDF saved: ${r.filePath}` : 'Save cancelled.')
      } else setNotice(await window.stitchflow.nativePrint(batch.id, layout))
    } catch (e) {
      setNotice(String(e))
    } finally {
      setBusy(false)
    }
  }
  const printable =
    batch && ['ready', 'printed'].includes(batch.status) && batch.unresolvedCount === 0
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="mr-auto text-xl font-semibold">A4 tailor slip</h2>
        <label className="text-sm">
          Layout{' '}
          <select
            aria-label="Print layout"
            value={layout}
            onChange={(e) => setLayout(e.target.value)}
            className="rounded border p-2"
          >
            <option value="standard">Standard</option>
            <option value="grouped">Grouped by SKU</option>
          </select>
        </label>
        <Button variant="secondary" onClick={() => onNavigate('history', batch?.id)}>
          Batch history
        </Button>
        <Button disabled={busy || !printable} onClick={() => void output(true)}>
          Save PDF
        </Button>
        <Button disabled={busy || !printable} onClick={() => void output(false)}>
          Print
        </Button>
      </div>
      {!printable && (
        <p className="rounded border border-amber-300 bg-amber-50 p-4 text-sm">
          Draft preview only. Resolve every issue and approve the batch in History before printing.{' '}
          <button className="underline" onClick={() => onNavigate('review', batch?.id)}>
            Review items
          </button>
        </p>
      )}
      {notice && (
        <p role="status" className="rounded border p-3 text-sm">
          {notice}
        </p>
      )}
      {html ? (
        <iframe
          title="A4 production slip preview"
          srcDoc={html}
          sandbox=""
          className="h-[900px] w-full rounded-lg border bg-white shadow-sm"
        />
      ) : (
        <p>No batch to preview.</p>
      )}
    </div>
  )
}
