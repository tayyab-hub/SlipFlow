import { useCallback, useEffect, useState } from 'react'
import { EMPTY_DASHBOARD_SUMMARY, type DashboardSummary } from '@shared/types'

/** Reads the four dashboard counters from the database, over the preload bridge. */
export function useDashboardSummary(): { summary: DashboardSummary; refresh: () => void } {
  const [summary, setSummary] = useState<DashboardSummary>(EMPTY_DASHBOARD_SUMMARY)
  const [version, setVersion] = useState(0)

  const refresh = useCallback(() => setVersion((current) => current + 1), [])

  useEffect(() => {
    let cancelled = false

    window.stitchflow
      .getDashboardSummary()
      .then((result) => {
        if (!cancelled) setSummary(result)
      })
      .catch((error: unknown) => {
        console.error('Could not read the dashboard summary', error)
      })

    return () => {
      cancelled = true
    }
  }, [version])

  return { summary, refresh }
}
