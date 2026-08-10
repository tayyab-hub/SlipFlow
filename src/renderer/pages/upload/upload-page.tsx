import { useCallback, useEffect, useState } from 'react'
import { CircleAlert, CircleCheck, CircleHelp, FileSpreadsheet, Trash2 } from 'lucide-react'
import type { ApplyMappingRequest, ImportFile, UploadResult } from '@shared/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { DropZone } from '@/components/upload/drop-zone'
import { PlatformBadge } from '@/components/upload/platform-badge'
import { ManualMapping } from './manual-mapping'

/** One line in the file list, from either this session's uploads or an earlier one. */
interface FileEntry {
  key: string
  fileName: string
  platform: string
  platformConfidence?: number
  rowCount: number
  status: UploadResult['status']
  detail: string
  importFileId: number | null
  /** Kept so the mapping screen can be reopened for a file that needs it. */
  result: UploadResult | null
}

function entryFromResult(result: UploadResult, index: number): FileEntry {
  return {
    key: `${result.filePath}:${index}:${result.status}`,
    fileName: result.fileName,
    platform: result.platform,
    platformConfidence: result.platformConfidence,
    rowCount: result.rowCount,
    status: result.status,
    detail: result.message,
    importFileId: result.importFileId,
    result
  }
}

function entryFromImportFile(file: ImportFile): FileEntry {
  const how =
    file.detectionStatus === 'auto'
      ? 'Columns detected automatically.'
      : file.detectionStatus === 'manual'
        ? 'Columns set by hand or from a saved layout.'
        : 'Imported earlier.'

  return {
    key: `import-file:${file.id}`,
    fileName: file.fileName,
    platform: file.platform,
    rowCount: file.rowCount,
    status: 'imported',
    detail: how,
    importFileId: file.id,
    result: null
  }
}

export function UploadPage() {
  const [entries, setEntries] = useState<FileEntry[]>([])
  const [mappingTarget, setMappingTarget] = useState<UploadResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const loadPending = useCallback(async () => {
    const files = await window.stitchflow.listPendingImports()
    setEntries(files.map(entryFromImportFile).reverse())
  }, [])

  useEffect(() => {
    void loadPending().catch((error: unknown) => {
      console.error('Could not list previous imports', error)
    })
  }, [loadPending])

  function absorb(results: readonly UploadResult[]): void {
    setEntries((current) => [...results.map(entryFromResult), ...current])

    // If anything needs mapping, take the operator straight to the first one.
    const needsMapping = results.find((result) => result.status === 'needs_mapping')
    if (needsMapping) setMappingTarget(needsMapping)
  }

  async function importFiles(filePaths: string[]): Promise<void> {
    setBusy(true)
    setNotice(null)
    try {
      absorb(await window.stitchflow.importOrderFiles(filePaths))
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'That upload could not be completed.')
    } finally {
      setBusy(false)
    }
  }

  async function applyMapping(request: ApplyMappingRequest): Promise<void> {
    setBusy(true)
    try {
      const result = await window.stitchflow.applyColumnMapping(request)

      if (result.status === 'imported') {
        setMappingTarget(null)
        // Replace the needs-mapping line for this file rather than stacking a second one.
        setEntries((current) => [
          entryFromResult(result, 0),
          ...current.filter((entry) => entry.result?.filePath !== request.filePath)
        ])
        setNotice(
          result.mappingRemembered
            ? `Imported and saved the layout — files like "${result.fileName}" will import automatically next time.`
            : `Imported "${result.fileName}".`
        )
      } else {
        setMappingTarget(result)
        setNotice(result.message)
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'That mapping could not be applied.')
    } finally {
      setBusy(false)
    }
  }

  async function remove(entry: FileEntry): Promise<void> {
    if (entry.importFileId === null) {
      setEntries((current) => current.filter((item) => item.key !== entry.key))
      return
    }

    await window.stitchflow.removeImport(entry.importFileId)
    setEntries((current) => current.filter((item) => item.key !== entry.key))
  }

  if (mappingTarget) {
    return (
      <ManualMapping
        result={mappingTarget}
        busy={busy}
        onCancel={() => setMappingTarget(null)}
        onSubmit={(request) => void applyMapping(request)}
      />
    )
  }

  const importedCount = entries.filter((entry) => entry.status === 'imported').length
  const totalRows = entries
    .filter((entry) => entry.status === 'imported')
    .reduce((sum, entry) => sum + entry.rowCount, 0)

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">Upload Orders</h2>
        <p className="text-sm text-muted-foreground">
          Add the order files you exported from each marketplace. StitchFlow works out which
          columns hold the SKU, colour, size and quantity.
        </p>
      </div>

      <DropZone
        busy={busy}
        onFiles={(paths) => void importFiles(paths)}
        onRejected={(names) =>
          setNotice(
            `Skipped ${names.length} file${names.length === 1 ? '' : 's'} StitchFlow can't read: ${names.join(', ')}`
          )
        }
      />

      {notice && (
        <p
          role="status"
          className="rounded-lg border border-border bg-muted px-4 py-2.5 text-sm text-muted-foreground"
        >
          {notice}
        </p>
      )}

      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-4">
          <h3 className="text-sm font-semibold tracking-tight">Files added</h3>
          {importedCount > 0 && (
            <p className="text-xs text-muted-foreground">
              {importedCount} file{importedCount === 1 ? '' : 's'} · {totalRows} order lines
            </p>
          )}
        </div>

        {entries.length === 0 ? (
          <Card className="flex flex-col items-center gap-2 px-6 py-10 text-center">
            <div className="flex size-11 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
              <FileSpreadsheet className="size-5" />
            </div>
            <p className="text-sm font-medium">No files yet</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Drop a marketplace export above, or use Choose files.
            </p>
          </Card>
        ) : (
          <ul className="space-y-2">
            {entries.map((entry) => (
              <li key={entry.key}>
                <Card className="flex items-center gap-4 px-4 py-3">
                  <StatusIcon status={entry.status} />

                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-medium">{entry.fileName}</span>
                      <PlatformBadge
                        platform={entry.platform}
                        confidence={entry.platformConfidence}
                      />
                      {entry.status === 'imported' && (
                        <Badge tone="success">{entry.rowCount} rows</Badge>
                      )}
                      {entry.status === 'needs_mapping' && (
                        <Badge tone="warning">needs mapping</Badge>
                      )}
                      {entry.status === 'failed' && <Badge tone="danger">unreadable</Badge>}
                    </div>
                    <p className="truncate text-xs text-muted-foreground" title={entry.detail}>
                      {entry.detail}
                    </p>
                  </div>

                  {entry.status === 'needs_mapping' && entry.result && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setMappingTarget(entry.result)}
                      disabled={busy}
                    >
                      Map columns
                    </Button>
                  )}

                  <Button
                    size="icon"
                    variant="ghost"
                    title="Remove this file"
                    onClick={() => void remove(entry)}
                    disabled={busy}
                  >
                    <Trash2 />
                  </Button>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function StatusIcon({ status }: { status: UploadResult['status'] }) {
  if (status === 'imported') {
    return (
      <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-success-muted text-success">
        <CircleCheck className="size-4.5" />
      </div>
    )
  }

  if (status === 'needs_mapping') {
    return (
      <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-warning-muted text-warning">
        <CircleHelp className="size-4.5" />
      </div>
    )
  }

  return (
    <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-destructive-muted text-destructive">
      <CircleAlert className="size-4.5" />
    </div>
  )
}