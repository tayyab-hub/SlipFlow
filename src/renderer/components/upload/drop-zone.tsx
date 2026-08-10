import { useRef, useState } from 'react'
import { FileSpreadsheet, FolderOpen, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const ACCEPTED_EXTENSIONS = ['.xlsx', '.xls', '.csv']

function hasAcceptedExtension(name: string): boolean {
  const lower = name.toLowerCase()
  return ACCEPTED_EXTENSIONS.some((extension) => lower.endsWith(extension))
}

interface DropZoneProps {
  busy: boolean
  onFiles: (filePaths: string[]) => void
  /** Called when files were dropped but none had a supported extension. */
  onRejected: (fileNames: string[]) => void
}

export function DropZone({ busy, onFiles, onRejected }: DropZoneProps) {
  const [dragging, setDragging] = useState(false)
  // Drag events fire for child elements too, so count enters/leaves instead of toggling.
  const dragDepth = useRef(0)

  function handleDrop(event: React.DragEvent<HTMLDivElement>): void {
    event.preventDefault()
    dragDepth.current = 0
    setDragging(false)
    if (busy) return

    const dropped = Array.from(event.dataTransfer.files)
    const accepted: string[] = []
    const rejected: string[] = []

    for (const file of dropped) {
      if (!hasAcceptedExtension(file.name)) {
        rejected.push(file.name)
        continue
      }
      // File.path no longer exists in Electron — the preload bridge resolves it.
      const path = window.stitchflow.pathForDroppedFile(file)
      if (path) accepted.push(path)
      else rejected.push(file.name)
    }

    if (rejected.length > 0) onRejected(rejected)
    if (accepted.length > 0) onFiles(accepted)
  }

  async function handleBrowse(): Promise<void> {
    const paths = await window.stitchflow.pickOrderFiles()
    if (paths.length > 0) onFiles(paths)
  }

  return (
    <div
      onDragEnter={(event) => {
        event.preventDefault()
        dragDepth.current += 1
        setDragging(true)
      }}
      onDragOver={(event) => {
        // Without this the browser refuses the drop.
        event.preventDefault()
      }}
      onDragLeave={(event) => {
        event.preventDefault()
        dragDepth.current -= 1
        if (dragDepth.current <= 0) {
          dragDepth.current = 0
          setDragging(false)
        }
      }}
      onDrop={handleDrop}
      className={cn(
        'flex flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors',
        dragging
          ? 'border-primary bg-primary-muted'
          : 'border-border bg-card hover:border-primary/40',
        busy && 'pointer-events-none opacity-60'
      )}
    >
      <div
        className={cn(
          'flex size-12 items-center justify-center rounded-2xl transition-colors',
          dragging ? 'bg-primary text-primary-foreground' : 'bg-primary-muted text-primary'
        )}
      >
        {dragging ? <FileSpreadsheet className="size-6" /> : <Upload className="size-6" />}
      </div>

      <div className="space-y-1">
        <p className="text-sm font-medium">
          {dragging ? 'Drop the order files here' : 'Drag order files here'}
        </p>
        <p className="text-sm text-muted-foreground">
          Excel or CSV exports from TikTok, Shopee or Lazada — {ACCEPTED_EXTENSIONS.join(', ')}
        </p>
      </div>

      <Button type="button" variant="secondary" onClick={() => void handleBrowse()} disabled={busy}>
        <FolderOpen />
        Choose files
      </Button>
    </div>
  )
}