import { app } from 'electron'
import { rmSync } from 'node:fs'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { applyAppIdentity } from './app-identity'
import { openDatabase, type StitchFlowDatabase } from './db'
import { resolveDatabasePath } from './db/paths'

/**
 * Phase 2 verification: insert and read back a row in every table.
 *
 * Run with `npm run db:verify`. Uses a throwaway database in the temp directory so it
 * never touches the operator's real data, and reports where the real database would
 * live so the `%APPDATA%\StitchFlow` requirement is checked rather than assumed.
 *
 * This is meant to stay useful: re-run it after any later change to the schema or the
 * repositories.
 */

// Same as the real entry point: identity and userData must be pinned before startup
// resolves any path, otherwise this reports a location the app would not actually use.
applyAppIdentity()

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

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function verify(db: StitchFlowDatabase): void {
  // Ids are shared between checks, so the later tables can reference the earlier rows
  // exactly the way the real import flow will.
  let batchId = 0
  let columnMappingId = 0
  let importFileId = 0

  console.log('\nTables')

  check('settings — write and read back', () => {
    db.settings.set('factory_name', 'Sunrise Garments')
    expect(db.settings.get('factory_name') === 'Sunrise Garments', 'value did not round-trip')
    expect(db.settings.getWithDefault('missing_key', 'A4') === 'A4', 'default not returned')
    expect(db.settings.getAll().length === 1, 'expected exactly one setting')
  })

  check('column_mappings — write and read back by signature', () => {
    const created = db.columnMappings.create({
      name: 'Shopee export',
      platform: 'shopee',
      headerSignature: 'order_id|sku|variation|quantity',
      skuColumn: 'SKU Reference No.',
      variationColumn: 'Variation Name',
      quantityColumn: 'Quantity',
      orderIdColumn: 'Order ID'
    })
    columnMappingId = created.id

    const found = db.columnMappings.findBySignature('order_id|sku|variation|quantity')
    expect(found?.id === created.id, 'signature lookup did not find the row')
    expect(found?.skuColumn === 'SKU Reference No.', 'sku_column did not round-trip')
    expect(found?.timesUsed === 0, 'times_used should start at zero')

    db.columnMappings.recordUse(created.id)
    expect(db.columnMappings.getById(created.id)?.timesUsed === 1, 'recordUse did not increment')
  })

  check('batches — write and read back', () => {
    const created = db.batches.create({ batchNumber: `${today()}-001`, name: 'Morning run' })
    batchId = created.id

    expect(created.status === 'draft', 'status should default to draft')
    expect(created.printedAt === null, 'printed_at should start null')
    expect(db.batches.getById(created.id)?.name === 'Morning run', 'name did not round-trip')
    expect(db.batches.findByNumber(created.batchNumber)?.id === created.id, 'lookup by number failed')
    expect(db.batches.countCreatedOn(today()) === 1, 'countCreatedOn should see today\'s batch')

    const printed = db.batches.markPrinted(created.id)
    expect(printed?.status === 'printed', 'markPrinted did not set status')
    expect(printed?.printedAt !== null, 'markPrinted did not stamp printed_at')
    db.batches.update(created.id, { status: 'draft', printedAt: null })
  })

  check('import_files — write and read back by hash', () => {
    const created = db.importFiles.create({
      batchId,
      columnMappingId,
      fileName: 'shopee-orders.xlsx',
      filePath: 'C:\\Orders\\shopee-orders.xlsx',
      fileHash: 'sha256:abc123',
      fileSize: 20_480,
      sheetName: 'Sheet1',
      platform: 'shopee',
      rowCount: 42,
      detectionStatus: 'auto'
    })
    importFileId = created.id

    expect(created.batchId === batchId, 'batch_id did not round-trip')
    expect(created.columnMappingId === columnMappingId, 'column_mapping_id did not round-trip')
    expect(db.importFiles.findByHash('sha256:abc123').length === 1, 'hash lookup failed')
    expect(db.importFiles.listByBatch(batchId).length === 1, 'listByBatch failed')
  })

  check('imported_orders — write and read back, duplicate hashes', () => {
    db.importedOrders.create({
      importFileId,
      batchId,
      rowNumber: 2,
      orderId: 'SP-1001',
      platform: 'shopee',
      rawSku: 'TSHIRT-RED-M',
      rawVariation: 'Red,M',
      quantity: 3,
      duplicateHash: 'hash-1'
    })
    const written = db.importedOrders.createMany([
      {
        importFileId,
        batchId,
        rowNumber: 3,
        orderId: 'SP-1002',
        rawSku: 'TSHIRT-RED-L',
        quantity: 1,
        duplicateHash: 'hash-2'
      }
    ])
    expect(written === 1, 'createMany did not report one insert')

    const rows = db.importedOrders.listByFile(importFileId)
    expect(rows.length === 2, `expected 2 order rows, got ${rows.length}`)
    expect(rows[0]?.quantity === 3, 'quantity did not round-trip')
    expect(rows[0]?.isDuplicate === false, 'is_duplicate should default to false')

    const existing = db.importedOrders.findExistingHashes(['hash-1', 'hash-unknown'])
    expect(existing.has('hash-1'), 'known hash not reported as existing')
    expect(!existing.has('hash-unknown'), 'unknown hash wrongly reported as existing')

    expect(db.importedOrders.markDuplicates([rows[0]!.id]) === 1, 'markDuplicates failed')
    expect(
      db.importedOrders.listByFile(importFileId)[0]?.isDuplicate === true,
      'is_duplicate was not set'
    )
  })

  check('sku_mappings — write, read back, and prefer the specific match', () => {
    const general = db.skuMappings.create({
      incomingSku: 'TSHIRT-RED-M',
      factorySku: 'FS-100',
      factoryColour: 'Red',
      factorySize: 'M'
    })
    expect(db.skuMappings.getById(general.id)?.factorySku === 'FS-100', 'factory_sku lost')

    // Case-insensitive matching (COLLATE NOCASE).
    expect(
      db.skuMappings.findBestMatch({ incomingSku: 'tshirt-red-m' })?.id === general.id,
      'lookup should be case-insensitive'
    )

    // A platform-specific row must win over the catch-all row.
    const specific = db.skuMappings.upsert({
      incomingSku: 'TSHIRT-RED-M',
      platform: 'lazada',
      factorySku: 'FS-100-LZ',
      factoryColour: 'Red',
      factorySize: 'M'
    })
    const matched = db.skuMappings.findBestMatch({
      incomingSku: 'TSHIRT-RED-M',
      platform: 'lazada'
    })
    expect(matched?.id === specific.id, 'platform-specific mapping did not win')
    expect(
      db.skuMappings.findBestMatch({ incomingSku: 'TSHIRT-RED-M' })?.id === general.id,
      'catch-all mapping should still match when no platform is given'
    )

    // upsert on the same incoming key updates rather than duplicating.
    db.skuMappings.upsert({
      incomingSku: 'TSHIRT-RED-M',
      platform: 'lazada',
      factorySku: 'FS-100-LZ2'
    })
    expect(db.skuMappings.count() === 2, `expected 2 mappings, got ${db.skuMappings.count()}`)
    expect(
      db.skuMappings.findBestMatch({ incomingSku: 'TSHIRT-RED-M', platform: 'lazada' })
        ?.factorySku === 'FS-100-LZ2',
      'upsert did not overwrite the factory side'
    )
    expect(db.skuMappings.list({ search: 'TSHIRT' }).length === 2, 'search returned wrong count')
  })

  check('production_items — write, read back, totals, printable filter', () => {
    db.productionItems.createMany([
      { batchId, factorySku: 'FS-100', colour: 'Red', size: 'M', quantity: 4, sortOrder: 1 },
      { batchId, factorySku: 'FS-101', colour: 'Blue', size: 'L', quantity: 6, sortOrder: 2 },
      {
        batchId,
        factorySku: '',
        colour: 'Green',
        size: 'S',
        quantity: 2,
        issueType: 'missing_sku',
        issueNote: 'No mapping found',
        isResolved: false,
        sortOrder: 3
      }
    ])

    const all = db.productionItems.listByBatch(batchId)
    expect(all.length === 3, `expected 3 production rows, got ${all.length}`)
    expect(all[0]?.quantity === 4, 'quantity did not round-trip')
    expect(all[0]?.isResolved === true, 'is_resolved should default to true')

    const printable = db.productionItems.listPrintable(batchId)
    expect(printable.length === 2, 'the flagged row must be excluded from printing')

    const unresolved = db.productionItems.listUnresolved(batchId)
    expect(unresolved.length === 1, 'the flagged row should appear under Needs Review')

    const totals = db.productionItems.totalsForBatch(batchId)
    expect(totals.items === 3, `totals.items was ${totals.items}`)
    expect(totals.units === 12, `totals.units was ${totals.units}`)
    expect(totals.unresolved === 1, `totals.unresolved was ${totals.unresolved}`)

    const fixed = db.productionItems.resolve(unresolved[0]!.id)
    expect(fixed?.isResolved === true && fixed.issueType === '', 'resolve() did not clear the issue')
    expect(db.productionItems.listPrintable(batchId).length === 3, 'fixed row should now print')
  })

  console.log('\nBehaviour')

  check('transaction rolls back on error', () => {
    const before = db.skuMappings.count()
    try {
      db.transaction(() => {
        db.skuMappings.create({ incomingSku: 'ROLLBACK-ME', factorySku: 'FS-999' })
        throw new Error('deliberate failure')
      })
    } catch {
      // expected
    }
    expect(db.skuMappings.count() === before, 'the failed transaction was not rolled back')
  })

  check('foreign keys cascade — deleting a batch clears its rows', () => {
    expect(db.productionItems.listByBatch(batchId).length > 0, 'nothing to cascade')
    db.batches.remove(batchId)
    expect(db.productionItems.listByBatch(batchId).length === 0, 'production_items were orphaned')
    expect(db.importedOrders.listByBatch(batchId).length === 0, 'imported_orders were orphaned')
  })

  check('STRICT tables reject a wrong-typed value', () => {
    let rejected = false
    try {
      db.raw.prepare('INSERT INTO batches (batch_number, created_at, updated_at, total_units) VALUES (?, ?, ?, ?)')
        .run('strict-test', 'now', 'now', 'not-a-number')
    } catch {
      rejected = true
    }
    expect(rejected, 'a STRICT table accepted text in an INTEGER column')
  })
}

function main(): void {
  const realPath = resolveDatabasePath()
  console.log('StitchFlow database verification')
  console.log(`  app name       ${app.getName()}`)
  console.log(`  userData       ${app.getPath('userData')}`)
  console.log(`  live database  ${realPath}`)
  console.log(`  exists now     ${existsSync(realPath) ? 'yes' : 'no (run the app once)'}`)

  const tempPath = join(tmpdir(), `stitchflow-verify-${process.pid}.db`)
  console.log(`  test database  ${tempPath}`)

  let db: StitchFlowDatabase | null = null
  try {
    db = openDatabase(tempPath)
    console.log(`  schema version ${db.schemaVersion}`)
    verify(db)

    // Re-opening must be a no-op, not a second attempt to create the tables.
    db.close()
    db = openDatabase(tempPath)
    check('migrations are idempotent on reopen', () => {
      expect(db!.settings.get('factory_name') === 'Sunrise Garments', 'data lost on reopen')
    })
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
