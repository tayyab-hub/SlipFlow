import { BrowserWindow, dialog, ipcMain } from 'electron'
import { writeFile } from 'node:fs/promises'
import { IpcChannels } from '@shared/ipc-channels'
import type { SavePdfResult } from '@shared/types'

export function registerPrintHandlers(): void {
  ipcMain.handle(
    IpcChannels.printSaveAsPdf,
    async (event, suggestedFileName: unknown): Promise<SavePdfResult> => {
      const contents = event.sender
      const window = BrowserWindow.fromWebContents(contents)

      const fileName =
        typeof suggestedFileName === 'string' && suggestedFileName.trim() !== ''
          ? suggestedFileName
          : 'production-sheet.pdf'

      const dialogOptions: Electron.SaveDialogOptions = {
        title: 'Save production sheet as PDF',
        defaultPath: fileName,
        filters: [{ name: 'PDF documents', extensions: ['pdf'] }]
      }

      const result = window
        ? await dialog.showSaveDialog(window, dialogOptions)
        : await dialog.showSaveDialog(dialogOptions)

      if (result.canceled || !result.filePath) {
        return { saved: false, filePath: null }
      }

      // preferCSSPageSize makes Chromium follow the page's own @page rule (A4, our
      // margins) instead of a default Letter size — so this matches window.print()
      // exactly, off the same @media print stylesheet.
      const pdfBuffer = await contents.printToPDF({
        printBackground: true,
        preferCSSPageSize: true
      })

      await writeFile(result.filePath, pdfBuffer)
      return { saved: true, filePath: result.filePath }
    }
  )
}
