import { useState } from 'react'
import { ActionTiles, type DashboardAction } from '@/components/action-tiles'
import { RecentBatches } from '@/components/recent-batches'
import { SummaryCards } from '@/components/summary-cards'
import { useDashboardSummary } from '@/hooks/use-dashboard-summary'
import type { Screen } from '@/App'

/**
 * Actions that have no screen yet. Shown as inline feedback so the shell is verifiably
 * interactive without pretending the features exist.
 */
const PENDING_ACTIONS: Partial<Record<DashboardAction, string>> = {
  review: 'The production review table arrives in Phase 5.',
  print: 'A4 print preview arrives in Phase 6.'
}

interface DashboardPageProps {
  onNavigate: (screen: Screen) => void
}

export function DashboardPage({ onNavigate }: DashboardPageProps) {
  const [notice, setNotice] = useState<string | null>(null)
  const { summary } = useDashboardSummary()

  function handleAction(action: DashboardAction): void {
    if (action === 'upload') {
      setNotice(null)
      onNavigate('upload')
      return
    }

    setNotice(PENDING_ACTIONS[action] ?? null)
  }

  return (
    <div className="space-y-6">
      <ActionTiles onSelect={handleAction} />

      {notice && (
        <p
          role="status"
          className="rounded-lg border border-border bg-muted px-4 py-2.5 text-sm text-muted-foreground"
        >
          {notice}
        </p>
      )}

      <div className="space-y-3">
        <h2 className="text-sm font-semibold tracking-tight">Today</h2>
        <SummaryCards summary={summary} />
      </div>

      <RecentBatches />
    </div>
  )
}