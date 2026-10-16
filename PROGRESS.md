# PROGRESS.md — StitchFlow (Factory Software)

Rolling session log. **A fresh Claude Code session reads
[CLAUDE.md](CLAUDE.md) + this file and should be able to continue without re-exploring
the codebase.** Update the "Current state" block and add a session entry at the end of
every session.

---

## Current state

**Release:** SlipFlow 1.0.0
**Status:** Core implementation and local quality gates complete; GitHub publication and CI verification in progress.
**Last updated:** 2026-10-16

The release preserves the initial work in checkpoint `410c4ae`, retains migration 0001 and all fixed sample files, and preserves the legacy StitchFlow data path. It adds seller identity, conservative duplicate handling, strict quantities, source provenance, individual source-line selection, review/reconciliation, complete A4 output, history, settings and verified backup/restore. Legacy unfinished rows require review.

Local results: lint/type/build PASS; original suites 45 PASS; release suite 51 PASS; Playwright 2 PASS. Synthetic sample reconciliation remains 28 original lines plus 12 excluded duplicate rows, 61 units. A 120-line PDF has 7 verified A4 pages. Latest recorded 10,000-row import: 2,201 ms on this Windows host.

The NSIS installer was installed, started, updated and uninstalled in isolated test directories. A persistence marker survived update and data remained after uninstall. Desktop/Start shortcuts were present. Packaged security posture is sandbox/context isolation enabled and Node integration disabled. Installer is unsigned.

Documentation, eight actual application screenshots, a 12-slide editable PowerPoint, PDF and presentation/portfolio scripts are under `docs/`. See the release documentation for current behavior. The earlier phase notes below are historical and may describe superseded behavior, especially partial printing and automatic printed status.

### Historical phase 6 notes

### What works right now (observed, not assumed)

**A4 print preview + printing (Phase 6)**

- A **Print Sheet** screen exists: opened from the Dashboard tile (most recently created
  batch), from the Review screen's new **Print this batch** button, or automatically
  reflects whichever batch was just reviewed. Reads `productionItems.listPrintable()` —
  resolved, issue-free rows only — so unresolved items are excluded from the sheet by
  construction, not by a UI filter. When a batch still has unresolved items, a banner
  says how many and links back to Review.
- **The A4 layout was designed from scratch** — the spec's ASCII mockup is not in this
  repo (CLAUDE.md §8) and the user explicitly chose "design it from scratch" over
  supplying one this session. Header block: title, factory-name placeholder (same
  "Factory name not set" string `AppHeader` already shows), batch number/name, created
  and printed dates, line/unit totals. **Standard** layout is a flat # / SKU / Colour /
  Size / Qty table; **Grouped by SKU** clusters rows under a bold SKU heading with a
  unit subtotal. Toggled with a plain `<select>`.
- **Print CSS is new** (`globals.css` had no `@media print` block before this phase):
  `@page { size: A4; margin: 14mm }`, plus the standard "hide everything except this
  element" trick (`.print-sheet` / `.no-print`) — confirmed by generating a real PDF
  and reading it back: the output shows only the production sheet, zero app chrome
  (no header, no toolbar, no status bar), fits on one page.
- **Print** calls `window.print()` (a plain DOM API — no IPC needed) then marks the
  batch printed. **Save PDF** (`src/main/ipc/print.ts`, new) shows a save dialog, calls
  `contents.printToPDF({ preferCSSPageSize: true })` — which is what makes the PDF
  respect the same `@page`/`@media print` rules as the on-screen/native-print path
  instead of defaulting to Letter size — writes the file, then marks the batch printed.
  `batches.markPrinted()` already existed and was already tested (`db:verify`); Phase 6
  just exposes it over IPC (`batchesMarkPrinted`) and calls it from both paths.
- An on-screen "~N pages (estimate)" indicator uses a simple rows-per-page heuristic —
  explicitly labelled as an estimate, not a real pagination engine.
