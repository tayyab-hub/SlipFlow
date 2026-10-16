import { useState } from 'react'
import { AppHeader } from '@/components/app-header'
import { StatusBar } from '@/components/status-bar'
import { DashboardPage } from '@/pages/dashboard/dashboard-page'
import { PrintPage } from '@/pages/print/print-page'
import { ReviewPage } from '@/pages/review/review-page'
import { SkuMappingPage } from '@/pages/sku-mapping/sku-mapping-page'
import { UploadPage } from '@/pages/upload/upload-page'
import { HistoryPage } from '@/pages/history/history-page'
import { SettingsPage } from '@/pages/settings/settings-page'

export type Screen =
  | 'dashboard'
  | 'upload'
  | 'sku-mapping'
  | 'review'
  | 'print'
  | 'history'
  | 'settings'

/** Second argument is only meaningful for `'review'`/`'print'` — which batch to open. */
export type Navigate = (screen: Screen, batchId?: number) => void

const SCREEN_TITLES: Record<Screen, string> = {
  dashboard: '',
  upload: 'Upload Orders',
  'sku-mapping': 'SKU Mappings',
  review: 'Review Production',
  print: 'Print Sheet',
  history: 'Batch History',
  settings: 'Settings'
}

/**
 * App shell: header, the current screen, status bar.
 *
 * Navigation is plain state rather than a router — there are four screens, and adding a
 * routing library would need sign-off under CLAUDE.md §2/§5.5. Revisit when the screen
 * count makes back/forward history worth having.
 */
export default function App() {
  const [screen, setScreen] = useState<Screen>('dashboard')
  const [reviewBatchId, setReviewBatchId] = useState<number | undefined>(undefined)
  const [printBatchId, setPrintBatchId] = useState<number | undefined>(undefined)
  const [historyBatchId, setHistoryBatchId] = useState<number | undefined>()

  const navigate: Navigate = (nextScreen, batchId) => {
    if (nextScreen === 'review') setReviewBatchId(batchId)
    if (nextScreen === 'print') setPrintBatchId(batchId)
    if (nextScreen === 'history') setHistoryBatchId(batchId)
    setScreen(nextScreen)
  }

  return (
    <div className="flex h-full flex-col">
      <AppHeader
        breadcrumb={SCREEN_TITLES[screen]}
        onHome={screen === 'dashboard' ? undefined : () => setScreen('dashboard')}
      />

      <div className="flex min-h-0 flex-1">
        <nav aria-label="Main navigation" className="w-44 shrink-0 space-y-1 border-r bg-card p-3">
          {(
            [
              'dashboard',
              'upload',
              'sku-mapping',
              'review',
              'history',
              'print',
              'settings'
            ] as Screen[]
          ).map((item) => (
            <button
              key={item}
              onClick={() => navigate(item)}
              aria-current={screen === item ? 'page' : undefined}
              className={`w-full rounded-lg px-3 py-3 text-left text-sm font-medium ${screen === item ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
            >
              {item === 'dashboard' ? 'Dashboard' : SCREEN_TITLES[item]}
            </button>
          ))}
          <p className="px-3 pt-8 text-xs leading-5 text-muted-foreground">
            Offline production
            <br />
            Your data stays on this PC.
          </p>
        </nav>
        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-6xl px-8 py-7">
            {screen === 'dashboard' && <DashboardPage onNavigate={navigate} />}
            {screen === 'upload' && <UploadPage onNavigate={navigate} />}
            {screen === 'sku-mapping' && <SkuMappingPage onNavigate={navigate} />}
            {screen === 'review' && <ReviewPage batchId={reviewBatchId} onNavigate={navigate} />}
            {screen === 'print' && <PrintPage batchId={printBatchId} onNavigate={navigate} />}
            {screen === 'history' && <HistoryPage batchId={historyBatchId} onNavigate={navigate} />}
            {screen === 'settings' && <SettingsPage />}
          </div>
        </main>
      </div>

      <StatusBar />
    </div>
  )
}
