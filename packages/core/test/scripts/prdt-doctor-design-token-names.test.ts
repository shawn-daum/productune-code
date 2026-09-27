/**
 * prdt-doctor-design-token-names.test.ts — T-689 slice 2, black-box over the
 * real `prdt` CLI (mirrors prdt-doctor-linkage-2c.test.ts's harness).
 *
 * Design SoT: docs/design.md §0.8 · docs/tickets/v1.10/T-659.md Outcome
 * "이름 검사 (`prdt doctor`)" — the literal rule this check implements:
 * a reference is the first word inside a backtick span that starts with
 * `--`, or the name inside `var(--…)`; `--x-*` matches by prefix; fenced
 * code blocks are skipped; a line (or a whole section under a heading)
 * carrying `(미발행)`/`(폐기)` is skipped; each unknown name is one finding
 * (line + name); a missing `ds_html:` file is one finding; the whole check
 * (both halves) is silent when frontmatter has no `tokens:` key.
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync } from 'child_process'
import { test, expect, describe, beforeEach, afterEach } from 'vitest'
import { subprocessTimeout } from '../helpers/subprocess-timeout'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const PRDT_CLI = path.join(CORE_ROOT, 'scripts', 'prdt')
const REPO_DISCIPLINE = path.join(CORE_ROOT, 'discipline')

let sandbox: string
let projectRoot: string
let env: NodeJS.ProcessEnv

/** T-668/T-676: doctor's "resident machine resources" check shells out to the
 *  REAL `uptime`; stubbing it keeps every doctor run in this file deterministic
 *  (same technique prdt-doctor-linkage-2c.test.ts uses). */
function fakeUptimeBinDir(dir: string): string {
  const bin = path.join(dir, 'bin')
  fs.mkdirSync(bin, { recursive: true })
  fs.writeFileSync(path.join(bin, 'uptime'),
    '#!/bin/sh\necho "12:00  up 1 day, 2 users, load averages: 1.00 1.00 1.00"\n')
  fs.chmodSync(path.join(bin, 'uptime'), 0o755)
  return bin
}

function runPrdt(args: string[]): { out: string; code: number } {
  try {
    const out = execFileSync('python3', [PRDT_CLI, ...args], {
      cwd: projectRoot,
      env,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: subprocessTimeout('cli'),
    })
    return { out, code: 0 }
  } catch (e: any) {
    if (typeof e.status !== 'number') throw new Error(`prdt doctor: ${e.stderr || e.message}`)
    return { out: `${e.stdout || ''}${e.stderr || ''}`, code: e.status }
  }
}

/** This check's own lines only — `⚠ design.md:…`/`⚠ design.md: …` — never the
 *  unrelated checks that also print a `docs/design.md` (leading `docs/`)
 *  substring (wiki-single-site, dead discipline-path citations). */
function designTokenFindings(): string[] {
  return runPrdt(['doctor']).out.split('\n').filter(l => l.startsWith('⚠ design.md'))
}

function writeConfig(): void {
  fs.writeFileSync(path.join(projectRoot, '.prdt', 'config.json'),
    JSON.stringify({ slug: 'proj' }, null, 2))
}

function writeTokensCss(text: string, rel = 'tokens.css'): void {
  const abs = path.join(projectRoot, rel)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  fs.writeFileSync(abs, text)
}

function writeDsHtml(rel = 'ds/design-system.html'): void {
  const abs = path.join(projectRoot, rel)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  fs.writeFileSync(abs, '<!doctype html><html><body>ds</body></html>')
}

function writeDesignMd(frontmatter: string, body: string): string {
  fs.mkdirSync(path.join(projectRoot, 'docs'), { recursive: true })
  const full = `---\n${frontmatter}\n---\n\n${body}\n`
  fs.writeFileSync(path.join(projectRoot, 'docs', 'design.md'), full)
  return full
}

const CLEAN_TOKENS = [
  ':root {',
  '  --accent: #111;',
  '  --text-primary: #222;',
  '  --persona-po: #333;',
  '  --persona-po-subtle: #444;',
  '  --persona-qa: #555;',
  '  --persona-qa-subtle: #666;',
  '}',
].join('\n')

// Split so a test can insert an extra line right after the checked bullets —
// `### Legacy (미발행)` is the LAST heading on purpose (T-687-style pitfall:
// a marked section with no following heading skips every line after it, so
// appending new content past it would silently never be checked).
const CLEAN_HEAD = [
  '# Design',
  '',
  '- `--accent` is the single swap point.',
  '- prose reads `var(--text-primary)` for body text.',
  '- every persona pill uses `--persona-*-subtle`.',
  '',
  '```css',
  '--totally-fake-token: red;',
  '```',
  '',
].join('\n')

const CLEAN_TAIL = [
  '### Legacy (미발행)',
  '',
  '- `--not-real-token` lives here but the whole section is skipped.',
  '',
  'a line that itself is marked also skips: `--another-fake-token` (미발행)',
].join('\n')

const CLEAN_BODY = CLEAN_HEAD + CLEAN_TAIL

beforeEach(() => {
  sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-design-token-names-'))
  const home = path.join(sandbox, 'home')
  fs.mkdirSync(home, { recursive: true })
  const disciplineDir = path.join(sandbox, 'discipline')
  fs.cpSync(REPO_DISCIPLINE, disciplineDir, { recursive: true })
  const binDir = fakeUptimeBinDir(sandbox)
  env = {
    ...process.env,
    HOME: home,
    PRDT_HOME: path.join(home, '.prdt'),
    PRDT_DISCIPLINE: disciplineDir,
    PATH: `${binDir}:${process.env.PATH}`,
  }
  projectRoot = path.join(sandbox, 'proj')
  fs.mkdirSync(path.join(projectRoot, '.prdt'), { recursive: true })
  writeConfig()
  for (const d of ['docs/prd', 'docs/tickets', 'docs/wiki', 'docs/artifacts']) {
    fs.mkdirSync(path.join(projectRoot, d), { recursive: true })
  }
  fs.writeFileSync(path.join(projectRoot, '.prdt', 'po-state.json'),
    JSON.stringify({ schema_version: 1, stage: 'build', version: 'v0.1', current_task: null }))
})
afterEach(() => fs.rmSync(sandbox, { recursive: true, force: true }))

