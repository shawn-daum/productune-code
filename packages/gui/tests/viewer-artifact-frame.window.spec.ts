// T-1010 (rendered half of scripts/qa/viewer-artifact-frame.test.ts): over file://, clicking an
// HTML artifact row shows the page in the side panel's sandboxed iframe with no second click,
// plus a 「새 탭에서 열기」 link; a missing file shows the fallback note. Same @window pattern as
// ds-html.window.spec.ts (see its header): the browser is spawned directly
// (non-detached, own --user-data-dir) and attached over CDP, because
// chromium.launch() is refused by isolation rule 6.
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { test, expect, chromium } from '@playwright/test'
import { execFileSync } from 'node:child_process'

process.env.PLAYWRIGHT_BROWSERS_PATH ??= path.join(
  process.env.PRODUCTUNE_REAL_HOME ?? os.homedir(),
  'Library/Caches/ms-playwright',
)

const entry = (p: string, bytes?: number) => ({
  fields: { bucket: 'v1.10', path: p, kind: 'html', status: 'approved' },
  diskRel: `docs/artifacts/v1.10/${p}`,
  inlined: false,
  bytes,
})
const DATA = {
  poState: { stage: 'build', version: 'v1.10', current_task: null },
  currentVersion: 'v1.10',
  prd: { current: { rel: 'docs/prd/PRD.md', body: '' }, closed: [] },
  tickets: { included: [], omitted: [] },
  wiki: [],
  features: [],
  artifacts: { entries: [entry('mock.html', 80), entry('gone.html')] },
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.once('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      const a = srv.address()
      const port = typeof a === 'object' && a ? a.port : 0
      srv.close(() => resolve(port))
    })
  })
}

test.describe('HTML artifact renders in the side panel @window', () => {
  let child: ChildProcessWithoutNullStreams
  let dir: string
  let cdp: string
  let file: string

  test.beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'viewer-frame-spec-'))
    file = path.join(dir, 'viewer.html')
    fs.mkdirSync(path.join(dir, 'docs/artifacts/v1.10'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'docs/artifacts/v1.10/mock.html'), '<!doctype html><h1 id="m">MOCKUP-RENDERED</h1><script>try{document.getElementById("m").dataset.js="ran";parent.document.title="pwn"}catch(e){document.getElementById("m").dataset.blocked="yes"}</script>')
    const script = `import { renderPage } from ${JSON.stringify(path.resolve(__dirname, '../../viewer/lib/render.mjs'))};
      process.stdout.write(renderPage({ data: JSON.parse(process.env.FX), dark: new Map(), light: new Map(), fontFaceCss: '', tokensSha256: '', artifactsBaseHref: './docs/artifacts', repoRootHref: '.', viewerAbsPath: process.env.VP }))`
    fs.writeFileSync(file, execFileSync(process.execPath, ['--input-type=module', '-e', script], { env: { ...process.env, FX: JSON.stringify(DATA), VP: file }, maxBuffer: 64 * 1024 * 1024 }))
    const port = await freePort()
    child = spawn(
      chromium.executablePath(),
      ['--headless=new', `--user-data-dir=${path.join(dir, 'profile')}`, '--no-sandbox', '--disable-gpu', '--use-mock-keychain', `--remote-debugging-port=${port}`],
      { detached: false, stdio: ['ignore', 'ignore', 'ignore'] },
    )
    cdp = `http://127.0.0.1:${port}`
    const deadline = Date.now() + 15_000
    for (;;) {
      try {
        if ((await fetch(`${cdp}/json/version`)).ok) break
      } catch {
        // not up yet
      }
      if (Date.now() > deadline) throw new Error('timed out waiting for CDP')
      await new Promise((r) => setTimeout(r, 100))
    }
  }, 30_000)

  test.afterAll(async () => {
    child.kill('SIGTERM')
    await new Promise((r) => setTimeout(r, 300))
    if (child.exitCode === null) child.kill('SIGKILL')
    fs.rmSync(dir, { recursive: true, force: true })
  })

  test('one click on the row shows the page in a sandboxed iframe; new-tab link; missing file falls back @window', async () => {
    const browser = await chromium.connectOverCDP(cdp)
    try {
      const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } })
      const page = await ctx.newPage()
      await page.goto(`file://${file}`)
      await page.addStyleTag({ content: '*{transition:none!important}' }) // headless draws no frames, so a 200ms slide-in would never finish
      await page.click('.activity-btn[data-store="artifact"]', { force: true })
      await page.click('.store-section[data-store="artifact"] tr[data-detail-kind="artifact"][data-detail-id="v1.10/mock.html"]', { force: true })
      const frame = page.frameLocator('.detail-panel.active iframe.detail-frame-view')
      await expect(frame.locator('#m')).toHaveText('MOCKUP-RENDERED')
      // sandboxed: its script ran but could not reach the viewer page
      await expect(frame.locator('#m')).toHaveAttribute('data-js', 'ran')
      await expect(frame.locator('#m')).toHaveAttribute('data-blocked', 'yes')
      expect(await page.title()).not.toBe('pwn')
      const link = page.locator('.detail-panel.active .detail-frame-bar a')
      await expect(link).toHaveText('새 탭에서 열기')
      const [popup] = await Promise.all([ctx.waitForEvent('page'), link.click({ force: true })])
      await popup.waitForLoadState()
      expect(popup.url()).toMatch(/docs\/artifacts\/v1\.10\/mock\.html$/)
      await expect(popup.locator('#m')).toHaveText('MOCKUP-RENDERED')
      await page.click('.detail-panel.active .detail-panel-close', { force: true })
      // missing file -> existing fallback note, no iframe
      await page.click('.store-section[data-store="artifact"] tr[data-detail-kind="artifact"][data-detail-id="v1.10/gone.html"]', { force: true })
      await expect(page.locator('.detail-panel.active .detail-nobody')).toContainText('이 문서는 페이지 안에 들어있지 않아요')
      await expect(page.locator('.detail-panel.active iframe')).toHaveCount(0)
      await ctx.close()
    } finally {
      await browser.close().catch(() => {})
    }
  })
})
