import { Badge } from '@/components/ui/badge'

const LABELS: Record<string, string> = {
  tiktok: 'TikTok',
  shopee: 'Shopee',
  lazada: 'Lazada',
  unknown: 'Unknown platform'
}

interface PlatformBadgeProps {
  platform: string
  /** 0–1 from detection; a low value is shown as "guessed". */
  confidence?: number
}

export function PlatformBadge({ platform, confidence }: PlatformBadgeProps) {
  const known = platform !== 'unknown' && platform !== ''
  const label = LABELS[platform] ?? platform
  const guessed = known && confidence !== undefined && confidence < 0.5

  return (
    <Badge tone={known ? 'brand' : 'neutral'} title={guessed ? 'Best guess — check this' : undefined}>
      {label}
      {guessed ? ' (guess)' : ''}
    </Badge>
  )
}