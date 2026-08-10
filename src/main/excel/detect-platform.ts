import { PLATFORM_SIGNALS } from './column-aliases'
import { normaliseHeader } from './header-signature'

export interface PlatformGuess {
  /** A key from PLATFORM_SIGNALS, or 'unknown'. */
  platform: string
  /** 0–1: the share of that platform's signal columns present in the file. */
  confidence: number
  via: 'headers' | 'filename' | 'none'
}

/** Below this share of matching signal columns, a header-based guess isn't trusted. */
const MIN_HEADER_CONFIDENCE = 0.3

/**
 * Works out which marketplace a file came from.
 *
 * Scored rather than matched one-for-one: `order_id` appears in every export, so a single
 * shared column must not decide it. Falls back to the file name, which is often the only
 * clue for a hand-edited export.
 */
export function detectPlatform(headers: readonly string[], fileName: string): PlatformGuess {
  const present = new Set(headers.map(normaliseHeader).filter((header) => header !== ''))

  let best: PlatformGuess = { platform: 'unknown', confidence: 0, via: 'none' }

  for (const [platform, signals] of Object.entries(PLATFORM_SIGNALS)) {
    if (signals.length === 0) continue

    const hits = signals.filter((signal) => present.has(signal)).length
    const confidence = hits / signals.length

    if (confidence > best.confidence) {
      best = { platform, confidence, via: 'headers' }
    }
  }

  if (best.via === 'headers' && best.confidence >= MIN_HEADER_CONFIDENCE) {
    return best
  }

  const lowerName = fileName.toLowerCase()
  for (const platform of Object.keys(PLATFORM_SIGNALS)) {
    if (lowerName.includes(platform)) {
      return { platform, confidence: 0.5, via: 'filename' }
    }
  }

  return { platform: 'unknown', confidence: 0, via: 'none' }
}