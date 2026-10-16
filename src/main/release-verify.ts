import { app } from 'electron'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as XLSX from 'xlsx'
import { closeDatabase, getDatabase, initialiseDatabase, openDatabase } from './db'
import { parseQuantity, importSpreadsheet, buildDuplicateHash } from './excel/import-file'
import { readSpreadsheet } from './excel/read-workbook'
import { createBatchFromPendingFiles } from './production/group-into-batch'
import { mergeProductionItems, recomputeBatchTotals } from './production/review-items'
import { assertComplete, requireDraft, requirePrintable } from './production/batch-policy'
import { batchEvidence, saveSeller, listSellers, sourceOrders } from './db/repositories/delivery'
import { createBackup, restoreBackup, verifyBackup } from './backups'
import { getSettings, validateSettings } from './settings'
import { DEFAULT_SETTINGS } from '@shared/delivery'
import { printDocument } from './production/print-document'
import { printWindow } from './ipc/print'
import { importSkuMappings } from './excel/import-sku-mappings'

const directory = mkdtempSync(join(tmpdir(), 'slipflow-release-'))
app.setPath('userData', join(directory, 'electron'))
app.disableHardwareAcceleration()
app.on('window-all-closed', () => {
  /* verification continues after each print window closes */
})
let passed = 0,
  failed = 0
async function check(name: string, run: () => unknown | Promise<unknown>): Promise<void> {
  try {
    await run()
    passed++
    console.log(`PASS ${name}`)
  } catch (error) {
    failed++
    console.error(`FAIL ${name}: ${String(error)}`)
  }
}
function csv(name: string, rows: string): string {
  const path = join(directory, name)
  writeFileSync(path, rows)
  return path
}
const header = 'Order ID,SKU,Variation,Quantity,Order Line ID,Product Name\n'

