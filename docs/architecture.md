# Architecture

SlipFlow retains the existing Electron, React, TypeScript, Tailwind, SheetJS and SQLite architecture. It operates on one Windows workstation without a server, login service or marketplace API.

## Process boundaries

| Layer | Responsibility | Boundary |
|---|---|---|
| Renderer | Dashboard, import previews, mappings, review, history, settings and slip preview | No Node or database access |
| Preload | Explicit functions such as import, batch creation and PDF export | No generic IPC invocation or filesystem API exposed |
| Main | Validate sender and arguments, parse selected files, transact changes, generate production output | Trusted local application code |
| SQLite | Source history, production state, settings and audit events | One process owns the writable connection |

`src/main/ipc/trusted-ipc.ts` checks both the registered webContents and its exact loaded main-frame URL. Nested frames cannot invoke handlers. Navigation, new windows, webviews and permission requests are refused. The packaged renderer has a Content Security Policy.

## Import to output

1. The main process grants access to paths selected in the native picker or received through the preload's real dropped-File bridge.
2. `read-workbook.ts` checks size, extension, workbook structure, cell formulas and row/column limits. The operator previews the selected worksheet and mapped columns before any import writes.
3. `import-file.ts` normalizes fields and stores the original quantity text, row number, seller and order-line identity. Malformed quantities are stored with zero production value and an explicit issue.
4. Duplicate identity uses marketplace, seller, order and reliable line identity. Exact duplicates are excluded; uncertain overlaps remain visible for review.
5. `group-into-batch.ts` groups only selected pending source rows in a transaction. A row cannot join two batches. Exact duplicate rows are attached for the exclusion audit but add no production units.
6. Explicit factory mappings resolve known variants. Unknown variants remain suggestions. Invalid or ambiguous source rows remain separate production items.
7. Draft-only review operations validate the complete resulting item. Merges require identical resolved product identity, preserve source links and recompute totals.
8. `batch-policy.ts` requires all rows to be valid and resolved. Differences between source and production totals, or invalid source information, require reconciliation notes.
9. The main process constructs escaped A4 HTML from database records. Final PDF/native print requires a ready or printed batch. Draft preview is marked as a draft.

## Compatibility

The visible name is SlipFlow. The data path remains `%APPDATA%\StitchFlow\stitchflow.db`, and the application ID remains `com.factorysoftware.stitchflow`. Version 1 data receives an additive migration and a recovery snapshot. Original migration `0001_init.sql` is unchanged. Previously unfinished rows require review under the stricter policy.

`imported_orders.batch_id` is authoritative for partial file batching. A file remains pending until all its order rows have been assigned. Batch source-file lookup follows order rows as well as the legacy file-level relationship. Public application operations archive batches instead of deleting them, preserving historical references.

## Build and delivery

Electron Vite creates isolated main, preload and renderer bundles. Electron Builder packages an ASAR and a per-user NSIS installer. Verification entry points are omitted from the installed package. Packaged fuses disable RunAsNode, NODE_OPTIONS and CLI inspection, enable ASAR integrity and restrict loading to the ASAR.

The explicit `--smoke-test --user-data-dir=<isolated path>` mode writes startup evidence and exits. It accepts no script input and is only a release QA path. Regular application startup uses the preserved data path.
