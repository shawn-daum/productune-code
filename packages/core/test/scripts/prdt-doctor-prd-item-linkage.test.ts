/**
 * prdt-doctor-prd-item-linkage.test.ts — T-674 slice 2b, black-box over the
 * real `prdt` CLI (mirrors prdt-doctor-linkage-edges.test.ts).
 *
 * Design SoT: docs/artifacts/v1.10/linkage-design.md §2.4 · §2.7. Literals
 * and grades: docs/tickets/v1.10/T-663.md Outcome "고정 리터럴" / "P1 넷째
 * 줄이 내는 판정 — 등급표", byte-exact.
 *
 *   P1 — the OPEN `## v` section's form: as-is/to-be pair (advisory) · every
 *        H4 is item-address form `#### <key> — <label>` (warning; duplicate
 *        key = violation) · the `### 이 버전이 뒤집은 것 (reversed)` heading +
 *        its row grammar incl. `- 없음` (mixed grades) · every target row
 *        resolving (violation).
 *   E4 — a ticket's `prd_item: <version>#<key>` resolves to an item key of
 *        that version (open section, or a closed versions/<id>.md once the
 *        round has moved there); malformed shape warns, unresolved violates.
 *
 * `edges` in `.prdt/index.db` and widening `wiki lint` to docs/prd/** are out
 * of scope here (next slice) — this file asserts nothing about them.
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync } from 'child_process'
import { test, expect, describe, beforeEach, afterEach } from 'vitest'
import { subprocessTimeout } from '../helpers/subprocess-timeout'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const PRDT_CLI = path.join(CORE_ROOT, 'scripts', 'prdt')

let sandbox: string
let projectRoot: string
let env: NodeJS.ProcessEnv

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
    if (typeof e.status !== 'number') throw new Error(`prdt ${args.join(' ')}: ${e.stderr || e.message}`)
    return { out: `${e.stdout || ''}${e.stderr || ''}`, code: e.status }
  }
}

const doctor = () => runPrdt(['doctor']).out

function poState(version: string): void {
  fs.writeFileSync(path.join(projectRoot, '.prdt', 'po-state.json'),
    JSON.stringify({ schema_version: 1, stage: 'build', version, current_task: null }))
}

function ticket(id: string, version: string, extra: Record<string, string> = {}, status = 'open'): void {
  const dir = path.join(projectRoot, 'docs', 'tickets', version)
  fs.mkdirSync(dir, { recursive: true })
  const extraLines = Object.entries(extra).map(([k, v]) => `${k}: ${v}`).join('\n')
  fs.writeFileSync(path.join(dir, `${id}.md`),
    `---\nid: ${id}\nslug: s-${id.toLowerCase()}\ntype: impl\nstatus: ${status}\n` +
    `assignee: developer\ncreated: 2026-01-01\n${extraLines}${extraLines ? '\n' : ''}---\n\nbody\n`)
}

function wikiPage(name: string, fm: Record<string, string>, body = ''): void {
  const dir = path.join(projectRoot, 'docs', 'wiki')
  fs.mkdirSync(dir, { recursive: true })
  const lines = Object.entries(fm).map(([k, v]) => `${k}: ${v}`).join('\n')
  fs.writeFileSync(path.join(dir, `${name}.md`), `---\n${lines}\n---\n\n# ${name}\n\n${body}\n`)
}

// The reversed heading's default legal row — kept out of the base template's
// arguments so every test that does not care about ⓒ/ⓓ still exercises a
// realistic, fully-resolving section (a decision page named `decision--x`).
const DEFAULT_REVERSED = '- [[decision--x]] — 뒤집었다.'

function writePrd(opts: {
  asis?: boolean; tobe?: boolean; reversedHeading?: string | null;
  reversedRows?: string[]; items?: string[];
} = {}): void {
  const {
    asis = true, tobe = true,
    reversedHeading = '### 이 버전이 뒤집은 것 (reversed)',
    reversedRows = [DEFAULT_REVERSED],
    items = ['#### alpha — 첫 항목\n\n본문.', '#### beta — 둘째 항목\n\n본문.'],
  } = opts
  const parts = ['## v1.10 — test round', '']
  if (asis) parts.push('### 이 버전 직전 (as-is)', '', 'as-is 본문.', '')
  if (tobe) parts.push('### 이 버전 직후 (to-be)', '', 'to-be 본문.', '')
  if (reversedHeading !== null) {
    parts.push(reversedHeading, '')
    parts.push(...reversedRows, '')
  }
  parts.push('### Why', '', 'why 본문.', '')
  parts.push(...items, '')
  const dir = path.join(projectRoot, 'docs', 'prd')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'PRD.md'), parts.join('\n') + '\n')
}

function versionsFile(id: string, body: string): void {
  const dir = path.join(projectRoot, 'docs', 'prd', 'versions')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, `${id}.md`), body)
}

describe('T-674 slice 2b — P1 (prd form) + E4 (prd_item edge)', () => {
  beforeEach(() => {
    sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-prd-item-'))
    const home = path.join(sandbox, 'home')
    fs.mkdirSync(home, { recursive: true })
    env = { ...process.env, HOME: home, PRDT_HOME: path.join(home, '.prdt'),
             PRDT_DISCIPLINE: path.join(CORE_ROOT, 'discipline') }
    projectRoot = path.join(sandbox, 'proj')
    fs.mkdirSync(path.join(projectRoot, '.prdt'), { recursive: true })
    fs.writeFileSync(path.join(projectRoot, '.prdt', 'config.json'), JSON.stringify({ slug: 'proj' }, null, 2))
    for (const d of ['docs/prd', 'docs/tickets', 'docs/wiki', 'docs/artifacts']) {
      fs.mkdirSync(path.join(projectRoot, d), { recursive: true })
    }
    poState('v1.10')
    wikiPage('decision--x', { type: 'decision', status: 'live' })
  })
  afterEach(() => fs.rmSync(sandbox, { recursive: true, force: true }))

  test('a fully-formed open section (as-is/to-be, item-address H4s, resolving reversed row) is silent', () => {
    writePrd()
    const d = doctor()
    expect(d).not.toContain('v1.10:')
  })

  // ── ⓐ as-is/to-be pair — advisory ───────────────────────────────────────────

  test('missing as-is/to-be pair is advisory (still a ⚠ line, exit 0, non-blocking)', () => {
    writePrd({ asis: false, tobe: false })
    const r = runPrdt(['doctor'])
    expect(r.code).toBe(0)
    expect(r.out).toContain('v1.10: missing as-is/to-be pair')
    expect(r.out).toContain('(non-blocking)')
  })

  // ── ⓑ H4 item-address form ──────────────────────────────────────────────────

  test('a numbered #### heading (not item-address form) warns', () => {
    writePrd({ items: ['#### 1. 첫 항목\n\n본문.'] })
    expect(doctor()).toContain('is not item-address form')
  })

  test('a duplicated item key violates', () => {
    writePrd({ items: ['#### alpha — 첫 항목\n\n본문.', '#### alpha — 다른 라벨\n\n본문.'] })
    expect(doctor()).toContain("item key 'alpha' duplicated")
  })

  // ── ⓒ reversed heading + row grammar ────────────────────────────────────────

  test('no reversed heading at all is advisory', () => {
    writePrd({ reversedHeading: null, reversedRows: [] })
    expect(doctor()).toContain('v1.10: no "### 이 버전이 뒤집은 것 (reversed)"')
  })

  test('a near-miss heading (suffix added) warns with the actual string', () => {
    writePrd({ reversedHeading: '### 이 버전이 뒤집은 것 (reversed) — 요약' })
    expect(doctor()).toContain('reversed heading near-miss "### 이 버전이 뒤집은 것 (reversed) — 요약"')
  })

  test('heading present, zero rows below it, violates', () => {
    writePrd({ reversedRows: [] })
    expect(doctor()).toContain('v1.10: reversed section has no rows')
  })

  test('a prose row with no leading target key violates', () => {
    writePrd({ reversedRows: ['그냥 산문으로 적은 줄입니다.'] })
    expect(doctor()).toContain('v1.10: reversed row without leading target key:')
  })

  test('"- 없음" mixed with a target row violates', () => {
    writePrd({ reversedRows: [DEFAULT_REVERSED, '- 없음'] })
    expect(doctor()).toContain('"- 없음" mixed with target rows')
  })

  test('two "- 없음" rows alone violate', () => {
    writePrd({ reversedRows: ['- 없음', '- 없음'] })
    expect(doctor()).toContain('"- 없음" mixed with target rows')
  })

  test('a single "- 없음" row alone is silent (the legal empty case)', () => {
    writePrd({ reversedRows: ['- 없음'] })
    expect(doctor()).not.toContain('v1.10: reversed')
    expect(doctor()).not.toContain('v1.10: "- 없음"')
  })

  // ── ⓓ target resolution ─────────────────────────────────────────────────────

  test('a reversed row citing a decision page that does not exist violates', () => {
    writePrd({ reversedRows: ['- [[decision--ghost]] — 없는 결정.'] })
    expect(doctor()).toContain('v1.10: reversed target [[decision--ghost]] does not resolve')
  })

  test('a reversed row citing a ticket that does not exist violates', () => {
    writePrd({ reversedRows: ['- T-9999 — 없는 티켓.'] })
    expect(doctor()).toContain('v1.10: reversed target T-9999 does not resolve')
  })

  test('a reversed row citing a real ticket (any status) resolves silently', () => {
    ticket('T-1', 'v1.10', {}, 'dropped')
    writePrd({ reversedRows: ['- T-1 — 뒤집힌 결정의 티켓.'] })
    expect(doctor()).not.toContain('v1.10: reversed target')
  })

  // ── E4 — prd_item edge ───────────────────────────────────────────────────────

  test('E4: a malformed prd_item warns', () => {
    writePrd()
    ticket('T-1', 'v1.10', { prd_item: 'not-a-prd-item' })
    expect(doctor()).toContain("ticket: T-1 prd_item: 'not-a-prd-item' is not `<version>#<key>` form")
  })

  test('E4: a well-formed prd_item pointing at a key the open section does not have violates', () => {
    writePrd()
    ticket('T-1', 'v1.10', { prd_item: 'v1.10#ghost' })
    expect(doctor()).toContain('ticket: T-1 prd_item: v1.10#ghost does not resolve to an item of v1.10')
  })

  test('E4: a prd_item resolving to a real open-section item key is silent', () => {
    writePrd()
    ticket('T-1', 'v1.10', { prd_item: 'v1.10#alpha' })
    expect(doctor()).not.toContain('T-1 prd_item')
  })

  test('E4: a prd_item resolving against a CLOSED versions/<id>.md file is silent', () => {
    versionsFile('v1.9', '## v1.9 — closed round\n\n#### gamma — 셋째 항목\n\n본문.\n')
    ticket('T-1', 'v1.9', { prd_item: 'v1.9#gamma' })
    expect(doctor()).not.toContain('T-1 prd_item')
  })

  test('E4: a prd_item naming a version with no record anywhere violates', () => {
    ticket('T-1', 'v0.1', { prd_item: 'v0.1#anything' })
    expect(doctor()).toContain('ticket: T-1 prd_item: v0.1#anything does not resolve to an item of v0.1')
  })
})
