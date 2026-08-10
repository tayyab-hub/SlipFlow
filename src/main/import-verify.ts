import { app } from 'electron'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { EMPTY_FIELD_MAPPING, type FieldMapping, type UploadResult } from '@shared/types'
import { applyAppIdentity } from './app-identity'
import { openDatabase, type StitchFlowDatabase } from './db'
import { importSpreadsheet } from './excel/import-file'

applyAppIdentity()

/**
 * Phase 3 verification: runs the four sample files through the real import pipeline and
 * checks what came out.
 *
 * Run with `npm run import:verify`. Uses a throwaway database, so it never touches the
 * operator's data. Sample paths are resolved from the working directory, which npm
 * scripts set to the project root.
 *
 * This is the automated half of the phase's Definition of Done — including the part that
 * matters most and is easy to get wrong: that a manually mapped layout is remembered and
 * reused on the next upload of the same format.
 */

const SAMPLES = join(process.cwd(), 'samples')

let failures = 0

function check(name: string, run: () => void): void {
  try {
    run()
    console.log(`  PASS  ${name}`)
  } catch (error) {
    failures += 1
    console.log(`  FAIL  ${name}`)
    console.log(`        ${error instanceof Error ? error.message : String(error)}`)
  }
}

function expect(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function summarise(result: UploadResult): string {
  return [
    result.status,
    `platform=${result.platform}`,
    `rows=${result.rowCount}`,
    `detection=${result.detectionStatus}`,
    result.usedSavedMapping ? 'saved-mapping' : '',
    result.blankRowsSkipped > 0 ? `blank=${result.blankRowsSkipped}` : ''
  ]
    .filter(Boolean)
    .join('  ')
}

async function verify(db: StitchFlowDatabase): Promise<void> {
  console.log('\nAutomatic detection')

  const tiktok = await importSpreadsheet(db, join(SAMPLES, 'tiktok-orders.xlsx'))
  console.log(`        tiktok-orders.xlsx   ${summarise(tiktok)}`)

  check('TikTok export — 12 rows, platform detected, columns auto-detected', () => {
    expect(tiktok.status === 'imported', `status was ${tiktok.status}: ${tiktok.message}`)
    expect(tiktok.platform === 'tiktok', `platform was ${tiktok.platform}`)
    expect(tiktok.rowCount === 12, `rowCount was ${tiktok.rowCount}`)
    expect(tiktok.detectionStatus === 'auto', `detectionStatus was ${tiktok.detectionStatus}`)
    expect(tiktok.mapping.sku === 'Seller SKU', `sku column was "${tiktok.mapping.sku}"`)
    expect(tiktok.mapping.quantity === 'Quantity', `quantity column was "${tiktok.mapping.quantity}"`)
  })

  check('TikTok export — orders were read from the second sheet, not the summary', () => {
    expect(tiktok.sheetName === 'Orders', `used sheet "${tiktok.sheetName}"`)
    expect(tiktok.sheetNames.length === 2, `workbook had ${tiktok.sheetNames.length} sheets`)
  })

  const shopee = await importSpreadsheet(db, join(SAMPLES, 'shopee-orders.xlsx'))
  console.log(`        shopee-orders.xlsx   ${summarise(shopee)}`)

  check('Shopee export — 9 rows, title row skipped, blank row not counted', () => {
    expect(shopee.status === 'imported', `status was ${shopee.status}: ${shopee.message}`)
    expect(shopee.platform === 'shopee', `platform was ${shopee.platform}`)
    expect(shopee.rowCount === 9, `rowCount was ${shopee.rowCount}`)
    expect(shopee.blankRowsSkipped === 1, `blankRowsSkipped was ${shopee.blankRowsSkipped}`)
    expect(
      shopee.mapping.sku === 'SKU Reference No.',
      `sku column was "${shopee.mapping.sku}"`
    )
  })

  const lazada = await importSpreadsheet(db, join(SAMPLES, 'lazada-orders.csv'))
  console.log(`        lazada-orders.csv    ${summarise(lazada)}`)

  check('Lazada CSV — 7 rows, camelCase headers matched after normalisation', () => {
    expect(lazada.status === 'imported', `status was ${lazada.status}: ${lazada.message}`)
    expect(lazada.platform === 'lazada', `platform was ${lazada.platform}`)
    expect(lazada.rowCount === 7, `rowCount was ${lazada.rowCount}`)
    expect(lazada.mapping.sku === 'sellerSku', `sku column was "${lazada.mapping.sku}"`)
    expect(lazada.mapping.quantity === 'quantity', `quantity column was "${lazada.mapping.quantity}"`)
  })

  check('all three marketplaces — 28 order lines, 61 units stored', () => {
    const rows = db.raw.prepare('SELECT COUNT(*) AS n, SUM(quantity) AS units FROM imported_orders').get()
    expect(Number(rows?.['n']) === 28, `stored ${String(rows?.['n'])} rows`)
    expect(Number(rows?.['units']) === 61, `stored ${String(rows?.['units'])} units`)
  })

  check('order lines kept their raw values and a duplicate hash', () => {
    const row = db.importedOrders
      .listByFile(tiktok.importFileId ?? 0)
      .find((order) => order.orderId === 'TT2608010011')
    expect(row !== undefined, 'could not find order TT2608010011')
    expect(row!.rawSku === 'TEE-BLK-M', `rawSku was "${row!.rawSku}"`)
    expect(row!.rawVariation === 'Black,M', `rawVariation was "${row!.rawVariation}"`)
    expect(row!.quantity === 5, `quantity was ${row!.quantity}`)
    expect(row!.duplicateHash.length === 64, 'duplicate hash is not a sha256')
  })

  console.log('\nManual mapping')

  const weirdPath = join(SAMPLES, 'unknown-format.xlsx')
  const filesBefore = db.importFiles.listUnassigned().length

  const rejected = await importSpreadsheet(db, weirdPath)
  console.log(`        unknown-format.xlsx  ${summarise(rejected)}`)

  check('unknown layout — detection declines and asks for help', () => {
    expect(rejected.status === 'needs_mapping', `status was ${rejected.status}`)
    expect(rejected.preview !== null, 'no preview was offered')
    expect(rejected.preview!.headers.length === 6, `preview had ${rejected.preview!.headers.length} headers`)
    expect(rejected.preview!.sampleRows.length === 5, 'preview should show the sample rows')
    expect(rejected.preview!.reason !== '', 'no reason was given')
  })

  check('a file that needs mapping writes NOTHING to the database', () => {
    expect(
      db.importFiles.listUnassigned().length === filesBefore,
      'an import_files row was created for a file that was not imported'
    )
  })

  const manualMapping: FieldMapping = {
    ...EMPTY_FIELD_MAPPING,
    orderId: 'Kode Pesanan',
    sku: 'Kode Barang',
    variation: 'Warna Ukuran',
    quantity: 'Jml'
  }

  const mapped = await importSpreadsheet(db, weirdPath, {
    mapping: manualMapping,
    remember: true,
    mappingName: 'Workshop invoice layout',
    platform: 'unknown'
  })
  console.log(`        after mapping        ${summarise(mapped)}`)

  check('operator mapping imports the file and saves the layout', () => {
    expect(mapped.status === 'imported', `status was ${mapped.status}: ${mapped.message}`)
    expect(mapped.rowCount === 5, `rowCount was ${mapped.rowCount}`)
    expect(mapped.detectionStatus === 'manual', `detectionStatus was ${mapped.detectionStatus}`)
    expect(mapped.mappingRemembered, 'the mapping was not saved')
    expect(db.columnMappings.list().length === 1, 'expected exactly one saved mapping')

    const rows = db.importedOrders.listByFile(mapped.importFileId ?? 0)
    expect(rows.length === 5, `stored ${rows.length} rows`)
    expect(rows[0]?.rawSku === 'TEE-BLK-M', `rawSku was "${rows[0]?.rawSku}"`)
    expect(rows[0]?.quantity === 3, `quantity was ${rows[0]?.quantity}`)
    expect(rows[0]?.rawVariation === 'Hitam M', `rawVariation was "${rows[0]?.rawVariation}"`)
  })

  // The Definition of Done: upload the same format again, with no mapping supplied.
  const remembered = await importSpreadsheet(db, weirdPath)
  console.log(`        re-upload            ${summarise(remembered)}`)

  check('THE REMEMBERED CASE — same format re-uploaded imports with no questions', () => {
    expect(remembered.status === 'imported', `status was ${remembered.status}: ${remembered.message}`)
    expect(remembered.usedSavedMapping, 'the saved mapping was not used')
    expect(remembered.rowCount === 5, `rowCount was ${remembered.rowCount}`)
    expect(remembered.preview === null, 'the operator was asked to map again')
    expect(
      db.columnMappings.list()[0]?.timesUsed === 1,
      'the saved mapping did not record that it was used'
    )
  })

  check('re-uploading the same rows reports them as duplicates (Phase 4 acts on this)', () => {
    expect(remembered.duplicateRows === 5, `duplicateRows was ${remembered.duplicateRows}`)
  })

  console.log('\nBad input')

  const missing = await importSpreadsheet(db, join(SAMPLES, 'does-not-exist.xlsx'))
  check('missing file — failed status, no crash, operator-readable message', () => {
    expect(missing.status === 'failed', `status was ${missing.status}`)
    expect(missing.message.includes('could not be opened'), `message was "${missing.message}"`)
  })

  const wrongType = await importSpreadsheet(db, join(SAMPLES, 'README.md'))
  check('unsupported extension — refused before any parsing', () => {
    expect(wrongType.status === 'failed', `status was ${wrongType.status}`)
    expect(wrongType.message.includes('.xlsx'), `message was "${wrongType.message}"`)
  })
}

async function main(): Promise<void> {
  console.log('StitchFlow import verification')
  console.log(`  samples  ${SAMPLES}`)

  const tempPath = join(tmpdir(), `stitchflow-import-verify-${process.pid}.db`)
  console.log(`  test db  ${tempPath}`)

  let db: StitchFlowDatabase | null = null
  try {
    db = openDatabase(tempPath)
    await verify(db)
  } catch (error) {
    failures += 1
    console.error('\nVerification aborted:', error)
  } finally {
    db?.close()
    for (const suffix of ['', '-wal', '-shm']) {
      rmSync(`${tempPath}${suffix}`, { force: true })
    }
  }

  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) FAILED.`)
  app.exit(failures === 0 ? 0 : 1)
}

void app.whenReady().then(main)