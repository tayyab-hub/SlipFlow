# Testing evidence

## Verified environment

Local execution: Windows 11 x64 build 26200, Node.js 24.18.0, npm 11.16, Electron 43.8.0, TypeScript 7.0.2. All destructive cases use temporary databases. Existing synthetic sample files and original migration bytes are preserved.

| Command / suite | Result | Main evidence |
|---|---:|---|
| `npm run lint` | PASS | Biome checks application, scripts and tests |
| `npm run typecheck` | PASS | Main/preload and renderer TypeScript projects |
| `npm run build` | PASS | Production main, preload and renderer bundles |
| Database verification | 11 PASS | CRUD, rollback, foreign keys, STRICT types, migrations |
| Import verification | 13 PASS | Three marketplace fixtures, worksheets, remembered manual mapping, malformed inputs |
| Grouping verification | 11 PASS | Cross-market totals, repeated file exclusion, unresolved products, bulk mappings |
| Review verification | 10 PASS | Corrections, totals, merge, manual add/remove and rejection |
| Release verification | 51 PASS | Quantity regressions, seller/line identity, provenance, approval, print, backup, migration and partial batching |
| `npm test` | **96 PASS, 0 FAIL** | Builds and invokes all five suites above |
| `npm run test:e2e` | **2 PASS, 0 FAIL** | Actual Electron UI workflows, 9.6 seconds in the recorded final run |
| `npm run pack:win` | PASS | NSIS x64 installer and bundled resources |

The original `db:verify`, `import:verify`, `grouping:verify` and `review:verify` scripts are retained. `scripts/verify.cjs` runs those same compiled entry points after one build. Two original grouping expectations were intentionally changed: unknown variants now require review instead of being auto-approved. Expected production arithmetic remains unchanged.

## Data correctness regression cases

- Quantity rejects zero, negatives, decimals including `3.0`, units suffixes, comma separators, scientific notation, ranges, blank, infinity, overflow and formula-like strings.
- Preview writes no source rows or mapping-usage changes.
- Separate sellers and marketplaces do not collide. Reliable order-line IDs distinguish multiple lines. Exact file repeats are excluded. Legitimate repeated lines without IDs retain occurrence identity.
- Changed quantities and uncertain overlaps remain unresolved for operator review.
- Bad quantities do not disappear into valid groups. Unknown SKUs cannot auto-resolve.
- A row cannot be batched again. Repeated file/row IDs and foreign selections are rejected. A partial file can supply two batches with correct separate provenance and totals.
- Merges reject repeated IDs and different identities. Manual changes require a complete valid item; draft/ready/printed/archive rules protect historical instructions.
- Unknown headers, empty/corrupt files, XLS worksheet selection, XLSX formulas, oversized files and conflicting mappings are covered.
- Backup tests include WAL-safe snapshot content, staged restore, recovery copy, corruption rejection, reopen persistence and version 1 migration.

## Complete operator scenario

Playwright launches the actual app with an isolated `--user-data-dir`, confirms version/security settings and drives the UI to create sellers and mappings, preview/import four files, review three unknown products, approve a batch, generate a PDF, reject malformed IPC input, create/restore a backup, restart, reopen/reprint and archive/restore history. A second scenario uses the row checkboxes to split one import into two batches and confirms that a partially used source file cannot be removed.

Only native file/save/confirmation dialogs are substituted in UI automation. Application import, IPC, database, review, PDF and recovery operations run normally. Real native printer output is not simulated or claimed.

The sample arithmetic is:

| Input | Source rows | Units |
|---|---:|---:|
| TikTok fixture | 12 | 27 |
| Shopee fixture | 9 | 22 |
| Lazada fixture | 7 | 12 |
| TikTok exact repeat | 12 stored, 12 excluded | 0 added |
| Final batch | 8 grouped lines | **61** |

Three platform-only products require explicit review. The shared `TEE-BLK-M` totals 16 units. Screenshots under `docs/screenshots/` are captured from these actual runs, with synthetic records only.

## PDF and performance checks

The release suite generates real PDFs through Electron/Chromium. A 120-line synthetic batch yields seven A4 pages. PDF extraction verified all 120 product rows, repeated batch/table headers and total 120; first and final pages were rendered and inspected. Three-digit line numbers were corrected to avoid wrapping. The normal operator PDF contains the same 61-unit batch shown in the UI.

A single local 10,000-row CSV import completed in **2,201 ms** in the recorded verification run, preserving all 10,000 units. This is a synthetic local benchmark, not a factory productivity measure or a general performance guarantee.

## Windows and presentation evidence

See [Windows installation evidence](evidence/windows-installation.json) for installer/startup/update/uninstall results, shortcuts, security posture and SHA-256. Installation ran against a dedicated test directory and isolated data. It did not replace a real factory installation. The unsigned state was explicitly checked.

The 12-slide PPTX passes package/relationship checks, slide count/dimension/font/layout checks and first-party reimport. All slides were visually inspected. The PDF is produced from those slide renders because the available native PDF exporter lacked a bundled standard-font module. The editable PPTX remains native text, shapes/connectors and screenshot images. Native Microsoft PowerPoint execution and animations/transitions are not claimed.

## Limits of the evidence

No production factory dataset, physical printer, Windows 10 host or independent security penetration test was available. Automatic backup snapshot/retention code is shared with the verified backup implementation; a long-running unattended timer/disk-full soak test has not been performed. See [known limitations](known-limitations.md).
