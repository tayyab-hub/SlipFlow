import { useEffect, useState } from 'react'
import type { Batch } from '@shared/types'
import type { Navigate } from '@/App'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
export function RecentBatches({ onNavigate }: { onNavigate: Navigate }) {
  const [rows, setRows] = useState<Batch[]>([]),
    [error, setError] = useState('')
  useEffect(() => {
    void window.stitchflow
      .listBatches({ limit: 5 })
      .then(setRows)
      .catch((e) => setError(String(e)))
  }, [])
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Recent batches</h2>
        <Button variant="ghost" onClick={() => onNavigate('history')}>
          View history
        </Button>
      </div>
      <Card className="divide-y overflow-hidden">
        {error && (
          <p role="alert" className="p-4">
            {error}
          </p>
        )}
        {rows.map((b) => (
          <button
            key={b.id}
            className="flex w-full items-center gap-4 p-4 text-left text-sm hover:bg-muted"
            onClick={() => onNavigate('history', b.id)}
          >
            <span className="mr-auto font-medium">
              {b.name || b.batchNumber}
              <small className="block font-normal text-muted-foreground">{b.batchNumber}</small>
            </span>
            <span>{b.status}</span>
            <strong>{b.totalUnits} units</strong>
            <span>{b.unresolvedCount} to review</span>
          </button>
        ))}
        {!rows.length && !error && (
          <p className="p-8 text-center text-sm text-muted-foreground">
            No batches yet. Import orders to create your first production run.
          </p>
        )}
      </Card>
    </section>
  )
}
