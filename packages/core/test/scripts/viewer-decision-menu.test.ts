/**
 * T-1138 — Home's 결정 bucket lists the current version's decision tickets (질문) with decision pages (기록).
 * Fixtures: tickets only · pages only · both · none (byte-identical to the pages-only table).
 */
import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync } from 'child_process'
import { test, expect, describe } from 'vitest'
import { subprocessTimeout } from '../helpers/subprocess-timeout'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const VIEWER_CLI = path.join(CORE_ROOT, '..', 'viewer', 'cli.mjs')
const RUN = fs.existsSync(path.join(CORE_ROOT, '..', 'viewer', 'node_modules', 'marked'))

function project(opts: { tickets: [string, string, string][]; pages: string[] }): string {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t1138-')))
  fs.mkdirSync(path.join(root, '.prdt'), { recursive: true })
  fs.writeFileSync(path.join(root, '.prdt', 'po-state.json'), JSON.stringify({ schema_version: 1, stage: 'build', version: 'v1.0', current_task: null }))
  fs.mkdirSync(path.join(root, 'docs', 'tickets', 'v1.0'), { recursive: true })
  fs.mkdirSync(path.join(root, 'docs', 'wiki'), { recursive: true })
  fs.writeFileSync(path.join(root, 'docs', 'tickets', 'v1.0', 'T-001.md'), `---\nid: T-001\nslug: s-impl\ntype: impl\nstatus: open\nassignee: developer\ncreated: 2026-09-28\n---\n\n## problem\n\nx\n`)
  for (const [id, status, created] of opts.tickets) {
    fs.writeFileSync(path.join(root, 'docs', 'tickets', 'v1.0', `${id}.md`), `---\nid: ${id}\nslug: q-${id.toLowerCase()}\ntype: decision\nstatus: ${status}\nassignee: user\ncreated: ${created}\n---\n\n## problem\n\nx\n`)
  }
  for (const name of opts.pages) {
    fs.writeFileSync(path.join(root, 'docs', 'wiki', `${name}.md`), `---\ntype: decision\ntitle: ${name}\nstatus: live\nversion: v1.0\n---\n\nbody\n`)
  }
  return root
}
function gen(root: string): string {
  const out = path.join(root, '.prdt', 'scratch', 'viewer', 'viewer.html')
  execFileSync('node', [VIEWER_CLI, '--repo-root', root, '--out', out], { stdio: 'pipe', timeout: subprocessTimeout('cli') })
  return fs.readFileSync(out, 'utf8')
}
// T-1259: 질문 rows are `.dv-row` (id · status text); 기록 rows stay table rows below them.
const rowIds = (html: string) => {
  const q = [...html.matchAll(/<div class="dv-row[^"]*" data-dv-id="([^"]+)"[^>]*><div class="dv-top"><span class="tid">[^<]*<\/span><span class="tt">[^<]*<\/span><span class="tst[^"]*">([^<]*)<\/span>/g)].map((m) => ({ pos: m.index ?? 0, key: `질문:${m[1]}`, st: m[2] }))
  const w = [...html.matchAll(/<tr class="detail-row" data-detail-kind="wiki" data-detail-id="([^"]+)"/g)].map((m) => ({ pos: m.index ?? 0, key: `기록:${m[1]}`, st: '' }))
  // the 기록 table is also listed in the wiki group — count each page once, at its first (decision-group) position
  const wOnce = w.filter((r, i) => w.findIndex((o) => o.key === r.key) === i)
  return [...q, ...wOnce].sort((x, y) => x.pos - y.pos)
}
const keys = (html: string) => rowIds(html).map((r) => r.key)

describe.skipIf(!RUN)('T-1138 decision bucket', () => {
  test('tickets only: open questions first, then done', () => {
    const html = gen(project({ tickets: [['T-002', 'done', '2026-09-29'], ['T-003', 'open', '2026-09-27']], pages: [] }))
    expect(keys(html)).toEqual(['질문:T-003', '질문:T-002'])
    expect(rowIds(html).map((r) => r.st)).toEqual(['기다리는 중', '닫힘'])
  })
  test('both: 질문 rows before 기록 rows', () => {
    const html = gen(project({ tickets: [['T-002', 'open', '2026-09-29']], pages: ['decision--a'] }))
    expect(keys(html)).toEqual(['질문:T-002', '기록:decision--a.md'])
  })
  test('pages only / none: no 구분 column, as before', () => {
    const html = gen(project({ tickets: [], pages: ['decision--a'] }))
    expect(keys(html)).toEqual(['기록:decision--a.md'])
    expect(html).not.toContain('<th>구분</th>')
    expect(html).toContain('data-detail-id="decision--a.md"')
  })
  test('dropped 질문 row carries the 중단 marker, after the open one', () => {
    const html = gen(project({ tickets: [['T-002', 'dropped', '2026-09-29'], ['T-003', 'open', '2026-09-27']], pages: [] }))
    expect(keys(html)).toEqual(['질문:T-003', '질문:T-002'])
    expect(rowIds(html)[1].st).toContain('중단')
  })
  test('none: no decision tickets and no pages — no 구분 column, no decision rows', () => {
    const html = gen(project({ tickets: [], pages: [] }))
    expect(keys(html)).toEqual([])
    expect(html).not.toContain('<th>구분</th>')
  })
})
