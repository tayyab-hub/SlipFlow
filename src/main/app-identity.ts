import { app } from 'electron'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The app's identity and data location, pinned before anything reads a path.
 *
 * The spec requires the database at `%APPDATA%\StitchFlow\stitchflow.db`, and neither
 * `productName` in package.json nor `app.setName()` is enough to guarantee that:
 * Electron resolves `userData` during startup, so a later rename does not move it. Left
 * alone it resolved to `%APPDATA%\Electron`, which is where the first Phase 2 run put the
 * database. So set the path explicitly — it is the only version that cannot drift, and it
 * also means renaming the app in package.json can never silently relocate the operator's
 * data.
 *
 * Must be called at module scope in every entry point, i.e. before `app.whenReady()`.
 */
export const APP_NAME = 'StitchFlow'
export const APP_USER_MODEL_ID = 'com.factorysoftware.stitchflow'

export function applyAppIdentity(): void {
  app.setName(APP_NAME)

  // `setPath` requires the directory to exist.
  const userDataDirectory = join(app.getPath('appData'), APP_NAME)
  mkdirSync(userDataDirectory, { recursive: true })
  app.setPath('userData', userDataDirectory)

  // Shows as "StitchFlow" in the Windows taskbar and notifications.
  app.setAppUserModelId(APP_USER_MODEL_ID)
}
