/**
 * prdt-tickets-place.test.ts — T-1497: a decision ticket names its fixed place in `place:`
 * (closed list define-direction · build-entry · deploy · prod-access). `tickets new --place`
 * writes it, `tickets fmt --check` and `prdt doctor` flag a value outside the list on
 * `type: decision` tickets only; `tickets check-place` is the matcher the gates use.
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { spawnSync } from 'child_process'
import { test, expect, describe } from 'vitest'

const PRDT_CLI = path.resolve(__dirname, '..', '..', 'scripts', 'prdt')
const T = 120_000

function project() {
  const root = path.join(fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t1497-'))), 'proj')
  const put = (rel: string, body: string) => { const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body) }
  put('.prdt/config.json', JSON.stringify({ slug: 'home', surfaces: {} }) + '\n')
  put('.prdt/po-state.json', JSON.stringify({ schema_version: 1, stage: 'build', version: 'v1.2', current_task: null }) + '\n')
  put('docs/_shared/.keep', '')
  put('docs/home/prd/PRD.md', '# PRD\n')
  const home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t1497-home-')))
  return { root, home, put }
}
function cli(p: { root: string; home: string }, args: string[]) {
  const r = spawnSync('python3', [PRDT_CLI, ...args], { cwd: p.root, encoding: 'utf8', timeout: 90_000,
    env: { ...process.env, PRDT_HOME: p.home, PRDT_LANG: 'en', PRDT_META_BACKUP: '0', TZ: 'UTC' } })
  return { out: r.stdout, err: r.stderr, code: r.status }
}
describe('prdt tickets --place (T-1497)', () => {
  test('new --type decision --place deploy writes `place: deploy` after assignee; an unknown value or a non-decision type is refused', () => {
    const p = project()
    const ok = cli(p, ['tickets', 'new', '--type', 'decision', '--slug', 'ship-it', '--place', 'deploy'])
    expect(ok.code).toBe(0)
    const dir = path.join(p.root, 'docs/home/tickets/v1.2')
    const f = fs.readdirSync(dir).find(n => n.endsWith('.md'))!
    const text = fs.readFileSync(path.join(dir, f), 'utf8')
    expect(text).toMatch(/\nassignee: user\nplace: deploy\n/)
    expect(cli(p, ['tickets', 'new', '--type', 'decision', '--slug', 'x', '--place', 'nowhere']).code).not.toBe(0)
    const nonDec = cli(p, ['tickets', 'new', '--type', 'impl', '--slug', 'y', '--place', 'deploy'])
    expect(nonDec.code).not.toBe(0)
    expect(nonDec.err).toContain('--place is for `--type decision` only')
    expect(fs.readdirSync(dir).filter(n => n.endsWith('.md'))).toHaveLength(1)
  }, T)

  test('without --place no `place:` line is written', () => {
    const p = project()
    expect(cli(p, ['tickets', 'new', '--type', 'decision', '--slug', 'plain']).code).toBe(0)
    const dir = path.join(p.root, 'docs/home/tickets/v1.2')
    expect(fs.readFileSync(path.join(dir, fs.readdirSync(dir)[0]), 'utf8')).not.toContain('place:')
  }, T)

  test('fmt --check flags a decision with an unknown place; a non-decision with the same key and a decision with a valid place pass', () => {
    const p = project()
    const mkT = (id: string, type: string, place: string) => p.put(`docs/home/tickets/v1.2/${id}.md`,
      `---\nid: ${id}\nslug: s-${id.toLowerCase()}\ntype: ${type}\nstatus: open\nassignee: ${type === 'decision' ? 'user' : 'po'}\nplace: ${place}\ncreated: 2026-11-10\n---\n\n` +
      ['request', 'problem', 'related', 'acceptance', 'evidence', 'outcome', 'log'].map(k => `## ${k}\n\n`).join('') + (type === 'decision' ? '## options\n\n' : ''))
    mkT('T-1', 'decision', 'depoly'); mkT('T-2', 'decision', 'build-entry'); mkT('T-3', 'impl', 'depoly')
    const r1 = cli(p, ['tickets', 'fmt', 'T-1', '--check'])
    expect(r1.code).not.toBe(0)
    expect(r1.out).toContain("T-1: place: 'depoly' is not one of define-direction · build-entry · deploy · prod-access")
    expect(cli(p, ['tickets', 'fmt', 'T-2', '--check']).out).not.toContain('place:')
    expect(cli(p, ['tickets', 'fmt', 'T-3', '--check']).out).not.toContain('place:')
  }, T)

  test('doctor reports a decision with an unknown place, and stays silent for valid ones', () => {
    const p = project()
    const mkT = (id: string, place: string) => p.put(`docs/home/tickets/v1.2/${id}.md`,
      `---\nid: ${id}\nslug: s-${id.toLowerCase()}\ntype: decision\nstatus: open\nassignee: user\nplace: ${place}\ncreated: 2026-11-10\n---\n\n## outcome\n\n`)
    mkT('T-1', 'depoly'); mkT('T-2', 'deploy')
    const out = cli(p, ['doctor']).out
    expect(out).toContain("decision place: T-1 (docs/home/tickets/v1.2/T-1.md): place: 'depoly' is not one of")
    expect(out).not.toContain('decision place: T-2')
  }, T)

  test('check-place --json: exit 0 with the ticket when closed; exit 1 with `missing` otherwise', () => {
    const p = project()
    const r0 = cli(p, ['tickets', 'check-place', '--place', 'build-entry', '--version', 'v1.2', '--json'])
    expect(r0.code).toBe(1)
    expect(JSON.parse(r0.out)).toMatchObject({ ok: false, missing: 'no-ticket', place: 'build-entry', version: 'v1.2' })
    p.put('docs/home/tickets/v1.2/T-7.md', '---\nid: T-7\nslug: be\ntype: decision\nstatus: done\nassignee: user\nplace: build-entry\ncreated: 2026-11-10\n---\n\n## outcome\n\n사용자 「진행해」\n')
    const r1 = cli(p, ['tickets', 'check-place', '--place', 'build-entry', '--version', 'v1.2', '--json'])
    expect(r1.code).toBe(0)
    expect(JSON.parse(r1.out)).toMatchObject({ ok: true, ticket: 'T-7', missing: null })
    expect(cli(p, ['tickets', 'check-place', '--place', 'build-entry', '--version', 'banana']).code).not.toBe(0)
  }, T)

  test('T-1528: check-place --place deploy for `<product>/v<N>.<m>` reads that product\'s own code.dir RELEASES.md', () => {
    const p = project()
    p.put('.prdt/config.json', JSON.stringify({ slug: 'home', code: { dir: 'code' }, products: [{ name: 'arc', code: { dir: 'arc' } }] }) + '\n')
    p.put('docs/arc/prd/PRD.md', '# PRD\n')
    p.put('docs/arc/tickets/v1.6/T-8.md', '---\nid: T-8\nslug: dep\ntype: decision\nstatus: done\nassignee: user\nplace: deploy\ncreated: 2026-11-13\n---\n\n## outcome\n\n사용자 「배포해」\nNotes: arc/docs/RELEASES.md#v1.6\n')
    p.put('code/docs/RELEASES.md', '# Releases\n\n## v1.6 — x\n')
    const miss = cli(p, ['tickets', 'check-place', '--place', 'deploy', '--version', 'arc/v1.6', '--json'])
    expect(miss.code).toBe(1)
    expect(JSON.parse(miss.out)).toMatchObject({ ok: false, missing: 'no-section', ticket: 'T-8', dir: 'docs/arc/tickets/v1.6',
      fact: 'T-8 cites `RELEASES.md` `## v1.6`, but arc/docs/RELEASES.md has no `## v1.6`' })
    p.put('arc/docs/RELEASES.md', '# Releases\n\n## v1.6 — x\n')
    const ok = cli(p, ['tickets', 'check-place', '--place', 'deploy', '--version', 'arc/v1.6', '--json'])
    expect(ok.code).toBe(0)
    expect(JSON.parse(ok.out)).toMatchObject({ ok: true, ticket: 'T-8' })
    // an added product without its own code.dir shares the project code repo
    p.put('.prdt/config.json', JSON.stringify({ slug: 'home', code: { dir: 'code' }, products: [{ name: 'arc' }] }) + '\n')
    expect(cli(p, ['tickets', 'check-place', '--place', 'deploy', '--version', 'arc/v1.6', '--json']).code).toBe(0)
  }, T)
})
