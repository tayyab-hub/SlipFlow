# CLAUDE.md — StitchFlow (Factory Software)

This file is read automatically at the start of every Claude Code session. It is the
project's standing contract: stack, conventions, and hard rules. Keep it short and
current. Session-to-session state lives in [PROGRESS.md](PROGRESS.md) — read that too.

---

## 1. What this is

**StitchFlow** — an offline-first Windows desktop app for a garment factory. An operator
exports order files from marketplaces (TikTok, Shopee, Lazada), drops them in, and gets a
printed A4 production sheet telling the floor what to sew.

The pipeline: **upload order files → detect columns → map marketplace SKUs to factory
SKU/colour/size → group and sum quantities → review and fix flagged rows → print the A4
sheet → save the run as a batch.**

No server, no accounts, no network. Data lives in one local SQLite file; it enters via
spreadsheets and leaves via the printer, a PDF, or a backup ZIP.

> **TODO (owner):** the detailed spec this was summarised from is not in the repo — see
> §8. Correct this paragraph if it misstates the product.

**Platform target:** Windows 11 (primary). Do not add macOS/Linux-only code paths
without asking.

---

## 2. Tech stack

Do not introduce a new library, framework, or state manager that is not on this list.
If something here is genuinely the wrong tool for a task, **stop and ask** — do not
swap it silently.

| Layer | Choice | Notes |
|---|---|---|
| Shell | **Electron** | Main + preload + renderer. Context isolation ON, `nodeIntegration` OFF. |
| UI | **React** + **TypeScript** | Function components + hooks only. No class components. |
| Styling | **Tailwind CSS v4** | Utility classes in JSX. **CSS-first config — there is no `tailwind.config.ts`**; theme tokens live in `src/renderer/styles/globals.css`. No CSS-in-JS. |
| Components | **shadcn/ui** | Copy-in components under `src/renderer/components/ui/`. Owned by us, editable. `components.json` is configured, so `npx shadcn@latest add <x>` lands in the right place. |
| Bundler | **electron-vite** (Vite 7) | Builds main / preload / renderer. Output in `out/`. |
| Database | **SQLite** | Single local file. Accessed **only** from the Electron main process. |
| Spreadsheets | **SheetJS (xlsx)** | All Excel import/export. Runs in main process, not the renderer. |
| Language | **TypeScript, strict** | `strict: true`. No `any` unless commented with why. |

---

## 3. Folder structure

Folders marked ⬜ don't exist yet — they're created by the phase that needs them.

```
Factory_Software/
├── CLAUDE.md                  # this file — the contract
├── PROGRESS.md                # rolling state: what's built, what's next
├── package.json
├── components.json            # shadcn/ui CLI config
├── electron.vite.config.ts    # main / preload / renderer build config
├── tsconfig.json              # references the two configs below
├── tsconfig.node.json         # main + preload + shared (Node libs, no DOM)
├── tsconfig.web.json          # renderer + shared (DOM libs)
├── out/                       # build output — git-ignored, never edit
└── src/
    ├── main/                  # Electron main process (Node context)
    │   ├── index.ts           # app lifecycle, window creation, IPC registration
    │   ├── ipc/               # ⬜ one file per IPC domain once index.ts outgrows it
    │   ├── db/                # ⬜ Phase 2
    │   │   ├── schema.sql     #    authoritative schema (see rule 5.1)
    │   │   ├── migrations/    #    NNNN_description.sql, append-only
    │   │   └── repositories/  #    one file per table/aggregate; all SQL lives here
    │   └── excel/             # ⬜ Phase 3 — SheetJS import + export
    ├── preload/
    │   ├── index.ts           # contextBridge surface — the ONLY main↔renderer door
    │   └── index.d.ts         # types the `window.stitchflow` global
    ├── renderer/              # React app (browser context, no Node APIs)
    │   ├── index.html         # Vite entry — renderer root is this folder
    │   ├── main.tsx           # React mount
    │   ├── App.tsx
    │   ├── env.d.ts
    │   ├── styles/
    │   │   └── globals.css    # Tailwind import + all theme tokens
    │   ├── pages/             # one folder per screen
    │   │   └── dashboard/
    │   ├── components/        # app-level components
    │   │   └── ui/            # shadcn/ui primitives
    │   ├── hooks/
    │   └── lib/               # renderer-only helpers (utils, formatters)
    └── shared/                # types + constants imported by BOTH sides
        ├── types.ts           # domain models, IPC request/response shapes
        └── ipc-channels.ts    # channel name constants — never inline a raw string
```

### Conventions

