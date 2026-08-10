import { useState } from 'react'
import { EMPTY_DASHBOARD_SUMMARY } from '@shared/types'
import { AppHeader } from '@/components/app-header'
import { ActionTiles, type DashboardAction } from '@/components/action-tiles'
import { RecentBatches } from '@/components/recent-batches'
import { StatusBar } from '@/components/status-bar'
import { SummaryCards } from '@/components/summary-cards'

/**
 * Which phase each action gets its real behaviour in. Shown as inline feedback so the
 * shell is verifiably interactive without pretending the features exist.
 */
const ACTION_STATUS: Record<DashboardAction, string> = {
  upload: 'File upload and column detection arrive in Phase 3.',
  review: 'The production review table arrives in Phase 5.',
  print: 'A4 print preview arrives in Phase 6.'
}

export function DashboardPage() {
  const [notice, setNotice] = useState<string | null>(null)

  return (
    <div className="flex h-full flex-col">
      <AppHeader />

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-6xl space-y-6 px-8 py-7">
          <ActionTiles onSelect={(action) => setNotice(ACTION_STATUS[action])} />

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
            {/* Placeholder zeros — nothing populates these until Phase 2. */}
            <SummaryCards summary={EMPTY_DASHBOARD_SUMMARY} />
          </div>

          <RecentBatches />
        </div>
      </main>

      <StatusBar />
    </div>
  )
}
