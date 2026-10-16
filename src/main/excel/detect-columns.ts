import type { FieldMapping } from '@shared/types'
import {
  COLUMN_ALIASES,
  DETECTABLE_FIELDS,
  FIELD_LABELS,
  REQUIRED_FIELDS,
  type DetectableField
} from './column-aliases'
import { normaliseHeader } from './header-signature'

export type MatchKind = 'exact' | 'fuzzy' | 'none'

export interface FieldMatch {
  /** The header exactly as it appears in the file, or `''` when not found. */
  column: string
  columnIndex: number
  match: MatchKind
}

export interface ColumnDetection {
  matches: Record<DetectableField, FieldMatch>
  mapping: FieldMapping
  /** True when the file can be imported without asking the operator. */
  ok: boolean
  missing: DetectableField[]
  /** Operator-facing explanation, shown on the manual-mapping screen. */
  reason: string
}

const MIN_FUZZY_LENGTH = 3

function emptyMatch(): FieldMatch {
  return { column: '', columnIndex: -1, match: 'none' }
}

/**
 * Maps a file's headers onto the fields StitchFlow needs.
 *
 * Two passes, so a strong match never loses a column to a weak one:
 *   1. exact matches against the alias list, in alias priority order
 *   2. substring matches, for fields still unfound, using columns nobody claimed
 *
 * A column is only ever claimed once — otherwise `variation_sku` would satisfy both the
 * SKU and the Variation field and one of them would be wrong.
 */
export function detectColumns(headers: readonly string[]): ColumnDetection {
  const normalised = headers.map(normaliseHeader)
  const claimed = new Set<number>()

  const matches = Object.fromEntries(
    DETECTABLE_FIELDS.map((field) => [field, emptyMatch()])
  ) as Record<DetectableField, FieldMatch>

  function claim(field: DetectableField, index: number, kind: MatchKind): void {
    matches[field] = {
      column: headers[index] ?? '',
      columnIndex: index,
      match: kind
    }
    claimed.add(index)
  }

  // Pass 1 — exact alias hits.
  for (const field of DETECTABLE_FIELDS) {
    for (const alias of COLUMN_ALIASES[field]) {
      const index = normalised.findIndex(
        (header, position) => header === alias && !claimed.has(position)
      )
      if (index !== -1) {
        claim(field, index, 'exact')
        break
      }
    }
  }

  // Pass 2 — substring hits for whatever is still missing.
  for (const field of DETECTABLE_FIELDS) {
    if (matches[field].match !== 'none') continue

    for (const alias of COLUMN_ALIASES[field]) {
      if (alias.length < MIN_FUZZY_LENGTH) continue

      const index = normalised.findIndex(
        (header, position) =>
          !claimed.has(position) &&
          header.length >= MIN_FUZZY_LENGTH &&
          (header.includes(alias) || alias.includes(header))
      )
      if (index !== -1) {
        claim(field, index, 'fuzzy')
        break
      }
    }
  }

  const mapping: FieldMapping = {
    orderId: matches.orderId.column,
    sku: matches.sku.column,
    variation: matches.variation.column,
    colour: matches.colour.column,
    size: matches.size.column,
    quantity: matches.quantity.column
  }

  const missing = REQUIRED_FIELDS.filter((field) => matches[field].match === 'none')

  // Colour and size may arrive pre-split, or inside one "Variation" column that Phase 4
  // takes apart. Either is fine; neither is not.
  const hasBreakdown =
    matches.variation.match !== 'none' ||
    (matches.colour.match !== 'none' && matches.size.match !== 'none')

  const ok = missing.length === 0 && hasBreakdown

  return { matches, mapping, ok, missing, reason: explain(missing, hasBreakdown) }
}

function explain(missing: readonly DetectableField[], hasBreakdown: boolean): string {
  if (missing.length === 0 && hasBreakdown) return 'All required columns were found.'

  const problems: string[] = []

  if (missing.length > 0) {
    problems.push(
      `could not find the ${missing.map((field) => FIELD_LABELS[field]).join(' and ')} column${
        missing.length > 1 ? 's' : ''
      }`
    )
  }
  if (!hasBreakdown) {
    problems.push('could not tell which columns hold the colour and size')
  }

  return `SlipFlow ${problems.join(', and ')}.`
}

/** Header name → column index, for applying a mapping to rows. */
export function resolveColumnIndexes(
  headers: readonly string[],
  mapping: FieldMapping
): Record<keyof FieldMapping, number> {
  function indexOf(columnName: string): number {
    if (columnName === '') return -1

    const exact = headers.indexOf(columnName)
    if (exact !== -1) return exact

    // A saved mapping may have been created from a file whose headers differ only in
    // spacing or case, so fall back to comparing normalised forms.
    const target = normaliseHeader(columnName)
    return headers.findIndex((header) => normaliseHeader(header) === target)
  }

  return {
    orderId: indexOf(mapping.orderId),
    sku: indexOf(mapping.sku),
    variation: indexOf(mapping.variation),
    colour: indexOf(mapping.colour),
    size: indexOf(mapping.size),
    quantity: indexOf(mapping.quantity)
  }
}