- **Files:** `kebab-case.ts` / `kebab-case.tsx`. Exception: React component files may be
  `PascalCase.tsx` if that matches what's already in the folder — match the neighbours.
- **Components:** `PascalCase`. **Functions/vars:** `camelCase`. **DB tables/columns:**
  `snake_case`.
- **Imports:** use the `@/` alias for `src/renderer`, `@shared/` for `src/shared`.
  No `../../../` chains deeper than one level.
- **Types:** anything crossing the IPC boundary is defined once in `src/shared/types.ts`
  and imported by both sides. Never redeclare a shape on the renderer side.
- **No SQL outside `src/main/db/repositories/`.** Pages and components call IPC, never a
  database.
- **No `require`/`fs`/`path`/`child_process` in `src/renderer/`.** If the UI needs
  something from the OS, add an IPC handler and expose it through the preload bridge.
- **Preload exposes named functions only.** Never expose `ipcRenderer` itself or a
  generic `invoke(channel, ...args)` passthrough — that reopens the whole main process
  to the renderer.
- **Dependency placement matters for packaging.** Anything bundled by Vite (React,
  Tailwind, icons, shadcn helpers, SheetJS if used in main) goes in `devDependencies`.
  Only genuinely external/native modules that must ship as real `node_modules` at
  runtime — `better-sqlite3` in Phase 2 — go in `dependencies`. Getting this backwards
  bloats the Phase 8 installer.

---

## 4. Commands

```
npm install          # install deps
npm run dev          # run the app with HMR (opens the Electron window)
npm run build        # typecheck, then build main + preload + renderer into out/
npm run preview      # run the built output without the dev server
npm run typecheck    # both projects  ← run before declaring any task done
npm run typecheck:node   # main + preload + shared
npm run typecheck:web    # renderer + shared
```

Not configured yet: **`npm run lint`** and **`npm test`**. Deferred to Phase 9 — don't
reference them as if they exist.

