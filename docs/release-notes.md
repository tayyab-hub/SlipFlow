# SlipFlow 1.0.0

Offline Windows x64 application for turning marketplace order exports into reviewed A4 production slips.

## Included

- Seller-aware CSV/XLS/XLSX import with worksheet preview and remembered column layouts.
- Strict quantity validation, reliable duplicate exclusion and review of ambiguous identities.
- Explicit factory SKU mapping, individual order-line selection, traceable production grouping and reconciliation.
- Controlled batch approval, A4 PDF/native printing, history, archive/restore and persisted settings.
- Verified manual/automatic SQLite snapshots and staged restoration with a recovery copy.
- Operator/security/architecture documentation, actual synthetic screenshots, editable 12-slide PowerPoint and presentation scripts.

## Verification

Local Windows 11 x64 checks passed: 96 regression/integration checks, two Electron UI scenarios, lint/type checking and production build. Actual A4 PDFs include a verified seven-page, 120-line case. The installer was installed, launched, updated and uninstalled in isolated test directories; the database marker survived update and data remained after uninstall. The published commit also passes the Windows GitHub Actions quality/packaging workflow before release publication.

## Install

Download `SlipFlow-Setup-1.0.0.exe` and compare its SHA-256 with `SHA256SUMS.txt`. Run the installer and launch SlipFlow from Start. Create sellers and factory mappings in Settings/SKU Mappings, then import, review, reconcile and approve a batch before printing. See the repository user guide for full steps.

The installer is unsigned and may show an unknown-publisher/reputation warning. No development tools are required for the installed app. Existing data stays at `%APPDATA%\StitchFlow\stitchflow.db`; create a verified backup before upgrading. Uninstalling preserves application data.

## Boundaries

Demonstrations and tests use synthetic data. Live marketplace exports, physical printers, real factory operation and Windows 10 remain unverified. No factory productivity savings or live API integration is claimed. Eight moderate advisories remain in a build-only packaging dependency chain; the audited tree had no high or critical advisories. Review the documented security and operational limitations before factory use.

Copyright is reserved; public source is provided for portfolio inspection. Third-party licenses are included with the distribution.
