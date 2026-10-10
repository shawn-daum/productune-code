/**
 * T-977 — the UX-writing word list (blacklist + plain replacement per entry,
 * keyed by BCP-47) and the two places it is checked:
 *  - `prdt wordlist check|export` (CLI; also the import path for a product's
 *    runtime LLM prompts),
 *  - `prdt-wordlist-check.sh` (PostToolUse Write|Edit|MultiEdit) — names each
 *    hit and its replacement back to the writer right after a UX-writing
 *    surface (docs/artifacts/**, docs/prd/PRD.md, docs/tickets/**) is written.
 * Every subprocess runs with a sandbox HOME + PRDT_HOME and an explicit cwd.
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync, spawnSync } from 'child_process'
import { test, expect, describe, beforeAll, afterAll } from 'vitest'
import { subprocessTimeout } from '../helpers/subprocess-timeout'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const PRDT_CLI = path.join(CORE_ROOT, 'scripts', 'prdt')
const HOOK = path.join(CORE_ROOT, 'scripts', 'hooks', 'prdt-wordlist-check.sh')
const CANON = path.join(CORE_ROOT, 'discipline', 'wordlist')

let sandbox: string
let home: string
let prdtHome: string
let project: string

beforeAll(() => {
  sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t977-'))
  home = path.join(sandbox, 'home')
  prdtHome = path.join(home, '.prdt')
  // An installed-mirror shape: discipline/wordlist + bin/prdt, the layout the
  // hook resolves (hooks/../bin/prdt) and install.sh produces.
  fs.mkdirSync(path.join(prdtHome, 'discipline'), { recursive: true })
  fs.cpSync(CANON, path.join(prdtHome, 'discipline', 'wordlist'), { recursive: true })
  fs.mkdirSync(path.join(prdtHome, 'bin'), { recursive: true })
  fs.mkdirSync(path.join(prdtHome, 'hooks'), { recursive: true })
  fs.copyFileSync(PRDT_CLI, path.join(prdtHome, 'bin', 'prdt'))
  fs.copyFileSync(path.join(CORE_ROOT, 'scripts', 'prdt-messages.json'), path.join(prdtHome, 'bin', 'prdt-messages.json'))
  fs.copyFileSync(HOOK, path.join(prdtHome, 'hooks', 'prdt-wordlist-check.sh'))
  fs.chmodSync(path.join(prdtHome, 'bin', 'prdt'), 0o755)
  fs.chmodSync(path.join(prdtHome, 'hooks', 'prdt-wordlist-check.sh'), 0o755)
  project = path.join(sandbox, 'proj')
  fs.mkdirSync(path.join(project, '.prdt'), { recursive: true })
  fs.writeFileSync(path.join(project, '.prdt', 'config.json'), '{"slug":"proj"}\n')
  fs.mkdirSync(path.join(project, 'docs', 'artifacts', 'v1.0'), { recursive: true })
  fs.mkdirSync(path.join(project, 'docs', 'tickets', 'v1.0'), { recursive: true })
  fs.mkdirSync(path.join(project, 'docs', 'prd'), { recursive: true })
  fs.mkdirSync(path.join(project, 'docs', 'wiki'), { recursive: true })
})

afterAll(() => { fs.rmSync(sandbox, { recursive: true, force: true }) })

function env(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  return { ...process.env, HOME: home, PRDT_HOME: prdtHome, CI: '1', PRDT_DISCIPLINE: '', ...extra }
}

function cli(args: string[], opts: { cwd?: string; input?: string } = {}): { out: string; err: string; code: number } {
  const r = spawnSync('python3', [PRDT_CLI, 'wordlist', ...args], {
    cwd: opts.cwd ?? project, env: env(), encoding: 'utf-8', input: opts.input ?? '',
    timeout: subprocessTimeout('cli'),
  })
  return { out: r.stdout ?? '', err: r.stderr ?? '', code: r.status ?? -1 }
}

function write(rel: string, body: string): string {
  const p = path.join(project, rel)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, body, 'utf-8')
  return p
}

describe('canonical lists', () => {
  test('ko · en · ja exist, every entry has a word, a compilable pattern and ≥1 replacement', () => {
    for (const lang of ['ko', 'en', 'ja']) {
      const data = JSON.parse(fs.readFileSync(path.join(CANON, `${lang}.json`), 'utf-8'))
      expect(data.lang).toBe(lang)
      expect(data.entries.length).toBeGreaterThan(5)
      for (const e of data.entries) {
        expect(typeof e.word).toBe('string')
        expect(Array.isArray(e.replace) && e.replace.length > 0).toBe(true)
        // JS-compilable too: a product imports the same patterns into its runtime.
        expect(() => new RegExp(e.pattern ?? e.word, e.flags ?? '')).not.toThrow()
      }
    }
  })

  test('ko is seeded from the observed words', () => {
    const words = JSON.parse(fs.readFileSync(path.join(CANON, 'ko.json'), 'utf-8')).entries.map((e: any) => e.word).join(' | ')
    for (const w of ['머무르다', '착지', '사람 손', '모름', 'em dash', '판 내기', '발자국', '축자']) expect(words).toContain(w)
  })
})

describe('prdt wordlist check', () => {
  test('markdown: each hit names line, word and replacement; exit 1', () => {
    const p = write('docs/prd/PRD.md', '# PRD\n\n값이 plist에 머무른다.\n상태: 모름\n판 내기 전에 발자국을 남긴다.\n')
    const r = cli(['check', p])
    expect(r.code).toBe(1)
    expect(r.out).toMatch(/PRD\.md:3:\d+: 머무른 \(머무르다\) → 남다/)
    expect(r.out).toMatch(/PRD\.md:4:\d+: 모름 → /)
    expect(r.out).toContain('버전 배포')
    expect(r.out).toContain('건드린 파일')
    expect(r.out).toMatch(/wordlist: 4 hits in 1 file/)
  })

  test('clean text → exit 0, zero hits', () => {
    const p = write('docs/prd/clean.md', '# PRD\n\n값이 plist에 남는다.\n생성 실패: Solar API 응답 시간 초과\n')
    const r = cli(['check', p])
    expect(r.code).toBe(0)
    expect(r.out).toMatch(/wordlist: 0 hits/)
  })

  test('markdown exemptions: code spans, fences, verbatim *"…"* quotes, frontmatter, fixed heading separators', () => {
    const p = write('docs/tickets/v1.0/T-001.md', [
      '---', 'title: 모름', '---', '## v1.2 — 라벨', '#### F-1 — 라벨',
      '사용자: *"머무른다 착지한다 이런게 slop"*', '`모름`', '```', '착지', '```', '본문 — 끝',
    ].join('\n') + '\n')
    const r = cli(['check', '--json', p])
    const j = JSON.parse(r.out)
    expect(j.total).toBe(1)
    expect(j.files[0].hits[0]).toMatchObject({ line: 11, word: 'em dash (—)' })
  })

  test('html: visible text, labels JSON and title attrs are checked; style, script, code, del and comments are not', () => {
    const p = write('docs/artifacts/v1.0/screen.html', [
      '<!doctype html><html><head><style>/* a — b */</style>',
      '<!-- comment 모름 <script id="labels"> -->',
      '<script>const x = "모름"</script>',
      '<script id="labels" type="application/json">{"k":"착지 완료"}</script>',
      '</head><body>',
      '<p title="사람 손 필요">상태: 모름</p>',
      '<table><tr><td><del>모름 — 수집 전</del></td><td><code>모름</code></td><td>수집 전</td></tr></table>',
      '</body></html>',
    ].join('\n'))
    const j = JSON.parse(cli(['check', '--json', p]).out)
    const got = j.files[0].hits.map((h: any) => `${h.line}:${h.match}`)
    expect(got).toEqual(['4:착지', '6:사람 손', '6:모름'])
  })

  test('language: Hangul text → ko, Latin-only → en, --lang overrides', () => {
    const en = write('docs/artifacts/v1.0/en.md', 'We leverage a seamless flow.\n')
    const j = JSON.parse(cli(['check', '--json', en]).out)
    expect(j.files[0].lang).toBe('en')
    expect(j.files[0].hits.map((h: any) => h.word)).toEqual(['leverage', 'seamless'])
    const forced = JSON.parse(cli(['check', '--json', '--lang', 'ko', en]).out)
    expect(forced.total).toBe(0)
  })

  test('stdin (`-`) checks text that is not a file (e.g. a chat reply)', () => {
    const r = cli(['check', '--lang', 'ko', '-'], { input: '빌드는 뒤에서 도는 중이고 결과는 모름\n' })
    expect(r.code).toBe(1)
    expect(r.out).toContain('백그라운드 작업')
  })

  test('project extension: .prdt/wordlist/<lang>.json adds entries and replaces a canon entry by word, canon untouched', () => {
    const before = fs.readFileSync(path.join(prdtHome, 'discipline', 'wordlist', 'ko.json'), 'utf-8')
    write('.prdt/wordlist/ko.json', JSON.stringify({
      lang: 'ko', schema: 1, entries: [
        { word: '얹다', pattern: '얹', replace: ['추가하다'] },
        { word: '모름', pattern: '모름', replace: ['사유를 적는다'] },
      ],
    }))
    try {
      const p = write('docs/prd/ext.md', '기존 경로에 얹는다. 모름\n')
      const j = JSON.parse(cli(['check', '--json', p]).out)
      expect(j.files[0].hits.map((h: any) => `${h.word}→${h.replace[0]}`)).toEqual(['얹다→추가하다', '모름→사유를 적는다'])
      expect(fs.readFileSync(path.join(prdtHome, 'discipline', 'wordlist', 'ko.json'), 'utf-8')).toBe(before)
    } finally {
      fs.rmSync(path.join(project, '.prdt', 'wordlist'), { recursive: true, force: true })
    }
  })

  test('a malformed project list is named, exit 3', () => {
    write('.prdt/wordlist/ko.json', '{ not json')
    try {
      const r = cli(['check', '--lang', 'ko', '-'], { input: '가\n' })
      expect(r.code).toBe(3)
      expect(r.err).toContain('.prdt/wordlist/ko.json')
    } finally {
      fs.rmSync(path.join(project, '.prdt', 'wordlist'), { recursive: true, force: true })
    }
  })
})

