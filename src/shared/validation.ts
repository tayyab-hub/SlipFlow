/** Exact positive decimal integer, never a lossy conversion of operator input. */
export const MAX_QUANTITY = 1_000_000_000
export function validQuantity(value: unknown): value is number {
  return (
    typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= MAX_QUANTITY
  )
}
export function quantityFromText(text: string): number | null {
  const trimmed = text.trim()
  if (!/^\d+$/.test(trimmed)) return null
  const value = Number(trimmed)
  return validQuantity(value) ? value : null
}
export function positiveId(value: unknown, label = 'id'): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0)
    throw new Error(`${label} must be a positive integer`)
  return value
}
export function boundedText(value: unknown, label: string, required = false, max = 500): string {
  if (
    typeof value !== 'string' ||
    value.length > max ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)
  )
    throw new Error(`${label} must be text of at most ${max} characters`)
  const result = value.trim()
  if (required && !result) throw new Error(`${label} is required`)
  return result
}
