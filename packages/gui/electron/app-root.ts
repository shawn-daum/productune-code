/**
 * app-root.ts — the single answer to "where is the gui package?" (T-442 F2).
 *
 * `app.getAppPath()` is NOT the package root, and two modules independently
 * assumed it was:
 *
 *   toolchain.ts      `join(getAppPath(), 'node_modules', 'npm')`
 *   prdt-bootstrap.ts `join(getAppPath(), '..', 'core')`
 *
 * Electron sets appPath to the package directory when it is handed one
 * (`electron .` → `<gui>`), but to the DIRECTORY OF THE MAIN SCRIPT when it is
 * handed a file (`electron dist-electron/main.js` → `<gui>/dist-electron`).
 * The second shape is how every Playwright spec boots the app, so both
 * resolutions were off by one directory for the entire test suite:
 *
 *   toolchain      → `<gui>/dist-electron/node_modules/npm`  (absent)
 *                    ⇒ `npm-payload-missing` on EVERY launch, which deletes the
 *                      user's npm/npx shims and marker. Destructive and silent.
 *   prdt-bootstrap → `<gui>/core`                            (absent)
 *                    ⇒ `payload-missing`, ~/.prdt provisioning never runs. Not
 *                      destructive, but it means the specs could never have
 *                      caught a T-431 regression.
 *
 * One resolver, so a third caller cannot invent a third wrong answer — the same
 * reason toolchain.ts has exactly one `toolchainBinDir()` (the T-439 lesson).
 */

import fs from 'fs'
import path from 'path'

/**
 * The package root containing `app.getAppPath()`: the nearest ancestor (or the
 * path itself) that has a `package.json`. Falls back to the input when there is
 * none, so a caller's error message still names a concrete location.
 *
 * Only meaningful for a NON-packaged app. In a packaged build the payloads come
 * from `process.resourcesPath` and this is not consulted.
 */
export function appPackageRoot(appPath: string): string {
  let dir = path.resolve(appPath)
  for (;;) {
    try {
      if (fs.statSync(path.join(dir, 'package.json')).isFile()) return dir
    } catch { /* keep walking */ }
    const parent = path.dirname(dir)
    if (parent === dir) return appPath
    dir = parent
  }
}
