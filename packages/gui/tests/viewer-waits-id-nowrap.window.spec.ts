// T-994: a ticket id in the Home waits column (.cp-went) never splits across
// lines at 1280–2560 px; the slug wraps instead. Same @window pattern as
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

const mk = (id: string, type: string, assignee: string, slug: string) => ({
  bucket: 'v1.13', rel: `docs/tickets/v1.13/${id}.md`, frontmatter: { id, type, assignee, status: 'open', slug }, body: '',
})
const SLUG = 'a-very-long-slug-that-has-to-wrap-inside-the-narrow-waits-column-instead-of-the-id'
const DATA = {
  poState: { stage: 'build', version: 'v1.13', current_task: null },
  currentVersion: 'v1.13',
  prd: { current: { rel: 'docs/prd/PRD.md', body: '' }, closed: [] },
  tickets: {
    included: [mk('T-993', 'decision', 'user', SLUG), mk('T-1017', 'impl', 'user', SLUG), mk('T-994', 'decision', 'user', 'short')],
    omitted: [],
  },
  wiki: [],
  features: [],
  artifacts: { entries: [] },
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

test.describe('viewer Home waits column keeps ticket ids whole @window', () => {
  let child: ChildProcessWithoutNullStreams
  let userDataDir: string
  let cdp: string
  let file: string

  test.beforeAll(async () => {
    userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'viewer-waits-spec-'))
    file = path.join(userDataDir, 'viewer.html')
    // render.mjs is ESM; Playwright's CJS spec loader cannot import it, so a
    // node child renders the page from the fixture and prints it.
    const script = `import { renderPage } from ${JSON.stringify(path.resolve(__dirname, '../../viewer/lib/render.mjs'))};
      process.stdout.write(renderPage({ data: JSON.parse(process.env.FX), dark: new Map(), light: new Map(), fontFaceCss: '', tokensSha256: '' }))`
    fs.writeFileSync(file, execFileSync(process.execPath, ['--input-type=module', '-e', script], { env: { ...process.env, FX: JSON.stringify(DATA) }, maxBuffer: 64 * 1024 * 1024 }))
    const port = await freePort()
    child = spawn(
      chromium.executablePath(),
      ['--headless=new', `--user-data-dir=${path.join(userDataDir, 'profile')}`, '--no-sandbox', '--disable-gpu', '--use-mock-keychain', `--remote-debugging-port=${port}`],
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
    fs.rmSync(userDataDir, { recursive: true, force: true })
  })

  for (const width of [1280, 1920, 2560])
    test(`Home waits @ ${width}px: a ticket id stays on one line @window`, async () => {
      const browser = await chromium.connectOverCDP(cdp)
      try {
        const ctx = await browser.newContext({ viewport: { width, height: 900 } })
        const page = await ctx.newPage()
        await page.goto(`file://${file}`)
        await page.waitForSelector('.sc-waits .cp-went')
        const rows = await page.$$eval('.sc-waits .cp-went .mono', (els) =>
          els.map((e) => ({ id: e.textContent, lines: e.getClientRects().length, h: e.getBoundingClientRect().height, w: e.getBoundingClientRect().width })),
        )
        expect(rows.length).toBeGreaterThanOrEqual(3)
        for (const r of rows) {
          expect(r.w, r.id ?? '').toBeGreaterThan(0)
          expect(r.lines, `${r.id} split`).toBe(1)
          expect(r.h, `${r.id} height`).toBeLessThan(24) // one text line at 12px
        }
        const over = await page.$$eval('.sc-waits .cp-went', (els) => els.filter((e) => e.scrollWidth > e.clientWidth).length)
        expect(over).toBe(0)
        await ctx.close()
      } finally {
        await browser.close().catch(() => {})
      }
    })
})
