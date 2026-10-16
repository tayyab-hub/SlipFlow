# Security and data protection

## Threat model

Assets are source order identity, production quantities, factory mappings, batch history and backups. The principal untrusted inputs are marketplace spreadsheets, their cells and filenames, imported mapping files, backup files and renderer IPC arguments. A compromised Windows account or a malicious local administrator is outside the application's protection boundary.

| Threat | Implemented control | Residual risk |
|---|---|---|
| Spreadsheet changes production quantities | Strict whole-number validation; invalid rows remain unresolved; explicit mapping/reconciliation | A human can still approve an incorrect correction |
| Repeated exports inflate production | Seller/platform/line-aware identity, exclusion evidence and assigned-row checks | Ambiguous exports need operator judgement |
| Cell HTML becomes executable output | React text rendering, escaped backend print HTML, sandboxed preview | Trusted dependencies still require updates |
| Renderer accesses arbitrary local files | Sandboxed renderer, no Node integration, context isolation, narrow preload, selected-file grants | A same-user local compromise can read app data |
| Untrusted frame invokes privileged IPC | Main-frame webContents/URL validation and fixed channels | Every new handler must keep argument validation |
| External navigation or remote content | Window/navigation/webview denial, permission denial, packaged CSP | Development HMR has a different CSP environment |
| SQL injection or partial writes | Parameterized values, static/allowlisted identifiers and transactions | Direct unsupported database edits bypass controls |
| Spreadsheet resource exhaustion | 20 MiB input, row/column/sheet/cell caps, XLSX expansion/entry caps, formula rejection | Parsing still runs in the main process; resource attacks are not eliminated |
| Unsafe backup replacement | Integrity/schema/FK checks, staged migration, pre-restore recovery snapshot and rollback | Trusted source snapshots and protected storage are still required |
| Packaged runtime abuse | ASAR integrity, load-only-ASAR, disabled RunAsNode/NODE_OPTIONS/CLI inspection fuses | Unsigned binaries lack a verified publisher identity |

## Data minimization and logging

The importer stores the required order/product fields and source metadata, not a copy of every customer column. It retains order IDs, product names, filenames and local source paths, which can still be sensitive. Backups contain the same information. Production PDFs can reveal order/account references.

Normal logging reports startup/schema status and errors, not full customer rows. Do not publish real logs, databases, PDFs or exports without reviewing them. Tests use synthetic data and temporary databases. `.gitignore` excludes local databases, WAL files, backups, order-export directories and test/build scratch output.

## Dependency audit

The release audit on 2026-10-16 reported **0 critical, 0 high and 8 moderate** findings. Electron was updated to 43.8.0, and affected `undici` and `source-map-js` transitive versions were updated within the existing major ranges.

The remaining finding is [GHSA-hp3w-g68c-fv3c](https://github.com/advisories/GHSA-hp3w-g68c-fv3c), an unbounded-precision denial of service in `sprintf-js`, propagated through `roarr`, `global-agent`, the packaging copy of `@electron/get`, and Electron Builder packages. The installed application bundles application code; these builder packages are not included. The eight audit entries describe the affected dependency chain, not eight independently demonstrated runtime exploits.

No upstream patched `sprintf-js` version was available in the audited registry result. The audit suggestion to downgrade Electron Builder was not applied blindly. Keep build inputs trusted, monitor the upstream fix and rerun the full Windows delivery checks on a packaging upgrade. CI rejects new high/critical audit findings while recording the moderate result.

All libraries are declared as devDependencies because Electron Vite bundles the runtime application. Therefore `npm audit --omit=dev` alone would hide relevant application dependencies and is not used to claim runtime safety.

## Local protection and reporting

SlipFlow has no account login, role separation or application-level encryption. Deploy under protected Windows accounts and consider full-disk encryption and restricted backup access. It has no telemetry or automatic update service.

Public source/history are scanned for common token/private-key patterns and prohibited runtime artifacts before publication. This is a bounded scan, not proof that all possible secrets can be detected. Fixture provenance and screenshot content were also reviewed. Report a security issue privately to the repository owner; do not attach real factory records to a public issue.
