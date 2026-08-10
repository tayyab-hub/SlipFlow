import { createHash } from 'node:crypto'

/**
 * Turns a spreadsheet header cell into a comparable key.
 *
 * `"SKU Reference No."` → `sku_reference_no`
 * `"sellerSku"`         → `seller_sku`   (camelCase is split — Lazada exports use it)
 * `"  Qty  "`           → `qty`
 *
 * Every alias in column-aliases.ts is written in this form.
 */
export function normaliseHeader(raw: unknown): string {
  const text = raw === null || raw === undefined ? '' : String(raw)

  return text
    .trim()
    // camelCase / PascalCase → snake_case, so "orderNumber" matches "order_number".
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

/**
 * A stable fingerprint of a file's header row, used to recognise "a file like this one"
 * and reuse its saved column mapping.
 *
 * Normalised, de-duplicated and **sorted**, so the same export with its columns in a
 * different order still matches. Hashed so the stored value is a fixed 64 characters.
 *
 * ⚠️ Changing any of this invalidates every saved mapping — existing rows in
 * `column_mappings` would stop matching their files and operators would be asked to map
 * them again. Treat it as a schema change.
 */
export function buildHeaderSignature(headers: readonly string[]): string {
  const normalised = headers.map(normaliseHeader).filter((header) => header !== '')
  const unique = [...new Set(normalised)].sort()

  return createHash('sha256').update(unique.join('|')).digest('hex')
}

/** The same normalised header list, unhashed — for logs and debugging. */
export function describeHeaders(headers: readonly string[]): string {
  return [...new Set(headers.map(normaliseHeader).filter((h) => h !== ''))].sort().join('|')
}