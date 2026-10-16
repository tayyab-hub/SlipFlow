# SlipFlow operator guide

## First launch

Install the versioned Windows installer and open **SlipFlow** from Start. Development tools are not required. In **Settings**, enter the factory display name, print layout, sorting, date format and backup preferences. Add one seller account for each marketplace shop. Renaming a seller preserves its identity; deactivation stops new imports without removing history.

The default data location remains `%APPDATA%\StitchFlow\stitchflow.db`. Do not delete this folder when upgrading from StitchFlow.

## Map products

Open **SKU Mappings**. Enter the incoming SKU, optional variation and marketplace, then the verified factory SKU, colour and size. A blank marketplace or variation acts as a general mapping. Specific marketplace matches take priority, then specific variation matches. Incoming matching is case-insensitive; confirm that this is appropriate for your factory's product codes.

Use **Edit** to correct a mapping. Existing batches keep their saved instructions; edits apply when later batches are grouped. Bulk import accepts these headers:

```csv
Incoming SKU,Incoming Variation,Platform,Factory SKU,Factory Colour,Factory Size,Notes
SHOP-TEE,"Black,M",tiktok,FACT-TEE,Black,M,Verified sample mapping
```

Incoming SKU and Factory SKU are required. Conflicting keys are reported and not overwritten. Missing colour or size still requires review before production. Only use `N/A` after verifying that a field truly does not apply.

## Import and inspect

1. Choose **Upload Orders** and select the correct seller.
2. Use **Choose files** or drag CSV/XLS/XLSX files into the drop zone. Multiple files for the selected seller are supported.
3. Inspect each preview. Select the intended worksheet, confirm the marketplace and map the displayed header names to SKU, quantity, order ID and variant fields.
4. Optionally remember the column layout, then select **Import with this mapping**.
5. Read the summary of imported rows, invalid quantities and duplicates. Previewing alone does not write orders.

Marketplace export layouts change. The supplied fixtures demonstrate tested layouts, not universal compatibility. Always inspect headers and quantities. Formula cells are rejected; export values only. Files over 20 MiB, more than 50,000 data rows, 150 columns or 25 worksheets are refused. XLSX declared expansion is limited to 100 MiB and 3,000 entries. Cells are limited to 2,000 characters.

Whole positive quantities such as `12` are accepted. Zero, negative values, decimals, thousands separators, scientific notation and text such as `2 pcs` are not silently converted. Correct them during production review after checking the source.

## Select and batch

Filter pending imports by seller if needed. Check the files to include. **Choose rows** opens the pending source rows, with search and individual checkboxes. Select all, clear or choose only the lines needed now. Unselected source rows remain pending for a later batch. Exact duplicate rows add no units and are retained in the batch's exclusion evidence.

Enter an optional batch name and create the batch. A unique `SF-date-reference` identifies it. Already-batched rows cannot be reused. Removing a wholly pending import deletes its stored rows after confirmation; partially batched imports must be retained.

## Resolve and approve

Review Production shows grouped lines and issues. Unknown mappings, missing variants, malformed quantities and uncertain duplicate identities require explicit resolution. Inspect the source rows before changing a line. Enter a verified SKU, colour, size and positive integer quantity, then save.

Manual additions and removals are supported for justified adjustments. Merging is allowed only for distinct, resolved rows with identical factory SKU, colour and size. Source links are retained. Ready batches must return to draft before editing; printed and archived history is locked.

Open **Reconcile / approve**. Compare source units against production units and inspect the audit history. Explain quantity corrections or source validation issues in the batch notes, then select **Approve as ready**. A note is not evidence that a correction is correct: the operator remains responsible for checking it.

## Print and retain

Open **Preview / print**. Select standard or SKU-grouped A4 output. Check the factory name, batch reference, variants, totals and account/source references. Draft preview is visibly marked and cannot be used for final PDF/native output.

**Save PDF** creates a PDF from current approved database records. **Print** opens the native print dialog. Select A4, review scaling and printer settings, then inspect the actual output. Only confirm physical printing once the pages have printed correctly. Opening a print dialog or saving a PDF never marks the batch printed by itself.

Batch History supports search, status filters, detail viewing, reprinting and archiving. Restore an archived batch before reprinting. Printed batches remain locked. Archive preserves both production and source records.

## Backups and errors

In Settings, create a verified backup and copy it to a separate drive. Automatic backups run only while SlipFlow is open; defaults are every 60 minutes with 14 automatic snapshots retained. Use an interval from 5 to 1,440 minutes, or 0 to disable. Manual and recovery backups are not removed by automatic retention.

Settings shows an automatic backup error when a snapshot fails. Correct disk-space or permission problems and create a manual backup. See [recovery instructions](backup-recovery.md) before restoring. If an import fails, no partial order import is kept; correct the reported issue and retry. Do not bypass an unresolved production issue just to print.
