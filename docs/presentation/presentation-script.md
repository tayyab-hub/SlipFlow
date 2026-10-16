# SlipFlow presentation script

The editable 12-slide deck includes speaker notes. This separate script supports a college demonstration or internship interview. All example orders are synthetic. Allow approximately 8 to 10 minutes plus the demonstration.

## 1. Introduction

My name is Muhammad Tayyab, and I am studying for a Diploma in Computer Science at Methodist College Kuala Lumpur. SlipFlow is an offline Windows desktop application that turns marketplace order exports into reviewed production instructions. Its central output is an A4 tailor slip showing the factory SKU, colour, size and quantity. The project focuses on correctness and traceability before visual polish. Today's demonstration uses synthetic records, and I am not claiming measured factory time savings.

## 2. The manufacturing problem

Factory staff receive order files from TikTok Shop, Shopee and Lazada. Those exports are designed for marketplace operations, so they are not automatically ready for the sewing floor. Staff still need to identify products, interpret variants and total quantities. Different sellers and file layouts make that work more difficult. The screenshot shows a real import preview in SlipFlow, where the operator confirms the columns before orders are stored.

## 3. The manual workflow

The manual process moves through reading exports, identifying SKUs, checking variants, adding quantities and writing slips. Each transfer can introduce a mistake. A repeated export could duplicate production, while a malformed quantity could be misread. I designed SlipFlow to preserve the source record and expose uncertainty, so staff can explain how each production total was reached.

## 4. The SlipFlow workflow

The operator selects the seller and previews the chosen worksheet. The application imports source rows, identifies reliable duplicates, and groups selected orders using explicit factory mappings. Unknown products and uncertain information remain in review. The operator checks the source totals and approves the complete batch before final output. Saving a PDF and confirming physical printing are separate actions.

## 5. Objectives and scope

The input formats are CSV, XLS and XLSX. The application supports seller identity, remembered column layouts and explicit SKU mappings. The outputs are reviewed production quantities, A4 slips, PDF files and retained batch history. SQLite keeps the data on the workstation. There is no cloud database or marketplace API dependency. Tested fixtures establish supported examples, but operators still need to confirm current exports.

## 6. Main features

This is the actual SKU mapping screen. Operators can add or edit mappings and import a mapping spreadsheet. Conflicting keys are reported rather than silently overwritten. Other screens cover seller management, import previews, selection of individual source lines, production review, history and recovery. A saved batch keeps its production values when a later mapping changes, which protects historical instructions.

## 7. Architecture

React and TypeScript provide the operator interface. The sandboxed preload exposes specific IPC functions. Electron's main process validates the sender and arguments before parsing selected files, updating SQLite or creating output. The renderer has no Node integration. SheetJS handles spreadsheets, and Chromium generates the A4 document. This separation gives the interface the operations it needs without exposing arbitrary filesystem access.

## 8. Database and processing

Each import belongs to a seller and contains source order lines. A production item links back to the source rows that supplied it. Batches retain status, totals and reconciliation notes, while audit events record important changes. In the demonstration, the three original files contain 28 rows and 61 units. Reimporting the 12-row TikTok file stores exclusion evidence but adds zero production units. The final result remains 61.

## 9. Working application

This screenshot was captured from the automated Electron workflow. The dashboard shows 40 imported rows because it includes the repeated file's 12 rows. The production total is still 61, and the unresolved count is zero after three unknown products have been reviewed. These are database values, not decorative counters. History can reopen the same batch after the application restarts.

## 10. Testing, reliability and security

There are 96 passing verification checks: 45 from the original suites and 51 from the release suite. Two Playwright scenarios drive the actual Electron interface. They cover the full operator workflow and splitting an import across two batches. Additional checks cover malformed quantities, duplicate identity, backup restoration, corruption rejection and migration. A 120-line batch was exported across seven A4 pages and inspected. These are engineering tests with synthetic data, not evidence of real factory deployment.

## 11. Limits and next work

The next validation steps are current anonymized marketplace exports, target physical printers and supervised operator use. The installer is unsigned, and Windows 10 has not been tested. Eight moderate findings remain in a packaging dependency chain; there were no high or critical npm findings in the release audit. Future work should be guided by a factory pilot, including measured preparation time, broader compatibility and signed distribution.

## 12. Demonstration

I will show an import preview, an unknown product requiring review, quantity reconciliation and A4 output. I will then reopen the batch from history and show the backup workflow. The project demonstrates desktop application development, relational integrity, validation, UI testing and Windows delivery. The key outcome is a traceable path from source orders to reviewed production instructions.

## Presentation format

Native text, shapes, connectors and screenshots remain editable in the PowerPoint file. The PDF is a static visual copy. No slide animation or transition has been implemented or claimed. PowerPoint-specific rendering should be checked on the presentation computer before a live talk.
