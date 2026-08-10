import type { LucideIcon } from 'lucide-react'
import { Archive, FileSpreadsheet, Layers, TriangleAlert } from 'lucide-react'
import type { DashboardSummary } from '@shared/types'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface SummaryCardSpec {
  key: keyof DashboardSummary
  label: string
  hint: string
  icon: LucideIcon
  /** Tailwind classes for the icon chip — the card's only colour. */
  tone: string
}

const CARDS: readonly SummaryCardSpec[] = [
  {
    key: 'ordersImported',
    label: 'Orders Imported',
    hint: 'From uploaded files',
    icon: FileSpreadsheet,
    tone: 'bg-primary-muted text-primary'
  },
  {
    key: 'itemsToProduce',
    label: 'Items to Produce',
    hint: 'Grouped by SKU, colour, size',
    icon: Layers,
    tone: 'bg-success-muted text-success'
  },
  {
    key: 'needsReview',
    label: 'Needs Review',
    hint: 'Held back from printing',
    icon: TriangleAlert,
    tone: 'bg-warning-muted text-warning'
  },
  {
    key: 'batchesToday',
    label: 'Batches Today',
    hint: 'Saved production runs',
    icon: Archive,
    tone: 'bg-muted text-muted-foreground'
  }
]

interface SummaryCardsProps {
  summary: DashboardSummary
}

export function SummaryCards({ summary }: SummaryCardsProps) {
  return (
    <section aria-label="Today's totals" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {CARDS.map(({ key, label, hint, icon: Icon, tone }) => (
        <Card key={key} className="p-5">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-medium text-muted-foreground">{label}</p>
            <div className={cn('flex size-8 items-center justify-center rounded-lg', tone)}>
              <Icon className="size-4" />
            </div>
          </div>
          <p className="tabular mt-3 text-3xl font-semibold leading-none tracking-tight">
            {summary[key]}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">{hint}</p>
        </Card>
      ))}
    </section>
  )
}
