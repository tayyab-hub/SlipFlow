const { test, expect, _electron: electron } = require('@playwright/test')
const { mkdtempSync, mkdirSync, rmSync, existsSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join, resolve } = require('node:path')

test('operator workflow, security boundary, print and recovery persist across restart', async () => {
  const data = mkdtempSync(join(tmpdir(), 'slipflow-e2e-'))
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  const screenshots = resolve('docs/screenshots')
  mkdirSync(screenshots, { recursive: true })
  let app
  const launch = async () =>
    electron.launch({ args: [resolve('.'), `--user-data-dir=${data}`], env })
  try {
    app = await launch()
    expect(await app.evaluate(({ app }) => app.getPath('userData'))).toBe(data)
    expect(await app.evaluate(({ app }) => app.getVersion())).toBe('1.0.0')
    let page = await app.firstWindow()
    const failures = []
    page.on('pageerror', (e) => failures.push(e.message))
    await expect(page.getByRole('heading', { name: 'SlipFlow', exact: true })).toBeVisible()
    const posture = await app.evaluate(({ BrowserWindow }) => {
      const p = BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences()
      return {
        sandbox: p.sandbox,
        contextIsolation: p.contextIsolation,
        nodeIntegration: p.nodeIntegration
      }
    })
    expect(posture).toEqual({ sandbox: true, contextIsolation: true, nodeIntegration: false })
    expect(await page.evaluate(() => typeof window.require)).toBe('undefined')
    await page
      .getByRole('navigation')
      .getByRole('button', { name: 'Settings', exact: true })
      .click()
    await page.getByLabel('Factory display name').fill('SlipFlow Demonstration Factory')
    await page.getByRole('button', { name: 'Save preferences', exact: true }).click()
    await expect(page.getByRole('status')).toContainText('Preferences saved')
    for (const [platform, name] of [
      ['tiktok', 'Demo TikTok'],
      ['shopee', 'Demo Shopee'],
      ['lazada', 'Demo Lazada']
    ]) {
      await page.getByLabel('Seller name', { exact: true }).fill(name)
      await page.getByLabel('Seller marketplace').selectOption(platform)
      await page.getByRole('button', { name: 'Add seller', exact: true }).click()
      await expect(page.getByText(name, { exact: true })).toBeVisible()
    }
    await page
      .getByRole('navigation')
      .getByRole('button', { name: 'SKU Mappings', exact: true })
      .click()
    for (const [sku, colour, size] of [
      ['TEE-BLK-M', 'Black', 'M'],
      ['TEE-BLK-L', 'Black', 'L'],
      ['TEE-WHT-M', 'White', 'M'],
      ['HOOD-NVY-L', 'Navy', 'L'],
      ['POLO-RED-S', 'Red', 'S']
    ]) {
      await page.getByLabel('Incoming SKU', { exact: false }).fill(sku)
      await page.getByLabel('Factory SKU', { exact: false }).fill(sku)
      await page.getByLabel('Factory Colour', { exact: true }).fill(colour)
      await page.getByLabel('Factory Size', { exact: true }).fill(size)
      await page.getByRole('button', { name: 'Add', exact: true }).click()
      await expect(page.getByRole('status')).toContainText(`Saved mapping for "${sku}"`)
    }
    await page.screenshot({ path: join(screenshots, 'sku-mappings.png') })
    const sellers = await page.evaluate(() => window.stitchflow.listSellers())
    for (const [platform, file] of [
      ['tiktok', 'tiktok-orders.xlsx'],
      ['shopee', 'shopee-orders.xlsx'],
      ['lazada', 'lazada-orders.csv'],
      ['tiktok', 'tiktok-orders.xlsx']
    ]) {
      await page
        .getByRole('navigation')
        .getByRole('button', { name: 'Upload Orders', exact: true })
        .click()
      await page
        .getByLabel('Seller account', { exact: true })
        .selectOption(String(sellers.find((s) => s.platform === platform).id))
      await app.evaluate(
        ({ dialog }, filePath) => {
          dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] })
        },
        resolve('samples', file)
      )
      await page.getByRole('button', { name: /choose files|browse files/i }).click()
      await expect(page.getByRole('heading', { name: 'Preview and confirm import' })).toBeVisible()
      if (platform === 'shopee')
        await page.screenshot({ path: join(screenshots, 'import-preview.png') })
      await page.getByRole('button', { name: 'Import with this mapping' }).click()
      await expect(page.getByRole('heading', { name: 'Import orders', exact: true })).toBeVisible()
    }
    await page.getByLabel('Batch name', { exact: true }).fill('Synthetic marketplace demonstration')
    await page.getByRole('button', { name: 'Create batch from 4 files' }).click()
    await expect(page.getByText(/8 lines · 61 units · 3 need/)).toBeVisible()
    await page.screenshot({ path: join(screenshots, 'review-issues.png') })
    for (const sku of ['TT-ONLY-CAP', 'SP-ONLY-SOCK', 'LZ-ONLY-BELT']) {
      const row = page.getByRole('row').filter({ hasText: sku })
      await row.getByTitle('Fix this row').click()
      const editing = page.locator('tr').filter({ has: page.locator('input[value="' + sku + '"]') })
      if (sku === 'TT-ONLY-CAP') await editing.locator('input').nth(1).fill('N/A')
      await editing.getByTitle('Save').click()
      await expect(page.getByTitle('Fix this row')).toHaveCount(
        sku === 'TT-ONLY-CAP' ? 2 : sku === 'SP-ONLY-SOCK' ? 1 : 0
      )
    }
    await page.getByRole('button', { name: 'Reconcile / approve' }).click()
    await expect(page.getByText('Source:', { exact: false })).toContainText('61 units')
    await page.getByRole('button', { name: 'Approve as ready' }).click()
    await expect(page.getByRole('button', { name: 'Return to draft' })).toBeVisible()
    await page.screenshot({ path: join(screenshots, 'history.png') })
    await page.getByRole('button', { name: 'Preview / print', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Save PDF', exact: true })).toBeEnabled()
    await expect(page.frameLocator('iframe').getByText('TOTAL 61 UNITS')).toBeVisible()
    await page.screenshot({ path: join(screenshots, 'tailor-slip.png') })
    const output = join(data, 'workflow.pdf')
    await app.evaluate(({ dialog }, filePath) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath })
    }, output)
    await page.getByRole('button', { name: 'Save PDF', exact: true }).click()
    await expect(page.getByRole('status')).toContainText('PDF saved')
    expect(existsSync(output)).toBe(true)
    expect(await page.evaluate(async () => (await window.stitchflow.listBatches())[0].status)).toBe(
      'ready'
    )
    const rejection = await page.evaluate(async () => {
      const b = (await window.stitchflow.listBatches())[0],
        i = (await window.stitchflow.listProductionItems(b.id))[0]
      try {
        await window.stitchflow.updateProductionItem(i.id, { quantity: 2.5 })
        return 'accepted'
      } catch {
        return 'rejected'
      }
    })
    expect(rejection).toBe('rejected')
    await page
      .getByRole('navigation')
      .getByRole('button', { name: 'Settings', exact: true })
      .click()
    await page.getByRole('button', { name: 'Create verified backup', exact: true }).click()
    await expect(page.getByRole('status')).toContainText('Verified backup saved')
    await page.getByLabel('Factory display name').fill('Changed after backup')
    await page.getByRole('button', { name: 'Save preferences' }).click()
    await app.evaluate(({ dialog }) => {
      dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false })
    })
    await page.getByRole('button', { name: 'Restore', exact: true }).first().click()
    await expect(page.getByRole('status')).toContainText('Restored and verified')
    await expect(page.getByLabel('Factory display name')).toHaveValue(
      'SlipFlow Demonstration Factory'
    )
    await page.screenshot({ path: join(screenshots, 'settings-backup.png') })
    await page
      .getByRole('navigation')
      .getByRole('button', { name: 'Dashboard', exact: true })
      .click()
    await expect(page.getByText('61 units', { exact: true })).toBeVisible()
    await page.screenshot({ path: join(screenshots, 'dashboard.png') })
    expect(failures).toEqual([])
    await app.close()
    app = await launch()
    page = await app.firstWindow()
    await expect(page.getByText('61 units', { exact: true })).toBeVisible()
    expect(
      await page.evaluate(async () => (await window.stitchflow.getSettings()).factoryName)
    ).toBe('SlipFlow Demonstration Factory')
    await page
      .getByRole('navigation')
      .getByRole('button', { name: 'Batch History', exact: true })
      .click()
    await page.getByRole('button', { name: 'Open', exact: true }).first().click()
    await page.getByRole('button', { name: 'Preview / print', exact: true }).click()
    await expect(page.frameLocator('iframe').getByText('TOTAL 61 UNITS')).toBeVisible()
    // Archive preserves source records, then restore allows an existing batch to be reprinted.
    await page.getByRole('button', { name: 'Batch history', exact: true }).click()
    await page.getByRole('button', { name: 'Archive', exact: true }).click()
    await page.getByRole('button', { name: 'Restore from archive', exact: true }).click()
    expect((await page.evaluate(() => window.stitchflow.listBatches()))[0].totalUnits).toBe(61)
  } finally {
    if (app) await app.close()
    rmSync(data, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
  }
})