- Confirmed by generating and reading back a real PDF (grouping the sample files with
  the five shared SKUs mapped): header block showed "Batch B2026...", "5 lines · 50
  units"; grouped layout showed HOOD-NVY-L/POLO-RED-S/TEE-BLK-L/TEE-BLK-M/TEE-WHT-M with
  correct per-SKU subtotals (11/8/6/16/9, matching `grouping:verify`'s known math); the
  unresolved-items banner correctly reported the 3 platform-only SKUs left unmapped.
- `npm run db:verify` (11/11), `npm run import:verify` (13/13), `npm run
  grouping:verify` (11/11) and `npm run review:verify` (10/10) all still pass — Phase 6
  added no schema change and changed no existing repository behaviour.

**Production review + issue handling (Phase 5)**

- A **Review Production** screen exists: opened from the Dashboard tile (most recently
  created batch) or directly from the Upload screen's grouping banner via a new
  **Review this batch** button (the specific batch just created). Confirmed on screen:
  navigating from each entry point loads the right batch's real data.
- The table shows every `production_item` in the batch with search (by factory SKU),
  a status filter (defaults to **Needs Review** when the batch has unresolved rows),
  and a sort control. Confirmed on screen grouping the three unmapped sample files: "18
  lines · 61 units · 18 need review", filtered view showing all 18 `unknown_mapping`
  rows with their issue notes ("No SKU mapping for …").
- **Edit** (pencil icon) swaps a row into inline `<input>` fields. Saving always sends
  the edited values plus `isResolved: true, issueType: '', issueNote: ''` — editing a
  row **is** how you fix it, whether it had an issue or not. Confirmed on screen: fixing
  one of the 18 unmapped rows dropped "18 need review" to "17 need review" and the row
  moved out of the Needs Review filter — the exact Phase 5 Definition of Done.
- **Delete**, **Add row** (manual entry, always created resolved), and **Merge selected**
  (checkbox-select ≥2 rows, sums quantity, unions source platforms, carries the first
  issue forward if not every merged row was clean) all work and keep the batch's stored
  totals in step via a new `recomputeBatchTotals()` helper called after every mutation.
- `npm run review:verify` passes all 10 checks: builds a batch with 2–3 intentionally
  broken rows directly through the repositories (`missing_sku`, `invalid_quantity`,
  `unknown_mapping`), confirms they — and only they — appear in `listUnresolved()`,
  fixes one and confirms it moves to `listPrintable()` while stored totals stay in sync,
  then exercises merge/create/remove the same way.
- `npm run db:verify` (11/11), `npm run import:verify` (13/13) and
  `npm run grouping:verify` (11/11) still pass — Phase 5 added no schema change and no
  repository method whose existing behaviour changed.

**SKU mapping, grouping, duplicates (Phase 4)**

- A **SKU Mappings** screen (linked from the Upload screen header) lets the operator add
  a mapping by hand (incoming SKU → factory SKU/colour/size, with variation and platform
  optional wildcards) or **bulk import** one from a spreadsheet via a file picker.
  Confirmed on screen: adding one writes to `sku_mappings` and appears in the table
  immediately; the bulk-import fixture (`samples/sku-mappings-bulk.csv`) reports 2
  imported + 1 skipped row.
- **Colour/size come from the mapping, never from parsing `raw_variation`.** One mapping
  row per factory item (wildcard variation/platform) matches the same SKU regardless of
  which of the three separators (`Black,M` / `Black / M` / `Black:M`) the source platform
  used — this is how the three-separator problem flagged after Phase 3 got solved.
- **"Group into production batch"** on the Upload screen (visible once files are
  pending) sums quantities into `production_items` by factory SKU + colour + size across
  every uploaded file, creates a `batches` row, assigns the source files/orders to it,
  and writes the stored totals. Confirmed on screen: uploading the three sample files
  with no mappings produced "18 production lines · 61 units · 18 need review (18
  unmapped SKUs)"; `npm run grouping:verify` confirms that with the five shared SKUs
  mapped, `TEE-BLK-M` alone sums to 16 units across TikTok+Shopee+Lazada.
- **Duplicate rows default to ignored.** A row whose `duplicate_hash` already exists in
  the database is stored with `is_duplicate = 1` at import time (not just reported), and
  grouping excludes flagged rows from every sum. The Upload screen shows a per-file
  banner ("N of M rows match orders already imported — ignored by default") with an
  **Import anyway** button that clears the flag for that file. Confirmed by
  `grouping:verify`: re-uploading `tiktok-orders.xlsx` flags all 12 rows, and they are
  excluded from the batch's totals unless "Import anyway" is used.
- **Unmapped SKUs are flagged, not dropped.** A row whose SKU has no mapping becomes its
  own `production_items` row with `issue_type = 'unknown_mapping'` and
  `is_resolved = 0`, so nothing is silently lost — Phase 5 owns actually fixing these.
