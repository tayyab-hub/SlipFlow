# Sample order files — permanent test fixtures

These four files are the project's **fixed regression fixtures** (CLAUDE.md §7). Every
phase from 3 onward tests against these exact bytes.

**Do not regenerate, edit, or "improve" them.** If they change, a later phase can no longer
tell "this broke" from "the test data moved". `generate-samples.mjs` is committed only so
the contents' provenance is visible — running it again defeats the point.

Need different data to test something new? Add a *new* file; leave these alone.

| File | Rows | What it deliberately exercises |
|---|---|---|
| `tiktok-orders.xlsx` | 12 | Two sheets — the orders are on the **second** one, so picking the right sheet matters. Headers `Order ID` / `Seller SKU` / `Variation` / `Quantity`. |
| `shopee-orders.xlsx` | 9 (+1 blank) | A **title row above the headers**, and one fully blank row among the data. Header `SKU Reference No.` needs punctuation stripped. |
| `lazada-orders.csv` | 7 | CSV rather than Excel, with **camelCase headers** (`sellerSku`, `orderNumber`) that only match the alias list after normalisation splits them. |
| `unknown-format.xlsx` | 5 | Headings in Indonesian (`Kode Barang`, `Jml`, `Warna Ukuran`) matching **no alias**. Must fail detection and trigger the manual-mapping screen. |
| `sku-mappings-bulk.csv` | 3 (2 valid + 1 bad) | Phase 4's bulk SKU-mapping import. Fixed headers (`Incoming SKU`, `Factory SKU`, …), one row missing the required `Factory SKU` to prove a bad row is reported and skipped, not silently written or allowed to abort the whole import. |

## Shared SKUs

The same seller SKUs appear across all three marketplaces:

`TEE-BLK-M`, `TEE-BLK-L`, `TEE-WHT-M`, `HOOD-NVY-L`, `POLO-RED-S`

Plus one platform-only SKU each — `TT-ONLY-CAP`, `SP-ONLY-SOCK`, `LZ-ONLY-BELT` — which
have no counterpart elsewhere.

That combination is what Phase 4 needs: proving one factory SKU can be reached from three
platforms, and that an unmapped SKU is flagged rather than silently dropped.

Expected totals across the three marketplace files: **28 order lines**, **61 units**
(TikTok 12/27, Shopee 9/22, Lazada 7/12).

`npm run import:verify` asserts all of the above. `npm run grouping:verify` (Phase 4)
re-imports the same three files, maps the five shared SKUs, and asserts the grouped
totals and the unmapped/duplicate handling — plus the bulk-import file above.