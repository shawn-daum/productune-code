import path from 'path'
import { test, expect, _electron as electron } from '@playwright/test'

// Smoke gate (surfaces.gui.smoke): app launches → renderer mounts → zero console errors.
// Run via `pnpm --filter @productune/gui smoke` — builds first, then symlinks
// renderer -> dist so main.js's packaged-layout path (`../renderer/index.html`) resolves
// in the repo layout.
const GUI_ROOT = path.resolve(__dirname, '..')

test('smoke: window opens, renderer mounts, zero console errors', async () => {
  const electronApp = await electron.launch({
    args: [path.join(GUI_ROOT, 'dist-electron', 'main.js')],
    cwd: GUI_ROOT,
  })

  const consoleErrors: string[] = []
  try {
    const window = await electronApp.firstWindow()
    window.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text())
    })
    window.on('pageerror', (err) => consoleErrors.push(String(err)))

    await window.waitForLoadState('domcontentloaded')
    await expect(window).toHaveTitle('productune')

    // Renderer mounted = React put something inside #root.
    await window.waitForSelector('#root > *', { timeout: 15_000 })

    // Let async init (IPC round-trips, store hydration) surface late errors.
    await window.waitForTimeout(1_000)

    expect(consoleErrors, `renderer console errors:\n${consoleErrors.join('\n')}`).toEqual([])
  } finally {
    await electronApp.close()
  }
})