describe('T-689 slice 2 — design-token name check (`prdt doctor`)', () => {
  test('clean fixture — every reference resolves, ds_html exists: 0 findings', () => {
    writeTokensCss(CLEAN_TOKENS)
    writeDsHtml()
    writeDesignMd('tokens: tokens.css\nds_html: ds/design-system.html', CLEAN_BODY)
    expect(designTokenFindings()).toEqual([])
  })

  test('an added `--nope` line yields exactly one finding naming that line', () => {
    writeTokensCss(CLEAN_TOKENS)
    writeDsHtml()
    const body = CLEAN_HEAD + '- a newly written line cites `--nope` by mistake.\n\n' + CLEAN_TAIL
    const full = writeDesignMd('tokens: tokens.css\nds_html: ds/design-system.html', body)
    const lineNo = full.split('\n').findIndex(l => l.includes('--nope')) + 1
    const findings = designTokenFindings()
    expect(findings.length).toBe(1)
    expect(findings[0]).toContain('--nope')
    expect(findings[0]).toMatch(new RegExp(`:${lineNo}:`))
  })

  test('a missing ds_html: file yields one finding', () => {
    writeTokensCss(CLEAN_TOKENS)
    // never write the ds_html file
    writeDesignMd('tokens: tokens.css\nds_html: ds/design-system.html', CLEAN_BODY)
    const findings = designTokenFindings()
    expect(findings.length).toBe(1)
    expect(findings[0]).toContain('ds_html file not found')
    expect(findings[0]).toContain('ds/design-system.html')
  })

  test('no `tokens:` key in frontmatter — the whole check (both halves) is silent', () => {
    writeTokensCss(CLEAN_TOKENS)
    // no ds_html file either — would otherwise be a second finding
    writeDesignMd('doc: design-system', CLEAN_HEAD + '- `--nope` too.\n\n' + CLEAN_TAIL)
    expect(designTokenFindings()).toEqual([])
  })

  test('a wildcard reference with no matching declared name is still a finding', () => {
    writeTokensCss(CLEAN_TOKENS)
    writeDsHtml()
    const body = CLEAN_HEAD + '- `--ghost-*-subtle` matches nothing declared.\n\n' + CLEAN_TAIL
    writeDesignMd('tokens: tokens.css\nds_html: ds/design-system.html', body)
    const findings = designTokenFindings()
    expect(findings.length).toBe(1)
    expect(findings[0]).toContain('--ghost-*-subtle')
  })

  // The real docs/design.md §4.1 line (T-659 Outcome "글꼴" F5) is exactly this
  // shape: a token that genuinely lives in a SIBLING file, named right after
  // that file's own backtick span with only a Korean possessive particle
  // between them. Flagging it would be a false positive against this repo's
  // own "0 unknown design-token names" acceptance line, so the narrow skip in
  // `_design_token_refs` (T-659 Outcome, "foreign file" comment) is load-bearing
  // for that line and gets its own regression coverage rather than riding on
  // whatever this repo's doc happens to contain today.
  test('a token cited right after a different source file name (foreign-file + 의) is not flagged', () => {
    writeTokensCss(CLEAN_TOKENS)
    writeDsHtml()
    const body = CLEAN_HEAD +
      '- `md-recipes.css` 의 `--font-sans`(시스템 스택)는 읽는 곳이 없는 잔재다.\n\n' +
      CLEAN_TAIL
    writeDesignMd('tokens: tokens.css\nds_html: ds/design-system.html', body)
    expect(designTokenFindings()).toEqual([])
  })

  test('the same unknown token WITHOUT a preceding foreign-file name is still flagged (the skip is narrow, not a name exemption)', () => {
    writeTokensCss(CLEAN_TOKENS)
    writeDsHtml()
    const body = CLEAN_HEAD + '- `--font-sans` alone, no foreign file before it.\n\n' + CLEAN_TAIL
    writeDesignMd('tokens: tokens.css\nds_html: ds/design-system.html', body)
    const findings = designTokenFindings()
    expect(findings.length).toBe(1)
    expect(findings[0]).toContain('--font-sans')
  })

  // Rule: "참조 = 백틱 안에서 -- 로 시작하는 첫 낱말" — a backtick span that goes
  // on past the token name (a value, a note) reads only its first word as the
  // reference, never the whole span.
  test('a backtick span with trailing words after the token name reads only the first word', () => {
    writeTokensCss(CLEAN_TOKENS)
    writeDsHtml()
    const body = CLEAN_HEAD + '- inline note citing `--accent unused trailing words`.\n\n' + CLEAN_TAIL
    writeDesignMd('tokens: tokens.css\nds_html: ds/design-system.html', body)
    expect(designTokenFindings()).toEqual([])
  })

  test('a tokens: file that itself does not exist on disk yields one finding', () => {
    // never write tokens.css
    writeDsHtml()
    writeDesignMd('tokens: tokens.css\nds_html: ds/design-system.html', CLEAN_BODY)
    const findings = designTokenFindings()
    expect(findings.length).toBe(1)
    expect(findings[0]).toContain('tokens file not found')
    expect(findings[0]).toContain('tokens.css')
  })
})
