import { app } from 'electron'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ProductionItem } from '@shared/types'
import { applyAppIdentity } from './app-identity'
import { openDatabase, type StitchFlowDatabase } from './db'
import { mergeProductionItems, recomputeBatchTotals } from './production/review-items'

/**
 * Phase 5 verification: proves the review/fix/merge flow directly against the
 * repositories — this phase never touches parsing or grouping, so there is no need to
 * route through a spreadsheet. Run with `npm run review:verify`, against a throwaway
 * database, same pattern as db:verify / import:verify / grouping:verify.
 */

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

function findItem(items: readonly ProductionItem[], factorySku: string): ProductionItem {
  const item = items.find((candidate) => candidate.factorySku === factorySku)
  if (!item) throw new Error(`No production item for factory SKU "${factorySku}"`)
  return item
}

async function verify(db: StitchFlowDatabase): Promise<void> {
  console.log('\nSet up a batch with intentionally broken rows')

  const batch = db.batches.create({ batchNumber: 'REVIEW-VERIFY-001' })

  const clean1 = db.productionItems.create({
    batchId: batch.id,
    factorySku: 'TEE-BLK-M',
    colour: 'Black',
    size: 'M',
    quantity: 10,
    sourcePlatforms: 'tiktok',
    sortOrder: 0
  })
  const clean2 = db.productionItems.create({
    batchId: batch.id,
    factorySku: 'TEE-BLK-M',
    colour: 'Black',
    size: 'M',
    quantity: 4,
    sourcePlatforms: 'shopee',
    sortOrder: 1
  })
  const missingSku = db.productionItems.create({
    batchId: batch.id,
    factorySku: '',
    quantity: 3,
    issueType: 'missing_sku',
    issueNote: 'Row 7 has no SKU.',
    isResolved: false,
    sortOrder: 2
  })
  const invalidQuantity = db.productionItems.create({
    batchId: batch.id,
    factorySku: 'POLO-RED-S',
    colour: 'Red',
    size: 'S',
    quantity: 0,
    issueType: 'invalid_quantity',
    issueNote: 'Row 12 has an unreadable quantity.',
    isResolved: false,
    sortOrder: 3
  })
  const unmapped = db.productionItems.create({
    batchId: batch.id,
    factorySku: '',
    quantity: 6,
    issueType: 'unknown_mapping',
    issueNote: 'No SKU mapping for "SP-ONLY-SOCK" from shopee.',
    isResolved: false,
    sortOrder: 4
  })

  recomputeBatchTotals(db, batch.id)

  check('5 lines created, batch totals stored correctly', () => {
    const stored = db.batches.getById(batch.id)
    expect(stored !== null, 'batch was not found')
    expect(stored!.totalItems === 5, `total_items was ${stored!.totalItems}`)
    expect(stored!.totalUnits === 23, `total_units was ${stored!.totalUnits}`)
    expect(stored!.unresolvedCount === 3, `unresolved_count was ${stored!.unresolvedCount}`)
  })

  console.log('\nTHE DEFINITION OF DONE — see broken rows under Needs Review')

  const unresolved = db.productionItems.listUnresolved(batch.id)
  check('exactly the 3 broken rows appear as unresolved', () => {
    expect(unresolved.length === 3, `listUnresolved returned ${unresolved.length} rows`)
    const ids = unresolved.map((item) => item.id).sort()
    expect(
      JSON.stringify(ids) === JSON.stringify([missingSku.id, invalidQuantity.id, unmapped.id].sort()),
      'listUnresolved did not return exactly the three broken rows'
    )
  })

  check('the two clean rows are NOT in listUnresolved', () => {
    expect(!unresolved.some((item) => item.id === clean1.id), 'clean1 was flagged unresolved')
    expect(!unresolved.some((item) => item.id === clean2.id), 'clean2 was flagged unresolved')
  })

  console.log('\nFix one — confirm it flows into the production list')

  // Same update shape the Review screen's "Fix" action sends: the corrected data, plus
  // clearing the issue and marking it resolved, in one call.
  db.productionItems.update(missingSku.id, {
    factorySku: 'HOOD-NVY-L',
    colour: 'Navy',
    size: 'L',
    quantity: 3,
    issueType: '',
    issueNote: '',
    isResolved: true
  })
  recomputeBatchTotals(db, batch.id)

  check('the fixed row now appears in listPrintable and no longer in listUnresolved', () => {
    const printable = db.productionItems.listPrintable(batch.id)
    const stillUnresolved = db.productionItems.listUnresolved(batch.id)

    expect(
      printable.some((item) => item.id === missingSku.id),
      'fixed row is not in listPrintable'
    )
    expect(
      !stillUnresolved.some((item) => item.id === missingSku.id),
      'fixed row is still in listUnresolved'
    )
    expect(stillUnresolved.length === 2, `listUnresolved now has ${stillUnresolved.length} rows`)
  })

  check('batch totals updated after the fix — still 5 lines/23 units, now 2 unresolved', () => {
    const stored = db.batches.getById(batch.id)
    const totals = db.productionItems.totalsForBatch(batch.id)
    expect(stored!.totalItems === totals.items, 'total_items drifted from totalsForBatch')
    expect(stored!.totalUnits === totals.units, 'total_units drifted from totalsForBatch')
    expect(stored!.unresolvedCount === 2, `unresolved_count was ${stored!.unresolvedCount}`)
  })

  console.log('\nMerge two rows')

  const merged = mergeProductionItems(db, batch.id, [clean1.id, clean2.id])
  const afterMerge = db.productionItems.listByBatch(batch.id)

  check('merge sums quantity, unions platforms, removes the second row', () => {
    expect(merged.quantity === 14, `merged quantity was ${merged.quantity}`)
    expect(merged.sourcePlatforms === 'shopee,tiktok', `sourcePlatforms was "${merged.sourcePlatforms}"`)
    expect(!afterMerge.some((item) => item.id === clean2.id), 'clean2 still exists after merge')
    expect(afterMerge.length === 4, `batch has ${afterMerge.length} rows after merge`)
  })

  check('batch totals updated after merge — still 23 units, now 4 lines', () => {
    const stored = db.batches.getById(batch.id)
    expect(stored!.totalItems === 4, `total_items was ${stored!.totalItems}`)
    expect(stored!.totalUnits === 23, `total_units was ${stored!.totalUnits}`)
  })

  console.log('\nManual add + remove')

  const manual = db.productionItems.create({
    batchId: batch.id,
    factorySku: 'MANUAL-ADD',
    colour: 'Grey',
    size: 'One Size',
    quantity: 2,
    isManual: true,
    sortOrder: 10
  })
  recomputeBatchTotals(db, batch.id)

  check('manually added row is resolved and counted', () => {
    const stored = db.batches.getById(batch.id)
    expect(stored!.totalItems === 5, `total_items was ${stored!.totalItems}`)
    expect(stored!.totalUnits === 25, `total_units was ${stored!.totalUnits}`)
    expect(findItem(db.productionItems.listByBatch(batch.id), 'MANUAL-ADD').isManual, 'not flagged manual')
  })

  db.productionItems.remove(manual.id)
  recomputeBatchTotals(db, batch.id)

  check('removing it drops the totals back down', () => {
    const stored = db.batches.getById(batch.id)
    expect(stored!.totalItems === 4, `total_items was ${stored!.totalItems}`)
    expect(stored!.totalUnits === 23, `total_units was ${stored!.totalUnits}`)
  })

  console.log('\nBad input')

  check('merging fewer than two ids is rejected', () => {
    let threw = false
    try {
      mergeProductionItems(db, batch.id, [merged.id])
    } catch {
      threw = true
    }
    expect(threw, 'merging a single id did not throw')
  })

  void invalidQuantity
  void unmapped
}

async function main(): Promise<void> {
  console.log('StitchFlow review verification')

  const tempPath = join(tmpdir(), `stitchflow-review-verify-${process.pid}.db`)
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
