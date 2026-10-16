import { BrowserWindow, dialog } from 'electron'
import { ipcMain } from './trusted-ipc'
import { writeFile } from 'node:fs/promises'
import { IpcChannels } from '@shared/ipc-channels'
import { positiveId } from '@shared/validation'
import { getDatabase } from '../db'
import { requirePrintable } from '../production/batch-policy'
import { printDocument } from '../production/print-document'
import { audit } from '../db/repositories/delivery'

function request(value: unknown): { batchId: number; layout: string } {
  if (!value || typeof value !== 'object') throw new Error('Print request is required.')
  const r = value as { batchId: unknown; layout: unknown }
  if (r.layout !== 'standard' && r.layout !== 'grouped') throw new Error('Choose a print layout.')
  return { batchId: positiveId(r.batchId), layout: r.layout }
}
export async function printWindow(html: string): Promise<BrowserWindow> {
  const window = new BrowserWindow({
    show: false,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false }
  })
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
  return window
}
export function registerPrintHandlers(): void {
  ipcMain.handle(IpcChannels.printPreview, (_event, value: unknown) => {
    const { batchId, layout } = request(value),
      db = getDatabase()
    let draft = false
    try {
      requirePrintable(db, batchId)
    } catch {
      draft = true
    }
    return printDocument(db, batchId, layout, draft)
  })
  ipcMain.handle(IpcChannels.printSaveAsPdf, async (_event, value: unknown) => {
    const { batchId, layout } = request(value)
    requirePrintable(getDatabase(), batchId)
    const chosen = await dialog.showSaveDialog({
      title: 'Save A4 tailor slip',
      defaultPath: `${getDatabase().batches.getById(batchId)!.batchNumber}.pdf`,
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    })
    if (chosen.canceled || !chosen.filePath) return { saved: false, filePath: null }
    const db = getDatabase()
    requirePrintable(db, batchId)
    const html = printDocument(db, batchId, layout)
    const window = await printWindow(html)
    try {
      const buffer = await window.webContents.printToPDF({
        pageSize: 'A4',
        preferCSSPageSize: true,
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate: '<span></span>',
        footerTemplate:
          '<div style="font-size:8px;width:100%;text-align:center">SlipFlow · Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>'
      })
      await writeFile(chosen.filePath, buffer)
      audit(
        getDatabase(),
        batchId,
        'pdf-exported',
        'A4 PDF exported; physical print status unchanged'
      )
      return { saved: true, filePath: chosen.filePath }
    } finally {
      window.destroy()
    }
  })
  ipcMain.handle(IpcChannels.printNative, async (_event, value: unknown) => {
    const { batchId, layout } = request(value),
      db = getDatabase()
    requirePrintable(db, batchId)
    const window = await printWindow(printDocument(db, batchId, layout))
    try {
      await new Promise<void>((resolve, reject) =>
        window.webContents.print(
          { silent: false, pageSize: 'A4', printBackground: false },
          (success, reason) =>
            success ? resolve() : reject(new Error(reason || 'Printing was cancelled.'))
        )
      )
      audit(
        getDatabase(),
        batchId,
        'print-submitted',
        'Print system accepted job; operator must verify physical output'
      )
      return 'Print job submitted. Check the physical output, then confirm printing in Batch History.'
    } finally {
      window.destroy()
    }
  })
}
