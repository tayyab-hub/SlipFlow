# Known limitations

## Validation still required

- Test evidence uses synthetic repository fixtures. Current live TikTok Shop, Shopee and Lazada exports have not been validated with a real factory. Operators must inspect each preview.
- Native print submission is implemented. Physical printers, driver scaling, paper handling and actual printed-page quality need onsite verification.
- Windows 11 x64 build 26200 was exercised locally. Windows 10, ARM64, other Windows configurations and a clean physical PC are not verified.
- Same-version installation/update and data persistence are tested. Upgrading from an independently distributed older installer is not verified; the legacy path and original migration are preserved and version 1 schema migration is tested.
- No real before-and-after factory study or time-saving percentage exists.

## Operational limits

- One workstation and local database; no multi-user synchronization, remote access, cloud backup or live marketplace API.
- No marketplace status/cancellation policy is assumed. Operators choose eligible exports and source lines. The software cannot decide which cancelled/refunded orders a factory should manufacture.
- Unknown or overlapping line identities require human review. Reconciliation notes document decisions but cannot prove their correctness.
- Imported order-line ID and product-name columns are recognized through known aliases; unusual labels may need an export change. Manual mapping currently covers order ID, SKU, variation, colour, size and quantity.
- Incoming SKU matching is case-insensitive and mappings are marketplace/variation scoped, not seller scoped. Shops sharing a marketplace but using the same SKU differently must use distinct input identifiers or verify each batch manually.
- No historical line-level provenance is fabricated for legacy data. Unfinished legacy batches require review.
- Imports are bounded to 20 MiB, 50,000 rows, 150 columns, 25 sheets and 2,000 characters per cell. Parsing/grouping/backup operations run in the main process and may briefly pause interaction on large workloads.
- History IPC returns at most 500 recent batches. A larger deployment needs pagination before older history becomes operationally necessary.
- Automatic backups run only while the app is open and are local by default. There is no built-in encryption or access-control role system.

## Distribution and engineering risks

- Installer and executable are unsigned. No code-signing certificate was supplied; Windows reputation warnings are expected.
- Eight moderate npm audit findings remain in a packaging-only dependency chain (`sprintf-js` through `@electron/get`/logging dependencies). There were no high or critical findings in the release audit. See [security](security.md).
- `node:sqlite` reports an experimental API warning in the current Electron runtime. Database behavior is covered by integration checks, but runtime upgrades require regression testing.
- Presentation slides are editable, with native text/shapes and screenshot images. The PDF copy is a visual export from validated slide renders. No animations or transitions are claimed. Native Microsoft PowerPoint execution has not been tested.

No confirmed critical or high application defect remained after the documented checks. This statement is bounded by the tested cases and environments, not a guarantee against all defects.
