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
const rowIds = (html: string, kinds: string[]) => [...html.matchAll(/<tr class="detail-row" data-detail-kind="(ticket|wiki)" data-detail-id="([^"]+)"><td><span class="pill pill-type">(질문 · 열림|질문 · 완료|질문 · 중단|기록)<\/span>/g)].filter((m) => kinds.includes(m[3])).map((m) => `${m[3]}:${m[2]}`)

describe.skipIf(!RUN)('T-1138 decision bucket', () => {
  test('tickets only: open questions first, then done', () => {
    const html = gen(project({ tickets: [['T-002', 'done', '2026-09-29'], ['T-003', 'open', '2026-09-27']], pages: [] }))
    expect(rowIds(html, ['질문 · 열림', '질문 · 완료', '질문 · 중단', '기록'])).toEqual(['질문 · 열림:T-003', '질문 · 완료:T-002'])
  })
  test('both: 질문 rows before 기록 rows', () => {
    const html = gen(project({ tickets: [['T-002', 'open', '2026-09-29']], pages: ['decision--a'] }))
    expect(rowIds(html, ['질문 · 열림', '질문 · 완료', '질문 · 중단', '기록'])).toEqual(['질문 · 열림:T-002', '기록:decision--a.md'])
  })
  test('pages only / none: no 구분 column, as before', () => {
    const html = gen(project({ tickets: [], pages: ['decision--a'] }))
    expect(rowIds(html, ['질문 · 열림', '질문 · 완료', '질문 · 중단', '기록'])).toEqual([])
    expect(html).not.toContain('<th>구분</th>')
    expect(html).toContain('data-detail-id="decision--a.md"')
  })
  test('질문 row: 버전 column is the ticket version dir, dropped is 질문 · 중단 (open first)', () => {
    const html = gen(project({ tickets: [['T-002', 'dropped', '2026-09-29'], ['T-003', 'open', '2026-09-27']], pages: [] }))
    expect(rowIds(html, ['질문 · 열림', '질문 · 완료', '질문 · 중단', '기록'])).toEqual(['질문 · 열림:T-003', '질문 · 중단:T-002'])
    expect(html).toMatch(/data-detail-id="T-003"><td>.*?<td class="num-col">v1\.0<\/td><\/tr>/)
    expect(html).toMatch(/data-detail-id="T-002"><td>.*?<td class="num-col">v1\.0<\/td><\/tr>/)
  })
  test('none: no decision tickets and no pages — no 구분 column, no decision rows', () => {
    const html = gen(project({ tickets: [], pages: [] }))
    expect(rowIds(html, ['질문 · 열림', '질문 · 완료', '질문 · 중단', '기록'])).toEqual([])
    expect(html).not.toContain('<th>구분</th>')
  })
})
