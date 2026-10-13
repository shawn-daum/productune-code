/**
 * statusline-i18n-labels.test.ts — T-1015 (T-1013 = B).
 *
 * Every statusline label reads in the CLI language: `PRDT_LANG` (en or ko prefix) wins,
 * else the device token `<PRDT_HOME>/cli-lang`, default ko — the rule of
 * `cli_lang()` in scripts/prdt. The To-Be table is the one the user confirmed
 * in the ticket; ticket ids, version, branch name, counts and `—` stay as-is.
 */
import path from 'path'
import fs from 'fs'
import os from 'os'
import crypto from 'crypto'
import { execFileSync } from 'child_process'
import { test, expect, describe, beforeEach, afterEach } from 'vitest'

const STATUSLINE_SH = path.resolve(__dirname, '..', '..', 'scripts', 'statusline-prdt.sh')
function which(bin: string): string | null {
  try { return execFileSync('which', [bin], { encoding: 'utf8' }).trim() || null } catch { return null }
}
const READY = !!which('python3')

let root: string
let prdtHome: string

const tmp = (p: string) => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), p)))
const OSC8_RE = /\x1b\]8;;[^\x1b]*\x1b\\([^\x1b]*)\x1b\]8;;\x1b\\/g
const unwrap = (s: string) => s.replace(OSC8_RE, '$1')

/** Display columns: Hangul / CJK / fullwidth = 2. */
function cols(s: string): number {
  let n = 0
  for (const ch of s) n += /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿＀-｠]/.test(ch) ? 2 : 1
  return n
}

function run(env: Record<string, string | undefined>): string {
  const e: Record<string, string | undefined> = { ...process.env, PRDT_HOME: prdtHome, PRDT_LANG: undefined, ...env }
  for (const k of Object.keys(e)) if (e[k] === undefined) delete e[k]
  return execFileSync('bash', [STATUSLINE_SH], {
    input: JSON.stringify({ workspace: { current_dir: root } }), encoding: 'utf8', env: e as NodeJS.ProcessEnv,
  }).replace(/\n$/, '')
}

function ticket(id: string, fm: Record<string, string> = {}, version = 'v1.13'): void {
  const d = path.join(root, 'docs', 'tickets', version)
  fs.mkdirSync(d, { recursive: true })
  const all = { id, type: 'impl', status: 'open', assignee: 'developer', ...fm }
  fs.writeFileSync(path.join(d, `${id}.md`), `---\n${Object.entries(all).map(([k, v]) => `${k}: ${v}`).join('\n')}\n---\n`)
}

function marker(id: string, persona: string, ageMs: number): void {
  const dir = path.join(prdtHome, 'run', 'dispatches')
  fs.mkdirSync(dir, { recursive: true })
  const hex = crypto.createHash('sha256').update(`a-${id}-${persona}`).digest('hex')
  fs.writeFileSync(path.join(dir, `${hex}.json`), JSON.stringify({
    agent_id: hex, persona, dispatch_id: 'd-x', ticket_id: id, project_root: root,
    since: new Date(Date.now() - ageMs).toISOString().replace(/\.\d{3}Z$/, 'Z'),
  }))
}

function indexDb(ids: string[], edges: Array<[string, string]>): void {
  const script = `
import sqlite3, sys, json
ids = json.loads(sys.argv[2]); edges = json.loads(sys.argv[3])
con = sqlite3.connect(sys.argv[1])
con.executescript("CREATE TABLE tickets (id TEXT PRIMARY KEY, path TEXT); CREATE TABLE edges (src TEXT, rel TEXT, dst TEXT, resolved INTEGER);")
for i in ids: con.execute("INSERT INTO tickets VALUES (?, ?)", (i, "docs/tickets/v1.13/%s.md" % i))
for s, d in edges: con.execute("INSERT INTO edges VALUES (?, 'deps', ?, 1)", (s, d))
con.commit()
`
  execFileSync('python3', ['-c', script, path.join(root, '.prdt', 'index.db'), JSON.stringify(ids), JSON.stringify(edges)])
}

function stubViewer(): void {
  const d = path.join(root, '.prdt', 'scratch', 'viewer')
  fs.mkdirSync(d, { recursive: true })
  fs.writeFileSync(path.join(d, 'viewer.html'), '<html></html>')
}

beforeEach(() => {
  root = tmp('prdt-t1015-proj-')
  prdtHome = tmp('prdt-t1015-home-')
  fs.mkdirSync(path.join(root, '.prdt'), { recursive: true })
  fs.writeFileSync(path.join(root, '.prdt', 'config.json'), JSON.stringify({ slug: 'proj' }))
  fs.writeFileSync(path.join(root, '.prdt', 'po-state.json'), JSON.stringify({
    schema_version: 1, stage: 'build', version: 'v1.13', current_task: null,
  }))
})
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true })
  fs.rmSync(prdtHome, { recursive: true, force: true })
})

