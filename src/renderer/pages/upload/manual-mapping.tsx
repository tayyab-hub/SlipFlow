import { useState } from 'react'
import { ArrowLeft, CircleHelp, Save } from 'lucide-react'
import {
  FIELD_HINTS,
  FIELD_LABELS,
  MAPPABLE_FIELDS,
  REQUIRED_MAPPING_FIELDS,
  type ApplyMappingRequest,
  type FieldMapping,
  type MappableField,
  type UploadResult
} from '@shared/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { PlatformBadge } from '@/components/upload/platform-badge'

const NOT_PRESENT = ''

interface ManualMappingProps {
  /** A result whose status is `needs_mapping` — `preview` is guaranteed present. */
  result: UploadResult
  busy: boolean
  onCancel: () => void
  onSubmit: (request: ApplyMappingRequest) => void
}

/**
 * The "We need help reading this file" screen.
 *
 * Shown when detection could not find the columns it needs. Nothing has been written to
 * the database at this point — the file is imported only when the operator confirms.
 */
export function ManualMapping({ result, busy, onCancel, onSubmit }: ManualMappingProps) {
  const preview = result.preview
  const headers = preview?.headers ?? []

  const [mapping, setMapping] = useState<FieldMapping>(preview?.suggested ?? result.mapping)
  const [remember, setRemember] = useState(true)
  const [mappingName, setMappingName] = useState(
    result.platform === 'unknown' ? 'Custom layout' : `${result.platform} layout`
  )

  const missingRequired = REQUIRED_MAPPING_FIELDS.filter((field) => mapping[field] === NOT_PRESENT)
  const chosen = Object.values(mapping).filter(Boolean)
  const canImport = missingRequired.length === 0 && new Set(chosen).size === chosen.length

  function choose(field: MappableField, column: string): void {
    setMapping((current) => ({ ...current, [field]: column }))
  }

  /** Which other field already claimed a column, so the operator can see the clash. */
  function claimedBy(field: MappableField, column: string): MappableField | null {
    if (column === NOT_PRESENT) return null
    const clash = MAPPABLE_FIELDS.find((other) => other !== field && mapping[other] === column)
    return clash ?? null
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-warning-muted text-warning">
            <CircleHelp className="size-5" />
          </div>
          <div className="space-y-1">
            <h2 className="text-lg font-semibold tracking-tight">Preview and confirm import</h2>
            <p className="max-w-2xl text-sm text-muted-foreground">
              {preview?.reason ?? result.message} Tell SlipFlow which column holds what, and it will
              remember for next time.
            </p>
          </div>
        </div>

        <Button variant="ghost" onClick={onCancel} disabled={busy}>
          <ArrowLeft />
          Back
        </Button>
      </div>

      <Card className="p-5">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium">{result.fileName}</span>
          <PlatformBadge platform={result.platform} confidence={result.platformConfidence} />
          <Badge>{result.rowCount} rows</Badge>
          {result.sheetName && <Badge>sheet: {result.sheetName}</Badge>}
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <Card className="space-y-4 p-5">
          <h3 className="text-sm font-semibold">Which column is which?</h3>

          <div className="space-y-3">
            {MAPPABLE_FIELDS.map((field) => {
              const required = REQUIRED_MAPPING_FIELDS.includes(
                field as (typeof REQUIRED_MAPPING_FIELDS)[number]
              )
              const clash = claimedBy(field, mapping[field])

              return (
                <label key={field} className="block space-y-1.5">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    {FIELD_LABELS[field]}
                    {required && <span className="text-destructive">*</span>}
                  </span>

                  <select
                    value={mapping[field]}
                    onChange={(event) => choose(field, event.target.value)}
                    disabled={busy}
                    className="h-9 w-full rounded-lg border border-input bg-card px-3 text-sm outline-none focus-visible:border-ring disabled:opacity-50"
                  >
                    <option value={NOT_PRESENT}>— not in this file —</option>
                    {headers.map((header, index) => (
                      <option key={`${header}-${index}`} value={header}>
                        {header || `(column ${index + 1} has no heading)`}
                      </option>
                    ))}
                  </select>

                  <span className="block text-xs text-muted-foreground">
                    {clash
                      ? `Also used for ${FIELD_LABELS[clash]} — pick a different column.`
                      : FIELD_HINTS[field]}
                  </span>
                </label>
              )
            })}
          </div>

          <div className="space-y-3 border-t border-border pt-4">
            <label className="flex items-start gap-2.5 text-sm">
              <input
                type="checkbox"
                checked={remember}
                onChange={(event) => setRemember(event.target.checked)}
                disabled={busy}
                className="mt-0.5 size-4 accent-[var(--color-primary)]"
              />
              <span>
                Remember this layout
                <span className="block text-xs text-muted-foreground">
                  Files with the same columns will import automatically from now on.
                </span>
              </span>
            </label>

            {remember && (
              <label className="block space-y-1.5">
                <span className="text-sm font-medium">Name for this layout</span>
                <input
                  value={mappingName}
                  onChange={(event) => setMappingName(event.target.value)}
                  disabled={busy}
                  className="h-9 w-full rounded-lg border border-input bg-card px-3 text-sm outline-none focus-visible:border-ring disabled:opacity-50"
                />
              </label>
            )}
          </div>

          <div className="flex items-center gap-2 pt-1">
            <Button
              onClick={() =>
                onSubmit({
                  filePath: result.filePath,
                  mapping,
                  remember,
                  mappingName,
                  platform: result.platform
                })
              }
              disabled={busy || !canImport}
            >
              <Save />
              Import with this mapping
            </Button>
            <Button variant="ghost" onClick={onCancel} disabled={busy}>
              Cancel
            </Button>
          </div>

          {!canImport && (
            <p className="text-xs text-destructive">
              {missingRequired.map((field) => FIELD_LABELS[field]).join(' and ')} must be set before
              the file can be imported.
            </p>
          )}
        </Card>

        <Card className="overflow-hidden p-0">
          <div className="border-b border-border px-5 py-3">
            <h3 className="text-sm font-semibold">What&apos;s in the file</h3>
            <p className="text-xs text-muted-foreground">
              First {preview?.sampleRows.length ?? 0} rows, so you can see which column is which.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/60">
                  {headers.map((header, index) => (
                    <th
                      key={`${header}-${index}`}
                      className="whitespace-nowrap px-3 py-2 font-semibold"
                    >
                      {header || `(column ${index + 1})`}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="select-text">
                {(preview?.sampleRows ?? []).map((row, rowIndex) => (
                  <tr key={rowIndex} className="border-b border-border last:border-0">
                    {headers.map((_, columnIndex) => (
                      <td
                        key={columnIndex}
                        className="max-w-[220px] truncate whitespace-nowrap px-3 py-2 text-muted-foreground"
                        title={row[columnIndex] ?? ''}
                      >
                        {row[columnIndex] ?? ''}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  )
}
