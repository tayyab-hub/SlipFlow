import { ipcMain } from './trusted-ipc'
import { BrowserWindow, dialog } from 'electron'
import { IpcChannels } from '@shared/ipc-channels'
import type {
  BulkImportSkuMappingsResult,
  NewSkuMapping,
  SkuMapping,
  SkuMappingUpdate
} from '@shared/types'
import { getDatabase } from '../db'
import { importSkuMappings } from '../excel/import-sku-mappings'
import { boundedText, positiveId } from '@shared/validation'

function assertNewMapping(value: unknown): NewSkuMapping {
  if (typeof value !== 'object' || value === null) {
    throw new TypeError('A SKU mapping is required')
  }

  const input = value as Partial<NewSkuMapping>
  if (typeof input.incomingSku !== 'string' || input.incomingSku.trim() === '') {
    throw new TypeError('incomingSku is required')
  }
  if (typeof input.factorySku !== 'string' || input.factorySku.trim() === '') {
    throw new TypeError('factorySku is required')
  }

  if (!['', 'tiktok', 'shopee', 'lazada', 'unknown'].includes(String(input.platform ?? '')))
    throw new Error('Platform must be tiktok, shopee, lazada, unknown, or blank for all.')
  return {
    incomingSku: boundedText(input.incomingSku, 'Incoming SKU', true),
    factorySku: boundedText(input.factorySku, 'Factory SKU', true),
    incomingVariation: boundedText(input.incomingVariation ?? '', 'Variation'),
    platform: boundedText(input.platform ?? '', 'Platform'),
    factoryColour: boundedText(input.factoryColour ?? '', 'Colour'),
    factorySize: boundedText(input.factorySize ?? '', 'Size'),
    notes: boundedText(input.notes ?? '', 'Notes', false, 2000)
  }
}

function assertUpdateRequest(value: unknown): { id: number; changes: SkuMappingUpdate } {
  if (typeof value !== 'object' || value === null) {
    throw new TypeError('An update request is required')
  }

  const request = value as { id?: unknown; changes?: unknown }
  if (typeof request.id !== 'number' || !Number.isInteger(request.id)) {
    throw new TypeError('id must be an integer')
  }
  if (typeof request.changes !== 'object' || request.changes === null) {
    throw new TypeError('changes is required')
  }

  return { id: request.id, changes: request.changes as SkuMappingUpdate }
}

export function registerSkuMappingHandlers(): void {
  ipcMain.handle(IpcChannels.skuMappingsList, (): SkuMapping[] => {
    return getDatabase().skuMappings.list()
  })

  ipcMain.handle(IpcChannels.skuMappingsCreate, (_event, input: unknown): SkuMapping => {
    return getDatabase().skuMappings.create(assertNewMapping(input))
  })

  ipcMain.handle(IpcChannels.skuMappingsUpdate, (_event, input: unknown): SkuMapping | null => {
    const { id, changes } = assertUpdateRequest(input)
    const db = getDatabase(),
      existing = db.skuMappings.getById(positiveId(id))
    if (!existing) throw new Error('Mapping no longer exists.')
    const allowed = [
      'incomingSku',
      'incomingVariation',
      'platform',
      'factorySku',
      'factoryColour',
      'factorySize',
      'notes'
    ]
    if (Object.keys(changes).some((k) => !allowed.includes(k)))
      throw new Error('Unknown mapping field.')
    const checked = assertNewMapping({ ...existing, ...changes })
    return db.skuMappings.update(id, checked)
  })

  ipcMain.handle(IpcChannels.skuMappingsRemove, (_event, id: unknown): boolean => {
    if (typeof id !== 'number' || !Number.isInteger(id)) {
      throw new TypeError('id must be an integer')
    }
    return getDatabase().skuMappings.remove(id)
  })

  ipcMain.handle(
    IpcChannels.skuMappingsBulkImport,
    async (event): Promise<BulkImportSkuMappingsResult | null> => {
      const window = BrowserWindow.fromWebContents(event.sender)
      const options: Electron.OpenDialogOptions = {
        title: 'Choose a SKU mapping file',
        buttonLabel: 'Import',
        properties: ['openFile'],
        filters: [{ name: 'SKU mapping files', extensions: ['xlsx', 'xls', 'csv'] }]
      }

      const result = window
        ? await dialog.showOpenDialog(window, options)
        : await dialog.showOpenDialog(options)

      if (result.canceled || result.filePaths.length === 0) return null

      return importSkuMappings(getDatabase(), result.filePaths[0]!)
    }
  )
}
