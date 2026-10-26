/**
 * prdt-decisions-find.test.ts — `prdt decisions find` (T-1257), black-box over
 * the REAL `prdt` CLI on fixture projects (never this repo's own docs).
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync } from 'child_process'
import { test, expect, describe, beforeAll, afterAll } from 'vitest'
import { subprocessTimeout } from '../helpers/subprocess-timeout'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const PRDT_CLI = path.join(CORE_ROOT, 'scripts', 'prdt')

let projectDir: string

function runPrdt(args: string[]): string {
  return execFileSync('python3', [PRDT_CLI, ...args], {
    cwd: projectDir,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: subprocessTimeout('cli'),
  })
}

function write(rel: string, text: string) {
  const f = path.join(projectDir, rel)
  fs.mkdirSync(path.dirname(f), { recursive: true })
  fs.writeFileSync(f, text)
}

function ticket(id: string, type: string, created: string, extra: { outcome?: string; log?: string; status?: string } = {}) {
  write(`docs/tickets/v1.0/${id}.md`, [
    '---', `id: ${id}`, `slug: fixture-${id.toLowerCase()}`, `type: ${type}`,
    `status: ${extra.status ?? 'done'}`, 'assignee: user', `created: ${created}`, '---', '',
    '## problem', '', `- fixture ${id} about the 배포 정본 and the Frobnicator.`, '',
    '## acceptance', '', '- fixture', '',
    '## outcome', '', extra.outcome ?? '', '',
    '## log', '', extra.log ?? '', '',
  ].join('\n'))
}

beforeAll(() => {
  projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-dec-find-'))
  fs.mkdirSync(`${projectDir}/docs/prd`, { recursive: true })
  runPrdt(['init', '--json', '--slug', 'proj', '--yes'])
  // keyed decision (design D6 headings), module set
  ticket('T-10', 'decision', '2026-10-01', {
    outcome: [
      '- 사용자 (2026-10-01, 원문 그대로): *"추천대로"*', '',
      '### why', '', '- 정본이 둘이면 어긋난다', '',
      '### how', '', '- 한 곳에만 적는다', '',
      '### module', '', '- discipline wording', '',
      '### what', '', '- 배포 정본 = DEPLOY.md',
    ].join('\n'),
  })
  // a later ticket that followed the same module
  ticket('T-11', 'decision', '2026-10-05', {
    outcome: ['- 사용자 (원문): *"ㅇㅋ"*', '', '### how', '', '- 한 곳에만 적는다', '', '### module', '', '- discipline wording', '', '### what', '', '- 배포 기록 줄'].join('\n'),
  })
  // decision without the keys
  ticket('T-12', 'decision', '2026-10-03', { outcome: '- 사용자 (원문): *"b"*' })
  // reversed by a later ticket
  ticket('T-13', 'decision', '2026-09-01', {
    outcome: '- 사용자 (원문): *"a"*', log: '- 2026-10-03 T-12 가 이 결정을 뒤집음',
  })
  // not a decision, no user quote → never listed
  ticket('T-14', 'impl', '2026-10-02', { outcome: 'built the Frobnicator' })
  write('docs/wiki/decision--wiki-page.md',
    ['---', 'title: 위키 결정 페이지', 'type: decision', 'status: active', '---', '', '# 결정', '', '배포 정본은 한 곳 — 사용자 「응」', ''].join('\n'))
  write('docs/wiki/log.md', [
    '# log', '',
    '- 2026-10-04 사용자 「스태시 쓰지마」 → 기록',
    '- 2026-10-04 PO 가 스태시 정리 (사용자 말 없음)',
    '- 2026-09-30 landing 정리 · 사용자 「land 는 merge 로」',
    '',
  ].join('\n'))
})

afterAll(() => { fs.rmSync(projectDir, { recursive: true, force: true }) })

describe('prdt decisions find', () => {
  test('one line per match: id · date · status · why · how · module · what · verbatim', () => {
    const line = runPrdt(['decisions', 'find', '배포']).split('\n').find((l) => l.startsWith('T-10'))!
    expect(line).toBe('T-10 · 2026-10-01 · done · why: 정본이 둘이면 어긋난다 · how: 한 곳에만 적는다 · module: discipline wording · what: 배포 정본 = DEPLOY.md · 원문 「추천대로」')
  })

  test('the quote label comes from the catalog (ko 원문 · en quote) and a hard-coded address name is not a user marker (T-1291)', () => {
    const run = (lang: string) => execFileSync('python3', [PRDT_CLI, 'decisions', 'find', 'Frobnicator'], {
      cwd: projectDir, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'], timeout: subprocessTimeout('cli'), env: { ...process.env, PRDT_LANG: lang },
    }).split('\n').find((l) => l.startsWith('T-12'))!
    expect(run('ko')).toContain('원문 「b」')
    expect(run('en')).toContain('quote 「b」')
    expect(run('en')).not.toContain('원문')
    write('docs/tickets/v1.0/T-19.md', ['---', 'id: T-19', 'slug: fixture-t-19', 'type: decision', 'status: done', 'assignee: user', 'created: 2026-10-20', '---', '',
      '## problem', '', '- Frobnicator', '', '## acceptance', '', '- x', '', '## outcome', '', '- 션님 (원문): *"x"*', ''].join('\n'))
    const out = execFileSync('python3', [PRDT_CLI, 'decisions', 'find', 'Frobnicator'], { cwd: projectDir, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'], timeout: subprocessTimeout('cli') })
    expect(out.split('\n').find((l) => l.startsWith('T-19')) ?? '').not.toContain('「x」')
    fs.rmSync(path.join(projectDir, 'docs/tickets/v1.0/T-19.md'))
  })

  test('a decision without the keys prints why: none', () => {
    const out = runPrdt(['decisions', 'find', 'Frobnicator'])
    const line = out.split('\n').find((l) => l.startsWith('T-12'))!
    expect(line).toContain('why: none')
    expect(line).toContain('원문 「b」')
    expect(line).not.toContain('how:')
  })

  test('newest first; a non-decision ticket with no user quote is not listed', () => {
    const ids = runPrdt(['decisions', 'find', 'Frobnicator']).trim().split('\n').map((l) => l.split(' · ')[0])
    expect(ids).toEqual(['T-11', 'T-12', 'T-10', 'T-13'].filter((i) => ids.includes(i)))
    expect(ids).not.toContain('T-14')
    expect(ids.indexOf('T-12')).toBeLessThan(ids.indexOf('T-13'))
  })

  test('wiki decision page and user-quoted log lines are lines too; log lines without a quote are not', () => {
    const out = runPrdt(['decisions', 'find', '배포', '스태시'])
    expect(out).toMatch(/^decision--wiki-page · - · active · why: none · what: 위키 결정 페이지 · 원문 「응」$/m)
    expect(out).toMatch(/^log\.md:3 · 2026-10-04 · log · .*원문 「스태시 쓰지마」$/m)
    expect(out).not.toContain('log.md:4')
  })

  test('ASCII words match whole words only (land does not hit landing); log line is hit', () => {
    const out = runPrdt(['decisions', 'find', 'land'])
    expect(out).toMatch(/^log\.md:5 · 2026-09-30 · log · /m)
  })

  test('a reversed decision names its successor', () => {
    const line = runPrdt(['decisions', 'find', 'Frobnicator']).split('\n').find((l) => l.startsWith('T-13'))!
    expect(line.endsWith('→ T-12')).toBe(true)
  })

  test('no hit prints one clear line', () => {
    expect(runPrdt(['decisions', 'find', 'zzzqqq']).trim()).toBe('no recorded decision')
  })

  test('--module lists the kinds; --module KIND gives the principle and the items that followed', () => {
    expect(runPrdt(['decisions', 'find', '--module']).trim()).toBe('module: discipline wording · 2 items')
    const out = runPrdt(['decisions', 'find', '--module', 'discipline wording']).trim().split('\n')
    expect(out[0]).toBe('module: discipline wording · principle: 한 곳에만 적는다 · set by T-10 · 2026-10-01')
    expect(out[1]).toBe('  followed: T-11 · 2026-10-05 · done · what: 배포 기록 줄')
  })

  test('term-dictionary entries are silent without schema 2, matched once a schema 2 file exists', () => {
    write('.prdt/wordlist/ko.json', JSON.stringify([{ word: 'land', replace: 'merge' }]))
    expect(runPrdt(['decisions', 'find', 'Frobnicator'])).not.toContain('term:')
    expect(runPrdt(['decisions', 'find', 'zzzqqq']).trim()).toBe('no recorded decision')
    write('.prdt/wordlist/ko.json', JSON.stringify({ schema: 2, entries: [{ concept: 'land (git)', say: ['merge'] }] }))
    expect(runPrdt(['decisions', 'find', 'land']).split('\n')).toContain('term: land (git) → merge')
    fs.rmSync(path.join(projectDir, '.prdt', 'wordlist'), { recursive: true, force: true })
  })
})
