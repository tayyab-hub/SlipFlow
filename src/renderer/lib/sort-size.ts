/**
 * Orders garment sizes the way a factory floor expects — smallest first — instead of
 * alphabetically (which would put "2XL" before "L" and "S" before "M").
 *
 * Handles two families, each sorted on its own numeric scale:
 *   - Named sizes: XXS, XS, S, M, L, XL, XXL/2XL, 3XL, 4XL, 5XL, 6XL, 7XL
 *   - Numeric sizes: children's ages ("2Y".."16Y"), plain numbers ("38", "40"), etc. —
 *     sorted on the leading number.
 * Anything unrecognised ("One Size", "Free") sorts alphabetically, after every sized row.
 */

const NAMED_SIZE_RANK: Record<string, number> = {
  XXS: 0,
  XS: 1,
  S: 2,
  M: 3,
  L: 4,
  XL: 5,
  XXL: 6,
  '2XL': 6,
  '3XL': 7,
  '4XL': 8,
  '5XL': 9,
  '6XL': 10,
  '7XL': 11
}

interface SizeKey {
  bucket: 0 | 1 | 2
  rank: number
  raw: string
}

function sizeKey(size: string): SizeKey {
  const raw = size.trim().toUpperCase()

  if (raw in NAMED_SIZE_RANK) {
    return { bucket: 0, rank: NAMED_SIZE_RANK[raw]!, raw }
  }

  const numeric = /^(\d+(?:\.\d+)?)/.exec(raw)
  if (numeric) {
    return { bucket: 1, rank: Number(numeric[1]), raw }
  }

  return { bucket: 2, rank: 0, raw }
}

export function compareSizes(a: string, b: string): number {
  const keyA = sizeKey(a)
  const keyB = sizeKey(b)

  if (keyA.bucket !== keyB.bucket) return keyA.bucket - keyB.bucket
  if (keyA.bucket === 2) return keyA.raw.localeCompare(keyB.raw)
  return keyA.rank - keyB.rank
}