async function main(): Promise<void> {
  const db = initialiseDatabase(join(directory, 'test.db'))
  try {
    for (const value of [
      '0',
      '-1',
      '1.5',
      '3.0',
      '2 pcs',
      '1,000',
      '1e3',
      '1-2',
      '',
      'Infinity',
      '9007199254740992',
      '1000000001',
      '=1+2'
    ]) {
      await check(`quantity rejects ${JSON.stringify(value)}`, () =>
        assert.equal(parseQuantity(value), null)
      )
    }
    await check('quantity preserves whole integers', () => {
      assert.equal(parseQuantity(' 12 '), 12)
      assert.equal(parseQuantity('1000000000'), 1_000_000_000)
    })
    saveSeller(db, 'Synthetic Shop A', 'tiktok')
    saveSeller(db, 'Synthetic Shop B', 'tiktok')
    saveSeller(db, 'Synthetic Shopee', 'shopee')
    const [shopA, shopB] = listSellers(db).filter((s) => s.platform === 'tiktok')
    const source = csv(
      'orders.csv',
      header + 'O1,TEE,"Black,M",2,L1,Tee\nO1,TEE,"Black,M",3,L2,Tee\n'
    )
    await check('preview writes no orders or saved mapping usage', async () => {
      const r = await importSpreadsheet(db, source, {
        sellerAccountId: shopA!.id,
        previewOnly: true
      })
      assert.equal(r.status, 'needs_mapping')
      assert.equal(db.importedOrders.count(), 0)
    })
    const imported = await importSpreadsheet(db, source, { sellerAccountId: shopA!.id })
    await check('CSV import preserves seller and separate order lines', () => {
      assert.equal(imported.rowCount, 2)
      assert.equal(
        db.importedOrders.listByFile(imported.importFileId!)[0]?.sellerAccountId,
        shopA!.id
      )
    })
    await check('identical file reimport excludes every duplicate', async () =>
      assert.equal(
        (await importSpreadsheet(db, source, { sellerAccountId: shopA!.id })).duplicateRows,
        2
      )
    )
    await check('different seller does not collide', async () =>
      assert.equal(
        (await importSpreadsheet(db, source, { sellerAccountId: shopB!.id })).duplicateRows,
        0
      )
    )
    await check('different marketplace produces a different key', () =>
      assert.notEqual(
        buildDuplicateHash({
          orderId: 'A',
          rawSku: 'B',
          rawVariation: 'C',
          quantity: 2,
          platform: 'tiktok'
        }),
        buildDuplicateHash({
          orderId: 'A',
          rawSku: 'B',
          rawVariation: 'C',
          quantity: 2,
          platform: 'shopee'
        })
      )
    )
    await check('changed quantity retains row for review', async () => {
      const r = await importSpreadsheet(
        db,
        csv('changed.csv', header + 'O1,TEE,"Black,M",8,L1,Tee\n'),
        { sellerAccountId: shopA!.id }
      )
      assert.equal(r.duplicateRows, 0)
      assert.match(
        db.importedOrders.listByFile(r.importFileId!)[0]!.validationNote,
        /Possible repeated/
      )
    })
    await check('repeated lines without IDs remain distinct', async () => {
      const path = csv('repeat.csv', header + 'R1,TEE,"Black,M",2,,Tee\nR1,TEE,"Black,M",2,,Tee\n')
      const r = await importSpreadsheet(db, path, { sellerAccountId: shopA!.id })
      assert.equal(r.duplicateRows, 0)
      assert.equal(
        new Set(db.importedOrders.listByFile(r.importFileId!).map((o) => o.duplicateHash)).size,
        2
      )
      assert.equal(
        (await importSpreadsheet(db, path, { sellerAccountId: shopA!.id })).duplicateRows,
        2
      )
    })
    await check('ambiguous overlaps across changed files require review', async () => {
      const r = await importSpreadsheet(
        db,
        csv('overlap.csv', header + 'R1,TEE,"Black,M",2,,Another label\n'),
        { sellerAccountId: shopA!.id }
      )
      assert.equal(r.duplicateRows, 0)
      assert.ok(db.importedOrders.listByFile(r.importFileId!)[0]!.validationNote)
    })
    db.skuMappings.create({
      incomingSku: 'TEE',
      factorySku: 'FACT-TEE',
      factoryColour: 'Black',
      factorySize: 'M'
    })
    const bad = await importSpreadsheet(
      db,
      csv(
        'bad.csv',
        header +
          'B1,TEE,"Black,M",2.8,B1,Tee\nB2,TEE,"Black,M",4,B2,Tee\nB3,UNKNOWN,"Blue,XL",1,B3,Unknown\n'
      ),
      { sellerAccountId: shopA!.id }
    )
    const batch = createBatchFromPendingFiles(db, [bad.importFileId!])
    await check('invalid quantity is isolated from valid group', () => {
      const items = db.productionItems.listByBatch(batch.batchId)
      assert.equal(items.length, 3)
      assert.equal(items.filter((i) => i.issueType === 'invalid_quantity').length, 1)
      assert.equal(items.find((i) => i.isResolved)?.quantity, 4)
    })
    await check('unknown SKU never auto-resolves', () =>
      assert.equal(
        db.productionItems.listByBatch(batch.batchId).find((i) => i.factorySku === 'UNKNOWN')
          ?.isResolved,
        false
      )
    )
    await check('production provenance links to actual source row', () => {
      const item = db.productionItems.listByBatch(batch.batchId)[0]!
      assert.equal(sourceOrders(db, batch.batchId, item.id).length, 1)
      assert.equal(sourceOrders(db, batch.batchId, item.id)[0]?.rowNumber, 2)
    })
    await check('incomplete batch cannot print', () =>
      assert.throws(() => requirePrintable(db, batch.batchId))
    )
    await check('cannot batch an already assigned file', () =>
      assert.throws(() => createBatchFromPendingFiles(db, [bad.importFileId!]))
    )
    await check('cannot batch repeated file IDs', () =>
      assert.throws(() =>
        createBatchFromPendingFiles(db, [imported.importFileId!, imported.importFileId!])
      )
    )
    const clean = createBatchFromPendingFiles(db, [imported.importFileId!])
    await check('grouped quantities reconcile to source', () => {
      assert.equal(clean.totals.units, 5)
      assert.equal(batchEvidence(db, clean.batchId).sourceUnits, 5)
    })
    await check('ready transition validates complete batch', () => {
      assertComplete(db, clean.batchId)
      db.batches.update(clean.batchId, { status: 'ready' })
      requirePrintable(db, clean.batchId)
    })
    await check('ready batch is locked against editing', () =>
      assert.throws(() => requireDraft(db, clean.batchId))
    )
    db.batches.update(clean.batchId, { status: 'draft' })
    const cleanItem = db.productionItems.listByBatch(clean.batchId)[0]!
    await check('merge cannot double count repeated ID', () =>
      assert.throws(() => mergeProductionItems(db, clean.batchId, [cleanItem.id, cleanItem.id]))
    )
    const other = db.productionItems.create({
      batchId: clean.batchId,
      factorySku: 'OTHER',
      colour: 'Blue',
      size: 'S',
      quantity: 2
    })
    await check('merge rejects different identities', () =>
      assert.throws(() => mergeProductionItems(db, clean.batchId, [cleanItem.id, other.id]))
    )
    db.productionItems.remove(other.id)
    db.productionItems.update(cleanItem.id, { quantity: 6 })
    recomputeBatchTotals(db, clean.batchId)
    await check('changed totals require reconciliation note', () =>
      assert.throws(() => assertComplete(db, clean.batchId))
    )
    db.productionItems.update(cleanItem.id, { quantity: 5 })
    recomputeBatchTotals(db, clean.batchId)
    db.batches.update(clean.batchId, { status: 'ready' })
    await check('empty, corrupted and duplicate-heading files fail safely', async () => {
      for (const p of [
        csv('empty.csv', ''),
        csv('corrupt.xlsx', 'not an xlsx file'),
        csv('headers.csv', 'SKU,SKU,Quantity\nA,B,1')
      ]) {
        const r = await importSpreadsheet(db, p)
        assert.ok(r.status === 'failed' || r.status === 'needs_mapping')
      }
    })
    await check('XLS and explicit worksheet selection', async () => {
      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(
        workbook,
        XLSX.utils.aoa_to_sheet([['Summary'], ['Synthetic']]),
        'Cover'
      )
      XLSX.utils.book_append_sheet(
        workbook,
        XLSX.utils.aoa_to_sheet([
          ['Order ID', 'SKU', 'Variation', 'Quantity'],
          ['XLS1', 'TEE', 'Black,M', 3]
        ]),
        'Orders'
      )
      const path = join(directory, 'synthetic.xls')
      writeFileSync(path, XLSX.write(workbook, { bookType: 'biff8', type: 'buffer' }))
      const data = await readSpreadsheet(path, 'Orders')
      assert.equal(data.rows.length, 1)
      assert.equal(data.sheetName, 'Orders')
    })
    await check('formula workbooks are refused', async () => {
      const wb = XLSX.utils.book_new()
      const ws = XLSX.utils.aoa_to_sheet([
        ['SKU', 'Variation', 'Quantity'],
        ['TEE', 'Black,M', 2]
      ])
      ws.C2 = { t: 'n', v: 2, f: '1+1' }
      XLSX.utils.book_append_sheet(wb, ws, 'Orders')
      const p = join(directory, 'formula.xlsx')
      writeFileSync(p, XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }))
      await assert.rejects(readSpreadsheet(p), /Formula/)
    })
    await check('oversized files rejected before parsing', async () => {
      const p = join(directory, 'large.csv')
      writeFileSync(p, Buffer.alloc(20 * 1024 * 1024 + 1))
      await assert.rejects(readSpreadsheet(p), /20 MiB/)
    })
    await check('mapping conflicts do not overwrite', async () => {
      const p = csv(
        'mapping.csv',
        'Incoming SKU,Factory SKU,Factory Colour,Factory Size\nTEE,WRONG,White,S\n'
      )
      const r = await importSkuMappings(db, p)
      assert.equal(r.imported, 0)
      assert.equal(db.skuMappings.findBestMatch({ incomingSku: 'TEE' })?.factorySku, 'FACT-TEE')
    })
    await check('settings persist and reject invalid retention', () => {
      db.settings.set(
        'appPreferences',
        JSON.stringify({ ...DEFAULT_SETTINGS, factoryName: 'Synthetic Factory' })
      )
      assert.equal(getSettings(db).factoryName, 'Synthetic Factory')
      assert.throws(() => validateSettings({ ...DEFAULT_SETTINGS, backupRetention: -1 }))
    })
    await check('print HTML escapes untrusted text and includes correct totals', () => {
      db.settings.set(
        'appPreferences',
        JSON.stringify({ ...DEFAULT_SETTINGS, factoryName: '<script>unsafe</script>' })
      )
      const html = printDocument(db, clean.batchId, 'standard')
      assert.ok(!html.includes('<script>'))
      assert.ok(html.includes('TOTAL 5 UNITS'))
      assert.ok(html.includes('Synthetic Shop A'))
    })
    db.settings.set(
      'appPreferences',
      JSON.stringify({ ...DEFAULT_SETTINGS, factoryName: 'SlipFlow Demonstration Factory' })
    )
    await check('A4 PDF renders from approved database records', async () => {
      const window = await printWindow(printDocument(db, clean.batchId, 'standard'))
      try {
        const pdf = await window.webContents.printToPDF({ pageSize: 'A4', preferCSSPageSize: true })
        assert.equal(pdf.subarray(0, 4).toString(), '%PDF')
        mkdirSync('temp/evidence', { recursive: true })
        writeFileSync('temp/evidence/tailor-slip.pdf', pdf)
        assert.equal(db.batches.getById(clean.batchId)?.status, 'ready')
      } finally {
        window.destroy()
      }
    })
    await check('multi-page A4 output includes 120 rows', async () => {
      const b = db.batches.create({
        batchNumber: 'MULTIPAGE',
        notes: 'Synthetic manual entries for pagination verification.'
      })
      for (let i = 0; i < 120; i++)
        db.productionItems.create({
          batchId: b.id,
          factorySku: `TEST-${String(i).padStart(3, '0')}`,
          colour: 'Black',
          size: 'M',
          quantity: 1,
          isManual: true
        })
      recomputeBatchTotals(db, b.id)
      db.batches.update(b.id, { status: 'ready' })
      requirePrintable(db, b.id)
      const w = await printWindow(printDocument(db, b.id, 'standard'))
      try {
        const pdf = await w.webContents.printToPDF({ pageSize: 'A4', preferCSSPageSize: true })
        writeFileSync('temp/evidence/multipage.pdf', pdf)
        assert.ok(pdf.length > 10000)
      } finally {
        w.destroy()
      }
    })
    await check('large synthetic import benchmark preserves 10,000 units', async () => {
      const path = csv(
        'benchmark.csv',
        header +
          Array.from({ length: 10000 }, (_, i) => `BENCH-${i},TEE,"Black,M",1,LINE-${i},Tee`).join(
            '\n'
          )
      )
      const started = performance.now()
      const r = await importSpreadsheet(db, path, { sellerAccountId: shopA!.id })
      assert.equal(r.rowCount, 10000)
      assert.equal(
        db.importedOrders.listByFile(r.importFileId!).reduce((s, o) => s + o.quantity, 0),
        10000
      )
      console.log(`BENCHMARK 10,000 rows ${(performance.now() - started).toFixed(0)} ms`)
    })
    const selective = await importSpreadsheet(
      db,
      csv(
        'selective.csv',
        header + 'SELECT1,TEE,"Black,M",2,SELECT1,Tee\nSELECT2,TEE,"Black,M",3,SELECT2,Tee\n'
      ),
      { sellerAccountId: shopA!.id }
    )
    const selectedRows = db.importedOrders.listByFile(selective.importFileId!)
    const partial = createBatchFromPendingFiles(
      db,
      [selective.importFileId!],
      'Partial selection',
      [selectedRows[0]!.id]
    )
    await check('individual selection leaves other rows pending', () => {
      assert.equal(partial.totals.units, 2)
      assert.equal(db.importedOrders.getById(selectedRows[1]!.id)?.batchId, null)
      assert.equal(db.importFiles.getById(selective.importFileId!)?.batchId, null)
    })
    await check('selection rejects already batched and foreign source rows', () => {
      assert.throws(() =>
        createBatchFromPendingFiles(db, [selective.importFileId!], '', [selectedRows[0]!.id])
      )
      assert.throws(() =>
        createBatchFromPendingFiles(db, [selective.importFileId!], '', [cleanItem.id + 1000000])
      )
    })
    const remainder = createBatchFromPendingFiles(db, [selective.importFileId!])
    await check('remaining rows reconcile across two batches and keep provenance', () => {
      assert.equal(remainder.totals.units, 3)
      assert.equal(batchEvidence(db, partial.batchId).sourceUnits, 2)
      assert.equal(batchEvidence(db, remainder.batchId).sourceUnits, 3)
      assert.equal(db.importFiles.listByBatch(partial.batchId)[0]?.id, selective.importFileId)
      assert.equal(db.importFiles.listByBatch(remainder.batchId)[0]?.id, selective.importFileId)
    })
    const before = db.importedOrders.count(),
      snapshot = createBackup(db, join(directory, 'backups'))
    await check('WAL-safe backup verifies and retains committed data', () => {
      verifyBackup(snapshot)
      const copy = openDatabase(snapshot)
      try {
        assert.equal(copy.importedOrders.count(), before)
      } finally {
        copy.close()
      }
    })
    db.settings.set('restore-marker', 'after backup')
    await check('restore replaces snapshot with recovery copy and persistence', () => {
      const recovery = restoreBackup(snapshot, join(directory, 'backups'))
      verifyBackup(recovery)
      assert.equal(getDatabase().settings.get('restore-marker'), null)
      assert.equal(getDatabase().importedOrders.count(), before)
      const live = getDatabase().filePath
      closeDatabase()
      initialiseDatabase(live)
      assert.equal(getDatabase().importedOrders.count(), before)
    })
    await check('corrupt restoration leaves current database usable', () => {
      assert.throws(() => restoreBackup(csv('broken.db', 'bad'), join(directory, 'backups')))
      assert.equal(getDatabase().importedOrders.count(), before)
    })
    await check(
      'legacy migration preserves data, makes a recovery snapshot and requires review',
      () => {
        const path = join(directory, 'legacy.db'),
          old = new DatabaseSync(path)
        old.exec(readFileSync('src/main/db/migrations/0001_init.sql', 'utf8'))
        old.exec(
          "CREATE TABLE schema_migrations(id INTEGER PRIMARY KEY,name TEXT NOT NULL,applied_at TEXT NOT NULL) STRICT; INSERT INTO schema_migrations VALUES(1,'0001_init','2026-01-01'); INSERT INTO settings VALUES('legacy-marker','keep','2026-01-01'); INSERT INTO batches(id,batch_number,created_at,updated_at) VALUES(1,'LEGACY','2026-01-01','2026-01-01'); INSERT INTO production_items(batch_id,factory_sku,colour,size,quantity,created_at,updated_at) VALUES(1,'LEGACY','Blue','M',2,'2026-01-01','2026-01-01')"
        )
        old.close()
        const migrated = openDatabase(path)
        try {
          assert.equal(migrated.settings.get('legacy-marker'), 'keep')
          assert.equal(migrated.productionItems.listByBatch(1)[0]?.quantity, 2)
          assert.equal(migrated.productionItems.listUnresolved(1).length, 1)
        } finally {
          migrated.close()
        }
      }
    )
  } finally {
    closeDatabase()
    // Electron still owns files in userData until process exit. The runner removes this directory afterwards.
    console.log(`VERIFY_TEMP ${directory}`)
  }
  console.log(`RELEASE VERIFY: ${passed} passed, ${failed} failed`)
  app.exit(failed ? 1 : 0)
}
void app
  .whenReady()
  .then(main)
  .catch((error) => {
    console.error(error)
    closeDatabase()
    app.exit(1)
  })
