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
import { test, expect, chromium, type Browser, type Page } from '@playwright/test'

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
const VIEWER_HTML = path.resolve(__dirname, '../../viewer/viewer.html')

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
      // MEASURED (2026-09-26, cua VM) — same fix as tests/ds-html.window.spec.ts:
      // under this suite's sandboxed HOME (T-450), a fresh throwaway HOME has
      // no `~/Library/Keychains`, and Chrome's os_crypt "Safe Storage" keychain
      // item write (`SecItemAdd` → `StorageManager::optionalSearchList`)
      // deadlocks there forever with zero stderr — `sample` on the hung
      // process showed the main thread and a `copy_certificates_from_keychain`
      // thread both parked on the same Security-framework mutex
      // (`_pthread_mutex_firstfit_lock_wait`). It never happens with the real
      // HOME (an unlocked login keychain already exists). This flag is
      // Chromium's own escape hatch for exactly this class of CI/macOS
      // keychain hang — it only changes what THIS child process does with its
      // keychain access, not HOME or any real-home path.
      '--use-mock-keychain',
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
): Promise<{ consoleErrors: string[]; pretendardFontFaceLoaded: boolean; requestUrls: string[] }> {
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
    // PO root-cause (2026-09-26, cua VM): a `page.goto` never reaches 'load'
    // if a sub-resource request never SETTLES (succeeds or fails) — and this
    // VM's NAT networking does not answer a TEST-NET-1 (192.0.2.1) connection
    // fast, it hangs well past this suite's own timeouts (MEASURED via a
    // direct connectOverCDP probe: the request is issued, then neither
    // 'requestfinished' nor 'requestfailed' ever fires). The external-<img>
    // fixture control below only needs the request to be ISSUED — the
    // `page.on('request')` listener above already captures that regardless of
    // whether the request is then aborted. Aborting every non-file:// request
    // deterministically, right after Playwright has already recorded it,
    // removes the dependency on this VM's routing behaviour entirely and
    // costs nothing for the other fixtures (the real viewer.html issues none).
    await page.route('**/*', (route) => {
      const url = route.request().url()
      return url.startsWith('file://') ? route.continue() : route.abort('connectionfailed')
    })
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'viewer-html-window-fixture-'))
    const file = path.join(tmp, 'page.html')
    fs.writeFileSync(file, html)
    try {
      await page.goto(`file://${file}`)
      await page.waitForLoadState('load')
      // PO root-cause (2026-09-26): `document.fonts.check()` returns true
      // whenever nothing NEEDS loading — an unknown/undeclared family counts
      // as "nothing to load", so it can never fail (MEASURED: it returned
      // true for a nonsense family name and even with an unrelated
      // `@font-face` declared, under both the sandboxed and the real HOME).
      // The real question is whether a Pretendard FontFace was actually
      // registered and loaded, so check the FontFaceSet directly instead.
      const pretendardFontFaceLoaded = await page.evaluate(async () => {
        await document.fonts.ready
        return Array.from(document.fonts).some((f) => f.family === 'Pretendard' && f.status === 'loaded')
      })
      await page.close()
      return { consoleErrors, pretendardFontFaceLoaded, requestUrls }
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

/**
 * Like `renderAndObserve`, but leaves the page OPEN for the caller to drive
 * with clicks/keys instead of taking one static snapshot and closing it —
 * needed for the click-interaction tests below (T-666 slice 1a defect). The
 * caller must `page.close()` + `browser.close()` and remove `tmp` itself.
 */
async function openInteractivePage(
  cdpBase: string,
  html: string,
): Promise<{ browser: Browser; page: Page; tmp: string }> {
  const browser = await chromium.connectOverCDP(cdpBase)
  const ctx = browser.contexts()[0] ?? (await browser.newContext())
  const page = await ctx.newPage()
  // Same "zero network requests" defense as renderAndObserve — irrelevant to
  // what these tests assert, but keeps this helper safe to reuse as-is.
  await page.route('**/*', (route) => {
    const url = route.request().url()
    return url.startsWith('file://') ? route.continue() : route.abort('connectionfailed')
  })
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'viewer-html-window-interact-'))
  const file = path.join(tmp, 'page.html')
  fs.writeFileSync(file, html)
  await page.goto(`file://${file}`)
  await page.waitForLoadState('load')
  return { browser, page, tmp }
}

