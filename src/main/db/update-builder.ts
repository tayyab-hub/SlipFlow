import type { SQLInputValue } from 'node:sqlite'
import { toDbBoolean } from './rows'

/**
 * Builds the SET clause of an UPDATE from a partial change set.
 *
 * `undefined` means "leave this column alone"; `null` means "set it to NULL". Each
 * `.set()` call states the column ↔ field pairing explicitly, so there is no
 * camelCase-to-snake_case guessing.
 */
export interface UpdateBuilder {
  set(column: string, value: SQLInputValue | undefined): UpdateBuilder
  setBoolean(column: string, value: boolean | undefined): UpdateBuilder
  /** True when no column changed — callers should skip the query entirely. */
  isEmpty(): boolean
  /** e.g. `name = $name, status = $status` */
  assignments(): string
  params(): Record<string, SQLInputValue>
}

export function createUpdate(): UpdateBuilder {
  const assignments: string[] = []
  const params: Record<string, SQLInputValue> = {}

  const builder: UpdateBuilder = {
    set(column, value) {
      if (value === undefined) return builder
      assignments.push(`${column} = $${column}`)
      params[`$${column}`] = value
      return builder
    },
    setBoolean(column, value) {
      return value === undefined ? builder : builder.set(column, toDbBoolean(value))
    },
    isEmpty: () => assignments.length === 0,
    assignments: () => assignments.join(', '),
    params: () => ({ ...params })
  }

  return builder
}

/** `?, ?, ?` for an `IN (…)` clause of the given length. */
export function placeholders(count: number): string {
  return Array.from({ length: count }, () => '?').join(', ')
}
