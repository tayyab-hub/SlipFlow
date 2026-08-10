# PROGRESS.md — StitchFlow (Factory Software)

Rolling session log. **A fresh Claude Code session reads
[CLAUDE.md](CLAUDE.md) + this file and should be able to continue without re-exploring
the codebase.** Update the "Current state" block and add a session entry at the end of
every session.

---

## Current state

**Phase:** 3 — file upload + automatic column detection
**Status:** ✅ Complete, verified against its Definition of Done
**Next phase:** 4 — SKU mapping, grouping, duplicate detection
**Last updated:** 2026-08-10

### What works right now (observed, not assumed)

**Upload + detection (Phase 3)**

- Dashboard "Upload Orders" tile opens a real Upload screen: drop zone plus a
  **Choose files** picker (`.xlsx`, `.xls`, `.csv`).
- The three sample marketplace files import with the right platform and row counts —
  confirmed on screen: `tiktok-orders.xlsx` TikTok/12, `shopee-orders.xlsx` Shopee/9,
  `lazada-orders.csv` Lazada/7, footer total "3 files · 28 order lines".
- `unknown-format.xlsx` fails detection and opens the **"We need help reading this
  file"** screen: the reason in plain language, six dropdowns pre-filled with whatever was
  detected, and a preview table of the first five rows so the operator can see which
  column is which. Nothing is written to the database until they confirm.
- Ticking "Remember this layout" saves a `column_mappings` row keyed on a hash of the
  header row. **Re-uploading the same format then imports silently** — verified by
  `npm run import:verify`, including that `times_used` increments.
- `npm run import:verify` passes all 13 checks: per-file platform/row/column assertions,
  the second-sheet case, the title-row case, the blank-row case, camelCase headers, "a
  file needing mapping writes nothing", the remembered-mapping case, duplicate-hash
  reporting, a missing file, and an unsupported extension.
- Verified the smoke run left the live database untouched afterwards (`import_files`,
  `imported_orders`, `column_mappings`, `batches` all back to 0).

**Database (Phase 2)**

- The app opens/creates its database on startup at
  `C:\Users\User\AppData\Roaming\StitchFlow\stitchflow.db` — i.e.
  `%APPDATA%\StitchFlow\stitchflow.db`, as the spec requires. Verified by launching the
  app and then inspecting the file with a separate reader: WAL mode on, foreign keys on,
  8 tables (the 7 domain tables + `schema_migrations`), 12 indexes, all 8 STRICT, and
  migration `0001_init` recorded.
- `npm run db:verify` passes all 11 checks: a write-and-read-back per table, plus
  transaction rollback, foreign-key cascade, STRICT type rejection, and migration
  idempotency on reopen. It runs against a throwaway database in the temp directory, so
  it never touches real data, and it prints where the live database would be.
- Driver is **`node:sqlite`**, not `better-sqlite3` — see CLAUDE.md §9 for why.

**Dashboard shell (Phase 1)**

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

No SKU mapping screen, no grouping, no duplicate prompt, no review table, no print view,
no batch creation, no settings UI, no installer, no lint, no unit tests.

Specific things that will surprise you if you don't know:

- **The four dashboard counters are still hard-coded zeros.** After importing files the
  dashboard still reads 0 — deliberately. Phase 3's job was to report what it read on the
  Upload screen; wiring the counters needs the grouping from Phase 4. Don't read the zeros
  as a bug.
- **Imported rows are raw, not grouped.** `imported_orders` holds order lines exactly as
  the marketplace wrote them. Nothing maps them to factory SKUs or sums quantities yet, so
  `production_items` is still empty and no `batches` row is ever created.
- **Duplicates are detected but not acted on.** Every row gets its `duplicate_hash`, and
  `UploadResult.duplicateRows` reports how many already exist, but nothing prompts
  Ignore / Import Anyway — that's Phase 4.
- **`rawColour` / `rawSize` are usually empty.** All three sample platforms put colour and
  size in one `Variation` column (`Black,M`, `Black / M`, `Black:M` — three different
  separators). Splitting that is Phase 4's problem.
