# Portfolio and demonstration materials

## 60 to 90 second introduction

Hello, I am Muhammad Tayyab, a Diploma in Computer Science student at Methodist College Kuala Lumpur. SlipFlow is an offline Windows desktop application for factories that receive orders from TikTok Shop, Shopee and Lazada.

The problem is that a marketplace export is not yet a production instruction. Staff still need to identify the factory product, check colour and size, and calculate quantities. SlipFlow imports those files, preserves the seller and source rows, identifies reliable duplicates, and groups verified variants into a production batch.

I focused on preventing incorrect output. Invalid quantities and unknown mappings require review. Operators reconcile the source and production totals before approving an A4 tailor slip. The application also supports PDF export, history, settings and verified backups.

The project uses Electron, React, TypeScript and SQLite. It has 96 passing verification checks and two automated Electron UI scenarios, plus an exercised Windows installer. The demonstration data is synthetic. Physical-printer checks and real factory validation are the next steps, so I do not claim measured factory time savings.

## Five-minute demonstration

Prepare an isolated demonstration profile with the three sample sellers and five verified shared SKU mappings. Keep the original `samples/` files unchanged. Do not demonstrate backup restoration against a real factory database.

| Time | Action | Explanation |
|---|---|---|
| 0:00 to 0:30 | Open Dashboard and Settings | Explain offline storage and separate seller identities. |
| 0:30 to 1:20 | Choose TikTok seller, preview the sample workbook | Show worksheet selection, column confirmation and the source rows. Explain preview writes nothing. |
| 1:20 to 1:50 | Import the remaining marketplace samples and a TikTok repeat | Show that the repeat is excluded. The three original files total 61 units. |
| 1:50 to 2:20 | Open Choose rows, then select all for the combined demo | Explain that a subset can be batched while remaining rows stay pending. |
| 2:20 to 3:10 | Create the batch and inspect the three unknown products | Resolve them only after reading the sample source. Show provenance and the 61-unit reconciliation. |
| 3:10 to 4:00 | Approve as ready and open Preview / print | Inspect the A4 table, save a PDF and show that the batch remains ready. Do not claim physical printing. |
| 4:00 to 4:30 | Reopen the batch from history | Show saved totals, status and audit details. |
| 4:30 to 5:00 | Create a verified backup and show restoration confirmation | Explain the pre-restore recovery snapshot and finish with validation limits. |

For a strict five-minute talk, pre-import the Shopee and Lazada fixtures and show the repeated import result instead of waiting through every dialog. Be explicit about which steps were prepared.

## Technical architecture explanation

The renderer owns presentation and interaction. Its preload bridge exposes named operations rather than raw IPC or Node APIs. Electron main checks the registered sender, main frame and arguments, then performs file, database and print operations. SQLite uses STRICT tables, foreign keys, WAL and transactions. Source order rows are preserved separately from editable production rows, linked through a provenance table. Batch approval checks completeness and reconciliation. The print document is generated from approved database state in the main process, preventing a renderer preview from becoming the authority for production output.

## Common questions and answers

**Why a desktop app instead of a website?** The initial requirement is local offline operation on a Windows factory workstation. A desktop app provides local file import, native printing and a bundled database without operating a server.

**Why Electron?** It preserves the existing React/TypeScript codebase and provides Windows packaging, a controlled preload boundary and Chromium print output. Its larger distribution size is a tradeoff.

**How do you prevent duplicate production?** Identity includes marketplace, seller, order and line information. Reliable repeats are excluded, uncertain overlaps require review, and an assigned source row cannot be batched again.

**What if an order contains two identical lines?** An occurrence index preserves repeated lines when reliable line IDs are absent. An altered later export can be ambiguous, so it requires review instead of silent suppression.

**What happens to a quantity such as 2.5 or 2 pcs?** It is not converted into a valid production quantity. The original text is retained and the item requires a verified whole-number correction.

**Can users change a printed batch?** Printed and archived production rows are locked. A ready batch may return to draft before printing. Historical reprinting uses its saved instructions.

**How do backups handle SQLite WAL?** `VACUUM INTO` creates a consistent committed snapshot. Integrity and foreign keys are verified. Restore stages a copy and retains a recovery snapshot before replacing the live database.

**Does it integrate with marketplace APIs?** No. It reads local exports. No API credentials or access have been assumed.

**What was actually tested?** Ninety-six verification checks, two real Electron UI scenarios, actual PDF generation and an isolated Windows 11 installation/update/uninstall. Real factory operation and physical printers remain unverified.

**How much time does it save?** That has not been measured in a factory. A local synthetic 10,000-row import benchmark took 2,201 ms, which measures parsing/import work only.

**Is the application fully secure?** No software can make that absolute claim. It uses sandboxing, context isolation, validated IPC, strict imports and recovery safeguards. Local account compromise, unencrypted data, unsigned distribution and packaging dependency findings are documented risks.

**What would you improve next?** Validate current anonymized exports and target printers, run a supervised factory pilot, sign the installer and add history pagination and background processing when measured workloads justify them.

## LinkedIn project description

I developed SlipFlow, an offline Windows desktop application that converts marketplace order exports into reviewed A4 production slips.

The project addresses a practical manufacturing workflow: identifying factory SKUs, checking variants, reconciling quantities and retaining the source of each production instruction. It supports TikTok Shop, Shopee and Lazada sample exports, seller-aware duplicate handling, individual order-line batching, manual review, PDF output, history and verified SQLite backups.

Built with Electron, React, TypeScript, Tailwind CSS and SQLite, SlipFlow includes 96 passing verification checks and two automated Electron UI scenarios. I also packaged and exercised its Windows installer and documented the security and recovery boundaries.

The demonstrations use synthetic data. Current live marketplace layouts, physical printers and real factory productivity still require field validation. This project strengthened my work in desktop architecture, data integrity, automated testing and software delivery as I prepare for a software development internship.

Repository: https://github.com/tayyab-hub/SlipFlow

## Three resume bullets

- Developed an offline Electron, React and TypeScript desktop application that converts marketplace order exports into reviewed A4 production slips with seller-aware duplicate control and source-row traceability.
- Implemented transactional SQLite batching, strict quantity validation, controlled review/status transitions and verified backup restoration; validated the application with 96 automated checks and two Electron UI scenarios.
- Packaged and exercised a Windows x64 installer, including startup, update persistence and uninstallation, and prepared CI, operator documentation and an editable technical presentation.

## Short GitHub portfolio summary

SlipFlow is an offline Windows application for converting marketplace exports into reviewed factory production slips. It combines seller-aware import validation, traceable SKU grouping, individual order-line selection, reconciliation, A4 output and SQLite recovery. Built with Electron, React and TypeScript, with automated regression/UI tests and Windows packaging. Demonstrated with synthetic data; real factory validation is pending.