- **Dashboard counters are now real**, not the Phase 1 placeholder zeros: Orders
  Imported, Items to Produce and Needs Review are computed live; Batches Today reuses
  the existing `countCreatedOn`. Confirmed on screen going Dashboard → Upload → group →
  back to Dashboard: 0/0/0/0 became 28/61/18/1.
- `npm run grouping:verify` passes all 11 checks: import + map + group, the exact
  `TEE-BLK-M` = 16 units assertion, the other four shared SKUs, the three platform-only
  SKUs landing as `unknown_mapping`, stored batch totals matching computed totals, and
  the bulk SKU-mapping import's partial-failure reporting.
- `npm run db:verify` (11/11) and `npm run import:verify` (13/13) still pass — this
  phase added repository methods and one behavioural change to `import-file.ts` (rows
  are now flagged `is_duplicate` at insert instead of merely counted) but changed no
  existing assertion's expected outcome.

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

No history/batches screen, no settings UI, no installer, no lint, no unit tests.

Specific things that will surprise you if you don't know:

- **One button groups *everything* pending into *one* batch.** There is no batch picker —
  "Group into production batch" always takes every currently-unassigned import file.
  Curating what goes into which batch is Phase 7 territory (`createBatchFromPendingFiles`
  already accepts an optional `importFileIds` param for this — nothing calls it yet).
- **The Review screen only ever shows one batch** — the one just created, or (via the
  Dashboard tile) the most recently created one. There is no way yet to pick an older
  batch; that needs Phase 7's history screen.
- **`missing_colour` / `missing_size` / `duplicate` are declared issue types that
  nothing currently sets.** Colour/size come from the SKU mapping now (Phase 4), so a
  blank one is treated as deliberate (e.g. a one-size item), not an error; and duplicate
  order lines are excluded from grouping entirely rather than ever becoming a flagged
  `production_item`. The Review screen's issue-label map (`ISSUE_LABELS` in
  `review-page.tsx`) covers all six for when/if that changes, but only three are
  currently reachable: `missing_sku`, `invalid_quantity`, `unknown_mapping`.
- **Merge's "clean only if every merged row was clean" rule** means merging a clean row
  into an issue row keeps the issue (carries the first non-empty `issue_type`/`issue_note`
  forward) — it does not average out or clear it. Deliberate: merging should never make a
  real problem disappear silently.
- **Batch numbers are a timestamp placeholder** (`B20260825-143022`), not the real
  human-friendly numbering scheme — that's explicitly deferred to Phase 7 (see
  PROGRESS.md's Phase 2 schema notes, which flagged this from the start).
- **`rawColour` / `rawSize` are still usually empty and unused for production.** All three
  sample platforms put colour and size in one `Variation` column with three different
  separators (`Black,M`, `Black / M`, `Black:M`). Phase 4 deliberately never parses that
  column — colour/size come from the `sku_mappings` row instead, which is what makes the
  separator differences a non-issue. `raw_variation` stays as audit-trail-only text.
- **Drag-and-drop was not tested with a real mouse drag.** The code path is there
  (`webUtils.getPathForFile` via the preload bridge) but automation can't produce an OS
  drag gesture. The picker path is fully verified, including through Phase 4's grouping.
  **Still worth a manual drag before Phase 5.**
- **Dashboard's "Items to Produce" / "Needs Review" are global counters**, not scoped to
  the most recent batch — there is no concept of "current batch" in the UI yet.
- **The A4 layout is invented, not from the spec** — see the new "Assumptions" entry
  below. Check it against the real spec before treating it as final.
- **The page-count estimate is a rows-per-page heuristic**, not real pagination. It
  will drift from the browser's actual print engine, especially for very long or very
  short SKU names. Labelled "(estimate)" in the UI on purpose.