- **Drag-and-drop was not tested with a real mouse drag.** The code path is there
  (`webUtils.getPathForFile` via the preload bridge) but automation can't produce an OS
  drag gesture. The picker path is fully verified. **Worth a manual drag before Phase 4.**

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

### ⚠️ The column-alias list is invented — REVIEW IT FIRST

`src/main/excel/column-aliases.ts` is the single most important thing to check in Phase 3.

The brief said "auto-detect … using the alias list from the spec". That spec is not in the
repo, so **the alias list was written from what TikTok/Shopee/Lazada exports typically look
like — it is a stand-in, not the real list.** Same for `PLATFORM_SIGNALS`, which decides
which marketplace a file came from.

Nothing else in the codebase knows any header names, so correcting it is a single-file
edit: paste the real aliases in, run `npm run import:verify`, done. Detection improves
everywhere at once.

Other Phase 3 choices that were judgement calls, not requirements:

1. **Detection succeeds only if SKU + Quantity are found, AND either a Variation column or
   both Colour and Size.** Anything less opens the mapping screen. That threshold is a
   guess about what makes a file usable.
2. **`header_signature` is a sha256 of the normalised, de-duplicated, *sorted* header
   names.** Sorting means a reordered export still matches its saved mapping. Hashing keeps
   the column a fixed 64 chars. Changing any of this orphans every saved mapping — treated
   as a hard rule (CLAUDE.md §5.12).
3. **camelCase headers are split before matching**, so Lazada's `sellerSku` matches the
   alias `seller_sku`. Without this the Lazada sample needs manual mapping.
4. **`Seller SKU` beats `SKU ID`** in the alias order, on the assumption the seller's own
   code is the one the factory recognises and the platform's numeric id is not.
5. **The sheet with the most rows wins** in a multi-sheet workbook, and the header row is
   the row with the most filled cells in the first 10. Both are heuristics that handle the
   sample files' cover sheet and title row.
6. **Unreadable quantities become 0 and are counted**, not rejected — the row is kept so
   Phase 5 can flag it rather than the operator silently losing an order line.
7. **A file needing mapping writes nothing at all.** No `import_files` row, no partial
   state. Asserted by a test, because the alternative (a half-imported file) is the kind of
   thing that is very hard to notice later.

### Schema decisions Claude invented — REVIEW THESE

The phase brief named the seven tables but not their columns, and the spec document is
not in the repo. Everything below was chosen, not read. **`0001_init.sql` is now
committed, so from here on the schema is additive-only** (CLAUDE.md §5.1) — if any of
this is wrong, say so and it gets amended in place while the database still holds no real
data. That option disappears once real batches exist.

1. **`imported_orders` keeps the raw rows** exactly as read from the file (`raw_sku`,
   `raw_variation`, `raw_colour`, `raw_size`), separate from the grouped
   `production_items`. That is what makes "where did this line come from?" answerable and
   gives duplicate detection something stable to compare.
2. **`sku_mappings` matching is case-insensitive** (`COLLATE NOCASE` on `incoming_sku`,
   `incoming_variation`, `platform`), because marketplace exports are inconsistent about
   case and `ABC-01` / `abc-01` are one product. Changing a collation later means a new
   index, so this was decided now on purpose.
3. **`platform = ''` means "applies to every platform"**, and a platform-specific mapping
   row wins over the catch-all. Same for `incoming_variation = ''` meaning "match by SKU
   alone". Verified by a test in `db:verify`.
4. **Optional text columns are `NOT NULL DEFAULT ''`, not nullable**, wherever they take
   part in a unique index — SQLite treats NULLs as distinct, so a nullable column would
   silently let duplicates through the constraint.
5. **`batches` stores `total_items` / `total_units` / `unresolved_count`** rather than
   deriving them, so the Phase 7 history list needs no aggregates. `productionItems
   .totalsForBatch()` computes the true values; whoever writes a batch must keep the
   stored copies in step.
