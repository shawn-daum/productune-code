// T-1049 (T-1056 = A) rendered half of scripts/qa/viewer-feature-guide.test.ts: in the real
// file:// page under its strict CSP, a feature guide's `flow` and a ```mermaid fence in the PRD
// body turn into SVG, a page with no diagram ships no mermaid, and the drawn diagram follows the
// light/dark switch. Same @window pattern as viewer-code-block-wrap.window.spec.ts (browser
// spawned directly, attached over CDP, because chromium.launch() is refused by isolation rule 6).
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { spawn, execFileSync, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { test, expect, chromium } from '@playwright/test'

process.env.PLAYWRIGHT_BROWSERS_PATH ??= path.join(
  process.env.PRODUCTUNE_REAL_HOME ?? os.homedir(),
  'Library/Caches/ms-playwright',
)

const FLOW = 'flowchart TD\n  A[세션 시작] --> B{훅 검사 통과?}\n  B -- 예 --> C[도구 실행]\n  B -- 아니오 --> D[안내 한 줄 표시 후 대기]'
const guide = (flow: string) => ({ when: ['w'], ux: [{ text: 'PRD 목차', at: 'viewer.prd' }], flow, logic: ['l'], limits: [], example: 'e' })
const DATA = (withDiagram: boolean) => ({
  currentVersion: 'v1.13',
  prd: { current: { rel: 'docs/prd/PRD.md', body: withDiagram ? '## 흐름\n\n```mermaid\nsequenceDiagram\n  A->>B: hi\n```\n' : '## 흐름\n\n본문\n' }, closed: [] },
  tickets: { included: [], omitted: [] },
  wiki: [],
  features: [],
  featureTaxonomy: {
    areas: [{ key: 'a', name: '영역', def: '' }],
    kinds: [{ key: 'feature', name: '기능', def: '' }],
    entries: [{ key: 'full', name: 'full', kind: 'feature', area: 'a', def: '정의.', aliases: [], links: [], guide: guide(withDiagram ? FLOW : '') }],
  },
  artifacts: { entries: [] },
})

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

test.describe('viewer mermaid diagrams under the file:// CSP @window', () => {
  let child: ChildProcessWithoutNullStreams
  let dir: string
  let cdp: string
  const files: Record<string, string> = {}

  test.beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'viewer-mermaid-spec-'))
    const script = `import { renderPage } from ${JSON.stringify(path.resolve(__dirname, '../../viewer/lib/render.mjs'))};
      import { normalizeGuide } from ${JSON.stringify(path.resolve(__dirname, '../../viewer/lib/collect.mjs'))};
      const d = JSON.parse(process.env.FX); d.featureTaxonomy.entries[0].guide = normalizeGuide(d.featureTaxonomy.entries[0].guide);
      process.stdout.write(renderPage({ data: d, dark: new Map(), light: new Map(), fontFaceCss: '', tokensSha256: '' }))`
    for (const [name, withDiagram] of [['with', true], ['without', false]] as const) {
      files[name] = path.join(dir, `${name}.html`)
      fs.writeFileSync(files[name], execFileSync(process.execPath, ['--input-type=module', '-e', script], { env: { ...process.env, FX: JSON.stringify(DATA(withDiagram)) }, maxBuffer: 64 * 1024 * 1024 }))
    }
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
  }, 60_000)

  test.afterAll(async () => {
    child.kill('SIGTERM')
    await new Promise((r) => setTimeout(r, 300))
    if (child.exitCode === null) child.kill('SIGKILL')
    fs.rmSync(dir, { recursive: true, force: true })
  })

  test('guide flow and PRD fence draw as SVG, no console error, theme flip redraws @window', async () => {
    const browser = await chromium.connectOverCDP(cdp)
    try {
      const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } })
      const page = await ctx.newPage()
      const problems: string[] = []
      page.on('console', (m) => { if (m.type() === 'error') problems.push(m.text()) })
      page.on('pageerror', (e) => problems.push(String(e)))
      await page.goto(`file://${files.with}?view=feature&kind=feature&id=full`)
      await page.waitForSelector('.detail-panel.active .fd-flow svg', { timeout: 20_000 })
      expect(await page.$$eval('.detail-panel.active .fd-flow svg text', (t) => t.map((x) => x.textContent).join(' '))).toContain('세션 시작')
      expect(await page.$$('.detail-panel.active .fd-smap .fd-sp.hit')).toHaveLength(1)
      await page.goto(`file://${files.with}?view=prd`)
      // the PRD card is a collapsed fold: the SVG is drawn into the page, just not visible
      await page.waitForSelector('.v-body .mm-fig svg', { state: 'attached', timeout: 20_000 })
      const before = await page.$eval('.v-body .mm-fig svg', (s) => s.outerHTML.length + getComputedStyle(s.querySelector('text') ?? s).fill)
      await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'))
      await page.waitForFunction((b) => {
        const s = document.querySelector('.v-body .mm-fig svg')
        return !!s && s.outerHTML.length + getComputedStyle(s.querySelector('text') ?? s).fill !== b
      }, before, { timeout: 20_000 })
      expect(problems).toEqual([])
      await ctx.close()
    } finally {
      await browser.close().catch(() => {})
    }
  })

  test('a page with no diagram carries no mermaid @window', async () => {
    const browser = await chromium.connectOverCDP(cdp)
    try {
      const ctx = await browser.newContext()
      const page = await ctx.newPage()
      await page.goto(`file://${files.without}`)
      expect(await page.evaluate(() => typeof (globalThis as { mermaid?: unknown }).mermaid)).toBe('undefined')
      expect(fs.statSync(files.without).size).toBeLessThan(1_000_000)
      await ctx.close()
    } finally {
      await browser.close().catch(() => {})
    }
  })
})
