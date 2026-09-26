// T-665 slice 2 acceptance line 2: "a @window Playwright spec mirroring
// tests/ds-html.window.spec.ts (non-detached spawn + connectOverCDP,
// isolation rules untouched) asserts no console error,
// document.fonts.check('12px Pretendard'), and zero non-file:// requests."
//
// This file deliberately duplicates `tests/ds-html.window.spec.ts`'s
// spawn/CDP helpers rather than importing or refactoring them out — per this
// ticket's own outcome §미해결 (T-665, slice 1): the two pages are read by
// different generators (`ds/generate.mjs` vs `viewer/generate.mjs`) with
// their own acceptance lines, and `tests/isolation-rules.cjs` is explicitly
// out of scope for this ticket ("isolation rules untouched"). See that
// file's header for the full WHY (rule 6 refuses a detached Chromium launch;
// rule 2's app-shaped signal + the WINDOW RULE gate any `--user-data-dir`
// launch regardless of `--headless`; `chromium.connectOverCDP` is used
// because it performs no spawn of its own, only attaches to one already
// running).
//
// The one property THIS file adds beyond the ds-html spec: `viewer.html`
// inlines hundreds of real ticket/wiki/artifact documents this generator
// does not author (unlike `design-system.html`'s single input, tokens.css),
// so "zero network requests" is asserted at RUNTIME here — via
// `page.on('request', …)` — as the more direct evidence for this
// specific page, on top of (not instead of) the static check in
// `scripts/qa/viewer-html.test.ts`.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import net from 'node:net'
import { test, expect, chromium } from '@playwright/test'

// A plain path constant, not an import from `viewer/generate.mjs` — MEASURED:
// Playwright's own module loader runs this file as CJS and fails
// (`ReferenceError: exports is not defined in ES module scope`) on an ESM
// `.mjs` import chain, exactly the reason `tests/ds-html.window.spec.ts`
// also hardcodes its HTML path rather than importing `ds/generate.mjs`'s
// `OUTPUT_PATH`.
//
// The ambient CJS `__dirname` (NOT `path.dirname(fileURLToPath(import.meta.url))`)
// — MEASURED 2026-09-26 (PO + QA, cua VM): a top-level `import.meta.url`
// reference is what made `npx playwright test --list` fail to load THIS file
// and `tests/ds-html.window.spec.ts` with `ReferenceError: require is not
// defined in ES module scope` (thrown from tests/isolation-rules.cjs's
// patchedLoad hook), collecting 0 specs — every OTHER spec in this suite
// (`tests/isolation.guard.spec.ts`, `tests/harness.ts`, etc.) uses the plain
// `__dirname` global instead and loads fine, confirming `import.meta.url` was
// the one thing this file did differently.
const VIEWER_HTML = path.resolve(__dirname, '../viewer/viewer.html')

// Same fix as tests/ds-html.window.spec.ts: `playwright.config.ts` repoints
// `HOME` at a sandbox at module scope (T-450), so Playwright's own browser
// cache — downloaded once under the developer's REAL home — is invisible
// under the sandboxed HOME unless pointed back at it explicitly.
process.env.PLAYWRIGHT_BROWSERS_PATH ??= path.join(
  process.env.PRODUCTUNE_REAL_HOME ?? os.homedir(),
  'Library/Caches/ms-playwright',
)

/**
 * Spawn `execPath` headless, with its own throwaway `--user-data-dir`, and
 * resolve once its CDP endpoint answers — polling `/json/version` rather than
 * scraping stderr for "DevTools listening on ...", which this exact binary
 * has been observed to print with enough delay/buffering variance under a
 * Node child_process pipe to make a fixed-timeout scrape flaky.
 *
 * `detached: false` (the default, stated for clarity) is rule 6's whole
 * requirement: the child must not be able to outlive this process undetected.
 * The caller reaps it in a `finally`.
 */
async function spawnHeadlessChrome(execPath: string): Promise<{
  child: ChildProcessWithoutNullStreams
  cdpBase: string
  userDataDir: string
}> {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'viewer-html-window-spec-'))
  const port = await reserveFreePort()
  const child = spawn(
    execPath,
    [
      '--headless=new',
      `--user-data-dir=${userDataDir}`,
      '--no-sandbox',
      '--disable-gpu',
      `--remote-debugging-port=${port}`,
    ],
    { detached: false, stdio: ['ignore', 'ignore', 'pipe'] },
  )
  let stderr = ''
  child.stderr.on('data', (d) => {
    stderr += String(d)
  })
  const cdpBase = `http://127.0.0.1:${port}`
  await waitForCdp(cdpBase, child, () => stderr)
  return { child, cdpBase, userDataDir }
}

function reserveFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.once('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address()
      const port = typeof addr === 'object' && addr ? addr.port : 0
      srv.close(() => resolve(port))
    })
  })
}