test('operator can batch selected order lines without losing or repeating the remainder', async () => {
  const data = mkdtempSync(join(tmpdir(), 'slipflow-selection-'))
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  const app = await electron.launch({ args: [resolve('.'), `--user-data-dir=${data}`], env })
  try {
    const page = await app.firstWindow()
    await expect(page.getByRole('heading', { name: 'SlipFlow', exact: true })).toBeVisible()
    const sellers = await page.evaluate(() =>
      window.stitchflow.saveSeller({ name: 'Selection demo', platform: 'tiktok' })
    )
    await page
      .getByRole('navigation')
      .getByRole('button', { name: 'Upload Orders', exact: true })
      .click()
    await page.getByLabel('Seller account', { exact: true }).selectOption(String(sellers[0].id))
    await app.evaluate(
      ({ dialog }, filePath) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] })
      },
      resolve('samples', 'tiktok-orders.xlsx')
    )
    await page.getByRole('button', { name: /choose files|browse files/i }).click()
    await page.getByRole('button', { name: 'Import with this mapping' }).click()
    await page.getByRole('button', { name: 'Choose rows', exact: true }).click()
    const file = (await page.evaluate(() => window.stitchflow.listPendingImports()))[0]
    const rows = await page.evaluate((id) => window.stitchflow.pendingOrderRows(id), file.id)
    await page.getByRole('button', { name: 'Clear rows', exact: true }).click()
    await page.getByLabel(`Include source row ${rows[0].rowNumber}`, { exact: true }).check()
    await expect(
      page.getByText(`1 of ${rows.length} pending rows selected.`, { exact: false })
    ).toBeVisible()
    await page.screenshot({ path: resolve('docs/screenshots/order-selection.png') })
    await page.getByRole('button', { name: 'Create batch from 1 files' }).click()
    await expect(page.getByRole('heading', { name: /^Batch SF-/ })).toBeVisible()
    const first = (await page.evaluate(() => window.stitchflow.listBatches()))[0]
    expect(first.totalUnits).toBe(rows[0].quantity)
    const removal = await page.evaluate(async (id) => {
      try {
        await window.stitchflow.removeImport(id)
        return 'accepted'
      } catch {
        return 'rejected'
      }
    }, file.id)
    expect(removal).toBe('rejected')
    await page
      .getByRole('navigation')
      .getByRole('button', { name: 'Upload Orders', exact: true })
      .click()
    await page.getByRole('button', { name: 'Choose rows', exact: true }).click()
    await expect(page.getByRole('checkbox')).toHaveCount(rows.length)
    await page.getByRole('button', { name: 'Create batch from 1 files' }).click()
    await expect(page.getByRole('heading', { name: /^Batch SF-/ })).toBeVisible()
    const batches = await page.evaluate(() => window.stitchflow.listBatches())
    expect(batches).toHaveLength(2)
    expect(batches.reduce((sum, b) => sum + b.totalUnits, 0)).toBe(
      rows.reduce((sum, r) => sum + r.quantity, 0)
    )
    expect(await page.evaluate(() => window.stitchflow.listPendingImports())).toHaveLength(0)
  } finally {
    await app.close()
    rmSync(data, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
  }
})
