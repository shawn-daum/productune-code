// T-830 (rendered half of scripts/qa/viewer-code-block-wrap.test.ts): a fenced
// code block with one very long line shows every character — no horizontal
// overflow — in the PRD card (.v-body) AND the ticket detail side panel
// (.detail-doc), at 420 px and 1400 px, light and dark. Same @window pattern as
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

const LONG = 'y'.repeat(474)
const BODY = '```\n' + LONG + '\n```\n\n- item\n\n  ```\n  ' + LONG + '\n  ```\n'
const DATA = {
  poState: { stage: 'build', version: 'v1.10', current_task: null },
  currentVersion: 'v1.10',
  prd: { current: { rel: 'docs/prd/PRD.md', body: BODY }, closed: [] },
  tickets: { included: [{ bucket: 'v1.10.0', rel: 'docs/tickets/v1.10.0/T-901.md', frontmatter: { id: 'T-901' }, body: BODY }], omitted: [] },
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

test.describe('viewer code blocks wrap in the card and the ticket panel @window', () => {
  let child: ChildProcessWithoutNullStreams
  let userDataDir: string
  let cdp: string
  let file: string

  test.beforeAll(async () => {
    userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'viewer-wrap-spec-'))
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

  for (const scheme of ['light', 'dark'] as const)
    for (const width of [420, 1400])
      for (const [label, hash, scope] of [
        ['ticket panel', '#T-901', '.detail-panel.active .detail-doc'],
        ['PRD card', '#docs/prd/PRD.md', '.v-body'],
      ] as const)
        test(`${label} @ ${width}px ${scheme}: every code block fits its box @window`, async () => {
          const browser = await chromium.connectOverCDP(cdp)
          try {
            const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: scheme })
            const page = await ctx.newPage()
            await page.goto(`file://${file}${hash}`)
            await page.waitForSelector(`${scope} pre`)
            const all = await page.$$eval(`${scope} pre`, (els) =>
              els.map((e) => ({ sw: e.scrollWidth, cw: e.clientWidth, len: (e.textContent ?? '').length })),
            )
            const boxes = all.filter((b) => b.cw > 0) // the card exists once per tab; only the shown one lays out
            expect(boxes.length).toBe(2) // top-level fence + fence inside a list item
            for (const b of boxes) {
              expect(b.len).toBeGreaterThanOrEqual(LONG.length)
              expect(b.sw).toBeLessThanOrEqual(b.cw)
            }
            await ctx.close()
          } finally {
            await browser.close().catch(() => {})
          }
        })
})
