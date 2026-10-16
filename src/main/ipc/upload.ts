import { ipcMain } from './trusted-ipc'
import { BrowserWindow, dialog } from 'electron'
import { IpcChannels } from '@shared/ipc-channels'
import type { ApplyMappingRequest, ImportFile, UploadResult } from '@shared/types'
import { getDatabase } from '../db'
import { importSpreadsheet } from '../excel/import-file'
import { boundedText, positiveId } from '@shared/validation'
import { listSellers } from '../db/repositories/delivery'
import { resolve, extname } from 'node:path'

const selectedFiles = new Set<string>()
function grantFile(path: string): void {
  if (!['.xlsx', '.xls', '.csv'].includes(extname(path).toLowerCase()))
    throw new Error('Unsupported file extension.')
  if (selectedFiles.size > 200) selectedFiles.clear()
  selectedFiles.add(resolve(path))
}
function requireSelected(path: string): void {
  if (!selectedFiles.has(resolve(path))) throw new Error('Select or drop this file first.')
}

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
    sellerAccountId: positiveId(request.sellerAccountId, 'Seller account'),
    sheetName: boundedText(request.sheetName ?? '', 'Worksheet'),
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
  ipcMain.on(IpcChannels.uploadDroppedFile, (_event, path: unknown) => {
    if (typeof path === 'string') {
      try {
        grantFile(path)
      } catch {
        /* invalid dropped files are rejected again at import */
      }
    }
  })
  ipcMain.handle(IpcChannels.uploadPickFiles, async (event): Promise<string[]> => {
    const window = BrowserWindow.fromWebContents(event.sender)

    const result = window
      ? await dialog.showOpenDialog(window, openDialogOptions())
      : await dialog.showOpenDialog(openDialogOptions())

    if (result.canceled) return []
    result.filePaths.forEach(grantFile)
    return result.filePaths
  })

  ipcMain.handle(
    IpcChannels.uploadImportFiles,
    async (_event, input: unknown): Promise<UploadResult[]> => {
      if (!input || typeof input !== 'object') throw new Error('An import request is required.')
      const request = input as { filePaths: unknown; sellerAccountId: unknown; sheetName?: unknown }
      const filePaths = assertStringArray(request.filePaths, 'paths')
      if (filePaths.length > 20) throw new Error('Import at most 20 files at once.')
      const sellerAccountId = positiveId(request.sellerAccountId, 'Seller account')
      const sheetName =
        request.sheetName === undefined ? undefined : boundedText(request.sheetName, 'Worksheet')
      const db = getDatabase()

      // Sequential on purpose: each file's duplicate check reads rows the previous file
      // may have just written.
      const results: UploadResult[] = []
      for (const filePath of filePaths) {
        requireSelected(filePath)
        results.push(
          await importSpreadsheet(db, filePath, { sellerAccountId, sheetName, previewOnly: true })
        )
      }
      return results
    }
  )

  ipcMain.handle(
    IpcChannels.uploadApplyMapping,
    async (_event, request: unknown): Promise<UploadResult> => {
      const { filePath, mapping, remember, mappingName, platform, sellerAccountId, sheetName } =
        assertMappingRequest(request)
      requireSelected(filePath)
      if (!listSellers(getDatabase()).some((s) => s.id === sellerAccountId && s.active))
        throw new Error('Choose an active seller.')
      const columns = Object.values(mapping).filter(Boolean)
      if (new Set(columns).size !== columns.length)
        throw new Error('Each field must use a different column.')

      return importSpreadsheet(getDatabase(), filePath, {
        mapping,
        remember,
        mappingName,
        platform,
        sellerAccountId,
        sheetName: sheetName || undefined
      })
    }
  )

  ipcMain.handle(IpcChannels.uploadListPending, (): ImportFile[] => {
    return getDatabase().importFiles.listUnassigned()
  })
  ipcMain.handle(IpcChannels.uploadPendingRows, (_event, id: unknown) =>
    getDatabase()
      .importedOrders.listByFile(positiveId(id))
      .filter((order) => order.batchId === null)
  )

  ipcMain.handle(IpcChannels.uploadRemoveFile, (_event, id: unknown): boolean => {
    if (typeof id !== 'number' || !Number.isInteger(id)) {
      throw new TypeError('id must be an integer')
    }
    // imported_orders rows go with it — ON DELETE CASCADE.
    const db = getDatabase(),
      file = db.importFiles.getById(id)
    if (file?.batchId !== null) throw new Error('Only pending imports may be removed.')
    if (db.importedOrders.listByFile(id).some((order) => order.batchId !== null))
      throw new Error('This file has batched source rows and must be retained for history.')
    return db.importFiles.remove(id)
  })

  ipcMain.handle(IpcChannels.uploadUnmarkDuplicates, (_event, importFileId: unknown): number => {
    if (typeof importFileId !== 'number' || !Number.isInteger(importFileId)) {
      throw new TypeError('importFileId must be an integer')
    }
    // "Import Anyway" — the operator has seen the warning and wants these rows counted.
    throw new Error(
      'Exact duplicates cannot be counted again. Review source order identities and create a documented manual adjustment when necessary.'
    )
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
