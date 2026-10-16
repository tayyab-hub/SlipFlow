import { app, BrowserWindow, dialog, session } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { writeFile } from 'node:fs/promises'
import { applyAppIdentity } from './app-identity'
import { closeDatabase, initialiseDatabase } from './db'
import { resolveDatabasePath } from './db/paths'
import { registerAppHandlers } from './ipc/app'
import { registerPrintHandlers } from './ipc/print'
import { registerProductionHandlers } from './ipc/production'
import { registerSkuMappingHandlers } from './ipc/sku-mappings'
import { registerUploadHandlers } from './ipc/upload'
import { registerDeliveryHandlers, startAutomaticBackups } from './ipc/delivery'
import { trustRenderer } from './ipc/trusted-ipc'

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
  if (process.env['ELECTRON_RENDERER_URL'] && isDev) return

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
            "frame-src 'self'",
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
    title: 'SlipFlow',
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
  // Explicit, isolated packaged-startup check for release QA. No code or file paths come from the renderer.
  if (app.commandLine.hasSwitch('smoke-test')) {
    if (!app.commandLine.hasSwitch('user-data-dir'))
      throw new Error('--smoke-test requires an explicit isolated --user-data-dir.')
    window.webContents.once('did-finish-load', () => {
      void (async () => {
        const heading = await window.webContents.executeJavaScript(
          `new Promise((resolve, reject) => { const started=Date.now(); function check(){const h=document.querySelector('h1');if(h)resolve(h.textContent);else if(Date.now()-started>10000)reject(new Error('Renderer did not mount'));else requestAnimationFrame(check)}check() })`
        )
        if (!String(heading).includes('SlipFlow')) throw new Error('Unexpected startup screen.')
        window.showInactive()
        await new Promise((resolve) => setTimeout(resolve, 500))
        const capture = await window.webContents.capturePage()
        await writeFile(join(app.getPath('userData'), 'startup.png'), capture.toPNG())
        const preferences = (
          window.webContents as unknown as { getLastWebPreferences(): Electron.WebPreferences }
        ).getLastWebPreferences()
        await writeFile(
          join(app.getPath('userData'), 'startup.json'),
          JSON.stringify(
            {
              version: app.getVersion(),
              packaged: app.isPackaged,
              heading,
              sandbox: preferences.sandbox,
              contextIsolation: preferences.contextIsolation,
              nodeIntegration: preferences.nodeIntegration,
              database: resolveDatabasePath()
            },
            null,
            2
          )
        )
        app.quit()
      })().catch((error) => {
        console.error('Startup verification failed', error)
        app.exit(1)
      })
    })
  }

  // Avoid the white flash while React mounts.
  window.once('ready-to-show', () => window.show())

  // Any external link opens in the user's browser, never in an app window.
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event) => event.preventDefault())
  window.webContents.on('will-attach-webview', (event) => event.preventDefault())

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    trustRenderer(window.webContents, process.env['ELECTRON_RENDERER_URL'])
    void window.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    trustRenderer(window.webContents, pathToFileURL(join(__dirname, '../renderer/index.html')).href)
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
  registerDeliveryHandlers()
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
      'SlipFlow cannot open its database',
      [
        'The production database could not be opened, so SlipFlow has to close.',
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
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) =>
      callback(false)
    )
    session.defaultSession.setPermissionCheckHandler(() => false)
    registerIpcHandlers()
    createMainWindow()
    const backupTimer = startAutomaticBackups()
    app.once('before-quit', () => clearInterval(backupTimer))

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
