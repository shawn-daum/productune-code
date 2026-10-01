// T-885 (T-876 = D): past-version ticket bodies live in per-version sibling
// data files the page loads with <script src> only when one is opened.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import vm from 'node:vm'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { collectTickets } from '@productune/viewer/lib/collect.mjs'
import { renderPage, pastTicketDataFiles, pastTicketDataContent, PAST_TICKET_GLOBAL } from '@productune/viewer/lib/render.mjs'
import { generate, checkUpToDate } from '@productune/viewer/generate.mjs'

const require = createRequire(import.meta.url)
const CLI = path.join(path.dirname(require.resolve('@productune/viewer/generate.mjs')), 'cli.mjs')

function ticket(id: string, body: string) {
  return `---\nid: ${id}\nslug: s-${id}\ntype: impl\nstatus: done\nassignee: developer\n---\n\n${body}\n`
}

let repo: string
let outDir: string
beforeAll(() => {
  repo = fs.mkdtempSync(path.join(os.tmpdir(), 't885-repo-'))
  outDir = fs.mkdtempSync(path.join(os.tmpdir(), 't885-out-'))
  fs.mkdirSync(path.join(repo, '.prdt'))
  fs.writeFileSync(path.join(repo, '.prdt/po-state.json'), JSON.stringify({ schema_version: 1, stage: 'build', version: 'v2.0', current_task: null }))
  for (const d of ['v2.0', 'v1.0', 'backlog']) fs.mkdirSync(path.join(repo, 'docs/tickets', d), { recursive: true })
  fs.writeFileSync(path.join(repo, 'docs/tickets/v2.0/T-3.md'), ticket('T-3', '지금 버전 본문'))
  // 뷁 · 똠 appear nowhere on the page itself — only in the past body.
  fs.writeFileSync(path.join(repo, 'docs/tickets/v1.0/T-1.md'), ticket('T-1', '지난 버전 본문 뷁똠 </script><script>window.PWN=1</script>'))
})
afterAll(() => {
  fs.rmSync(repo, { recursive: true, force: true })
  fs.rmSync(outDir, { recursive: true, force: true })
})

describe('collect.mjs — past-version bodies ride beside the rows, never on them', () => {
  it('an omitted bucket carries `bodies` keyed by rel; its rows still have no `body` key', () => {
    const t = collectTickets(repo, 'v2.0')
    const b = t.omitted.find((o: any) => o.bucket === 'v1.0')
    expect(Object.keys(b.bodies)).toEqual(['docs/tickets/v1.0/T-1.md'])
    expect(b.tickets[0]).not.toHaveProperty('body')
  })
})

