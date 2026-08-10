import { useState } from 'react'
import { EMPTY_DASHBOARD_SUMMARY } from '@shared/types'
import { ActionTiles, type DashboardAction } from '@/components/action-tiles'
import { RecentBatches } from '@/components/recent-batches'
import { SummaryCards } from '@/components/summary-cards'
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
        {/* Placeholder zeros. Wiring these to real queries belongs to Phase 4/5 — the
            upload screen is where Phase 3 reports what it read. */}
        <SummaryCards summary={EMPTY_DASHBOARD_SUMMARY} />
      </div>

      <RecentBatches />
    </div>
  )
}