describe.skipIf(!READY)('statusline label language (T-1015)', () => {
  function seedFull(): void {
    ticket('T-1', { status: 'done' })
    ticket('T-2')
    ticket('T-3', { type: 'decision', assignee: 'user' })
    ticket('T-4', { assignee: 'user' })
    marker('T-2', 'developer', 60_000)
    marker('T-2', 'qa', 50_000)
    marker('T-1', 'designer', 40_000)
  }

  test('ko (default, no token, no env): every label in Korean, ids/counts kept, last-row separator is `|`', () => {
    seedFull()
    const rows = run({}).split('\n')
    expect(rows).toEqual([
      'proj v1.13 | 단계: 개발 1/3 | 총 티켓 1/4 | 작업중 T-2(개발자+QA) T-1(기획자)',
      '결정사항 T-3 | 요청사항 T-4',
    ])
  })

  test('en (PRDT_LANG=en): English labels, last-row separator is `|`', () => {
    seedFull()
    expect(run({ PRDT_LANG: 'en' }).split('\n')).toEqual([
      'proj v1.13 | stage: build 1/3 | total tickets 1/4 | working T-2(developer+qa) T-1(designer)',
      'decision T-3 | request T-4',
    ])
  })

  test('the device token `cli-lang` selects en; PRDT_LANG=ko* overrides the token; OS LANG is never read', () => {
    seedFull()
    fs.writeFileSync(path.join(prdtHome, 'cli-lang'), 'en\n')
    expect(run({ LANG: 'ko_KR.UTF-8' }).split('\n')[1]).toBe('decision T-3 | request T-4')
    expect(run({ PRDT_LANG: 'ko_KR.UTF-8' }).split('\n')[1]).toBe('결정사항 T-3 | 요청사항 T-4')
    fs.rmSync(path.join(prdtHome, 'cli-lang'))
    expect(run({ LANG: 'en_US.UTF-8' }).split('\n')[1]).toBe('결정사항 T-3 | 요청사항 T-4')
  })

  test.each([
    ['define', '기획', 'define'], ['build', '개발', 'build'], ['ship', '배포', 'ship'],
    ['retro', '회고', 'retro'], ['idle', '유휴', 'idle'],
  ])('stage %s → ko %s / en %s', (stage, ko, en) => {
    fs.writeFileSync(path.join(root, '.prdt', 'po-state.json'), JSON.stringify({ schema_version: 1, stage, version: 'v1.13' }))
    expect(run({ PRDT_LANG: 'ko' }).split('\n')[0]).toBe(`proj v1.13 | 단계: ${ko} 0/0 | 작업중 0`)
    expect(run({ PRDT_LANG: 'en' }).split('\n')[0]).toBe(`proj v1.13 | stage: ${en} 0/0 | working 0`)
  })

  test('persona labels: po / user in both languages; branch label with the branch name kept', () => {
    ticket('T-5')
    ticket('T-6')
    marker('T-5', 'po', 60_000)
    marker('T-6', 'user', 50_000)
    execFileSync('git', ['init', '-q', '-b', 'dev'], { cwd: root })
    execFileSync('git', ['-c', 'user.email=u@test', '-c', 'user.name=u', 'commit', '-q', '--allow-empty', '-m', 'i'], { cwd: root })
    expect(run({ PRDT_LANG: 'ko' }).split('\n')[0]).toBe('proj v1.13 | 단계: 개발 0/2 | 총 티켓 0/2 | 작업중 T-5(PO) T-6(사용자) | 브랜치: dev')
    expect(run({ PRDT_LANG: 'en' }).split('\n')[0]).toBe('proj v1.13 | stage: build 0/2 | total tickets 0/2 | working T-5(po) T-6(user) | branch: dev')
  })

  test('T-1019: no ` | ` follows a Hangul character or `—` in any ko row; separator stays one-space; empty = 0', () => {
    seedFull()
    execFileSync('git', ['init', '-q', '-b', 'dev'], { cwd: root })
    execFileSync('git', ['-c', 'user.email=u@test', '-c', 'user.name=u', 'commit', '-q', '--allow-empty', '-m', 'i'], { cwd: root })
    const fixtures = [
      run({ PRDT_LANG: 'ko' }),
      (() => { fs.writeFileSync(path.join(root, '.prdt', 'po-state.json'), JSON.stringify({ schema_version: 1, stage: 'idle', version: 'v1.13' })); return run({ PRDT_LANG: 'ko' }) })(),
    ]
    for (const out of fixtures) {
      const plain = unwrap(out)
      expect(plain).not.toMatch(/[\u1100-\u11ff\u3130-\u318f\uac00-\ud7a3\u2014] ?\|/)
      expect(plain).not.toContain('  |')
      expect(plain).not.toContain('\u2014')
    }
    expect(fixtures[1].split('\n')[0]).toContain('단계: 유휴 0/0 | ')
    expect(run({ PRDT_LANG: 'en' }).split('\n')[0]).toContain('stage: idle 0/0 | total tickets 1/4 | working T-2')
  })

  test('T-1017: a long branch stays whole and last when the working segment has to give way', () => {
    for (let i = 1; i <= 30; i++) { ticket(`T-${100 + i}`); marker(`T-${100 + i}`, 'developer', 60_000 + i) }
    const br = 'feature/' + 'x'.repeat(25)
    execFileSync('git', ['init', '-q', '-b', br], { cwd: root })
    execFileSync('git', ['-c', 'user.email=u@test', '-c', 'user.name=u', 'commit', '-q', '--allow-empty', '-m', 'i'], { cwd: root })
    const ko = unwrap(run({ PRDT_LANG: 'ko' })).split('\n')[0]
    const en = unwrap(run({ PRDT_LANG: 'en' })).split('\n')[0]
    expect(ko.endsWith(` | 브랜치: ${br}`)).toBe(true)
    expect(en.endsWith(` | branch: ${br}`)).toBe(true)
    expect(cols(ko)).toBeLessThanOrEqual(200)
    expect(cols(en)).toBeLessThanOrEqual(200)
  })

  test('folded rows: `+N 제품` (ko) / `+N products` (en)', () => {
    const names = Array.from({ length: 20 }, (_, i) => `l${String(i).padStart(2, '0')}`)
    fs.writeFileSync(path.join(root, '.prdt', 'config.json'), JSON.stringify({ slug: 'big', lines: names.map((name) => ({ name })) }))
    fs.writeFileSync(path.join(root, '.prdt', 'po-state.json'), JSON.stringify({
      schema_version: 1, stage: 'build', version: 'v1.0',
      lines: Object.fromEntries(names.map((n) => [n, { stage: 'build', version: 'v1.0' }])),
    }))
    const ko = run({ PRDT_LANG: 'ko' }).split('\n')
    const en = run({ PRDT_LANG: 'en' }).split('\n')
    expect(ko).toHaveLength(17)
    expect(ko[15]).toBe('+6 제품')
    expect(en[15]).toBe('+6 products')
    expect(ko[16]).toBe('결정사항 0 | 요청사항 0')
  })

  test('OSC 8 links still wrap every ticket id in both languages', () => {
    seedFull()
    indexDb(['T-1', 'T-2', 'T-3', 'T-4'], [])
    stubViewer()
    for (const lang of ['ko', 'en']) {
      const out = run({ PRDT_LANG: lang })
      for (const id of ['T-1', 'T-2', 'T-3', 'T-4']) {
        const raw = unwrap(out).match(new RegExp(`(?<![A-Za-z0-9_-])${id}(?![A-Za-z0-9_-])`, 'g')) ?? []
        const wrapped = out.match(new RegExp(`\\x1b\\]8;;file://[^\\x1b]*\\x1b\\\\${id}\\x1b\\]8;;\\x1b\\\\`, 'g')) ?? []
        expect(wrapped.length, `${lang} ${id}`).toBeGreaterThan(0)
        // every visible occurrence of the id is a wrapped one
        expect(raw.length, `${lang} ${id}`).toBe(wrapped.length)
      }
    }
  })

  test('width fallback is measured in display columns: a ko row that fits in characters but not in columns collapses', () => {
    // Three running tickets, each with two Korean personas and successors; ko's
    // Hangul double width pushes the row past 200 columns while its character
    // count stays under it.
    const ids = ['T-750', 'T-751', 'T-752']
    ids.forEach((id) => { ticket(id); marker(id, 'designer', 60_000); marker(id, 'developer', 50_000); marker(id, 'qa', 40_000) })
    const succ = ids.flatMap((id, i) => [`T-${9000 + i * 2}`, `T-${9001 + i * 2}`].map((s) => [s, id] as [string, string]))
    indexDb([...ids, ...succ.map(([s]) => s)], succ)
    fs.writeFileSync(path.join(root, '.prdt', 'config.json'), JSON.stringify({ slug: 'p'.repeat(25) }))
    execFileSync('git', ['init', '-q', '-b', 'b'.repeat(15)], { cwd: root })
    execFileSync('git', ['-c', 'user.email=u@test', '-c', 'user.name=u', 'commit', '-q', '--allow-empty', '-m', 'i'], { cwd: root })
    const ko = run({ PRDT_LANG: 'ko' }).split('\n')
    const en = run({ PRDT_LANG: 'en' }).split('\n')
    for (const r of ko) expect(cols(r)).toBeLessThanOrEqual(200)
    for (const r of en) expect(cols(r)).toBeLessThanOrEqual(200)
    // Under a character count the widest tier (3 ids, 2 successors each) would
    // fit; in columns it is over 200, so ko must tighten to the next tier.
    const widest = ko[0].replace(/\u2026$/, '')
    expect(ko[0]).not.toContain('T-9001') // a 2nd successor only shows at the widest tier
    expect(ko[0]).not.toContain('\u2026')
    expect(cols(widest)).toBeLessThanOrEqual(200)
    expect(ko[0].length).toBeLessThan(cols(ko[0]))
  })
})
