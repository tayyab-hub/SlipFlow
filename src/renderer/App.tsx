import { useState } from 'react'
import { AppHeader } from '@/components/app-header'
import { StatusBar } from '@/components/status-bar'
import { DashboardPage } from '@/pages/dashboard/dashboard-page'
import { SkuMappingPage } from '@/pages/sku-mapping/sku-mapping-page'
import { UploadPage } from '@/pages/upload/upload-page'

export type Screen = 'dashboard' | 'upload' | 'sku-mapping'

const SCREEN_TITLES: Record<Screen, string> = {
  dashboard: '',
  upload: 'Upload Orders',
  'sku-mapping': 'SKU Mappings'
}

/**
 * App shell: header, the current screen, status bar.
 *
 * Navigation is plain state rather than a router — there are two screens, and adding a
 * routing library would need sign-off under CLAUDE.md §2/§5.5. Revisit when the screen
 * count makes back/forward history worth having.
 */
export default function App() {
  const [screen, setScreen] = useState<Screen>('dashboard')

  return (
    <div className="flex h-full flex-col">
      <AppHeader
        breadcrumb={SCREEN_TITLES[screen]}
        onHome={screen === 'dashboard' ? undefined : () => setScreen('dashboard')}
      />

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-6xl px-8 py-7">
          {screen === 'dashboard' && <DashboardPage onNavigate={setScreen} />}
          {screen === 'upload' && <UploadPage onNavigate={setScreen} />}
          {screen === 'sku-mapping' && <SkuMappingPage onNavigate={setScreen} />}
        </div>
      </main>

      <StatusBar />
    </div>
  )
}