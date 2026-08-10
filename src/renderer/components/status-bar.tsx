import { HardDrive } from 'lucide-react'
import { useAppInfo } from '@/hooks/use-app-info'

export function StatusBar() {
  const appInfo = useAppInfo()

  return (
    <footer className="border-t border-border bg-card">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-8 py-2.5 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <HardDrive className="size-3.5" />
          Works offline — all data stays on this PC
        </span>

        {/* Blank until the IPC round trip resolves; a value here proves the bridge works. */}
        {appInfo && (
          <span className="tabular">
            v{appInfo.appVersion} · Electron {appInfo.electronVersion} · {appInfo.platform}
            {appInfo.packaged ? '' : ' · dev'}
          </span>
        )}
      </div>
    </footer>
  )
}