// T-706 root cause (measured 2026-09-27, this checkout's execution sandbox):
// every interaction test below hung at "waiting for element to be visible,
// enabled and stable" until Playwright's own action timeout, regardless of
// viewer.html's content — reproduced identically against the pre-T-706
// (ca78f9b) render.mjs/collect.mjs output, so it is not a T-706 regression.
// Isolated with a standalone probe: `requestAnimationFrame` never fires in
// this sandbox's spawned headless Chrome — a 3s poll scheduling 5 consecutive
// rAF callbacks got 0 — tried across `--headless=new` and legacy `--headless`,
// with and without `--disable-gpu`, and with
// `--use-angle=swiftshader --enable-unsafe-swiftshader` /
// `--run-all-compositor-stages-before-draw`; none changed the result.
// Playwright's default `.click()` actionability wait includes a "stable"
// check (two equal bounding-rect samples across animation frames), which
// therefore never resolves here. A raw CDP `Input.dispatchMouseEvent` at the
// element's real coordinates, and `page.click(..., { force: true })` (skips
// the actionability wait but still dispatches a real mouse click through the
// same input pipeline), both land correctly and flip the real interaction
// state (verified: the activity-bar switch and the detail-panel open both
// fire) — the page's own click delegator is not what is broken. `force:
// true` is used below for exactly that reason: it keeps every click a real,
// coordinate-based mouse event through the actual document click listener
// (the T-666 slice 1a defect this suite exists to catch would still fail it),
// while not depending on a browser property (rAF ticking) this sandbox does
// not provide. Non-click assertions (`toBeVisible`, `toHaveClass`,
// `toHaveCount`) do not use the "stable" check and were unaffected.
test.describe('viewer/viewer.html — rendered in a real browser @window', () => {
  let execPath: string
  let child: ChildProcessWithoutNullStreams
  let cdpBase: string
  let userDataDir: string

  test.beforeAll(async () => {
    expect(
      fs.existsSync(VIEWER_HTML),
      `${VIEWER_HTML} does not exist — run \`pnpm --filter @productune/viewer viewer\` first`,
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
    const { pretendardFontFaceLoaded } = await renderAndObserve(cdpBase, html)
    expect(pretendardFontFaceLoaded).toBe(true)
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
    const { pretendardFontFaceLoaded } = await renderAndObserve(cdpBase, broken)
    expect(pretendardFontFaceLoaded).toBe(false)
  })

  // The viewer's own fixture written to a throwaway `file://` path is itself
  // an external request source if it references anything network-shaped — a
  // page that DOES fetch must fail this control, or "zero non-file://
  // requests" above could be passing for the wrong reason (e.g. a page.on
  // listener that never fires).
  // Uses 192.0.2.1 (RFC 5737 TEST-NET-1, reserved for documentation) rather
  // than a real hostname, so no DNS lookup is involved. `page.on('request')`
  // fires as the request is ISSUED, before the browser learns whether it
  // will succeed — and on THIS VM's NAT networking it never learns: the
  // connection just hangs (MEASURED 2026-09-26) rather than failing fast, so
  // `renderAndObserve`'s route handler aborts every non-file:// request right
  // after recording it, and this test never needs the network to answer.
  test('fixture control: an external <img src> produces a non-file:// request @window', async () => {
    const broken = '<!doctype html><html><body><img src="http://192.0.2.1/does-not-exist.png"></body></html>'
    const { requestUrls } = await renderAndObserve(cdpBase, broken)
    expect(requestUrls.some((u) => u.startsWith('http://192.0.2.1/'))).toBe(true)
  })

  // T-666 slice 1a defect (d-T666-s1a-fix-0926): the vitest suite (which only
  // asserts on markup strings) stayed green while clicking a ticket row did
  // nothing in a real browser, and the sidebar group buttons did nothing
  // either. Root cause: the click delegator's activity-bar branch matched on
  // `ev.target.closest('[data-store]')`, but `.store-section` ALSO carries a
  // `data-store` attribute (it's what the activity-bar switch toggles), so
  // every click anywhere inside a store section (a ticket row, a sidebar
  // group button) matched that closest() first and returned before reaching
  // the group-select / detail-row branches below it. These two tests drive
  // the real generated `viewer.html` in an actual browser (unlike the vitest
  // suite's string/markup assertions) and fail on that bug.
  test('clicking a ticket row opens its detail panel with the ticket body; Escape and outside click close it; another row swaps the ticket @window', async () => {
    const html = fs.readFileSync(VIEWER_HTML, 'utf8')
    const { browser, page, tmp } = await openInteractivePage(cdpBase, html)
    try {
      await page.click('.activity-btn[data-store="ticket"]', { force: true })
      // T-709 결정 1: sidebar groups now sort newest-version-first (e.g.
      // v2.0/v1.11 ahead of the current v1.10), and every bucket's rows
      // share the same `.detail-row` class (`ticketRowsTable` is reused for
      // frontmatter-only buckets too) — so the DOM's first `.detail-row`
      // can belong to a non-active bucket pane, hidden via `.view-pane`
      // without `.active`. Scope to the active pane (the current version,
      // via `defaultKey`) so `.first()` resolves to a visible row.
      const rows = page.locator('#store-ticket .view-pane.active .detail-row')
      await expect(rows.first()).toBeVisible()

      await rows.nth(0).click({ force: true })
      await expect(page.locator('#store-ticket .detail-panel.active')).toHaveCount(1)
      const firstTitle = await page.locator('#store-ticket .detail-panel-title').innerText()
      expect(firstTitle.length).toBeGreaterThan(0)
      const bodyText = await page.locator('#store-ticket .detail-panel-body').innerText()
      expect(bodyText.length).toBeGreaterThan(0)

      await page.keyboard.press('Escape')
      await expect(page.locator('#store-ticket .detail-panel.active')).toHaveCount(0)

      await rows.nth(0).click({ force: true })
      await expect(page.locator('#store-ticket .detail-panel.active')).toHaveCount(1)
      await page.click('#store-ticket .topstrip', { force: true })
      await expect(page.locator('#store-ticket .detail-panel.active')).toHaveCount(0)

      await rows.nth(1).click({ force: true })
      await expect(page.locator('#store-ticket .detail-panel.active')).toHaveCount(1)
      const secondTitle = await page.locator('#store-ticket .detail-panel-title').innerText()
      expect(secondTitle).not.toBe(firstTitle)
    } finally {
      await page.close()
      fs.rmSync(tmp, { recursive: true, force: true })
      await browser.close().catch(() => {})
    }
  }, 30_000)

  test('clicking the backlog sidebar group shows the backlog pane; clicking back shows the current-version pane @window', async () => {
    const html = fs.readFileSync(VIEWER_HTML, 'utf8')
    const { browser, page, tmp } = await openInteractivePage(cdpBase, html)
    try {
      await page.click('.activity-btn[data-store="ticket"]', { force: true })
      // T-709 결정 1: sidebar order is newest-version-first now, so the
      // first `[data-group-select]` button in DOM order is a roadmap
      // bucket (e.g. v2.0), not the default-active one — the current
      // version keeps its `.active` class via `defaultKey` regardless of
      // where it sits in that order (`groupedStore`'s `defaultIndex`).
      // Select by `.active`, not DOM position (same pattern as the
      // breadcrumb test above).
      const activeBtn = page.locator('#store-ticket [data-group-select].active').first()
      const currentGroup = await activeBtn.getAttribute('data-group-select')
      expect(currentGroup).toBeTruthy()
      // Pin: the default-active group really is the current version (its
      // label carries the "· 현재" tag) — not merely "whichever bucket
      // happened to land first" (T-709.md 결정 1 `TICKET.currentTag`),
      // the exact viewer-bug shape this fix could otherwise have masked.
      const activeLabel = await activeBtn.locator('span').first().innerText()
      expect(activeLabel).toContain('현재')
      await expect(page.locator(`#store-ticket .view-pane[data-group="${currentGroup}"]`)).toHaveClass(/active/)

      await page.click('#store-ticket [data-group-select="backlog"]', { force: true })
      await expect(page.locator('#store-ticket .view-pane[data-group="backlog"]')).toHaveClass(/active/)
      await expect(page.locator(`#store-ticket .view-pane[data-group="${currentGroup}"]`)).not.toHaveClass(/active/)

      await page.click(`#store-ticket [data-group-select="${currentGroup}"]`, { force: true })
      await expect(page.locator(`#store-ticket .view-pane[data-group="${currentGroup}"]`)).toHaveClass(/active/)
      await expect(page.locator('#store-ticket .view-pane[data-group="backlog"]')).not.toHaveClass(/active/)
    } finally {
      await page.close()
      fs.rmSync(tmp, { recursive: true, force: true })
      await browser.close().catch(() => {})
    }
  }, 30_000)

  // T-708 결함 5: the group-switch handler used to write the raw
  // `data-group-select` KEY into the breadcrumb ('progress', 'backlog', a
  // version/bucket key) instead of the label the reader already sees on the
  // pressed button — reproduced by re-clicking an ALREADY-active button
  // (docs/artifacts/v1.10/viewer-home-2000-breadcrumb-bug.png), so the
  // pre-click breadcrumb (server-rendered, always correct — see this
  // ticket's outcome) can't hide the bug. Pins: after that click, the
  // breadcrumb reads the button's own visible label text, never the key.
  test('re-clicking the already-active sidebar group keeps the breadcrumb on its label, never the raw group key @window', async () => {
    const html = fs.readFileSync(VIEWER_HTML, 'utf8')
    const { browser, page, tmp } = await openInteractivePage(cdpBase, html)
    try {
      await page.click('.activity-btn[data-store="home"]', { force: true })
      const activeBtn = page.locator('#store-home [data-group-select].active').first()
      const key = await activeBtn.getAttribute('data-group-select')
      const labelText = await activeBtn.locator('span').first().innerText()
      expect(key).toBeTruthy()
      expect(labelText.length).toBeGreaterThan(0)

      await activeBtn.click({ force: true })
      const crumbText = await page.locator('#store-home .js-group-label').innerText()
      expect(crumbText).toBe(labelText)
      expect(crumbText).not.toBe(key)
    } finally {
      await page.close()
      fs.rmSync(tmp, { recursive: true, force: true })
      await browser.close().catch(() => {})
    }
  }, 30_000)

  // T-708 결함 4: the approved mockup's frame starts directly at the activity
  // bar — no title bar, no build-fact banner. Pins both halves: no <header>
  // element anywhere in the rendered page, and the activity bar is the
  // app-shell's own first thing a reader's eye reaches.
  test('the rendered page draws no <header> banner @window', async () => {
    const html = fs.readFileSync(VIEWER_HTML, 'utf8')
    const { browser, page, tmp } = await openInteractivePage(cdpBase, html)
    try {
      await expect(page.locator('header')).toHaveCount(0)
      await expect(page.locator('.app-shell .activity').first()).toBeVisible()
    } finally {
      await page.close()
      fs.rmSync(tmp, { recursive: true, force: true })
      await browser.close().catch(() => {})
    }
  }, 30_000)

  // T-708 슬라이스 2 결함 9 (PO 실측, headless 2000×900): .store-section 이
  // 900 이 아니라 876 에서 끝나고 사이드바/본문 열은 851 에서 끝나 두 개의 빈
  // 띠가 남았다 — root cause: T-665's retired flat layout's bare
  // `section {margin-bottom/padding-bottom/border-bottom}` rule still
  // matched `.store-section` (a real `<section>`), the only element that
  // selector could still reach. Pins the fix at the SAME viewport PO used.
  test('the frame fills the viewport height — no empty band below the sidebar/main columns or at the bottom of the window @window', async () => {
    const html = fs.readFileSync(VIEWER_HTML, 'utf8')
    const { browser, page, tmp } = await openInteractivePage(cdpBase, html)
    try {
      await page.setViewportSize({ width: 2000, height: 900 })
      const rects = await page.evaluate(() => {
        const r = (el: Element | null) => (el ? el.getBoundingClientRect() : null)
        return {
          innerHeight: window.innerHeight,
          storeSection: r(document.querySelector('.store-section.active')),
          sidebar: r(document.querySelector('.store-section.active .sidebar')),
          mainCol: r(document.querySelector('.store-section.active .frame-main-col')),
        }
      })
      expect(rects.storeSection!.bottom).toBe(rects.innerHeight)
      expect(rects.sidebar!.bottom).toBe(rects.innerHeight)
      expect(rects.mainCol!.bottom).toBe(rects.innerHeight)
    } finally {
      await page.close()
      fs.rmSync(tmp, { recursive: true, force: true })
      await browser.close().catch(() => {})
    }
  }, 30_000)

  // T-708 슬라이스 2 결함 10 (PO 결정, 사용자 축자 "전체의 네모 크기랑 아래
  // 배정된 네모 크기가 달라"): '전체' 줄 네모(과거 6×6/gap 2px)가 행렬 네모
  // (10×10/gap 3px)와 같은 크기가 됐는지 실제 렌더에서 확인 — 결함 3 은 행렬
  // 칸만 접고(nowrap+10개 cap), '전체' 줄은 접지 않되 넘치면 줄을 바꾼다.
  test("the overall progress row's squares match the matrix's own size/gap, never fold, and may wrap onto a 2nd line @window", async () => {
    const html = fs.readFileSync(VIEWER_HTML, 'utf8')
    const { browser, page, tmp } = await openInteractivePage(cdpBase, html)
    try {
      const sizes = await page.evaluate(() => {
        const overallSq = document.querySelector('.stage-overall-sq-wrap .stage-sq')
        const matrixSq = document.querySelector('.stage-matrix .stage-sq')
        const wrap = document.querySelector('.stage-overall-sq-wrap')
        const overallRect = overallSq!.getBoundingClientRect()
        const matrixRect = matrixSq!.getBoundingClientRect()
        return {
          overall: { width: overallRect.width, height: overallRect.height },
          matrix: { width: matrixRect.width, height: matrixRect.height },
          wrapFlexWrap: getComputedStyle(wrap!).flexWrap,
          wrapGap: getComputedStyle(wrap!).gap,
        }
      })
      expect(sizes.overall).toEqual(sizes.matrix)
      expect(sizes.overall.width).toBe(10)
      expect(sizes.wrapFlexWrap).toBe('wrap')
      await expect(page.locator('.stage-overall .stage-matrix-fold')).toHaveCount(0)

      // "may wrap": force the sq-wrap to a width narrower than its real
      // 61-square line and confirm it actually spans more than one visual
      // row (distinct top offsets among the squares) — proves `wrap` isn't
      // a dead value that never triggers in practice.
      const wraps = await page.evaluate(() => {
        const wrap = document.querySelector('.stage-overall-sq-wrap') as HTMLElement
        wrap.style.width = '200px'
        const tops = new Set(Array.from(wrap.querySelectorAll('.stage-sq')).map((el) => Math.round(el.getBoundingClientRect().top)))
        return tops.size
      })
      expect(wraps).toBeGreaterThan(1)
    } finally {
      await page.close()
      fs.rmSync(tmp, { recursive: true, force: true })
      await browser.close().catch(() => {})
    }
  }, 30_000)

  // T-708 슬라이스 2 결함 3: the matrix's own fold cap in the REAL generated
  // page (developer × 항목 밖 = 15 tickets today — measured 2026-09-27),
  // never a 2nd row for any matrix cell.
  test('a real matrix cell over 10 tickets shows exactly 10 squares plus a "+N" fold, all on one line — no matrix row ever wraps @window', async () => {
    const html = fs.readFileSync(VIEWER_HTML, 'utf8')
    const { browser, page, tmp } = await openInteractivePage(cdpBase, html)
    try {
      const fold = page.locator('#store-home .stage-matrix .stage-matrix-fold').first()
      await expect(fold).toHaveCount(1)
      const cell = page.locator('#store-home .stage-matrix .stage-matrix-fold').first().locator('xpath=ancestor::span[contains(@class,"stage-matrix-sq-wrap")]')
      const info = await cell.evaluate((el) => {
        const squares = Array.from(el.querySelectorAll('.stage-sq, .stage-sq-svg'))
        const tops = new Set(squares.map((s) => Math.round(s.getBoundingClientRect().top)))
        return { squareCount: squares.length, distinctRows: tops.size, flexWrap: getComputedStyle(el).flexWrap }
      })
      expect(info.squareCount).toBe(10)
      expect(info.distinctRows).toBe(1)
      expect(info.flexWrap).toBe('nowrap')
    } finally {
      await page.close()
      fs.rmSync(tmp, { recursive: true, force: true })
      await browser.close().catch(() => {})
    }
  }, 30_000)

  // T-708 슬라이스 2 결함 11: the buttons under the progress card are gone —
  // the sidebar's own 티켓/PRD rows are the only way to reach those stores.
  test('home carries no "티켓 목록 보기"/"PRD 열기" shortcut buttons under the progress card @window', async () => {
    const html = fs.readFileSync(VIEWER_HTML, 'utf8')
    const { browser, page, tmp } = await openInteractivePage(cdpBase, html)
    try {
      await expect(page.locator('#store-home .dash-actions')).toHaveCount(0)
      await expect(page.locator('#store-home .btn-secondary')).toHaveCount(0)
    } finally {
      await page.close()
      fs.rmSync(tmp, { recursive: true, force: true })
      await browser.close().catch(() => {})
    }
  }, 30_000)

  // T-666 slice 1b: wiki/feature/artifact/PRD now share the SAME
  // sidebar-group → list → detail-panel model the ticket store proved in
  // slice 1a (acceptance line 1). One real-browser row-open per store —
  // markup-string assertions alone already proved insufficient once
  // (slice 1a's defect, see this file's tests above) — plus outside-click
  // and Escape close, per store (acceptance line 2).
  for (const store of ['wiki', 'feature', 'artifact']) {
    test(`clicking a ${store} row opens its detail panel with a non-empty body; Escape closes it @window`, async () => {
      const html = fs.readFileSync(VIEWER_HTML, 'utf8')
      const { browser, page, tmp } = await openInteractivePage(cdpBase, html)
      try {
        await page.click(`.activity-btn[data-store="${store}"]`, { force: true })
        const rows = page.locator(`#store-${store} .detail-row`)
        await expect(rows.first()).toBeVisible()

        await rows.first().click({ force: true })
        await expect(page.locator(`#store-${store} .detail-panel.active`)).toHaveCount(1)
        const title = await page.locator(`#store-${store} .detail-panel-title`).innerText()
        expect(title.length).toBeGreaterThan(0)
        // Non-empty even for a non-inlined artifact (.html/.json) — the
        // fallback "say so + link the file" message, never a blank panel.
        const bodyText = await page.locator(`#store-${store} .detail-panel-body`).innerText()
        expect(bodyText.length).toBeGreaterThan(0)

        await page.keyboard.press('Escape')
        await expect(page.locator(`#store-${store} .detail-panel.active`)).toHaveCount(0)
      } finally {
        await page.close()
        fs.rmSync(tmp, { recursive: true, force: true })
        await browser.close().catch(() => {})
      }
    }, 30_000)
  }

  // T-666 slice 2a: home is now a `groupedStore()` workspace (progress /
  // ticket / artifact / prd), not a flat summary table — proving the sidebar
  // switch and the detail panel in a real browser, per the slice 1a lesson
  // that markup-string tests alone once passed while clicks were dead.
  test("home's sidebar rows switch its own main pane, and opening a ticket row from home opens home's own detail panel @window", async () => {
    const html = fs.readFileSync(VIEWER_HTML, 'utf8')
    const { browser, page, tmp } = await openInteractivePage(cdpBase, html)
    try {
      await expect(page.locator('#store-home')).toHaveClass(/active/)
      await expect(page.locator('#store-home .view-pane[data-group="progress"]')).toHaveClass(/active/)

      for (const group of ['ticket', 'artifact', 'prd', 'progress']) {
        await page.click(`#store-home [data-group-select="${group}"]`, { force: true })
        await expect(page.locator(`#store-home .view-pane[data-group="${group}"]`)).toHaveClass(/active/)
      }

      await page.click('#store-home [data-group-select="ticket"]', { force: true })
      const rows = page.locator('#store-home .detail-row[data-detail-kind="ticket"]')
      await expect(rows.first()).toBeVisible()
      await rows.first().click({ force: true })
      await expect(page.locator('#store-home .detail-panel.active')).toHaveCount(1)
      // Scoped to home's OWN panel — the ticket store's sibling section must
      // stay untouched (each `.store-section` carries its own `.detail-panel`).
      await expect(page.locator('#store-ticket .detail-panel.active')).toHaveCount(0)
      const bodyText = await page.locator('#store-home .detail-panel-body').innerText()
      expect(bodyText.length).toBeGreaterThan(0)

      await page.keyboard.press('Escape')
      await expect(page.locator('#store-home .detail-panel.active')).toHaveCount(0)
    } finally {
      await page.close()
      fs.rmSync(tmp, { recursive: true, force: true })
      await browser.close().catch(() => {})
    }
  }, 30_000)

  // T-709 결정 2: PRD no longer has one shared "closed" group listing every
  // closed round as a row that opens a detail panel — each closed round is
  // now its OWN sidebar group, rendered straight into its own `.view-pane`
  // body (no list → detail-panel indirection at all; a PRD version is
  // exactly one document, so "row" and "document" are the same thing —
  // T-709.md 결정 2). This replaces the old `data-group-select="closed"` +
  // `.detail-row` + `.detail-panel` flow that mechanism disproves.
  test("clicking a closed PRD round's sidebar group shows that round's body directly in its own pane @window", async () => {
    const html = fs.readFileSync(VIEWER_HTML, 'utf8')
    const { browser, page, tmp } = await openInteractivePage(cdpBase, html)
    try {
      await page.click('.activity-btn[data-store="prd"]', { force: true })
      const groupButtons = page.locator('#store-prd [data-group-select]')
      const groupCount = await groupButtons.count()
      // Group 0 is always "open" (the current version); decision 2 appends
      // one group per closed round after it — this repo has 13+ (measured,
      // T-709.md slice 2), so there is always at least one more.
      expect(groupCount).toBeGreaterThan(1)
      const closedKey = await groupButtons.nth(1).getAttribute('data-group-select')
      expect(closedKey).toBeTruthy()
      expect(closedKey).not.toBe('open')

      await groupButtons.nth(1).click({ force: true })
      const pane = page.locator(`#store-prd .view-pane[data-group="${closedKey}"]`)
      await expect(pane).toHaveClass(/active/)
      // No detail-row/detail-panel indirection left for this content.
      await expect(pane.locator('.detail-row')).toHaveCount(0)
      await expect(page.locator('#store-prd .detail-panel.active')).toHaveCount(0)
      const bodyText = await pane.innerText()
      expect(bodyText.length).toBeGreaterThan(0)
    } finally {
      await page.close()
      fs.rmSync(tmp, { recursive: true, force: true })
      await browser.close().catch(() => {})
    }
  }, 30_000)

  // T-766: home's stage line shows the current po-state stage plus ONE
  // version-wide done/total (never a per-type TYPE_TO_STAGE guess — T-755's
  // fix to statusline-prdt.sh, carried into the viewer by this ticket), and
  // the progress matrix's trailing "항목 밖" row (a ticket with no prd_item
  // never disappears) — driven against the REAL generated page's real ticket
  // data, not a fixture, per this file's own reason for being (slice 1a's
  // lesson: markup-string tests alone once passed while the real interaction
  // was dead).
  test("home's progress pane shows the current stage's version-wide done/total and a trailing row for a ticket with no prd_item @window", async () => {
    const html = fs.readFileSync(VIEWER_HTML, 'utf8')
    const { browser, page, tmp } = await openInteractivePage(cdpBase, html)
    try {
      await expect(page.locator('#store-home .view-pane[data-group="progress"]')).toHaveClass(/active/)
      const stageLineText = await page.locator('#store-home .stage-line').innerText()
      expect(stageLineText, `stage line "${stageLineText}" is not "<stage> | n/m"`).toMatch(
        /^(define|build|ship|retro|idle|\?) \| \d+\/\d+$/,
      )

      const rows = page.locator('#store-home .stage-matrix-row:not(.stage-matrix-head)')
      const rowCount = await rows.count()
      let trailingRowText: string | null = null
      for (let i = 0; i < rowCount; i++) {
        const text = await rows.nth(i).innerText()
        if (text.includes('항목 밖')) trailingRowText = text
      }
      expect(trailingRowText, 'no "항목 밖" trailing row found in the real matrix').not.toBeNull()
    } finally {
      await page.close()
      fs.rmSync(tmp, { recursive: true, force: true })
      await browser.close().catch(() => {})
    }
  }, 30_000)

  // T-666 slice 2b acceptance line 3: a relative document link inside a
  // rendered body resolves against the REAL viewer.html's own on-disk
  // directory, never leaving it to be treated as "next to viewer.html" (its
  // pre-fix behavior). Checked against the filesystem directly — the
  // strongest form of "points to the real file" this suite can assert.
  test('a relative document link inside a rendered body resolves to a real file on disk, not against viewer.html\'s own folder @window', async () => {
    const html = fs.readFileSync(VIEWER_HTML, 'utf8')
    const { browser, page, tmp } = await openInteractivePage(cdpBase, html)
    try {
      await page.click('.activity-btn[data-store="prd"]', { force: true })
      const links = page.locator('#store-prd .view-pane[data-group="open"] a[href]')
      await expect(links.first()).toBeVisible()
      const href = await links.first().getAttribute('href')
      expect(href).toBeTruthy()
      const targetAttr = await links.first().getAttribute('target')
      expect(targetAttr).toBe('_blank')
      const pathPart = decodeURI(href!.split('#')[0])
      const resolved = path.resolve(path.dirname(VIEWER_HTML), pathPart)
      expect(fs.existsSync(resolved), `relative link "${href}" does not resolve to a real file at ${resolved}`).toBe(true)
    } finally {
      await page.close()
      fs.rmSync(tmp, { recursive: true, force: true })
      await browser.close().catch(() => {})
    }
  }, 30_000)
})
