/**
 * T-439 QA fail rows — proved against the REAL packaged-layout Electron app.
 *
 * QA's post-mortem of the previous round: "proving the installer returns ok is
 * not proving the app can see the install", and "proving a string-cleaning
 * function is pure is not proving the string renders on the screen where the
 * failure occurs". So neither of these tests asserts on a code path. Each drives
 * the shipped app in a synthetic participant HOME and reads the rendered DOM.
 *
 *   1. BLOCKER — engine detection. HOME is a fresh dir with NO shell profile of
 *      any kind. The engine row is observed at "not installed"; the launcher
 *      then appears at ~/.local/bin/claude exactly as the official installer
 *      leaves it (no shell integration written); the row is observed to advance
 *      to the installed state IN THE SAME APP RUN, after the login-shell PATH
 *      cache has already been warmed by the first check.
 *
 *   2. HIGH — project:create failure surface. `~/productune` is made a FILE, so
 *      the real main-process handler's `mkdirSync` genuinely throws ENOTDIR.
 *      Nothing is stubbed: a real IPC rejection is triggered on the real create
 *      button, and the test asserts the message is VISIBLE, with a real bounding
 *      box, on the version step — the screen the failure happens on.
 *
 * Run: pnpm --filter @productune/gui exec playwright test tests/t439.spec.ts
 * (after `vite build && ln -sfn dist renderer`, same prerequisite as smoke).
 */

import fs from 'fs'
import path from 'path'
import { test, expect } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { GUI_ROOT, launchApp, sandboxHome } from './harness'

const PROFILE_FILES = ['.zprofile', '.zshrc', '.zshenv', '.profile', '.bash_profile', '.bashrc']

/** A HOME as a fresh macOS account has it: no shell profile has ever been written. */
function freshHome(tag: string): string {
  const home = sandboxHome(`t439-${tag}`)
  for (const f of PROFILE_FILES) {
    expect(fs.existsSync(path.join(home, f)), `${f} must not exist in a fresh HOME`).toBe(false)
  }
  return home
}

/** Write the launcher exactly where the official native installer puts it. */
function placeInstalledCli(home: string): string {
  const binDir = path.join(home, '.local', 'bin')
  fs.mkdirSync(binDir, { recursive: true })
  const launcher = path.join(binDir, 'claude')
  fs.writeFileSync(
    launcher,
    '#!/bin/bash\n' +
      'if [ "$1" = "--version" ]; then echo "2.1.211 (Claude Code)"; exit 0; fi\n' +
      'if [ "$1" = "auth" ]; then echo \'{"loggedIn":false}\'; exit 0; fi\n' +
      'exit 0\n',
    { mode: 0o755 },
  )
  return launcher
}

function assertNoShellIntegration(home: string) {
  for (const f of PROFILE_FILES) {
    const p = path.join(home, f)
    const size = fs.existsSync(p) ? fs.statSync(p).size : 0
    expect(size, `${f} must stay empty/absent — the installer writes no shell integration`).toBe(0)
  }
}

/**
 * T-442 F1/F5: this spec always injected `HOME`, which is why QA read it as the
 * correct example — but HOME alone leaves Electron's userData on the real
 * account (measured: `app.getPath('userData')` ignores $HOME on macOS). So this
 * spec too was writing the real ~/Library/Application Support/productune and
 * contending for the real app's single-instance lock. `launchApp` adds the
 * second redirection; the env below keeps this spec's own fresh-Mac floor.
 */
async function launch(home: string): Promise<ElectronApplication> {
  return launchApp({
    home,
    env: {
      // A login shell reporting the stock macOS PATH — the fresh-Mac floor.
      // Deterministic so the runner's own PATH can never leak a real claude in.
      SHELL: '/bin/bash',
      PATH: '/usr/bin:/bin:/usr/sbin:/sbin',
    },
  })
}

/**
 * Everything rendered on the step, whitespace-normalised. Read from #root
 * rather than a narrow node so a locator that silently drifts cannot make the
 * assertions vacuous — the strings below are what a participant literally sees.
 */
async function screenText(win: Page): Promise<string> {
  return (await win.locator('#root').innerText()).replace(/\s+/g, ' ').trim()
}

/** The row's three possible status labels (en) — mutually exclusive by design. */
const ROW_NOT_INSTALLED = 'not installed'
const ROW_INSTALLED_NO_AUTH = 'installed · not authed'

/** True only for the "not installed" state — `installed · not authed` also
 *  contains the substring "installed", so ordering matters here. */
function rowSaysNotInstalled(text: string): boolean {
  return text.includes(ROW_NOT_INSTALLED) && !text.includes(ROW_INSTALLED_NO_AUTH)
}

// ── 1. BLOCKER: the app must see an install performed on an untouched profile ──

