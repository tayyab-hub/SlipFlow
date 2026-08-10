/**
 * Generates the sample marketplace order files used to test StitchFlow.
 *
 * ⚠️  RUN ONCE. The files it produces are committed and are the project's permanent
 * regression fixtures (CLAUDE.md §7): every later phase tests against these exact files,
 * so regenerating or "improving" them destroys the ability to spot a regression. This
 * script is kept only so the contents' provenance is visible.
 *
 *     node samples/generate-samples.mjs
 *
 * What each file deliberately exercises:
 *   tiktok-orders.xlsx   two sheets — the data is on the SECOND one, so sheet choice matters
 *   shopee-orders.xlsx   a title row above the headers, and one fully blank data row
 *   lazada-orders.csv    CSV, with camelCase headers that only match after normalisation
 *   unknown-format.xlsx  Indonesian headers matching no alias — must trigger manual mapping
 *
 * The same seller SKUs (TEE-BLK-M, TEE-WHT-M, HOOD-NVY-L, POLO-RED-S, TEE-BLK-L) appear
 * across all three marketplaces, plus one platform-only SKU each. That is what Phase 4
 * needs to prove one factory SKU can be reached from three platforms.
 */
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const XLSX = require('xlsx')

const OUTPUT_DIR = dirname(fileURLToPath(import.meta.url))

// ---------------------------------------------------------------------------
// TikTok — data on the second sheet
// ---------------------------------------------------------------------------

const tiktokHeaders = [
  'Order ID',
  'Order Status',
  'SKU ID',
  'Seller SKU',
  'Product Name',
  'Variation',
  'Quantity',
  'SKU Unit Original Price',
  'Created Time'
]

const tiktokRows = [
  ['TT2608010001', 'Awaiting Shipment', '17298374', 'TEE-BLK-M', 'Classic Cotton Tee', 'Black,M', 2, 12.9, '2026-08-01 09:14'],
  ['TT2608010002', 'Awaiting Shipment', '17298375', 'TEE-BLK-L', 'Classic Cotton Tee', 'Black,L', 1, 12.9, '2026-08-01 09:22'],
  ['TT2608010003', 'Awaiting Shipment', '17298376', 'TEE-WHT-M', 'Classic Cotton Tee', 'White,M', 3, 12.9, '2026-08-01 09:31'],
  ['TT2608010004', 'Awaiting Shipment', '17298380', 'HOOD-NVY-L', 'Zip Hoodie', 'Navy,L', 1, 28.5, '2026-08-01 09:48'],
  ['TT2608010005', 'Awaiting Shipment', '17298381', 'POLO-RED-S', 'Pique Polo', 'Red,S', 2, 19.0, '2026-08-01 10:03'],
  ['TT2608010006', 'Awaiting Shipment', '17298374', 'TEE-BLK-M', 'Classic Cotton Tee', 'Black,M', 1, 12.9, '2026-08-01 10:15'],
  ['TT2608010007', 'Awaiting Shipment', '17298376', 'TEE-WHT-M', 'Classic Cotton Tee', 'White,M', 2, 12.9, '2026-08-01 10:29'],
  ['TT2608010008', 'Awaiting Shipment', '17298380', 'HOOD-NVY-L', 'Zip Hoodie', 'Navy,L', 4, 28.5, '2026-08-01 10:44'],
  ['TT2608010009', 'Awaiting Shipment', '17298375', 'TEE-BLK-L', 'Classic Cotton Tee', 'Black,L', 2, 12.9, '2026-08-01 11:02'],
  ['TT2608010010', 'Awaiting Shipment', '17298381', 'POLO-RED-S', 'Pique Polo', 'Red,S', 1, 19.0, '2026-08-01 11:19'],
  ['TT2608010011', 'Awaiting Shipment', '17298374', 'TEE-BLK-M', 'Classic Cotton Tee', 'Black,M', 5, 12.9, '2026-08-01 11:37'],
  ['TT2608010012', 'Awaiting Shipment', '17298399', 'TT-ONLY-CAP', 'Baseball Cap', 'One Size', 3, 9.5, '2026-08-01 11:51']
]

const tiktokBook = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(
  tiktokBook,
  XLSX.utils.aoa_to_sheet([
    ['TikTok Shop — Order Export'],
    ['Generated', '2026-08-01'],
    ['Orders in this file', tiktokRows.length]
  ]),
  'Summary'
)
XLSX.utils.book_append_sheet(
  tiktokBook,
  XLSX.utils.aoa_to_sheet([tiktokHeaders, ...tiktokRows]),
  'Orders'
)
XLSX.writeFile(tiktokBook, join(OUTPUT_DIR, 'tiktok-orders.xlsx'))

// ---------------------------------------------------------------------------
// Shopee — title row above the headers, one blank row among the data
// ---------------------------------------------------------------------------

const shopeeHeaders = [
  'Order ID',
  'Order Creation Date',
  'Order Status',
  'Product Name',
  'SKU Reference No.',
  'Variation Name',
  'Quantity',
  'Deal Price',
  'Buyer Username'
]

