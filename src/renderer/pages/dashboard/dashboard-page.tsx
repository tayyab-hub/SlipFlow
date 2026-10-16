import { ActionTiles, type DashboardAction } from '@/components/action-tiles'
import { RecentBatches } from '@/components/recent-batches'
import { SummaryCards } from '@/components/summary-cards'
import { useDashboardSummary } from '@/hooks/use-dashboard-summary'
import type { Navigate } from '@/App'

interface DashboardPageProps {
  onNavigate: Navigate
}

export function DashboardPage({ onNavigate }: DashboardPageProps) {
  const { summary } = useDashboardSummary()

  function handleAction(action: DashboardAction): void {
    // No batch id on review/print — those screens fall back to the most recently
    // created batch.
    onNavigate(action)
  }

  return (
    <div className="space-y-6">
      <ActionTiles onSelect={handleAction} />

      <div className="space-y-3">
        <h2 className="text-sm font-semibold tracking-tight">Production overview</h2>
        <SummaryCards summary={summary} />
      </div>

      <RecentBatches onNavigate={onNavigate} />
      <p className="text-sm text-muted-foreground">
        {summary.pendingOrders} pending order lines · {summary.activeBatches} active batches
      </p>
    </div>
  )
}
