import { app, BrowserWindow, dialog, session, shell } from 'electron'
import { join } from 'node:path'
import { applyAppIdentity } from './app-identity'
import { closeDatabase, initialiseDatabase } from './db'
import { resolveDatabasePath } from './db/paths'
import { registerAppHandlers } from './ipc/app'
import { registerPrintHandlers } from './ipc/print'
import { registerProductionHandlers } from './ipc/production'
import { registerSkuMappingHandlers } from './ipc/sku-mappings'
import { registerUploadHandlers } from './ipc/upload'

// Before anything else: pins the app name and the userData directory that the database
// path is derived from. Must not be moved inside whenReady() — Electron resolves paths
// during startup and would create a stray %APPDATA%\Electron folder first.
applyAppIdentity()

const isDev = !app.isPackaged

/**
 * Content-Security-Policy for the renderer, applied to packaged builds only.
 *
 * In development Vite serves the renderer over HTTP and injects its HMR client and a
 * React Refresh preamble inline, which a strict policy would block. The packaged app
 * loads from file:// where none of that exists, so the strict policy applies there.
 * This is a dev/prod difference, NOT a relaxation of the packaged app's security.
 */
function applyContentSecurityPolicy(): void {
  if (isDev) return

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          [
            "default-src 'self'",
            "script-src 'self'",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data:",
            "font-src 'self' data:",
            "connect-src 'self'",
            "object-src 'none'",
            "frame-src 'none'",
            "base-uri 'none'",
            "form-action 'none'"
          ].join('; ')
        ]
      }
    })
  })
}

function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 880,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    backgroundColor: '#f7f8fa',
    autoHideMenuBar: true,
    title: 'StitchFlow',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      // Security posture is fixed — see CLAUDE.md §5.3. Do not weaken these to make
      // a feature work; add an IPC handler instead.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  })

  // Avoid the white flash while React mounts.
  window.once('ready-to-show', () => window.show())

  // Any external link opens in the user's browser, never in an app window.
  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    void window.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return window
}

/** One call per IPC domain — handlers live in src/main/ipc/. */
function registerIpcHandlers(): void {
  registerAppHandlers()
  registerUploadHandlers()
  registerSkuMappingHandlers()
  registerProductionHandlers()
  registerPrintHandlers()
}

/**
 * Open the database before the window exists, so the UI never renders against a
 * database that failed to open.
 *
 * A failure here is fatal and unrecoverable from inside the app — the operator's data is
 * unreachable — so it reports plainly and quits rather than showing a broken dashboard.
 * Phase 9 owns the friendlier wording.
 */
function startDatabase(): boolean {
  const filePath = resolveDatabasePath()

  try {
    const db = initialiseDatabase(filePath)
    console.log(`Database ready (schema v${db.schemaVersion}) at ${filePath}`)
    return true
  } catch (error) {
    dialog.showErrorBox(
      'StitchFlow cannot open its database',
      [
        'The production database could not be opened, so StitchFlow has to close.',
        '',
        `Location: ${filePath}`,
        `Details: ${error instanceof Error ? error.message : String(error)}`
      ].join('\n')
    )
    return false
  }
}

// Single instance only — two copies of the app would mean two writers on one SQLite file.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const [existing] = BrowserWindow.getAllWindows()
    if (existing) {
      if (existing.isMinimized()) existing.restore()
      existing.focus()
    }
  })

  void app.whenReady().then(() => {
    if (!startDatabase()) {
      app.exit(1)
      return
    }

    applyContentSecurityPolicy()
    registerIpcHandlers()
    createMainWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  // Checkpoints the WAL and closes cleanly, so the .db file on disk is complete.
  app.on('will-quit', closeDatabase)
}
