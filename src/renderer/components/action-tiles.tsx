import type { LucideIcon } from 'lucide-react'
import { ArrowRight, ClipboardList, Printer, Upload } from 'lucide-react'
import { cn } from '@/lib/utils'

/** The three steps of the operator's workflow, in order. */
export type DashboardAction = 'upload' | 'review' | 'print'

interface ActionTile {
  action: DashboardAction
  step: string
  title: string
  description: string
  icon: LucideIcon
}

const TILES: readonly ActionTile[] = [
  {
    action: 'upload',
    step: 'Step 1',
    title: 'Upload Orders',
    description: 'Add order files exported from TikTok, Shopee or Lazada.',
    icon: Upload
  },
  {
    action: 'review',
    step: 'Step 2',
    title: 'Review Production',
    description: 'Check grouped quantities and fix anything flagged.',
    icon: ClipboardList
  },
  {
    action: 'print',
    step: 'Step 3',
    title: 'Print Sheet',
    description: 'Print the A4 production sheet for the floor.',
    icon: Printer
  }
]

interface ActionTilesProps {
  onSelect: (action: DashboardAction) => void
}

export function ActionTiles({ onSelect }: ActionTilesProps) {
  return (
    <section aria-label="Main actions" className="grid gap-4 sm:grid-cols-3">
      {TILES.map(({ action, step, title, description, icon: Icon }, index) => (
        <button
          key={action}
          type="button"
          onClick={() => onSelect(action)}
          className={cn(
            'group flex flex-col items-start gap-3 rounded-2xl border border-border bg-card p-5 text-left',
            'shadow-[0_1px_2px_rgb(16_24_40/0.04),0_1px_3px_rgb(16_24_40/0.06)] transition-all',
            'hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[0_4px_12px_rgb(16_24_40/0.08)]',
            'active:translate-y-0'
          )}
        >
          <div className="flex w-full items-center justify-between">
            <div
              className={cn(
                'flex size-11 items-center justify-center rounded-xl transition-colors',
                index === 0
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-primary-muted text-primary group-hover:bg-primary group-hover:text-primary-foreground'
              )}
            >
              <Icon className="size-5" />
            </div>
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {step}
            </span>
          </div>

          <div className="space-y-1">
            <h3 className="text-base font-semibold tracking-tight">{title}</h3>
            <p className="text-sm leading-snug text-muted-foreground">{description}</p>
          </div>

          <span className="mt-auto inline-flex items-center gap-1.5 pt-2 text-sm font-medium text-primary">
            Open
            <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
          </span>
        </button>
      ))}
    </section>
  )
}