const shopeeRows = [
  ['260801ABCD01', '2026-08-01 10:02', 'Completed', 'Classic Cotton Tee', 'TEE-BLK-M', 'Black / M', 1, 13.5, 'buyer_one'],
  ['260801ABCD02', '2026-08-01 10:18', 'Completed', 'Classic Cotton Tee', 'TEE-WHT-M', 'White / M', 2, 13.5, 'buyer_two'],
  ['260801ABCD03', '2026-08-01 10:35', 'Completed', 'Zip Hoodie', 'HOOD-NVY-L', 'Navy / L', 1, 29.9, 'buyer_three'],
  ['260801ABCD04', '2026-08-01 10:52', 'Completed', 'Pique Polo', 'POLO-RED-S', 'Red / S', 3, 20.5, 'buyer_four'],
  ['', '', '', '', '', '', '', '', ''],
  ['260801ABCD05', '2026-08-01 11:11', 'Completed', 'Classic Cotton Tee', 'TEE-BLK-L', 'Black / L', 2, 13.5, 'buyer_five'],
  ['260801ABCD06', '2026-08-01 11:26', 'Completed', 'Classic Cotton Tee', 'TEE-BLK-M', 'Black / M', 4, 13.5, 'buyer_six'],
  ['260801ABCD07', '2026-08-01 11:44', 'Completed', 'Ankle Socks', 'SP-ONLY-SOCK', 'Grey / Free', 6, 4.9, 'buyer_seven'],
  ['260801ABCD08', '2026-08-01 12:01', 'Completed', 'Classic Cotton Tee', 'TEE-WHT-M', 'White / M', 1, 13.5, 'buyer_eight'],
  ['260801ABCD09', '2026-08-01 12:20', 'Completed', 'Zip Hoodie', 'HOOD-NVY-L', 'Navy / L', 2, 29.9, 'buyer_nine']
]

const shopeeBook = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(
  shopeeBook,
  XLSX.utils.aoa_to_sheet([
    ['Shopee Order Report — generated 2026-08-01'],
    shopeeHeaders,
    ...shopeeRows
  ]),
  'orders'
)
XLSX.writeFile(shopeeBook, join(OUTPUT_DIR, 'shopee-orders.xlsx'))

// ---------------------------------------------------------------------------
// Lazada — CSV with camelCase headers
// ---------------------------------------------------------------------------

const lazadaHeaders = [
  'orderNumber',
  'orderItemId',
  'createTime',
  'itemName',
  'sellerSku',
  'lazadaSku',
  'variation',
  'quantity',
  'unitPrice',
  'paidPrice'
]

const lazadaRows = [
  ['812345678901', '9001', '2026-08-01 11:20', 'Classic Cotton Tee', 'TEE-BLK-M', 'LZ-8891', 'Black:M', 2, 14.0, 28.0],
  ['812345678902', '9002', '2026-08-01 11:35', 'Classic Cotton Tee', 'TEE-BLK-L', 'LZ-8892', 'Black:L', 1, 14.0, 14.0],
  ['812345678903', '9003', '2026-08-01 11:49', 'Classic Cotton Tee', 'TEE-WHT-M', 'LZ-8893', 'White:M', 1, 14.0, 14.0],
  ['812345678904', '9004', '2026-08-01 12:05', 'Zip Hoodie', 'HOOD-NVY-L', 'LZ-8901', 'Navy:L', 3, 30.0, 90.0],
  ['812345678905', '9005', '2026-08-01 12:22', 'Pique Polo', 'POLO-RED-S', 'LZ-8910', 'Red:S', 2, 21.0, 42.0],
  ['812345678906', '9006', '2026-08-01 12:40', 'Classic Cotton Tee', 'TEE-BLK-M', 'LZ-8891', 'Black:M', 1, 14.0, 14.0],
  ['812345678907', '9007', '2026-08-01 12:58', 'Leather Belt', 'LZ-ONLY-BELT', 'LZ-8977', 'Brown:Free', 2, 11.0, 22.0]
]

const lazadaBook = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(
  lazadaBook,
  XLSX.utils.aoa_to_sheet([lazadaHeaders, ...lazadaRows]),
  'orders'
)
XLSX.writeFile(lazadaBook, join(OUTPUT_DIR, 'lazada-orders.csv'), { bookType: 'csv' })

// ---------------------------------------------------------------------------
// The awkward one — headings in Indonesian, matching no alias
// ---------------------------------------------------------------------------

const unknownHeaders = ['Kode Pesanan', 'Nama Barang', 'Kode Barang', 'Warna Ukuran', 'Jml', 'Harga']

const unknownRows = [
  ['INV-0001', 'Kaos Katun', 'TEE-BLK-M', 'Hitam M', 3, 50000],
  ['INV-0002', 'Kaos Katun', 'TEE-WHT-M', 'Putih M', 2, 50000],
  ['INV-0003', 'Jaket Hoodie', 'HOOD-NVY-L', 'Navy L', 1, 150000],
  ['INV-0004', 'Polo Pique', 'POLO-RED-S', 'Merah S', 4, 90000],
  ['INV-0005', 'Kaos Katun', 'TEE-BLK-L', 'Hitam L', 2, 50000]
]

const unknownBook = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(
  unknownBook,
  XLSX.utils.aoa_to_sheet([unknownHeaders, ...unknownRows]),
  'Sheet1'
)
XLSX.writeFile(unknownBook, join(OUTPUT_DIR, 'unknown-format.xlsx'))

console.log('Wrote sample files to', OUTPUT_DIR)
console.log(`  tiktok-orders.xlsx   ${tiktokRows.length} rows (data on sheet 2 of 2)`)
console.log(`  shopee-orders.xlsx   ${shopeeRows.length - 1} rows + 1 blank, title row above headers`)
console.log(`  lazada-orders.csv    ${lazadaRows.length} rows`)
console.log(`  unknown-format.xlsx  ${unknownRows.length} rows, headings match no alias`)