6. **`production_items` is deliberately NOT unique** on (batch, sku, colour, size),
   because Phase 5 lets the operator add and merge rows by hand. Grouping is enforced in
   code at insert time, not by the database.
7. **Issue states live on the row** (`issue_type`, `issue_note`, `is_resolved`) rather
   than in a separate issues table. `listPrintable()` is the single place that decides
   what may be printed: resolved **and** issue-free.
8. **All tables are `STRICT`** — SQLite rejects a wrong-typed value instead of storing it.
   Worth having when the input is spreadsheets. Verified by a test.
9. **Timestamps are ISO-8601 UTC strings**; `batch_number` is a free-text human reference
   (nothing generates one yet — that's Phase 7).
10. **`schema_migrations` is an eighth table**, infrastructure rather than domain, needed
    to make the append-only rule enforceable.

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
  SQLite file.
- **Database driver is `node:sqlite`, not `better-sqlite3`.** Rationale and consequences
  in CLAUDE.md §9. Do not swap it without reading that section — the machine has no C++
  toolchain, so `better-sqlite3` cannot even build here.
- **`src/main/app-identity.ts` calls `app.setPath('userData', …)` explicitly, at module
  scope.** This is the only thing deciding where operator data lives. Moving it inside
  `whenReady()`, or trusting `productName`/`app.setName()` instead, sends the database to
  `%APPDATA%\Electron` — that actually happened during this phase.
- **WAL journal mode**, with a `wal_checkpoint(TRUNCATE)` on clean shutdown so the `.db`
  file is self-contained. Phase 7 backups must use `sqlite.backup()`, not a file copy.
- **Repositories are factories** (`createBatchesRepository(db)`) assembled in
  `src/main/db/index.ts`, and take the handle explicitly — that is what lets `db:verify`
  run the identical code against a throwaway database.
- **`rows.ts` readers throw on a type mismatch instead of coercing.** Deliberate: a
  schema/mapper drift should be loud, not a `NaN` on a production sheet.
- **Preload exposes named functions only** (`window.stitchflow.getAppInfo()`). No
  `ipcRenderer` passthrough, no generic `invoke(channel, ...)`.
- **Tailwind v4, CSS-first — there is no `tailwind.config.ts`.** Do not create one.
- **Version pins:** `vite@^7` + `@vitejs/plugin-react@^5`. Vite 8 exists but
  `electron-vite@5` peer-requires ≤ 7, and plugin-react 6 requires Vite 8. These three
  move together or not at all.
- **Bundled libs live in `devDependencies`**; `dependencies` is reserved for native
  runtime modules, of which there are now none. See CLAUDE.md §3.
- **No router.** Navigation is `useState<Screen>` in `App.tsx`. Adding react-router would
  be a new dependency needing sign-off (CLAUDE.md §2/§5.5/§5.11), and two screens don't
  justify it. Revisit when back/forward history starts to matter.
- **SheetJS comes from SheetJS's CDN tarball, not npm.** The registry package is abandoned
  at 0.18.5 with open advisories. See CLAUDE.md §4.
- **Parsing lives entirely in main.** The renderer never reads a file; drag-and-drop
  resolves a *path* via `webUtils.getPathForFile` in the preload and sends that. No file
  bytes cross the bridge.
- **`header_signature` normalisation is frozen** — see the alias-list section above and
  CLAUDE.md §5.12.
- **`samples/` is fixed.** Regenerating those four files destroys their value as regression
  fixtures (CLAUDE.md §5.13, samples/README.md).
- Git tags **`phase-1-skeleton`**, **`phase-2-database`** and **`phase-3-upload-parsing`**
  mark those commits. `git checkout <tag>` returns to a known-good state.

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
6. **No lint or test setup** (deferred to Phase 9). `npm run db:verify` is the only
   automated check that exists; don't reference `npm run lint` or `npm test`.
7. **`node:sqlite` is marked experimental upstream.** It works today on Electron 43; an
   Electron upgrade could in principle remove or change it. `npm run db:verify` is the
   canary — run it first after any Electron bump.
8. **`%APPDATA%\Electron` may exist on this machine** from Phase 1 dev runs, before the
   userData path was pinned. It holds only Chromium dev cache, no StitchFlow data
   (checked). Harmless; it is also the shared dev folder for other Electron projects, so
   don't delete it blindly.
9. **The stored batch counters can drift.** `batches.total_items` / `total_units` /
   `unresolved_count` are written by callers, not maintained by a trigger. Whoever builds
   the batch-save flow (Phase 5/7) must call `productionItems.totalsForBatch()` and write
   the result, or the history list will show stale numbers.
10. **`npm install` needs `cdn.sheetjs.com` reachable**, because SheetJS is a URL
    dependency rather than a registry one. On a machine without access to that host the
    install fails; there is no registry fallback that isn't the abandoned 0.18.5.
11. **Drag-and-drop is unverified by automation** — see "What does NOT exist yet". The
    picker path is covered; the OS drag gesture is not.
12. **Uploaded files accumulate with no batch.** Every import creates an `import_files` row
    with `batch_id = NULL`, and the Upload screen lists them on return. Nothing clears them
    except the per-row delete button, until Phase 4/7 assigns files to batches.
13. **A stale saved mapping is handled but only shallowly.** If a marketplace renames a
    column, the saved mapping no longer resolves and the file is sent back to the mapping
    screen with an explanation. It does not offer to update the existing mapping — the
    operator would re-save and overwrite it.

### Useful technique for verifying UI phases

To check the UI actually renders without a human looking at it: temporarily add an
env-gated hook in `createMainWindow` that, on `did-finish-load`, calls
`window.webContents.capturePage()`, writes the PNG, optionally drives a click via
`executeJavaScript`, then `app.exit(0)`. Remove it before committing — it was used and
removed in Phase 1, so `out/main/index.js` should stay small (~3.7 kB now).

For database and parsing phases the equivalent is `npm run db:verify` /
`npm run import:verify`, which are permanent — extend those rather than writing a throwaway
script.

**Driving the UI without a mouse.** Phase 3 needed screenshots of a flow that starts with a
native file dialog. What worked: temporarily make the `upload:pick-files` handler return
canned paths from an env var, then `executeJavaScript` a click on the real "Choose files"
button. The whole UI path runs for real; only the OS dialog is stubbed. Both the seam and
the hook were removed before committing, and the run cleaned up the rows it created via
`importFiles.remove()` so the live database was left as found — verified afterwards.

### Next actions — Phase 4 (SKU mapping, grouping, duplicates)

1. **Splitting the variation string is the first real problem.** The three sample platforms
   use three separators for the same thing: `Black,M` (TikTok), `Black / M` (Shopee),
   `Black:M` (Lazada), and the manually mapped file uses a space (`Hitam M`). Decide whether
   colour/size come from splitting `raw_variation` or from the SKU mapping table itself —
   the second is more reliable and the schema already supports it
   (`sku_mappings.factory_colour` / `factory_size`).
2. **The mapping table is keyed on (incoming_sku, incoming_variation, platform)** with
   `''` as the wildcard and case-insensitive matching. `skuMappings.findBestMatch()` already
   implements the precedence and is tested — use it rather than writing new lookup SQL.
3. **Grouping is code, not a constraint.** `production_items` has no unique index on
   (batch, sku, colour, size) on purpose (Phase 5 allows hand edits), so the grouping step
   must sum quantities before inserting.
4. **Batch totals are stored, not derived.** Whatever creates a batch must call
   `productionItems.totalsForBatch()` and write `total_items` / `total_units` /
   `unresolved_count` back onto the `batches` row, or the Phase 7 history list shows stale
   numbers.
5. **Duplicate detection is half-built.** Hashes are already written to every row and
   `importedOrders.findExistingHashes()` works; `UploadResult.duplicateRows` reports the
   count. What's missing is the Ignore / Import Anyway prompt and setting `is_duplicate`.
   Default to ignoring, per the phase brief.
6. **The sample files already contain the test case.** `TEE-BLK-M`, `TEE-WHT-M`,
   `HOOD-NVY-L`, `POLO-RED-S`, `TEE-BLK-L` appear on all three platforms; `TT-ONLY-CAP`,
   `SP-ONLY-SOCK` and `LZ-ONLY-BELT` appear on one each and should end up flagged as
   unmapped. Expected totals: 28 lines, 61 units.
7. **Wire the dashboard counters** while grouping exists — they are still hard-coded zeros
   and now look wrong after an import.
8. `npm run db:verify` **and** `npm run import:verify` must still pass at the end.

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
**Commit:** `d19b379`, tag `phase-1-skeleton`

## Session 3 — 2026-08-10 — Phase 2

**Built:**
- `src/main/db/migrations/0001_init.sql` — the seven tables plus 12 indexes, all STRICT,
  heavily commented. Inlined into the bundle via Vite `?raw`, so there is no file to find
  at runtime. Migration registry and transactional runner in `migrations/index.ts` with a
  `schema_migrations` table.
- `src/main/db/index.ts` — `openDatabase()` (WAL, foreign keys, 5 s busy timeout),
  `transaction()` that joins rather than nests, `close()` that checkpoints the WAL, and
  the app-wide `initialiseDatabase` / `getDatabase` / `closeDatabase` handle.
- Seven repositories in `src/main/db/repositories/`, plus support modules `rows.ts`
  (typed column readers, `nowIso`), `update-builder.ts` (partial UPDATE + `IN (…)`
  placeholders), `paths.ts` (database and backup locations).
- `src/main/app-identity.ts` — pins app name **and** `userData`, called at module scope.
- `src/shared/types.ts` — record, `New*` and `*Update` types for all seven tables, plus
  the `BatchStatus` / `DetectionStatus` / `ProductionIssueType` unions matching the CHECK
  constraints.
- `src/main/db-verify.ts` + `npm run db:verify` — 11 checks, run as a second
  electron-vite main entry so it exercises the real bundled code.
- `src/main/index.ts` opens the database before the window exists and closes it on
  `will-quit`; a failure to open shows an error box and exits rather than rendering a
  dashboard over a dead database.

**Verified:** `npm run typecheck` clean. `npm run db:verify` — 11/11 pass (write/read per
table, transaction rollback, FK cascade, STRICT rejection, migration idempotency).
Launched the app, which created
`C:\Users\User\AppData\Roaming\StitchFlow\stitchflow.db`; inspected that file with an
independent reader — WAL on, foreign keys on, 8 tables, 12 indexes, 8 STRICT, migration
`0001_init` recorded.

**Not done / left:** No UI wiring, no new IPC channels — Phase 2 was explicitly
"nothing UI-facing". Nothing generates a `batch_number` yet. The stored batch counters are
not maintained automatically (see Known issues #9).

**Known issues:** The path bug below, now fixed. Plus `node:sqlite`'s experimental status
and the stored-counter drift risk — both in "Known issues" above.

**Decisions:**
- **`node:sqlite` instead of `better-sqlite3`** — checked the machine first: no MSVC C++
  toolchain exists, so `better-sqlite3` could not be rebuilt for Electron's ABI here.
  `node:sqlite` needs no compiler, no rebuild, and no asar unpacking in Phase 8. Full
  rationale and consequences in CLAUDE.md §9.
- **Migrations are the authoritative schema; `schema.sql` was dropped** from the planned
  layout. Two copies of the DDL would drift. CLAUDE.md §3 and §5.1 updated to match.
- Schema shape choices (case-insensitive SKU matching, `''` as the wildcard, no unique
  constraint on production items, stored batch totals) are listed under "Schema decisions
  Claude invented" above and are the main thing worth reviewing.

**Bug found and fixed during the phase:** `app.getPath('userData')` resolved to
`%APPDATA%\Electron`, not `%APPDATA%\StitchFlow` — Electron fixes that path during
startup, so neither `productName` in package.json nor `app.setName()` moves it. Fixed by
calling `app.setPath('userData', …)` explicitly at module scope in `app-identity.ts`. This
is exactly the item flagged as "verify, don't assume" at the end of Phase 1; had it not
been checked, the database would have shipped to the wrong directory.

**Next:** Phase 3 — upload + column detection. **Ask for the spec's column-alias list and
§30 sample-file definitions before starting**; the alias list is the core of the feature
and guessing it wastes the phase.
**Commit:** `94803f0`, tag `phase-2-database`

## Session 4 — 2026-08-10 — Phase 3

**Built:**
- `src/main/excel/`: `read-workbook.ts` (SheetJS; sheet choice, header-row search, blank-row
  handling, friendly errors), `column-aliases.ts` (**invented alias list** + platform
  signals), `header-signature.ts` (normalisation + the reuse fingerprint),
  `detect-columns.ts` (two-pass exact-then-fuzzy matching, one column per field),
  `detect-platform.ts` (scored, with a filename fallback), `import-file.ts` (orchestrates
  read → detect → persist in a single transaction).
- IPC split into `src/main/ipc/app.ts` and `src/main/ipc/upload.ts`; five new channels for
  pick / import / apply-mapping / list / remove, with argument validation on every one.
- Preload gained named functions for those, plus `pathForDroppedFile` wrapping
  `webUtils.getPathForFile` (Electron removed `File.path`).
- Renderer: `App.tsx` became the shell with a screen switch; `pages/upload/upload-page.tsx`,
  `pages/upload/manual-mapping.tsx`, `components/upload/{drop-zone,platform-badge}.tsx`,
  `components/ui/badge.tsx`. `AppHeader` gained a back button and breadcrumb.
- `src/shared/types.ts`: `FieldMapping`, `FilePreview`, `UploadResult`,
  `ApplyMappingRequest`, and the field labels/hints shared with the mapping screen.
- `samples/` — four fixed fixtures plus `generate-samples.mjs` and a README explaining why
  they must never be regenerated.
- `src/main/import-verify.ts` + `npm run import:verify` (third electron-vite main entry).

**Verified:** `npm run typecheck` clean. `npm run import:verify` 13/13 pass.
`npm run db:verify` still 11/11 (no Phase 2 regression). Launched the app and drove the real
UI: dashboard tile → Upload screen → picker → three files listed as TikTok/12, Shopee/9,
Lazada/7 with "3 files · 28 order lines"; then the awkward file opening the "We need help
reading this file" screen with dropdowns and a data preview. Confirmed the live database was
left empty afterwards.

**Not done / left:** Drag-and-drop is implemented but only the picker path was verified —
an OS drag gesture can't be automated, so **worth one manual drag**. Dashboard counters
still hard-coded zeros (Phase 4). Colour/size still unsplit from the variation string
(Phase 4). Duplicates reported but not prompted (Phase 4).

**Known issues:** Items 10–13 in "Known issues" above are new: the CDN dependency on
`cdn.sheetjs.com`, unverified drag-and-drop, uploaded files accumulating with no batch, and
only shallow handling of a saved mapping going stale.

**Decisions:** No routing library — screen state in `App.tsx`. SheetJS from the vendor CDN
rather than the abandoned registry package. Parsing entirely in main; only paths cross the
bridge, never file bytes. `header_signature` normalisation is now frozen (CLAUDE.md §5.12).
A file that needs mapping writes nothing at all.

**Next:** Phase 4 — SKU mapping, grouping, duplicate detection. **Review
`src/main/excel/column-aliases.ts` first** — it is invented, and everything downstream
inherits its mistakes. Then decide whether colour/size come from splitting the variation
string or from the mapping table (the schema supports the latter, and three platforms use
three different separators).
**Commit:** tag `phase-3-upload-parsing`
