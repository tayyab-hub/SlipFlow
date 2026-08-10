# PROGRESS.md — StitchFlow (Factory Software)

Rolling session log. **A fresh Claude Code session reads
[CLAUDE.md](CLAUDE.md) + this file and should be able to continue without re-exploring
the codebase.** Update the "Current state" block and add a session entry at the end of
every session.

---

## Current state

**Phase:** 1 — skeleton app / dashboard shell
**Status:** ✅ Complete, verified against its Definition of Done
**Next phase:** 2 — SQLite database layer
**Last updated:** 2026-08-10

### What works right now (observed, not assumed)

- `npm run dev` opens a 1280×880 Electron window showing the StitchFlow dashboard:
  header with brand mark, three action tiles (**Upload Orders / Review Production /
  Print Sheet**, labelled Step 1–3), four summary cards all reading **0**
  (Orders Imported, Items to Produce, Needs Review, Batches Today), a "No production
  batches yet" empty state, and a status bar.
- The whole page fits the default window with no scrollbar and nothing clipped.
- Clicking an action tile renders an inline notice (e.g. "File upload and column
  detection arrive in Phase 3") — confirms React state and event handling work.
- **The IPC bridge works end to end.** The status bar reads
  `v0.1.0 · Electron 43.3.0 · win32 · dev`, fetched over
  main → preload → renderer with `contextIsolation: true` and `sandbox: true`.
- `npm run typecheck` passes (both projects, strict).
- `npm run build` passes: `out/main/index.js`, `out/preload/index.js`,
  `out/renderer/` (656 kB JS, 26 kB CSS). Unused lucide icons are tree-shaken out
  (verified by grepping the bundle).

### What does NOT exist yet

No database, no file upload, no parsing, no SKU mapping, no review table, no print view,
no batches, no settings, no installer, no lint, no tests. The three action tiles are
inert by design. Every counter is a hard-coded zero from `EMPTY_DASHBOARD_SUMMARY`.

### Assumptions Claude made (not from a spec — change freely)

The original spec document is **not in this repo**, so these were invented:

1. **Visual style.** "Clean, minimal, rounded cards" was the only guidance available.
   Chose: indigo primary, cool near-white background, `rounded-2xl` cards with a very
   soft shadow, Segoe UI. Every colour is a CSS variable in
   [globals.css](src/renderer/styles/globals.css) — re-skinning to the real branding spec
   means editing that one block, no component changes.
2. **The four card labels/meanings** were not specified. Chose Orders Imported / Items to
   Produce / Needs Review / Batches Today, typed as `DashboardSummary` in
   [types.ts](src/shared/types.ts). Renaming these is cheap now and expensive after
   Phase 2 wires them to queries — correct them before then if they're wrong.
3. **Step 1/2/3 labels** on the tiles, to make the Upload → Review → Print order obvious.
4. **The "Recent Batches" empty-state panel** was not in the Phase 1 brief. Added as part
   of "dashboard shell"; it is completely inert. Delete it if unwanted.
5. **Clicking a tile shows an "arrives in Phase N" notice** rather than doing nothing, so
   the shell is testable. These strings are placeholders — remove them as each phase
   lands.
6. **Dark-mode tokens exist but nothing activates them** (no `.dark` class is ever set).
   Kept so a Phase 7 theme setting doesn't require redefining all 25 colours.

### Decisions a later session must not silently reverse

- **Bundler is electron-vite** (main / preload / renderer → `out/`).
- **`package.json` has no `"type": "module"`** — main and preload build as CJS on
  purpose, so the sandboxed preload can `require('electron')`. Changing this breaks the
  preload.
- **Security posture: `contextIsolation: true`, `sandbox: true`,
  `nodeIntegration: false`** — verified working with a real IPC round trip, so there is
  no excuse to weaken it later.
- **CSP is applied via `onHeadersReceived` in packaged builds only.** Dev is exempt
  because Vite injects an inline HMR/React-Refresh preamble that a strict policy blocks.
  The packaged app (file://, no dev server) gets the strict policy. This is a dev/prod
  difference, not a weakened production app.
- **Single-instance lock is on.** Two copies of the app would mean two writers on one
  SQLite file in Phase 2.
- **Preload exposes named functions only** (`window.stitchflow.getAppInfo()`). No
  `ipcRenderer` passthrough, no generic `invoke(channel, ...)`.
- **Tailwind v4, CSS-first — there is no `tailwind.config.ts`.** Do not create one.
- **Version pins:** `vite@^7` + `@vitejs/plugin-react@^5`. Vite 8 exists but
  `electron-vite@5` peer-requires ≤ 7, and plugin-react 6 requires Vite 8. These three
  move together or not at all.
- **Bundled libs live in `devDependencies`**; `dependencies` is reserved for native
  runtime modules (`better-sqlite3`, Phase 2). See CLAUDE.md §3.
- **No router yet** — added in Phase 3, when a second screen exists.
- Git tag **`phase-1-skeleton`** marks this commit. `git checkout phase-1-skeleton`
  returns to a known-good state.

### Known issues / environment gotchas

1. **Electron's binary download silently no-ops during `npm install`.** Symptom:
   `npm run dev` fails with `Error: Electron uninstall`. Fix:
   `node node_modules/electron/install.js`. Happened on first install here. Never "fix"
   this by editing config.
2. **`ELECTRON_RUN_AS_NODE=1` leaks in from the VS Code host process.** Symptom:
   `TypeError: Cannot read properties of undefined (reading 'isPackaged')` at startup,
   because `require('electron')` returns a path string instead of the API. Fix: run
   `Remove-Item Env:ELECTRON_RUN_AS_NODE` before `npm run dev` in that terminal. This is
   **not** an app bug — launching from a normal terminal works fine.
3. **Renderer bundle is not minified** (656 kB, 16k lines). Deliberate: readable stack
   traces are worth more than bytes during Phases 2–9 for a local desktop app. Turn
   minification on in Phase 8 when building the installer.
4. **TypeScript 7 removed `baseUrl`** — tsconfig `paths` must be relative. Watch for
   other removed options; TS 7 is new. Bundler aliases are separate, in
   `electron.vite.config.ts`; a new alias needs adding in **both** places.
5. **No git remote** — history is local only, so this is not a backup.
6. **No lint or test setup** (deferred to Phase 9). Don't reference `npm run lint` or
   `npm test`; they don't exist.

### Useful technique for verifying UI phases

To check the UI actually renders without a human looking at it: temporarily add an
env-gated hook in `createMainWindow` that, on `did-finish-load`, calls
`window.webContents.capturePage()`, writes the PNG, optionally drives a click via
`executeJavaScript`, then `app.exit(0)`. Remove it before committing — it was used and
removed in this phase, so `out/main/index.js` should stay at ~2.9 kB.

### Next actions — Phase 2 (SQLite)

1. `npm install better-sqlite3` into **`dependencies`** (native module), plus
   `@electron/rebuild` in devDependencies; rebuild against Electron 43's ABI. Budget time
   for this — it's the usual first-hour sink.
2. **Verify, don't assume, the DB path.** The spec wants
   `%APPDATA%\StitchFlow\stitchflow.db`. Electron derives `userData` from the app name,
   and `package.json` sets `"name": "stitchflow"` with `"productName": "StitchFlow"` —
   confirm `app.getPath('userData')` actually resolves to `...\StitchFlow` and not
   `...\stitchflow`, and call `app.setName('StitchFlow')` if it doesn't.
3. Create `src/main/db/` per CLAUDE.md §3: `schema.sql`, `migrations/0001_init.sql`,
   `repositories/` (one file per table). Tables: `batches`, `production_items`,
   `sku_mappings`, `imported_orders`, `import_files`, `column_mappings`, `settings`.
4. Migrations are **append-only** from this point on (CLAUDE.md §5.1) — get the initial
   schema reviewed before committing, because after Phase 2 it can only be added to.
5. CRUD per table, callable from main. **No UI wiring in Phase 2** — the dashboard
   counters stay hard-coded zeros until a later phase.
6. Verification for the DoD: a script that inserts and reads back one row per table.

---

## How to update this file

At the end of each session, append a new `## Session N` entry below and refresh the
**Current state** block above. Keep entries factual — "works" means it was actually run
and observed, not "was written".

Template:

```markdown
## Session N — YYYY-MM-DD — Phase X

**Built:** what was actually added or changed (files/areas, not a diff).
**Verified:** what was run and observed to work (commands, manual checks).
**Not done / left:** anything in scope that was skipped, and why.
**Known issues:** bugs, hacks, TODOs left behind, and where they are.
**Decisions:** choices made that a later session must not silently reverse.
**Next:** the single next action.
```

---

## Session log

## Session 1 — 2026-08-10 — Phase 0

**Built:** Git repo (`main`), `.gitignore`, `.gitattributes`, `CLAUDE.md`, `PROGRESS.md`.
No application code.
**Verified:** `git init` succeeded; git 2.55.0 with user identity configured globally.
**Not done / left:** Phase plan not recorded (not supplied at the time).
**Known issues:** none.
**Decisions:** Default branch `main`. Database files and `data/` git-ignored so real
operator data can never be committed. Schema changes additive-migration-only.
**Next:** Owner supplies the phase plan.
**Commit:** `be92b94`

## Session 2 — 2026-08-10 — Phase 1

**Built:**
- Full 9-phase plan recorded in CLAUDE.md §7, plus §8 noting the missing spec document.
  CLAUDE.md §2/§3/§4 updated to match what actually got built (Tailwind v4 CSS-first,
  real folder tree, real npm scripts, environment gotchas).
- Project scaffold: `package.json`, `electron.vite.config.ts`, three tsconfigs,
  `components.json`.
- Main process ([src/main/index.ts](src/main/index.ts)): window creation, single-instance
  lock, external-link handling, production-only CSP, `app:info` IPC handler.
- Preload bridge ([src/preload/index.ts](src/preload/index.ts)) exposing
  `window.stitchflow.getAppInfo()`, typed via `src/preload/index.d.ts`.
- Shared layer: `src/shared/ipc-channels.ts`, `src/shared/types.ts` (`AppInfo`,
  `DashboardSummary`, `EMPTY_DASHBOARD_SUMMARY`).
- Renderer: theme tokens in `styles/globals.css`, hand-written shadcn/ui `button` and
  `card` primitives, `lib/utils.ts` (`cn`), `hooks/use-app-info.ts`, components
  `app-header`, `action-tiles`, `summary-cards`, `recent-batches`, `status-bar`, and
  `pages/dashboard/dashboard-page.tsx`.

**Verified:** `npm run typecheck` clean; `npm run build` clean; app launched via
`npm run dev` and screenshotted — dashboard renders as described above, fits the window
with no scrollbar, tile click updates the notice, and the status bar proves IPC works
under `sandbox: true`. Confirmed unused lucide icons are tree-shaken out of the bundle.
Confirmed the temporary screenshot hook was removed (main bundle back to 2.91 kB).

**Not done / left:** Nothing from Phase 1's brief. ESLint/tests not set up (Phase 9).
Bundle minification deliberately left off until Phase 8.

**Known issues:** See "Known issues / environment gotchas" above — the Electron binary
download and the `ELECTRON_RUN_AS_NODE` leak both cost time and will recur on a fresh
clone or a new terminal.

**Decisions:** See "Decisions a later session must not silently reverse" above. The
notable ones: CJS main/preload so the sandboxed preload works, CSP in packaged builds
only, Vite pinned to 7, no `tailwind.config.ts`, bundled deps in `devDependencies`.

**Next:** Phase 2 — SQLite layer. Confirm the `%APPDATA%\StitchFlow` path resolves
correctly before creating tables, and get the initial schema reviewed before committing,
since migrations become append-only afterwards.
