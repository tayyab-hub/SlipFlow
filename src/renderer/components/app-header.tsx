import { Shirt } from 'lucide-react'

export function AppHeader() {
  return (
    <header className="sticky top-0 z-10 border-b border-border bg-card/90 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-8 py-4">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Shirt className="size-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold leading-tight tracking-tight">StitchFlow</h1>
            <p className="text-xs text-muted-foreground">Production sheets from order files</p>
          </div>
        </div>

        {/* Populated from Settings in Phase 7. */}
        <p className="text-xs text-muted-foreground">Factory name not set</p>
      </div>
    </header>
  )
}