describe('render.mjs — data files and the loader map', () => {
  const lite = (bucket: string, id: string, bodies?: Record<string, string>) => ({
    bucket, count: 1, bytes: 1, ...(bodies ? { bodies } : {}),
    tickets: [{ rel: `docs/tickets/${bucket}/${id}.md`, frontmatter: { id } }],
  })

  it('one file per bucket with bodies; a bucket name that is not a plain directory name, or with no bodies, gets none', () => {
    const files = pastTicketDataFiles({
      included: [],
      omitted: [
        lite('v1.0', 'T-1', { 'docs/tickets/v1.0/T-1.md': 'a' }),
        lite('v 1"x', 'T-2', { 'docs/tickets/v 1"x/T-2.md': 'b' }),
        lite('v0.9', 'T-4'),
      ],
    }, { prefix: 'viewer' })
    expect(files.map((f: any) => f.name)).toEqual(['viewer.tickets-v1.0.js'])
  })

  it('the data file has no literal "<" and only sets its own bucket on the one global', () => {
    const content = pastTicketDataContent('v1.0', { tickets: { 'T-1': { path: 'docs/tickets/v1.0/T-1.md', body: '<p>x</p></script><!--<script>' } } })
    expect(content).not.toContain('<')
    const ctx: any = { window: {} }
    vm.runInNewContext(content, ctx)
    expect(Object.keys(ctx.window)).toEqual([PAST_TICKET_GLOBAL])
    expect(ctx.window[PAST_TICKET_GLOBAL]['v1.0'].tickets['T-1'].body).toBe('<p>x</p></script><!--<script>')
  })

  it('the page carries the generator map, no past body, and a CSP with strict-dynamic beside the two hashes', () => {
    const data: any = {
      currentVersion: 'v2.0', stage: 'build',
      tickets: { included: [], omitted: [lite('v1.0', 'T-1', { 'docs/tickets/v1.0/T-1.md': 'PASTBODYMARK' })] },
      wiki: [], features: [], artifacts: { entries: [] },
      prd: { current: { rel: 'docs/prd/PRD.md', frontmatter: {}, body: '' }, closed: [], openItems: [] },
    }
    const html = renderPage({ data, dark: new Map(), light: new Map(), fontFaceCss: '', tokensSha256: '', pastTicketSrc: { 'v1.0': 'viewer.tickets-v1.0.js' } })
    expect(html).not.toContain('PASTBODYMARK')
    const blob = JSON.parse(/<script id="detail-data" type="application\/json">([\s\S]*?)<\/script>/.exec(html)![1])
    expect(blob.pastTickets).toEqual({ 'v1.0': 'viewer.tickets-v1.0.js' })
    expect(blob.ticket['T-1'].body).toBeUndefined()
    expect(blob.ticket['T-1'].fileHref).toBeTruthy()
    const csp = /script-src ([^;"]+)/.exec(html)![1]
    expect(csp.match(/'sha256-[^']+'/g)).toHaveLength(2)
    expect(csp).toContain("'strict-dynamic'")
    expect(csp).not.toMatch(/'self'|file:|unsafe-inline/)
  })
})

describe('generate.mjs + cli.mjs — sibling files on disk', () => {
  it('writes the data file beside the page, with the past body and a font supplement for glyphs the page lacks', async () => {
    const out = path.join(outDir, 'viewer.html')
    const { html, dataFiles } = await generate({ repoRoot: repo, outputPath: out })
    expect(dataFiles.map((f: any) => f.name)).toEqual(['viewer.tickets-v1.0.js'])
    expect(html).not.toContain('뷁')
    const ctx: any = { window: {} }
    vm.runInNewContext(dataFiles[0].content, ctx)
    const payload = ctx.window[PAST_TICKET_GLOBAL]['v1.0']
    expect(payload.tickets['T-1'].body).toContain('뷁똠')
    expect(payload.tickets['T-1'].body).not.toMatch(/<script/i)
    expect(payload.font.range).toContain('U+BDC1') // 뷁
    expect(payload.font.range).toContain('U+B620') // 똠
    expect(payload.font.regular.length).toBeGreaterThan(0)
    expect(payload.font.semibold.length).toBeGreaterThan(0)
  })

  it('cli writes page + data files, --check passes, a changed data file fails --check, and a stale bucket file is removed', async () => {
    const out = path.join(outDir, 'viewer.html')
    const stale = path.join(outDir, 'viewer.tickets-v0.1.js')
    const unrelated = path.join(outDir, 'other.js')
    fs.writeFileSync(stale, 'x')
    fs.writeFileSync(unrelated, 'x')
    execFileSync(process.execPath, [CLI, '--repo-root', repo, '--out', out])
    expect(fs.existsSync(path.join(outDir, 'viewer.tickets-v1.0.js'))).toBe(true)
    expect(fs.existsSync(stale)).toBe(false)
    expect(fs.existsSync(unrelated)).toBe(true)
    expect((await checkUpToDate({ repoRoot: repo, outputPath: out })).upToDate).toBe(true)
    fs.appendFileSync(path.join(outDir, 'viewer.tickets-v1.0.js'), ' ')
    expect((await checkUpToDate({ repoRoot: repo, outputPath: out })).upToDate).toBe(false)
  })
})

describe('render.mjs — loader state is safe for bucket names that collide with Object.prototype members', () => {
  it.each(['constructor', 'hasOwnProperty', 'toString', '__proto__'])('opening a ticket in bucket "%s" loads without throwing', (bucket) => {
    const data: any = {
      currentVersion: 'v2.0', stage: 'build',
      tickets: { included: [], omitted: [{ bucket, count: 1, bytes: 1, bodies: { [`docs/tickets/${bucket}/T-5.md`]: 'b' }, tickets: [{ rel: `docs/tickets/${bucket}/T-5.md`, frontmatter: { id: 'T-5' } }] }] },
      wiki: [], features: [], artifacts: { entries: [] },
      prd: { current: { rel: 'docs/prd/PRD.md', frontmatter: {}, body: '' }, closed: [], openItems: [] },
    }
    const html = renderPage({ data, dark: new Map(), light: new Map(), fontFaceCss: '', tokensSha256: '', pastTicketSrc: { [bucket]: `viewer.tickets-${bucket}.js` } })
    const script = html.slice(html.indexOf('var DETAIL_DATA = JSON.parse'))
    const start = script.indexOf('var PAST = ')
    const end = script.indexOf('function closeDetailPanel')
    expect(start).toBeGreaterThan(-1)
    const appended: any[] = []
    const ctx: any = {
      window: {}, DETAIL_DATA: { pastTickets: { [bucket]: `viewer.tickets-${bucket}.js` }, ticket: {} },
      document: { createElement: () => ({}), head: { appendChild: (el: any) => appended.push(el) } },
      out: {},
    }
    vm.runInNewContext(script.slice(start, end) + `;out.ref = pastTicketRef({ path: 'docs/tickets/${bucket}/T-5.md' });
      out.cbs = 0; loadPastTickets(out.ref, function () { out.cbs++; }); loadPastTickets(out.ref, function () { out.cbs++; });`, ctx)
    expect(ctx.out.ref.key).toBe(bucket)
    expect(appended).toHaveLength(1)
    appended[0].onerror()
    expect(ctx.out.cbs).toBe(2)
  })
})
