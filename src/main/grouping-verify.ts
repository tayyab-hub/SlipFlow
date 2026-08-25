import { app } from 'electron'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { NewSkuMapping, ProductionItem } from '@shared/types'
import { applyAppIdentity } from './app-identity'
import { openDatabase, type StitchFlowDatabase } from './db'
import { importSpreadsheet } from './excel/import-file'
import { createBatchFromPendingFiles } from './production/group-into-batch'

/**
 * Phase 4 verification: proves grouping and duplicate handling against the real sample
 * files, using the exact quantities in samples/generate-samples.mjs (samples/ itself is
 * a fixed fixture and is never regenerated — see samples/README.md).
 *
 * Run with `npm run grouping:verify`. Uses a throwaway database, same as db:verify and
 * import:verify.
 */

applyAppIdentity()

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

/** One mapping per shared SKU, wildcard variation/platform — see PROGRESS.md's Phase 4
 *  design note on why colour/size come from here rather than from parsing
 *  `raw_variation` (which uses three different separators across the sample files). */
const SHARED_SKU_MAPPINGS: NewSkuMapping[] = [
  { incomingSku: 'TEE-BLK-M', factorySku: 'TEE-BLK-M', factoryColour: 'Black', factorySize: 'M' },
  { incomingSku: 'TEE-BLK-L', factorySku: 'TEE-BLK-L', factoryColour: 'Black', factorySize: 'L' },
  { incomingSku: 'TEE-WHT-M', factorySku: 'TEE-WHT-M', factoryColour: 'White', factorySize: 'M' },
  { incomingSku: 'HOOD-NVY-L', factorySku: 'HOOD-NVY-L', factoryColour: 'Navy', factorySize: 'L' },
  { incomingSku: 'POLO-RED-S', factorySku: 'POLO-RED-S', factoryColour: 'Red', factorySize: 'S' }
  // TT-ONLY-CAP / SP-ONLY-SOCK / LZ-ONLY-BELT deliberately left unmapped.
]

function findItem(items: readonly ProductionItem[], factorySku: string): ProductionItem {
  const item = items.find((candidate) => candidate.factorySku === factorySku)
  if (!item) throw new Error(`No production item for factory SKU "${factorySku}"`)
  return item
}

/** Unmapped items have no factory SKU — found instead by the raw SKU named in the issue note. */
function findUnmappedItem(items: readonly ProductionItem[], rawSku: string): ProductionItem {
  const item = items.find(
    (candidate) => candidate.issueType === 'unknown_mapping' && candidate.issueNote.includes(rawSku)
  )
  if (!item) throw new Error(`No unmapped production item mentioning "${rawSku}"`)
  return item
}

