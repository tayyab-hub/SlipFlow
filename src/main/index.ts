import { app, BrowserWindow, ipcMain, session, shell } from 'electron'
import { join } from 'node:path'
import { IpcChannels } from '@shared/ipc-channels'
import type { AppInfo } from '@shared/types'

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

function registerIpcHandlers(): void {
  ipcMain.handle(IpcChannels.appInfo, (): AppInfo => {
    return {
      appVersion: app.getVersion(),
      electronVersion: process.versions.electron,
      platform: process.platform,
      packaged: app.isPackaged
    }
  })
}

// Single instance only — two copies of the app would later mean two writers on one
// SQLite file (Phase 2).
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
    // Shows as "StitchFlow" in the Windows taskbar / notifications.
    app.setAppUserModelId('com.factorysoftware.stitchflow')

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
}
