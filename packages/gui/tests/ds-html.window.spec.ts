// T-689 acceptance line 3, properties 2 and 3 of 3: opening
// `ds/design-system.html` from `file://` logs no console error, and
// `document.fonts.check('12px Pretendard')` is true. Property 1 (zero network
// requests) is a static fact checked without a browser in
// `scripts/qa/ds-html.test.ts`.
//
// WHY THIS IS A PLAYWRIGHT SPEC, NOT A VITEST TEST, AND WHY IT IS `@window`
//
// MEASURED (2026-09-26): `chromium.launch()` (`@playwright/test`) cannot run
// under this suite's isolation guard at all — it spawns its child with
// `detached: true`, which `tests/isolation-rules.cjs` rule 6 refuses
// unconditionally (S13: a detached child can outlive the run and write after
// the tripwire's last fingerprint).
//
// Routing around rule 6 with a manual, non-detached `child_process.spawn` does
// not avoid the rest of the guard, and should not: any Chromium-family launch
// needs its OWN `--user-data-dir` regardless (Chromium's default profile dir
// reads the OS account's home, not a sandboxed `HOME` env var — the exact
// hazard rule 2 exists for), and passing `--user-data-dir` is itself the first
// of rule 2's five "is this app-shaped" signals. An app-shaped launch is then
// gated by the WINDOW RULE, same as `_electron.launch()`: refused on this host
// unless `PRODUCTUNE_ALLOW_WINDOWS=1`, with no headless-mode exemption — the
// guard cannot tell a real window from a headless one and is deliberately
// strict about it (`docs/wiki/fact--qa-cua-vm.md`).
//
// That is exactly the gate `playwright.config.ts` already wires every other
// window-needing assertion in this suite through: tag the title `@window`, and
// the config grep-inverts it out of a host run (this file is skipped, by
// design, when you run `pnpm smoke` at your desk) while the VM — which sets
// `PRODUCTUNE_ALLOW_WINDOWS=1` — runs it for real. No isolation-rules.cjs
// change, no new entry point: this spec calls the SAME guarded
// `child_process.spawn` every other test in this suite goes through, with a
// `--user-data-dir` under the OS temp dir and `detached: false` so rule 6 never
// fires and the process is reaped (see `afterAll`) before the test returns.
//
// The browser itself is never launched via Playwright's own `chromium.launch()`
// — that call is what rule 6 refuses. Instead: locate the cached executable
// via `chromium.executablePath()` (a pure path lookup, no launch), spawn it
// directly, then attach with `chromium.connectOverCDP()`, which only opens a
// WebSocket to an already-running process and performs no spawn of its own.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import net from 'node:net'
import { test, expect, chromium } from '@playwright/test'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DS_HTML = path.resolve(__dirname, '../ds/design-system.html')

// Same fix as the vitest file used to need: `playwright.config.ts` repoints
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
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ds-html-window-spec-'))
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

/** Render `html` (a string, not a file) and collect console errors + font check. */
async function renderAndObserve(
  cdpBase: string,
  html: string,
): Promise<{ consoleErrors: string[]; fontsPretendard12pxAvailable: boolean }> {
  const browser = await chromium.connectOverCDP(cdpBase)
  try {
    const ctx = browser.contexts()[0] ?? (await browser.newContext())
    const page = await ctx.newPage()
    const consoleErrors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text())
    })
    page.on('pageerror', (err) => consoleErrors.push(String(err)))
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ds-html-window-fixture-'))
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
      return { consoleErrors, fontsPretendard12pxAvailable }
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

test.describe('ds/design-system.html — rendered in a real browser @window', () => {
  let execPath: string
  let child: ChildProcessWithoutNullStreams
  let cdpBase: string
  let userDataDir: string

  test.beforeAll(async () => {
    expect(
      fs.existsSync(DS_HTML),
      `${DS_HTML} does not exist — run \`pnpm --filter @productune/gui ds\` first`,
    ).toBe(true)
    execPath = chromium.executablePath()
    ;({ child, cdpBase, userDataDir } = await spawnHeadlessChrome(execPath))
  }, 30_000)

  test.afterAll(async () => {
    await stopHeadlessChrome(child, userDataDir)
  })

  test('logs no console error @window', async () => {
    const html = fs.readFileSync(DS_HTML, 'utf8')
    const { consoleErrors } = await renderAndObserve(cdpBase, html)
    expect(consoleErrors).toEqual([])
  })

  test('has Pretendard available for document.fonts.check @window', async () => {
    const html = fs.readFileSync(DS_HTML, 'utf8')
    const { fontsPretendard12pxAvailable } = await renderAndObserve(cdpBase, html)
    expect(fontsPretendard12pxAvailable).toBe(true)
  })

  // Non-vacuous controls: each property above must be able to FAIL, on a
  // fixture built to break exactly it, or the assertion above could be passing
  // for the wrong reason.
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
})