describe('prdt wordlist export (runtime prompt import)', () => {
  test('json: merged list with patterns a product can compile', () => {
    const j = JSON.parse(cli(['export', '--lang', 'ko']).out)
    expect(j.lang).toBe('ko')
    expect(j.entries.find((e: any) => e.word === '착지')).toMatchObject({ pattern: '착지', replace: expect.any(Array) })
  })

  test('lines: one `word → replacement` line per entry, ready to paste into a prompt', () => {
    const out = cli(['export', '--lang', 'ko', '--format', 'lines']).out
    expect(out).toMatch(/^- 발자국 → 건드린 파일$/m)
  })
})

describe('prdt-wordlist-check.sh (PostToolUse)', () => {
  function hook(payload: object, extraEnv: Record<string, string> = {}): { out: string; code: number } {
    const r = spawnSync('bash', [path.join(prdtHome, 'hooks', 'prdt-wordlist-check.sh')], {
      cwd: project, env: env(extraEnv), input: JSON.stringify(payload), encoding: 'utf-8',
      timeout: subprocessTimeout('hook'),
    })
    return { out: r.stdout ?? '', code: r.status ?? -1 }
  }
  const ev = (file: string, tool = 'Write') => ({
    hook_event_name: 'PostToolUse', tool_name: tool, cwd: project,
    tool_input: { file_path: file }, tool_response: {},
  })

  test('a written artifact with hits → additionalContext naming each word and its replacement', () => {
    const p = write('docs/artifacts/v1.0/hook.html', '<p>상태: 모름</p>\n<p>Archive에 착지</p>\n')
    const r = hook(ev(p, 'Edit'))
    expect(r.code).toBe(0)
    const j = JSON.parse(r.out)
    expect(j.hookSpecificOutput.hookEventName).toBe('PostToolUse')
    const ctx: string = j.hookSpecificOutput.additionalContext
    expect(ctx).toContain('docs/artifacts/v1.0/hook.html')
    expect(ctx).toMatch(/line 1 "모름" → /)
    expect(ctx).toMatch(/line 2 "착지" → 도착하다/)
  })

  test('ticket body and PRD are surfaces; wiki, design.md and code are not', () => {
    const t = write('docs/tickets/v1.0/T-002.md', '상태 모름\n')
    expect(hook(ev(t)).out).toContain('모름')
    for (const rel of ['docs/wiki/x.md', 'docs/design.md', 'src/a.md']) {
      const p = write(rel, '상태 모름\n')
      expect(hook(ev(p)).out).toBe('')
    }
  })

  test('clean surface file, non-write tool, or broken payload → silent exit 0', () => {
    const p = write('docs/prd/PRD.md', '# PRD\n수집 전\n')
    expect(hook(ev(p))).toEqual({ out: '', code: 0 })
    const dirty = write('docs/artifacts/v1.0/r.md', '모름\n')
    expect(hook({ ...ev(dirty), tool_name: 'Read' })).toEqual({ out: '', code: 0 })
    const r = spawnSync('bash', [path.join(prdtHome, 'hooks', 'prdt-wordlist-check.sh')], {
      cwd: project, env: env(), input: '{ broken /docs/x.md"', encoding: 'utf-8', timeout: subprocessTimeout('hook'),
    })
    expect(r.status).toBe(0)
    expect(r.stdout).toBe('')
  })
})