async function waitForCdp(
  cdpBase: string,
  child: ChildProcessWithoutNullStreams,
  readStderr: () => string,
  timeoutMs = 15_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  let exited = false
  child.once('exit', () => {
    exited = true
  })
  while (Date.now() < deadline) {
    if (exited) {
      throw new Error(`chrome-headless exited before answering CDP.\nstderr:\n${readStderr()}`)
    }
    try {
      const res = await fetch(`${cdpBase}/json/version`)
      if (res.ok) return
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error(`timed out waiting for CDP at ${cdpBase}.\nstderr:\n${readStderr()}`)
}

/** Reap the child and its throwaway profile. Never leaves a process behind. */
async function stopHeadlessChrome(child: ChildProcessWithoutNullStreams, userDataDir: string): Promise<void> {
  if (child.exitCode === null && child.signalCode === null) {
    child.kill('SIGTERM')
    await Promise.race([
      new Promise((resolve) => child.once('exit', resolve)),
      new Promise((resolve) => setTimeout(resolve, 5_000)),
    ])
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
  }
  fs.rmSync(userDataDir, { recursive: true, force: true })
}

/**
 * Render `html` (a string, not a file — same as the ds-html window spec) and
 * collect console errors + the font check + every request the page issues.
 */
async function renderAndObserve(
  cdpBase: string,
  html: string,
): Promise<{ consoleErrors: string[]; fontsPretendard12pxAvailable: boolean; requestUrls: string[] }> {
  const browser = await chromium.connectOverCDP(cdpBase)
  try {
    const ctx = browser.contexts()[0] ?? (await browser.newContext())
    const page = await ctx.newPage()
    const consoleErrors: string[] = []
    const requestUrls: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text())
    })
    page.on('pageerror', (err) => consoleErrors.push(String(err)))
    page.on('request', (req) => requestUrls.push(req.url()))
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'viewer-html-window-fixture-'))
    const file = path.join(tmp, 'page.html')
    fs.writeFileSync(file, html)
    try {
      await page.goto(`file://${file}`)
      await page.waitForLoadState('load')
      const fontsPretendard12pxAvailable = await page.evaluate(async () => {
        await document.fonts.ready
        return document.fonts.check('12px Pretendard')
      })
      await page.close()
      return { consoleErrors, fontsPretendard12pxAvailable, requestUrls }
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  } finally {
    // Do not close the underlying Chrome process here — `connectOverCDP`'s
    // `browser.close()` would send it a shutdown command; the caller reaps
    // the process itself via `stopHeadlessChrome`.
    await browser.close().catch(() => {})
  }
}

test.describe('viewer/viewer.html — rendered in a real browser @window', () => {
  let execPath: string
  let child: ChildProcessWithoutNullStreams
  let cdpBase: string
  let userDataDir: string

  test.beforeAll(async () => {
    expect(
      fs.existsSync(VIEWER_HTML),
      `${VIEWER_HTML} does not exist — run \`pnpm --filter @productune/gui viewer\` first`,
    ).toBe(true)
    execPath = chromium.executablePath()
    ;({ child, cdpBase, userDataDir } = await spawnHeadlessChrome(execPath))
  }, 30_000)

  test.afterAll(async () => {
    await stopHeadlessChrome(child, userDataDir)
  })

  test('logs no console error @window', async () => {
    const html = fs.readFileSync(VIEWER_HTML, 'utf8')
    const { consoleErrors } = await renderAndObserve(cdpBase, html)
    expect(consoleErrors).toEqual([])
  })

  test('has Pretendard available for document.fonts.check @window', async () => {
    const html = fs.readFileSync(VIEWER_HTML, 'utf8')
    const { fontsPretendard12pxAvailable } = await renderAndObserve(cdpBase, html)
    expect(fontsPretendard12pxAvailable).toBe(true)
  })

  test('issues zero non-file:// requests @window', async () => {
    const html = fs.readFileSync(VIEWER_HTML, 'utf8')
    const { requestUrls } = await renderAndObserve(cdpBase, html)
    const nonFile = requestUrls.filter((u) => !u.startsWith('file://'))
    expect(nonFile).toEqual([])
  })

  // Non-vacuous controls: each property above must be able to FAIL, on a
  // fixture built to break exactly it, or the assertion above could be
  // passing for the wrong reason.
  test('fixture control: a script that throws is caught as a console error @window', async () => {
    const broken = '<!doctype html><html><body><script>throw new Error("boom")</script></body></html>'
    const { consoleErrors } = await renderAndObserve(cdpBase, broken)
    expect(consoleErrors.length).toBeGreaterThan(0)
  })

  test('fixture control: a page with no @font-face fails the Pretendard check @window', async () => {
    const broken = '<!doctype html><html><head></head><body>no fonts here</body></html>'
    const { fontsPretendard12pxAvailable } = await renderAndObserve(cdpBase, broken)
    expect(fontsPretendard12pxAvailable).toBe(false)
  })

  // The viewer's own fixture written to a throwaway `file://` path is itself
  // an external request source if it references anything network-shaped — a
  // page that DOES fetch must fail this control, or "zero non-file://
  // requests" above could be passing for the wrong reason (e.g. a page.on
  // listener that never fires).
  // Uses 192.0.2.1 (RFC 5737 TEST-NET-1, reserved for documentation — no
  // route ever exists to it) rather than a real hostname, so the request
  // fails fast with no route instead of stalling on a DNS lookup; either way
  // `page.on('request')` fires as the request is ISSUED, before the browser
  // learns whether it will succeed.
  test('fixture control: an external <img src> produces a non-file:// request @window', async () => {
    const broken = '<!doctype html><html><body><img src="http://192.0.2.1/does-not-exist.png"></body></html>'
    const { requestUrls } = await renderAndObserve(cdpBase, broken)
    expect(requestUrls.some((u) => u.startsWith('http://192.0.2.1/'))).toBe(true)
  })
})