- **`batch.status` never reaches `'ready'`** — that value exists in the schema
  (`BatchStatus`) but nothing sets it. Only `'draft'` → `'printed'` (via
  `markPrinted()`) is exercised today.

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
7. **The A4 print layout (Phase 6) is entirely invented.** The user was asked directly
   whether they had the spec's ASCII mockup and explicitly chose "design it from
   scratch" over supplying one. Header block fields (factory name placeholder, batch
   number/name, created/printed dates, line/unit totals), the standard table's column
   order (# / SKU / Colour / Size / Qty), and the grouped-by-SKU heading+subtotal
   format are all judgement calls in `src/renderer/pages/print/print-page.tsx` — cheap
   to change now, before any operator has seen a printed sheet.

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
  fixtures (CLAUDE.md §5.13, samples/README.md). `sku-mappings-bulk.csv`, added in Phase 4,
  is now equally fixed — it's a new file, not a regeneration of the original four.
- **SKU mapping matching is by incoming SKU alone, wildcard variation/platform, by
  convention — not enforced by the schema.** Nothing stops an operator (or a later phase)
  from creating a platform- or variation-specific override; `findBestMatch`'s precedence
  (specific beats wildcard) already handles that correctly. But the *grouping* code never
  parses `raw_variation` itself, so a mapping is the only way colour/size reach a
  production item.
- **Duplicate rows are flagged `is_duplicate = 1` at import time**, not left for grouping
  to re-detect. Grouping just excludes flagged rows. "Import Anyway" clears the flag via
  `importedOrders.clearDuplicateForFile` — it does not re-run hash detection.
- **`production/group-into-batch.ts` always groups every currently-unassigned import
  file into one new batch.** There is no partial-selection API yet; add one deliberately
  in Phase 5/7 rather than assuming `createBatchFromPendingFiles`'s optional
  `importFileIds` param (present but unused by the IPC layer) is exercised anywhere.
- **Editing a `production_item` always resolves it** — the Review screen's Save action
  sends `isResolved: true, issueType: '', issueNote: ''` alongside whatever fields
  changed, unconditionally. There is no "edit without resolving" path; if Phase 6/7 ever
  needs one, that's a new, deliberate UI affordance, not a tweak to the existing Save.
- **Every mutation to a batch's `production_items` must call
  `recomputeBatchTotals()`** (`src/main/production/review-items.ts`) afterward — update,
  create, remove, merge. This is the same "stored totals must be kept in step" rule from
  Phase 4, now enforced at every one of Phase 5's five new IPC handlers, not just batch
  creation.
- **The print sheet is isolated at print time via the classic "hide everything except
  this element" CSS trick** (`body * { visibility: hidden }` /
  `.print-sheet, .print-sheet * { visibility: visible }`), not by conditionally
  rendering `AppHeader`/`StatusBar`. Neither component knows printing exists. Any new
  page-level chrome added later doesn't need to think about print — it's hidden for
  free by the existing `body *` rule.
- **`printToPDF` is always called with `preferCSSPageSize: true`**, deliberately, so
  the PDF and the native `window.print()` output are pixel-identical — both read the
  same `@page`/`@media print` rules in `globals.css`. Don't pass an explicit
  `pageSize`/`margins` option instead; that would let the two paths drift apart.
- **Printing marks a batch `printed` optimistically on click**, not on confirmed
  completion. `window.print()` has no callback for "the operator actually printed
  vs. cancelled the OS dialog" — clicking Print is treated as the trackable action.
  Save PDF marks it only after a confirmed successful write.
- Git tags **`phase-1-skeleton`**, **`phase-2-database`**, **`phase-3-upload-parsing`**,
  **`phase-4-mapping-grouping`**, **`phase-5-review-issues`** and **`phase-6-print`**
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
14. **`webContents.printToPDF()` can fail with "Failed to generate PDF: Printing
    failed" if something else is concurrently calling `executeJavaScript` on the same
    `webContents` while it runs** — hit repeatedly while automating Phase 6's manual
    verification (a polling `__click` helper kept calling `executeJavaScript` every
    200ms and collided with the in-flight print job). Isolated with a series of
    standalone repros: identical `printToPDF` calls succeeded consistently outside that
    polling loop, including on the real batch data reached via real navigation — so
    this is a test-harness hazard, not an application bug. If a future phase automates
    around printing again, stop all polling/`executeJavaScript` activity on that
    `webContents` before triggering `printToPDF`.

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

### Next actions — Phase 7 (batches history, settings, backup)

1. **`RecentBatches` (`src/renderer/components/recent-batches.tsx`) is still the Phase 1
   inert empty-state placeholder.** This is the obvious place for the real history list
   — `batches.list()` already supports it, and `Navigate` already threads a `batchId`
   into Review/Print, so a history row just needs to call
   `onNavigate('review', id)` / `onNavigate('print', id)`.