async function verify(db: StitchFlowDatabase): Promise<void> {
  console.log('\nSetup: import the three marketplace samples, map the shared SKUs')

  const tiktok = await importSpreadsheet(db, join(SAMPLES, 'tiktok-orders.xlsx'))
  const shopee = await importSpreadsheet(db, join(SAMPLES, 'shopee-orders.xlsx'))
  const lazada = await importSpreadsheet(db, join(SAMPLES, 'lazada-orders.csv'))

  check('all three sample files imported cleanly', () => {
    expect(tiktok.status === 'imported', `tiktok status was ${tiktok.status}`)
    expect(shopee.status === 'imported', `shopee status was ${shopee.status}`)
    expect(lazada.status === 'imported', `lazada status was ${lazada.status}`)
  })

  const mappingsWritten = db.skuMappings.upsertMany(SHARED_SKU_MAPPINGS)
  check('sku_mappings written for the five shared SKUs', () => {
    expect(mappingsWritten === 5, `wrote ${mappingsWritten} mappings`)
  })

  console.log('\nRe-upload TikTok a second time — every row should become a duplicate')

  const tiktokAgain = await importSpreadsheet(db, join(SAMPLES, 'tiktok-orders.xlsx'))
  check('re-uploading the same file imports, flagged as duplicates, not rejected', () => {
    expect(tiktokAgain.status === 'imported', `status was ${tiktokAgain.status}`)
    expect(tiktokAgain.duplicateRows === 12, `duplicateRows was ${tiktokAgain.duplicateRows}`)
  })

  const reuploadedRows = db.importedOrders.listByFile(tiktokAgain.importFileId ?? 0)
  check('THE DEFAULT — every re-uploaded row is flagged is_duplicate, none acted on yet', () => {
    expect(reuploadedRows.length === 12, `stored ${reuploadedRows.length} rows`)
    expect(
      reuploadedRows.every((row) => row.isDuplicate),
      'not every re-uploaded row was flagged as a duplicate'
    )
  })

  console.log('\nGroup everything pending into one batch')

  const result = createBatchFromPendingFiles(db)
  const items = db.productionItems.listByBatch(result.batchId)

  check('duplicate rows from the re-upload were excluded from grouping', () => {
    expect(
      result.duplicateRowsExcluded === 12,
      `duplicateRowsExcluded was ${result.duplicateRowsExcluded}`
    )
  })

  check('three platform-only SKUs are unmapped, nothing else is', () => {
    expect(result.unmappedSkuCount === 3, `unmappedSkuCount was ${result.unmappedSkuCount}`)
    for (const sku of ['TT-ONLY-CAP', 'SP-ONLY-SOCK', 'LZ-ONLY-BELT']) {
      const item = findUnmappedItem(items, sku)
      expect(item.factorySku === '', `${sku} should have no factory SKU assigned`)
      expect(!item.isResolved, `${sku} should be held back from printing`)
    }
  })

  // Expected per-SKU totals, summed by hand from samples/generate-samples.mjs:
  //   TEE-BLK-M   TikTok 2+1+5=8   Shopee 1+4=5   Lazada 2+1=3   -> 16
  //   TEE-BLK-L   TikTok 1+2=3     Shopee 2       Lazada 1       -> 6
  //   TEE-WHT-M   TikTok 3+2=5     Shopee 2+1=3   Lazada 1       -> 9
  //   HOOD-NVY-L  TikTok 1+4=5     Shopee 1+2=3   Lazada 3       -> 11
  //   POLO-RED-S  TikTok 2+1=3     Shopee 3       Lazada 2       -> 8
  check('THE DEFINITION OF DONE — TEE-BLK-M sums to 16 units across all three platforms', () => {
    const item = findItem(items, 'TEE-BLK-M')
    expect(item.quantity === 16, `quantity was ${item.quantity}`)
    expect(item.colour === 'Black', `colour was "${item.colour}"`)
    expect(item.size === 'M', `size was "${item.size}"`)
    expect(item.issueType === '', `issueType was "${item.issueType}"`)
    expect(item.isResolved, 'TEE-BLK-M should not be held back')
    expect(
      item.sourcePlatforms === 'lazada,shopee,tiktok',
      `sourcePlatforms was "${item.sourcePlatforms}"`
    )
  })

  check('the other four shared SKUs also grouped correctly', () => {
    expect(findItem(items, 'TEE-BLK-L').quantity === 6, 'TEE-BLK-L total wrong')
    expect(findItem(items, 'TEE-WHT-M').quantity === 9, 'TEE-WHT-M total wrong')
    expect(findItem(items, 'HOOD-NVY-L').quantity === 11, 'HOOD-NVY-L total wrong')
    expect(findItem(items, 'POLO-RED-S').quantity === 8, 'POLO-RED-S total wrong')
  })

  check('batch totals: 8 lines, 61 units, 3 unresolved — stored totals match computed', () => {
    expect(items.length === 8, `production_items had ${items.length} rows`)
    expect(result.totals.items === 8, `totals.items was ${result.totals.items}`)
    expect(result.totals.units === 61, `totals.units was ${result.totals.units}`)
    expect(result.totals.unresolved === 3, `totals.unresolved was ${result.totals.unresolved}`)

    const batch = db.batches.getById(result.batchId)
    expect(batch !== null, 'batch was not found')
    expect(batch!.totalItems === 8, `stored total_items was ${batch!.totalItems}`)
    expect(batch!.totalUnits === 61, `stored total_units was ${batch!.totalUnits}`)
    expect(batch!.unresolvedCount === 3, `stored unresolved_count was ${batch!.unresolvedCount}`)
  })

  check('all four import files (3 originals + the re-upload) were assigned to the batch', () => {
    expect(db.importFiles.listUnassigned().length === 0, 'files remain unassigned')
  })

  console.log('\nBulk import a SKU-mapping spreadsheet')

  const { importSkuMappings } = await import('./excel/import-sku-mappings')
  const bulk = await importSkuMappings(db, join(SAMPLES, 'sku-mappings-bulk.csv'))

  check('bulk import writes the valid rows and reports the bad one, nothing partial', () => {
    expect(bulk.imported === 2, `imported was ${bulk.imported}`)
    expect(bulk.errors.length === 1, `errors had ${bulk.errors.length} entries`)
    expect(bulk.errors[0]?.reason.includes('Factory SKU'), `error reason was "${bulk.errors[0]?.reason}"`)

    const written = db.skuMappings.list({ search: 'TT-ONLY-CAP' })
    expect(written.length === 1, 'the valid TT-ONLY-CAP row from the bulk file was not written')
    expect(written[0]?.factoryColour === 'Grey', `factoryColour was "${written[0]?.factoryColour}"`)
  })
}

async function main(): Promise<void> {
  console.log('StitchFlow grouping verification')
  console.log(`  samples  ${SAMPLES}`)

  const tempPath = join(tmpdir(), `stitchflow-grouping-verify-${process.pid}.db`)
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
