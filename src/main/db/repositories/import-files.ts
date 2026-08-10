import type { DatabaseSync } from 'node:sqlite'
import type { DetectionStatus, ImportFile, ImportFileUpdate, NewImportFile } from '@shared/types'
import {
  nowIso,
  readInteger,
  readNullableInteger,
  readText,
  type DbRow
} from '../rows'
import { createUpdate } from '../update-builder'

function toImportFile(row: DbRow): ImportFile {
  return {
    id: readInteger(row, 'id'),
    batchId: readNullableInteger(row, 'batch_id'),
    columnMappingId: readNullableInteger(row, 'column_mapping_id'),
    fileName: readText(row, 'file_name'),
    filePath: readText(row, 'file_path'),
    fileHash: readText(row, 'file_hash'),
    fileSize: readInteger(row, 'file_size'),
    sheetName: readText(row, 'sheet_name'),
    platform: readText(row, 'platform'),
    rowCount: readInteger(row, 'row_count'),
    detectionStatus: readText(row, 'detection_status') as DetectionStatus,
    importedAt: readText(row, 'imported_at')
  }
}

export interface ImportFilesRepository {
  create(input: NewImportFile): ImportFile
  getById(id: number): ImportFile | null
  /** Recognises an identical re-upload before any parsing happens. */
  findByHash(fileHash: string): ImportFile[]
  listByBatch(batchId: number): ImportFile[]
  listUnassigned(): ImportFile[]
  update(id: number, changes: ImportFileUpdate): ImportFile | null
  remove(id: number): boolean
}

export function createImportFilesRepository(db: DatabaseSync): ImportFilesRepository {
  const insert = db.prepare(`
    INSERT INTO import_files (
      batch_id, column_mapping_id, file_name, file_path, file_hash, file_size,
      sheet_name, platform, row_count, detection_status, imported_at
    ) VALUES (
      $batch_id, $column_mapping_id, $file_name, $file_path, $file_hash, $file_size,
      $sheet_name, $platform, $row_count, $detection_status, $imported_at
    )
  `)
  const selectById = db.prepare('SELECT * FROM import_files WHERE id = ?')
  const selectByHash = db.prepare(
    'SELECT * FROM import_files WHERE file_hash = ? AND file_hash <> \'\' ORDER BY imported_at DESC'
  )
  const selectByBatch = db.prepare(
    'SELECT * FROM import_files WHERE batch_id = ? ORDER BY imported_at, id'
  )
  const selectUnassigned = db.prepare(
    'SELECT * FROM import_files WHERE batch_id IS NULL ORDER BY imported_at, id'
  )
  const deleteById = db.prepare('DELETE FROM import_files WHERE id = ?')

  function getById(id: number): ImportFile | null {
    const row = selectById.get(id)
    return row ? toImportFile(row) : null
  }

  return {
    create(input) {
      const result = insert.run({
        $batch_id: input.batchId ?? null,
        $column_mapping_id: input.columnMappingId ?? null,
        $file_name: input.fileName,
        $file_path: input.filePath ?? '',
        $file_hash: input.fileHash ?? '',
        $file_size: input.fileSize ?? 0,
        $sheet_name: input.sheetName ?? '',
        $platform: input.platform ?? 'unknown',
        $row_count: input.rowCount ?? 0,
        $detection_status: input.detectionStatus ?? 'pending',
        $imported_at: nowIso()
      })

      const created = getById(Number(result.lastInsertRowid))
      if (!created) throw new Error('Import file was inserted but could not be read back')
      return created
    },

    getById,

    findByHash(fileHash) {
      return selectByHash.all(fileHash).map(toImportFile)
    },

    listByBatch(batchId) {
      return selectByBatch.all(batchId).map(toImportFile)
    },

    listUnassigned() {
      return selectUnassigned.all().map(toImportFile)
    },

    update(id, changes) {
      const patch = createUpdate()
        .set('batch_id', changes.batchId)
        .set('column_mapping_id', changes.columnMappingId)
        .set('file_name', changes.fileName)
        .set('file_path', changes.filePath)
        .set('file_hash', changes.fileHash)
        .set('file_size', changes.fileSize)
        .set('sheet_name', changes.sheetName)
        .set('platform', changes.platform)
        .set('row_count', changes.rowCount)
        .set('detection_status', changes.detectionStatus)

      if (patch.isEmpty()) return getById(id)

      db.prepare(`UPDATE import_files SET ${patch.assignments()} WHERE id = $id`).run({
        ...patch.params(),
        $id: id
      })

      return getById(id)
    },

    remove(id) {
      return Number(deleteById.run(id).changes) > 0
    }
  }
}