**Definition of done for any code change:** `npm run typecheck` passes and the app still
launches (actually run it — `npm run dev` — don't infer it from a green typecheck).

### Environment gotchas hit already

- **Electron's binary download can silently no-op** during `npm install`, and `npm run
  dev` then fails with `Error: Electron uninstall`. Fix:
  `node node_modules/electron/install.js`. Do not "fix" this by changing the config.
- **Vite is pinned to `^7`.** Vite 8 exists but `electron-vite@5` peer-requires ≤7, and
  `@vitejs/plugin-react@6` requires Vite 8 — so that plugin is pinned to `^5`. Don't
  bump any of these three without checking the other two.
- **TypeScript 7 removed `baseUrl`.** Path aliases in the tsconfigs must be relative
  (`"./src/shared/*"`). Aliases for the *bundler* are separate, in
  `electron.vite.config.ts` — a new alias must be added in both places.
- **`composite` + `--noEmit` conflict**, hence `--composite false` in the typecheck
  scripts. Leave it.

---

## 5. Do not touch — hard rules

These exist because breaking them is expensive to undo. Violating one is worse than
leaving a task unfinished.

1. **Never rewrite, drop, or restructure the database schema without asking.** Schema
   changes are **additive migrations only**: add a new numbered file in
   `src/main/db/migrations/`, never edit a migration that already exists, never
   `DROP TABLE`, never rename a column in place. If a change seems to require destroying
   data, stop and ask.
2. **Never delete or overwrite a user's `.db` file**, and never point the app at a
   different database path as a workaround.
3. **Never disable `contextIsolation`, enable `nodeIntegration`, or turn off
   `sandbox`/CSP** to make something work. Route it through preload IPC instead.
4. **Do not restructure folders, rename files wholesale, or "reorganize" working code**
   unless that is the explicit task.
5. **Do not upgrade major versions** of Electron, React, or the SQLite driver, and do not
   add dependencies outside §2, without asking first.
6. **Do not delete or rewrite tests** to make a suite pass. Fix the code or report the
   failure.
7. **Do not commit** unless asked. Committing is the owner's checkpoint (see §6).
8. **Do not touch `.env`, credentials, or anything in `data/` / `userdata/`.**
9. **Do not silently change scope.** If the requested task turns out to be wrong or
   impossible, say so and stop — do not substitute a different task.
10. **Excel is untrusted input.** Every importer validates and reports bad rows; it never
    partially writes a half-imported sheet. Wrap multi-row imports in a transaction.

---

## 6. Workflow (how sessions are run)

- **One phase per session.** Work the current phase only; do not start the next one.
- **Commit after every phase.** The owner commits — it's the revert point if a phase goes
  wrong. Reverting beats asking Claude to repair a broken state.
- **End of every session: update [PROGRESS.md](PROGRESS.md)** — what was built, what
  works, what's left, known issues. A fresh session reads CLAUDE.md + PROGRESS.md and
  must be able to continue without re-exploring the whole codebase.
- **When context is thin or a task is ambiguous, ask.** Most damage comes from a session
  guessing at intent it lost, not from carelessness.

---

## 7. Phase tracker

**Current phase: Phase 1 — skeleton app / dashboard shell ✅ complete**
**Next phase: Phase 2 — SQLite database layer**

| Phase | Goal | Commit tag | Status |
|---|---|---|---|
| 0 | Git repo, `.gitignore`, CLAUDE.md, PROGRESS.md | — | ✅ Done |
| 1 | Electron + React + TS + Tailwind + shadcn scaffold. Empty dashboard: 3 buttons (Upload / Review / Print) + 4 summary cards with placeholder zeros. No logic. | `phase-1-skeleton` | ✅ Done |
| 2 | SQLite layer. Tables: `batches`, `production_items`, `sku_mappings`, `imported_orders`, `import_files`, `column_mappings`, `settings`. DB at `%APPDATA%\StitchFlow\stitchflow.db`. Basic CRUD per table, nothing UI-facing. | `phase-2-database` | ⬜ Not started |
| 3 | File upload (drag-drop + picker). Parse `.xlsx`/`.xls`/`.csv` via SheetJS. Auto-detect SKU/colour/size/quantity columns from the spec's alias list. Show row count + platform per file. Manual-mapping fallback screen, mapping saved for reuse. Also generate the sample marketplace test files (spec §30). | `phase-3-upload-parsing` | ⬜ Not started |
| 4 | SKU Mapping screen (incoming SKU → factory SKU/colour/size/platform + bulk import). Grouping (sum qty by factory SKU+colour+size). Duplicate detection (order ID + SKU + variation + qty hash) with Ignore / Import Anyway prompt. | `phase-4-mapping-grouping` | ⬜ Not started |
| 5 | Review table (edit SKU/colour/size/qty, delete, add, merge, search/filter/sort). Issues screen (missing SKU/colour/size, invalid qty, unknown mapping, duplicate) with Fix flow. Unresolved items excluded from print until confirmed. | `phase-5-review-issues` | ⬜ Not started |
| 6 | A4 print preview matching the spec layout (standard table + optional grouped-by-SKU). Print CSS, page-count estimate, native Print, Save PDF. | `phase-6-print` | ⬜ Not started |
| 7 | Save runs as batches. History screen (view/reprint/duplicate/delete). Settings (factory name, paper size, layout, checkboxes, sorting, date format). Backup Now / Restore / daily auto-backup keeping last 14. Export/Import all data as ZIP. | `phase-7-history-settings-backup` | ⬜ Not started |
| 8 | electron-builder → `StitchFlow Setup.exe` (NSIS). Desktop + Start Menu shortcuts, DB preserved across updates, splash screen, optional launch-on-startup. | `phase-8-installer` | ⬜ Not started |
| 9 | Hardening: corrupted/empty files, blank rows, multi-sheet workbooks, performance on a few thousand rows with progress indicator, friendly errors everywhere. Finalise README. Run the spec's 31-step Final Test end to end with no raw error surfacing. | `phase-9-hardening` | ⬜ Not started |

Detail for the phase in flight lives in PROGRESS.md, not here. This table is the map;
PROGRESS.md is the position.

### Phase discipline

- **One phase per session, one commit per phase.** Do not start the next phase in the
  same session, even if there is time left.
- **Never silently rewrite an earlier phase.** If Phase N appears to require changing
  something Phase N-2 built (especially the DB schema), say so explicitly and get it
  reviewed as a deliberate change. Do not slide it in.
- **Before anything risky** (refactor, schema change, dependency upgrade): make sure the
  last phase is committed first, so `git checkout` is available as the undo.
- **For any change touching more than a couple of files, present the plan first** and
  wait for approval before executing.
- **Test against that phase's Definition of Done before committing** — actually run the
  app and click through it, don't just typecheck.
- **Sample data is fixed.** The TikTok/Shopee/Lazada sample files created in Phase 3 are
  the permanent regression fixtures. Reuse them in every later phase; do not regenerate
  or "improve" them, or you lose the ability to spot regressions.

---

## 8. Missing spec

Several phases reference an original spec document (branding spec, column-alias list,
A4 ASCII layout mockup, sample-file definitions in §30, the 31-step Final Test). **That
document is not in this repo.** When a phase needs detail from it, ask for the relevant
section rather than inventing it. Anything Claude guessed instead of read is flagged in
PROGRESS.md under "Assumptions".