2. **No screen lets the operator pick an older batch.** Review and Print both only ever
   show "the batch just handled" or "the most recently created one" — that was a
   deliberate scope limit in both phases, explicitly deferred here.
3. **Settings doesn't exist yet, so "Factory name not set" is hardcoded in two places**
   (`AppHeader` and the print sheet's header block) — when Settings lands, both need to
   read the same value, not just one of them.
4. **`createBatchFromPendingFiles`'s `importFileIds` param has existed since Phase 4
   and is still never passed** — if Phase 7 wants the operator to choose which pending
   files go into which batch, that's the seam, not new grouping logic.
5. **Backup Now / Restore needs `sqlite.backup()`, not a file copy** — already flagged
   in CLAUDE.md §9 (WAL-safety reason) and in the "Decisions" list above.
6. **`batch.status` has never reached `'ready'`** — only `'draft'`→`'printed'` is
   exercised. Decide whether Phase 7's history list needs that state or the schema
   value stays permanently unused.
7. `npm run db:verify`, `npm run import:verify`, `npm run grouping:verify` **and**
   `npm run review:verify` must still pass at the end (no `print:verify` exists —
   Phase 6 is UI/print-pipeline, not business logic a Node script can assert against).

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

## Session 5 — 2026-08-25 — Phase 4

**Built:**
- `src/main/production/group-into-batch.ts` — `groupOrdersForBatch()` (pure grouping:
  sums by factory SKU + colour + size, excludes `is_duplicate` rows, flags
  `missing_sku` / `unknown_mapping` / `invalid_quantity`) and
  `createBatchFromPendingFiles()` (transaction: creates the batch, inserts
  `production_items`, reassigns the source files/orders, writes stored totals).
- `src/main/excel/import-sku-mappings.ts` — bulk SKU-mapping spreadsheet parser (fixed
  headers, no alias/fuzzy matching needed since it's StitchFlow's own format), reusing
  `readSpreadsheet()` from Phase 3.
- `src/main/excel/import-file.ts` — rows matching an existing `duplicate_hash` are now
  flagged `is_duplicate` at insert, not just counted.
- Repository additions: `importedOrders.clearDuplicateForFile()` / `.count()`,
  `productionItems.globalTotals()`.
- New IPC: `src/main/ipc/sku-mappings.ts` (CRUD + bulk import), `src/main/ipc/production.ts`
  (`batchesCreateFromPending`), plus additions to `ipc/upload.ts`
  (`uploadUnmarkDuplicates`) and `ipc/app.ts` (`appDashboardSummary`).
- Renderer: `pages/sku-mapping/sku-mapping-page.tsx` (new screen — table, add form, bulk
  import), `hooks/use-dashboard-summary.ts`; `upload-page.tsx` gained the duplicate
  banner + Import Anyway, the Group-into-batch button and result summary, and a SKU
  Mappings nav link; `dashboard-page.tsx` now fetches the real summary instead of
  `EMPTY_DASHBOARD_SUMMARY`; `App.tsx` gained the `sku-mapping` screen.
- `src/main/grouping-verify.ts` + `npm run grouping:verify` (new permanent verification
  script, same shape as `db-verify`/`import-verify`) and the new fixed fixture
  `samples/sku-mappings-bulk.csv`.

**Verified:** `npm run typecheck` clean. `npm run db:verify` 11/11, `npm run
import:verify` 13/13 (no regressions). `npm run grouping:verify` 11/11, including the
exact Definition-of-Done assertion (`TEE-BLK-M` = 16 units summed from TikTok 8 + Shopee
5 + Lazada 3) and the duplicate-default-ignore behaviour (12 re-uploaded rows excluded
from every total). Drove the real app end-to-end using the project's documented
screenshot/`executeJavaScript`-click technique (temporarily stubbed
`upload:pick-files` from an env var and added an env-gated walkthrough hook in
`index.ts`, both fully reverted afterward — confirmed via `git diff` showing only the
intended IPC-registration lines changed): Dashboard (all zeros) → Upload → imported the
three sample files (3 files · 28 order lines) → Group into production batch ("18
production lines · 61 units · 18 need review" — expected, since no SKU mappings existed
in that run) → SKU Mappings screen renders empty/add-form/bulk-import → back to
Dashboard, now showing 28 / 61 / 18 / 1. The walkthrough's own cleanup step removed the
batch it created (cascades to `production_items`/`import_files`/`imported_orders`);
confirmed via the app's own entry point (`STITCHFLOW_DB_DUMP` temporary flag, also
reverted) that every table was back to 0 rows afterward.

