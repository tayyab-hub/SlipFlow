import { Inbox } from 'lucide-react'
import { Card } from '@/components/ui/card'

/**
 * Empty-state placeholder. Real batch history lands in Phase 7.
 */
export function RecentBatches() {
  return (
    <section aria-label="Recent batches" className="space-y-3">
      <h2 className="text-sm font-semibold tracking-tight">Recent Batches</h2>

      <Card className="flex flex-col items-center justify-center gap-3 px-6 py-10 text-center">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
          <Inbox className="size-6" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium">No production batches yet</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Upload an order file to build your first production sheet. Saved batches will
            appear here.
          </p>
        </div>
      </Card>
    </section>
  )
}
