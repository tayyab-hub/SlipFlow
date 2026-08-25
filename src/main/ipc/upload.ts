import { BrowserWindow, dialog, ipcMain } from 'electron'
import { IpcChannels } from '@shared/ipc-channels'
import type { ApplyMappingRequest, ImportFile, UploadResult } from '@shared/types'
import { getDatabase } from '../db'
import { importSpreadsheet } from '../excel/import-file'

/**
 * Even though the renderer is our own code, everything crossing the bridge is checked
 * before it reaches the filesystem or the database. A renderer bug should surface as a
 * rejected call, not a bad row.
 */
function assertStringArray(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new TypeError(`${label} must be an array of file paths`)
  }
  return value as readonly string[]
}

function assertMappingRequest(value: unknown): ApplyMappingRequest {
  if (typeof value !== 'object' || value === null) {
    throw new TypeError('A column mapping request is required')
  }

  const request = value as Partial<ApplyMappingRequest>
  if (typeof request.filePath !== 'string' || request.filePath === '') {
    throw new TypeError('filePath is required')
  }
  if (typeof request.mapping !== 'object' || request.mapping === null) {
    throw new TypeError('mapping is required')
  }

  return {
    filePath: request.filePath,
    mapping: {
      orderId: String(request.mapping.orderId ?? ''),
      sku: String(request.mapping.sku ?? ''),
      variation: String(request.mapping.variation ?? ''),
      colour: String(request.mapping.colour ?? ''),
      size: String(request.mapping.size ?? ''),
      quantity: String(request.mapping.quantity ?? '')
    },
    remember: request.remember === true,
    mappingName: String(request.mappingName ?? ''),
    platform: String(request.platform ?? 'unknown')
  }
}

export function registerUploadHandlers(): void {
  ipcMain.handle(IpcChannels.uploadPickFiles, async (event): Promise<string[]> => {
    const window = BrowserWindow.fromWebContents(event.sender)

    const result = window
      ? await dialog.showOpenDialog(window, openDialogOptions())
      : await dialog.showOpenDialog(openDialogOptions())

    return result.canceled ? [] : result.filePaths
  })

  ipcMain.handle(
    IpcChannels.uploadImportFiles,
    async (_event, paths: unknown): Promise<UploadResult[]> => {
      const filePaths = assertStringArray(paths, 'paths')
      const db = getDatabase()

      // Sequential on purpose: each file's duplicate check reads rows the previous file
      // may have just written.
      const results: UploadResult[] = []
      for (const filePath of filePaths) {
        results.push(await importSpreadsheet(db, filePath))
      }
      return results
    }
  )

  ipcMain.handle(
    IpcChannels.uploadApplyMapping,
    async (_event, request: unknown): Promise<UploadResult> => {
      const { filePath, mapping, remember, mappingName, platform } = assertMappingRequest(request)

      return importSpreadsheet(getDatabase(), filePath, {
        mapping,
        remember,
        mappingName,
        platform
      })
    }
  )

  ipcMain.handle(IpcChannels.uploadListPending, (): ImportFile[] => {
    return getDatabase().importFiles.listUnassigned()
  })

  ipcMain.handle(IpcChannels.uploadRemoveFile, (_event, id: unknown): boolean => {
    if (typeof id !== 'number' || !Number.isInteger(id)) {
      throw new TypeError('id must be an integer')
    }
    // imported_orders rows go with it — ON DELETE CASCADE.
    return getDatabase().importFiles.remove(id)
  })

  ipcMain.handle(IpcChannels.uploadUnmarkDuplicates, (_event, importFileId: unknown): number => {
    if (typeof importFileId !== 'number' || !Number.isInteger(importFileId)) {
      throw new TypeError('importFileId must be an integer')
    }
    // "Import Anyway" — the operator has seen the warning and wants these rows counted.
    return getDatabase().importedOrders.clearDuplicateForFile(importFileId)
  })
}

function openDialogOptions(): Electron.OpenDialogOptions {
  return {
    title: 'Choose order files',
    buttonLabel: 'Add files',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Order files', extensions: ['xlsx', 'xls', 'csv'] },
      { name: 'Excel workbooks', extensions: ['xlsx', 'xls'] },
      { name: 'CSV files', extensions: ['csv'] }
    ]
  }
}