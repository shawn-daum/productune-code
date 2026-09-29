/**
 * statusline-critical-path.test.ts — T-776 (T-681 slice S6).
 *
 * `statusline-prdt.sh` shells out to the project's own `prdt schedule --json`
 * (never reimplements CPM here) so the footer's `CP …` segment can never
 * drift from `compute_schedule()`'s own graph — coverage drives the REAL
 * script end-to-end, same idiom as statusline-running-waiting.test.ts, and
 * cross-checks the segment against a direct `prdt schedule --json` call
 * (prdt-schedule.test.ts's own idiom) rather than re-deriving the expected
 * chain by hand.
 *
 * `_find_prdt_script()` looks for `<root>/packages/core/scripts/prdt` (or
 * under the configured/default code dir) — a bare `.prdt`-only test project
 * has neither, so `linkPrdtCli()` below symlinks the real script in, the
 * same file `prdt schedule` itself is tested against.
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync } from 'child_process'
import { test, expect, describe, beforeEach, afterEach } from 'vitest'
import { subprocessTimeout } from '../helpers/subprocess-timeout'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const STATUSLINE_SH = path.join(CORE_ROOT, 'scripts', 'statusline-prdt.sh')
const PRDT_CLI = path.join(CORE_ROOT, 'scripts', 'prdt')
const VERSION = 'v9.9' // scratch-only version id, matches VERSION_RE

let root: string
let prdtHome: string

function tmp(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix))
}

function makeProject(prefix = 'prdt-t776-sl-proj-'): string {
  const r = fs.realpathSync(tmp(prefix))
  fs.mkdirSync(path.join(r, '.prdt'), { recursive: true })
  fs.writeFileSync(
    path.join(r, '.prdt', 'po-state.json'),
    JSON.stringify({ schema_version: 1, stage: 'build', version: VERSION, current_task: null }),
  )
  return r
}

/** Symlinks the real `scripts/prdt` in at the path `_find_prdt_script()`
 *  looks for on a non-split project — the literal same file `prdt schedule`
 *  is tested against, never a copy that could drift. */
function linkPrdtCli(): void {
  const dir = path.join(root, 'packages', 'core', 'scripts')
  fs.mkdirSync(dir, { recursive: true })
  fs.symlinkSync(PRDT_CLI, path.join(dir, 'prdt'))
}

function writeTicket(id: string, fm: Record<string, string | undefined> = {}): void {
  const dir = path.join(root, 'docs', 'tickets', VERSION)
  fs.mkdirSync(dir, { recursive: true })
  const lines = ['---', `id: ${id}`, `slug: s-${id.toLowerCase()}`, `type: ${fm.type ?? 'impl'}`,
    `status: ${fm.status ?? 'open'}`, `assignee: ${fm.assignee ?? 'developer'}`]
  if (fm.deps) lines.push(`deps: ${fm.deps}`)
  lines.push('created: 2026-09-28', '---', '', '## problem', '', 'x', '', '## acceptance', '', '- x', '')
  fs.writeFileSync(path.join(dir, `${id}.md`), lines.join('\n'))
}

function runStatusline(): string {
  return execFileSync('bash', [STATUSLINE_SH], {
    cwd: root, input: '', encoding: 'utf-8',
    env: { ...process.env, PRDT_HOME: prdtHome },
  })
}

/** The real `prdt schedule --json`'s own `critical_path` — the oracle this
 *  suite cross-checks the statusline's `CP …` segment against. `cmd_schedule`
 *  exits 1 on a dependency cycle even in `--json` mode (stdout still carries
 *  the JSON, `critical_path: []`) — same exit `execFileSync` throws on, so
 *  this reads `e.stdout` on that path rather than treating it as a real
 *  failure (the statusline's own `critical_path_head()` degrades the same
 *  non-zero exit to `[]` without even parsing stdout). */
function realCriticalPath(): string[] {
  let out: string
  try {
    out = execFileSync('python3', [PRDT_CLI, 'schedule', '--json'], {
      cwd: root, encoding: 'utf-8', timeout: subprocessTimeout('cli'),
      env: { ...process.env, PRDT_HOME: prdtHome },
    })
  } catch (e: any) {
    out = e.stdout ?? '{}'
  }
  return JSON.parse(out).critical_path
}

function segment(out: string, name: 'CP'): string | undefined {
  const found = out.trim().split(' | ').find((p) => p.startsWith(`${name} `))
  return found === undefined ? undefined : found.replace(/\x1b\]8;;file:\/\/[^\x1b]*\x1b\\(.*?)\x1b\]8;;\x1b\\/g, '$1').slice(name.length + 1)
}

function which(bin: string): string | null {
  try { return execFileSync('which', [bin], { encoding: 'utf8' }).trim() || null } catch { return null }
}
const PYTHON3 = which('python3')

beforeEach(() => {
  root = makeProject()
  prdtHome = tmp('prdt-t776-sl-home-')
})

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true })
  fs.rmSync(prdtHome, { recursive: true, force: true })
})

describe.skipIf(!PYTHON3)('T-776 — statusline critical-path (CP) footer segment', () => {
  test('no packages/core/scripts/prdt reachable (bare project): CP omitted, no crash', () => {
    writeTicket('T-810')
    const out = runStatusline()
    expect(out).not.toMatch(/\bCP\b/)
    expect(out).toContain('build') // rest of the line still renders
  })

  test('no open tickets at all: CP omitted even with the CLI reachable', () => {
    linkPrdtCli()
    const out = runStatusline()
    expect(out).not.toMatch(/\bCP\b/)
  })

  test('a 3-long chain: CP shows the ≤2-id HEAD, matching `prdt schedule --json` exactly', () => {
    linkPrdtCli()
    writeTicket('T-810')
    writeTicket('T-811', { deps: '["T-810"]' })
    writeTicket('T-812', { deps: '["T-811"]' })
    const chain = realCriticalPath()
    expect(chain.length).toBe(3) // sanity: the oracle really is a 3-long chain

    const out = runStatusline()
    expect(segment(out, 'CP')).toBe(chain.slice(0, 2).join('→'))
  })

  test('a 1-long chain (single ready ticket, no deps): CP shows just that id, no arrow', () => {
    linkPrdtCli()
    writeTicket('T-820')
    const chain = realCriticalPath()
    expect(chain).toEqual(['T-820'])
    const out = runStatusline()
    expect(segment(out, 'CP')).toBe('T-820')
  })

  test('a dependency cycle: `prdt schedule` computes critical_path as [] — CP segment omitted, statusline still renders', () => {
    linkPrdtCli()
    writeTicket('T-830', { deps: '["T-831"]' })
    writeTicket('T-831', { deps: '["T-830"]' })
    const chain = realCriticalPath()
    expect(chain).toEqual([])
    const out = runStatusline()
    expect(out).not.toMatch(/\bCP\b/)
    expect(out).toContain('build')
  })

  test('CP sits beside `waiting` in the footer, in that order', () => {
    linkPrdtCli()
    writeTicket('T-840')
    writeTicket('T-841', { type: 'decision' }) // → "waiting"
    const out = runStatusline().trim()
    const parts = out.split(' | ').map((p) => p.replace(/\x1b\]8;;file:\/\/[^\x1b]*\x1b\\(.*?)\x1b\]8;;\x1b\\/g, '$1'))
    const waitingIdx = parts.findIndex((p) => p.startsWith('waiting '))
    const cpIdx = parts.findIndex((p) => p.startsWith('CP '))
    expect(waitingIdx).toBeGreaterThanOrEqual(0)
    expect(cpIdx).toBe(waitingIdx + 1)
  })
})
