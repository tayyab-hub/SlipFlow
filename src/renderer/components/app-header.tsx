import { ArrowLeft, Shirt } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface AppHeaderProps {
  /** Name of the current screen, shown next to the brand. Empty on the dashboard. */
  breadcrumb?: string
  /** Provided when there is somewhere to go back to. */
  onHome?: () => void
}

export function AppHeader({ breadcrumb, onHome }: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-10 border-b border-border bg-card/90 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-8 py-4">
        <div className="flex items-center gap-3">
          {onHome ? (
            <Button variant="ghost" size="icon" onClick={onHome} title="Back to dashboard">
              <ArrowLeft />
            </Button>
          ) : (
            <div className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Shirt className="size-5" />
            </div>
          )}

          <div>
            <h1 className="text-lg font-semibold leading-tight tracking-tight">
              SlipFlow
              {breadcrumb && (
                <span className="font-normal text-muted-foreground"> · {breadcrumb}</span>
              )}
            </h1>
            <p className="text-xs text-muted-foreground">Production sheets from order files</p>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">Offline workspace</p>
      </div>
    </header>
  )
}
