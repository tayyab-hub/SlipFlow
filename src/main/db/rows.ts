import type { SQLOutputValue } from 'node:sqlite'

/**
 * Row-reading helpers.
 *
 * `node:sqlite` hands back `Record<string, SQLOutputValue>`, so every column has to be
 * narrowed before it becomes a typed domain object. These throw rather than coerce: if a
 * column is missing or the wrong type, the schema and the mapper have drifted apart and
 * we want to hear about it immediately, not read `NaN` off a production sheet.
 */

export type DbRow = Record<string, SQLOutputValue>

function fail(column: string, value: SQLOutputValue, expected: string): never {
  throw new Error(
    `Column "${column}" should be ${expected} but was ${value === null ? 'null' : typeof value}`
  )
}

export function readText(row: DbRow, column: string): string {
  const value = row[column]
  if (typeof value !== 'string') fail(column, value ?? null, 'text')
  return value
}

export function readNullableText(row: DbRow, column: string): string | null {
  const value = row[column]
  if (value === null || value === undefined) return null
  if (typeof value !== 'string') fail(column, value, 'text or null')
  return value
}

export function readInteger(row: DbRow, column: string): number {
  const value = row[column]
  if (typeof value === 'bigint') return Number(value)
  if (typeof value !== 'number') fail(column, value ?? null, 'an integer')
  return value
}

export function readNullableInteger(row: DbRow, column: string): number | null {
  const value = row[column]
  if (value === null || value === undefined) return null
  if (typeof value === 'bigint') return Number(value)
  if (typeof value !== 'number') fail(column, value, 'an integer or null')
  return value
}

/** Booleans are stored as INTEGER 0/1. */
export function readBoolean(row: DbRow, column: string): boolean {
  return readInteger(row, column) !== 0
}

export function toDbBoolean(value: boolean): number {
  return value ? 1 : 0
}

/** Every timestamp in the database is written through here. */
export function nowIso(): string {
  return new Date().toISOString()
}
