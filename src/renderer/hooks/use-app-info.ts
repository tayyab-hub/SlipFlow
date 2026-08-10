import { useEffect, useState } from 'react'
import type { AppInfo } from '@shared/types'

/**
 * Reads static app info from the main process over the preload bridge.
 *
 * Phase 1 uses this as the end-to-end proof that main → preload → renderer IPC is
 * wired correctly, before the database depends on it.
 */
export function useAppInfo(): AppInfo | null {
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null)

  useEffect(() => {
    let cancelled = false

    window.stitchflow
      .getAppInfo()
      .then((info) => {
        if (!cancelled) setAppInfo(info)
      })
      .catch((error: unknown) => {
        // Non-fatal: the status bar just stays blank.
        console.error('Could not read app info', error)
      })

    return () => {
      cancelled = true
    }
  }, [])

  return appInfo
}