**Not done / left:** No editing UI for `production_items` (Phase 5). No batch
picker — grouping always consumes every pending file (Phase 5/7). Batch numbering is a
timestamp placeholder (Phase 7). `missing_colour` / `missing_size` / `duplicate` issue
types are declared in the schema but nothing sets them (colour/size no longer come from
parsing, so it's unclear Phase 5 still needs the first two — worth revisiting, not
carried over as-is).

**Known issues:** None new beyond what's listed above under "Known issues /
environment gotchas" and "What does NOT exist yet".

**Decisions:** Colour/size come from `sku_mappings`, never from parsing
`raw_variation` — this is what makes the three separators a non-issue (see "Key design
decision" in the approved Phase 4 plan). Duplicate handling is decided once, at upload
time (`is_duplicate` flag + banner), not re-decided at grouping time. One button groups
*everything* pending into *one* new batch — no partial selection yet.

**Next:** Phase 5 — review table, issues screen. Start from "Next actions — Phase 5"
above: there is currently no way to edit, delete, add, or merge a `production_item`, and
the Issues screen should read from the already-tested `listUnresolved()` /
`listPrintable()` repository methods rather than filtering client-side.
**Commit:** tag `phase-4-mapping-grouping`

## Session 6 — 2026-08-25 — Phase 5

**Built:**
- `src/main/production/review-items.ts` — `recomputeBatchTotals()` (the "stored totals
  must be kept in step" rule, now called after every mutation, not just batch creation)
  and `mergeProductionItems()` (sums quantity, unions `source_platforms`, keeps the
  earliest row's SKU/colour/size, carries the first issue forward unless every merged
  row was clean).
- `src/main/ipc/production.ts` extended with six handlers:
  `productionItemsListByBatch/Update/Create/Remove/Merge` and `batchesList`/
  `batchesGetById`. No new repository methods were needed — Phase 4 already built
  `listByBatch`/`listPrintable`/`listUnresolved`/`update`/`create`/`remove`; Phase 5 is
  mostly IPC exposure plus the one new merge orchestration.
- Renderer: `pages/review/review-page.tsx` (new) — batch header with live totals,
  search/filter/sort toolbar, a table with inline edit-in-place rows, per-row Edit/
  Delete, checkbox multi-select with a Merge button, and a standalone Add-row form
  reusing the same field component. `App.tsx`'s `Screen`/navigation became a proper
  `Navigate` type (`(screen, batchId?) => void`) so Upload's grouping banner and the
  Dashboard tile can both open Review — the banner opens the batch just created, the
  tile falls back to the most recently created one.
- `src/main/review-verify.ts` + `npm run review:verify` — builds its scenario directly
  through the repositories (no spreadsheet needed, this phase never touches parsing).
- Dashboard's "Review Production" tile now navigates for real instead of showing a
  "Phase 5" placeholder notice.

**Verified:** `npm run typecheck` clean. `npm run db:verify` 11/11, `npm run
import:verify` 13/13, `npm run grouping:verify` 11/11 — all unchanged, no regressions.
New `npm run review:verify` 10/10, including the exact Definition-of-Done sequence:
create a batch with 3 intentionally broken rows (`missing_sku`, `invalid_quantity`,
`unknown_mapping`) plus 2 clean ones, confirm exactly the three appear in
`listUnresolved()`, fix one via the same update shape the UI's Save button sends,
confirm it now appears in `listPrintable()` and the batch's stored totals stay in sync.
Drove the real app end-to-end via the same temporary, fully-reverted
screenshot/`executeJavaScript` technique as Phase 4 (confirmed via `git diff` showing
zero residue in `index.ts`/`upload.ts` afterward): grouped the three sample files with
no SKU mappings (18 lines / 61 units / 18 need review, all `unknown_mapping`), opened
Review from the grouping banner, and — captured on screen — fixing one row dropped the
count from **18 need review to 17**, with the row visibly leaving the Needs Review
filter. Also confirmed merge, add, and delete each complete successfully with totals
updating (some individual screenshots in that longer chain landed on a transient
"Loading…" frame due to the harness's own polling timing, not an application fault —
the underlying behaviour for all of those is what `review-verify.ts` proves
deterministically). Confirmed via the app's own entry point that the live database was
back to empty afterward.

**Not done / left:** No batch-picker/history screen (Phase 7) — Review always shows one
batch, either the one just created or the most recent. `missing_colour` / `missing_size`
/ `duplicate` issue types remain declared but unreachable given Phase 4's design
(colour/size from the mapping; duplicates excluded before grouping) — the Review
screen's issue-label map covers all six regardless, for if that ever changes.

**Known issues:** None new.

**Decisions:** Editing a `production_item` always resolves it — Save sends
`isResolved: true, issueType: '', issueNote: ''` unconditionally alongside the edited
fields, for both issue rows and already-clean rows. Merging is clean only if every
merged row was clean; otherwise the first issue is carried forward, never silently
dropped. Every mutation to a batch's items recomputes and re-stores the batch totals.

**Next:** Phase 6 — A4 print preview. Start from "Next actions — Phase 6" above:
`listPrintable()` is the query to build the print view from, and the spec's ASCII
layout mockup isn't in this repo — ask for it rather than guessing the layout.
**Commit:** tag `phase-5-review-issues`

## Session 7 — 2026-08-25 — Phase 6

**Built:**
- Asked the user directly whether the spec's ASCII print-layout mockup was available
  before starting (per CLAUDE.md §8's standing instruction) — they explicitly chose to
  have the layout designed from scratch rather than supply one.
- `src/renderer/pages/print/print-page.tsx` (new) — the Print Sheet screen: header
  block (title, factory-name placeholder, batch number/name, created/printed dates,
  line/unit totals), a Standard-table / Grouped-by-SKU toggle, a rows-per-page
  page-count estimate, an unresolved-items warning banner (linking to Review), and
  Print / Save PDF buttons. Reads `listPrintable()`, not `listByBatch()`, so unresolved
  items are excluded by construction.
- `src/main/ipc/print.ts` (new) — one handler, `printSaveAsPdf`: save dialog →
  `contents.printToPDF({ preferCSSPageSize: true })` → write file. `preferCSSPageSize`
  is what makes the PDF and `window.print()` share one `@page`/`@media print` source of
  truth instead of drifting apart.
- `src/main/ipc/production.ts` extended with `batchesMarkPrinted` (thin wrapper over
  the already-tested `batches.markPrinted()`) and `productionItemsListPrintable`.
- `src/renderer/styles/globals.css` gained its first `@media print` block: `@page {
  size: A4; margin: 14mm }`, the "hide everything except `.print-sheet`" visibility
  trick, `.no-print`, and table row/header-repeat rules for multi-page sheets.
- `App.tsx`'s `Screen`/`Navigate` gained `'print'`; the Dashboard's Print Sheet tile and
  Review's new "Print this batch" button both navigate to it (Review also gained the
  `onNavigate` prop it was missing since Phase 5).
- Dashboard's `handleAction` simplified — all three tiles now navigate directly, so the
  Phase 1-era `notice`/`PENDING_ACTIONS` state in `dashboard-page.tsx` was dead code and
  removed.

**Verified:** `npm run typecheck` clean. `db:verify` 11/11 (includes the pre-existing
`markPrinted` check Phase 6 depends on), `import:verify` 13/13, `grouping:verify`
11/11, `review:verify` 10/10 — all unchanged, no regressions. No new verify script:
this phase is UI/print-pipeline, not business logic a Node script can meaningfully
assert against. Drove the real app end-to-end via the same temporary,
fully-reverted screenshot technique as Phases 4/5, extended with a new one this phase
enables — **reading the generated PDF back with the Read tool's native PDF support**:
grouped the three sample files with the five shared SKUs pre-mapped, opened Print from
Review, screenshotted both layouts (Standard: clean # / SKU / Colour / Size / Qty
table; Grouped: HOOD-NVY-L/POLO-RED-S/TEE-BLK-L/TEE-BLK-M/TEE-WHT-M with correct
per-SKU subtotals — 11/8/6/16/9, matching `grouping:verify`'s known math — the
unresolved banner correctly named the 3 unmapped platform-only SKUs), then triggered
Save PDF for real and read the output file directly: a genuinely clean single A4 page
with **zero app chrome** — no header, no toolbar, no status bar — confirming the print
CSS actually works, not just that the on-screen preview looks right. Confirmed via the
app's own entry point that the live database was back to empty afterward.

**Not done / left:** No batch-picker/history screen (Phase 7, same constraint Phase 5
already worked within). Page-count is a heuristic estimate, not real pagination.
`batch.status` still never reaches `'ready'` — only `'draft'`→`'printed'` is exercised.

**Known issues:** `webContents.printToPDF()` can fail ("Failed to generate PDF:
Printing failed") if something else concurrently calls `executeJavaScript` on the same
`webContents` while the print job is in flight — hit repeatedly while automating this
phase's own manual verification (the `__click` polling helper collided with it). Not an
application bug: isolated with several standalone repros showing identical
`printToPDF` calls succeed reliably outside that specific collision, including on real
batch data reached through real navigation. Documented above under "Known issues /
environment gotchas" for whichever future phase next automates around printing.

**Decisions:** The print sheet is isolated at print time via the CSS "hide everything
except this element" trick (`.print-sheet` visibility toggling), not by conditionally
rendering `AppHeader`/`StatusBar` — neither component knows printing exists, and
nothing about future page chrome needs to either. `printToPDF` always passes
`preferCSSPageSize: true` so the PDF and native print never diverge. Printing marks a
batch `printed` optimistically on click (no completion callback exists for
`window.print()`); Save PDF marks it only after a confirmed write.

**Next:** Phase 7 — batches history, settings, backup. Start from "Next actions —
Phase 7" above: `RecentBatches` is still Phase 1's inert placeholder and is the obvious
place for the real history list, since `batches.list()` and the `Navigate` batch-id
plumbing both already exist to support it.
**Commit:** tag `phase-6-print`

## SlipFlow delivery session - 2026-10-16 (active)

The user's comprehensive delivery request supersedes the earlier one-phase-per-session restriction and authorizes dependencies, commits and GitHub publication. Checkpoint `410c4ae` preserves every initial local source change, including size sorting. Working branch: `codex/slipflow-release`.

Implemented so far: strict integer quantities; seller accounts; scoped conservative duplicate detection; source provenance; unknown-SKU review; safe identical-item merges; batch approval and reconciliation; history/archive; persisted settings; WAL-safe verified backups and restoration with recovery snapshots; preview before import and explicit worksheet selection; selected-file batching; backend-owned A4 printing/PDF without optimistic printed status; IPC sender allowlist; hardened navigation/permissions; additive migration 0002 with legacy path preservation.

Verification evidence: baseline 45 checks passed. Current original suites 45/45 pass, release suite 48/48 passes, and the full Playwright Electron operator workflow passes. The grouping suite's two unsafe auto-approval assertions were replaced with the explicitly requested conservative policy; its quantity assertions remain unchanged. A 10,000-row synthetic import took 2,323 ms in the recorded run. This is a local benchmark, not factory time savings.

Real UI workflow: three marketplace fixtures, repeated TikTok file excluded, 3 unknown SKUs explicitly corrected, 61 units reconciled, PDF exported without changing ready status, backup restored, application reopened, persisted records reprinted. Screenshots under docs/screenshots are real synthetic-data captures. Multipage PDF contains all 120 items, correct total, repeated headers, and A4 page dimensions. Visual review found wrapped three-digit row numbers; fixed and awaiting final rerender.

Security: Electron updated within major 43 to 43.8.0, source-map-js and undici patched. No high findings remain in the npm audit. Eight moderate findings share the build-only sprintf-js dependency chain, with no patched upstream sprintf-js release. Runtime has no external node_modules dependencies; document this residual risk.

Windows: initial NSIS installer built at release/SlipFlow-Setup-1.0.0.exe. Rebuild after final checks before installation QA. GitHub account verified as tayyab-hub in connector and Git Credential Manager. Target repository currently returns 404. No remote publication yet.

Remaining: final QA/security/privacy audit, installer install/startup/uninstall checks, documentation, presentation, final Git commits/push, remote CI and gated release. Track work in DELIVERY-CHECKLIST.md. Never label unverified external checks successful.

### Hosted CI follow-up

Published source with preserved history. Initial Windows Server 2025 hosted runs passed dependency install, privacy scan, lint, type checking, audit and all 96 verification checks, but exposed a timing race in the partial-order UI assertion. The test now waits for rendered row count and completed batch navigation. Local full rerun: 2 PASS; targeted follow-up: 1 PASS. Hosted rerun is in progress. Final branding review also updated the remaining old-name operator messages without changing legacy database identity.