test('T-439 BLOCKER: engine row advances after install on a shell-profile-untouched HOME', async () => {
  const home = freshHome('detect')
  const app = await launch(home)

  try {
    const win = await app.firstWindow()
    await win.waitForLoadState('domcontentloaded')
    await win.waitForSelector('#root > *', { timeout: 20_000 })

    // Walk the participant path to the engine-connect step (0 → 1 → 2 → 3).
    for (let i = 0; i < 3; i++) {
      const next = win.locator('button:has-text("Next"), button:has-text("다음")').last()
      await next.click()
      await win.waitForTimeout(400)
    }

    // Step 3 reached: an Install control is on screen and the row says so.
    const installBtn = win.locator('button:has-text("Install Claude Code")')
    await expect(installBtn, 'expected the engine-connect step with an Install control').toBeVisible({ timeout: 20_000 })
    const before = await screenText(win)
    expect(before).toContain('ENGINE CONNECTION')
    expect(rowSaysNotInstalled(before), `row should start not-installed, screen was: ${before}`).toBe(true)

    // The install happens — this is the on-disk state installClaudeCli verifies
    // and returns ok on. Crucially it writes NO shell integration...
    const launcher = placeInstalledCli(home)
    expect(fs.existsSync(launcher)).toBe(true)
    assertNoShellIntegration(home)
    // ...and ~/.local/bin is on no shell's PATH here.
    expect(process.env.PATH ?? '').not.toContain(path.join(home, '.local', 'bin'))

    // Re-detect in the SAME app run — the login-shell PATH cache was already
    // warmed by the check on entry to this step, i.e. before the install.
    await win.evaluate(() => window.dispatchEvent(new Event('focus')))

    // Poll for the TARGET state, not merely "no longer says not-installed" —
    // the row briefly renders a "checking" placeholder on every re-detect, and
    // treating that as success would make this assertion vacuous.
    await expect
      .poll(async () => (await screenText(win)).includes(ROW_INSTALLED_NO_AUTH), {
        timeout: 20_000,
        message: 'engine row never advanced past "not installed" — QA\'s infinite Install loop',
      })
      .toBe(true)

    const after = await screenText(win)
    expect(after, 'row must now report the install it performed').toContain(ROW_INSTALLED_NO_AUTH)
    expect(rowSaysNotInstalled(after)).toBe(false)
    expect(after, `row did not change. before="${before}"`).not.toBe(before)

    // The loop is broken: the Install button is gone, replaced by sign-in.
    await expect(win.locator('button:has-text("Install Claude Code")')).toHaveCount(0)
    await expect(win.locator('button:has-text("Connect")')).toBeVisible()

    await win.screenshot({ path: path.join(GUI_ROOT, 'test-results', 't439-engine-row-advanced.png') })
  } finally {
    await app.close()
    fs.rmSync(home, { recursive: true, force: true })
  }
})

// ── 2. HIGH: a failed project:create must be visible where it happens ─────────

test('T-439 HIGH: a real project:create failure renders on the version step', async () => {
  const home = freshHome('create')
  // Onboarding-complete markers so the app opens on the home view (App.tsx
  // gates the wizard on productune.env AND a persisted language pref).
  fs.mkdirSync(path.join(home, '.productune'), { recursive: true })
  fs.writeFileSync(path.join(home, '.productune', 'productune.env'), 'MY_PO_ENGINE=claude\n')
  fs.writeFileSync(
    path.join(home, '.productune', 'settings.json'),
    JSON.stringify({ ui: { language: 'en' } }, null, 2),
  )
  // Make the projects base path un-creatable FOR REAL: `~/productune` is a file,
  // so project:create's own mkdirSync throws ENOTDIR in the main process.
  fs.writeFileSync(path.join(home, 'productune'), 'not a directory\n')

  const app = await launch(home)
  try {
    const win = await app.firstWindow()
    await win.waitForLoadState('domcontentloaded')
    await win.waitForSelector('#root > *', { timeout: 20_000 })

    await win.locator('button:has-text("New project"), button:has-text("새 프로젝트")').first().click()
    await win.locator('input[placeholder="my-saas"]').fill('t439-fail-demo')
    await win.locator('button:has-text("Next"), button:has-text("다음")').last().click()

    // We are on the version step — the screen that owns the create.
    await expect(win.locator('text=/First Version ID|첫 번째 Version ID/')).toBeVisible({ timeout: 10_000 })
    // Nothing is shown yet.
    await expect(win.locator('[data-testid="version-init-error"]')).toHaveCount(0)

    await win.locator('button:has-text("Next"), button:has-text("다음")').last().click()

    // The failure must PAINT, on this screen, with a real box.
    const err = win.locator('[data-testid="version-init-error"]')
    await expect(err, 'the create failure must be rendered on the version step').toBeVisible({ timeout: 20_000 })
    const text = (await err.innerText()).trim()
    expect(text.length, 'error must not be empty').toBeGreaterThan(0)
    // The IPC plumbing must be stripped, the actionable cause kept.
    expect(text).not.toContain('Error invoking remote method')
    expect(text).toMatch(/ENOTDIR|not a directory/i)

    const box = await err.boundingBox()
    expect(box, 'error element has no bounding box — not actually on screen').not.toBeNull()
    expect(box!.width).toBeGreaterThan(4)
    expect(box!.height).toBeGreaterThan(4)

    // And the participant is not stranded: the step is interactive again.
    await expect(win.locator('button:has-text("Next"), button:has-text("다음")').last()).toBeEnabled()

    await win.screenshot({ path: path.join(GUI_ROOT, 'test-results', 't439-create-error.png') })
  } finally {
    await app.close()
    fs.rmSync(path.join(home, 'productune'), { force: true })
    fs.rmSync(home, { recursive: true, force: true })
  }
})
