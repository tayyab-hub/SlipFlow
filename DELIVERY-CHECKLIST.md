# SlipFlow delivery checklist

User scope: complete existing application, verify, package, document, present and publish.
Checkpoint: `410c4ae` preserves every initial modified/untracked source file.
Work branch: `codex/slipflow-release`. Original fixtures and migration 0001 remain unchanged.

- [x] Inspect repository and uncommitted work; safe Git checkpoint
- [x] Baseline build and 45 original verification checks
- [x] Strict quantities, seller identity, conservative duplicates and mapping
- [x] Safe grouping, provenance, review, reconciliation and status transitions
- [x] Import preview, worksheet choice and selective batching
- [x] History, seller management, persisted settings and verified backup/restore
- [x] Backend-generated complete A4 slips, PDF and print confirmation
- [x] Electron/IPC security review and dependency audit
- [x] Automated regression suite and real UI workflow with synthetic records
- [x] Windows installer build, packaged startup and installation checks
- [x] Documentation and actual application screenshots
- [x] Editable PowerPoint, PDF and presentation/portfolio scripts
- [ ] Privacy/history scan, commit, publish, verify remote and CI
- [ ] Release gates and final evidence report

Baseline: Windows, Electron 43.3.0; build PASS; db 11, import 13, grouping 11, review 10.
Confirmed initial defects: lossy quantity parsing; cross-market duplicate key; unverified
automatic SKU acceptance; invalid quantities can merge into valid groups; unchecked IPC
updates; arbitrary merge identities and repeated IDs; printing incomplete batches;
optimistic printed status; missing history/settings/backups/release pipeline.
