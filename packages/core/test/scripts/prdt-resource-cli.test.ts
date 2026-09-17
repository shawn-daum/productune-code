/**
 * `prdt resource up|down|ls` (T-591) — the CLI the stop-what-you-started
 * rule names (qa/habit.md §Working rules, po/habit.md §Returns). Markers
 * live under `~/.prdt/run/resources/<name>/<dispatch>.json`. No subcommand
 * stops anything — that duty stays with the dispatch whose `down` empties a
 * resource's marker count; this CLI only records and counts.
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync } from 'child_process'
import { test, expect, describe, beforeEach, afterEach } from 'vitest'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const PRDT_CLI = path.join(CORE_ROOT, 'scripts', 'prdt')

function which(bin: string): string | null {
  try { return execFileSync('which', [bin], { encoding: 'utf8' }).trim() || null } catch { return null }
}
const PYTHON3 = which('python3')

let sandbox: string
let machineHome: string
let projectDir: string

function run(args: string[], env: Record<string, string> = {}): { out: string; code: number } {
  try {
    const out = execFileSync(PYTHON3 as string, [PRDT_CLI, ...args], {
      cwd: projectDir,
      env: { ...process.env, PRDT_HOME: machineHome, ...env },
      encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000,
    })
    return { out, code: 0 }
  } catch (e: any) {
    return { out: (e.stdout || '') + (e.stderr || ''), code: e.status ?? 1 }
  }
}

function markerPath(name: string, dispatch: string): string {
  return path.join(machineHome, 'run', 'resources', name, `${dispatch}.json`)
}

function _resourceHasAnyMarker(): boolean {
  const base = path.join(machineHome, 'run', 'resources')
  if (!fs.existsSync(base)) return false
  return fs.readdirSync(base).some((name) => {
    const dir = path.join(base, name)
    return fs.statSync(dir).isDirectory() && fs.readdirSync(dir).length > 0
  })
}

beforeEach(() => {
  sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-resource-cli-'))
  machineHome = path.join(sandbox, 'home')
  fs.mkdirSync(path.join(machineHome, 'hooks'), { recursive: true })
  projectDir = path.join(sandbox, 'proj')
  fs.mkdirSync(projectDir, { recursive: true })
  execFileSync(PYTHON3 as string, [PRDT_CLI, 'init', '--json', '--slug', 'proj', '--yes'], {
    cwd: projectDir,
    env: { ...process.env, PRDT_HOME: machineHome },
    encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000,
  })
})

afterEach(() => {
  fs.rmSync(sandbox, { recursive: true, force: true })
})

describe.skipIf(!PYTHON3)('prdt resource up|down|ls (T-591)', () => {
  test('never acts: the CLI section carries no stop/kill/shutdown/quit verb reaching a subprocess call, and `down` only unlinks its own marker file', () => {
    const src = fs.readFileSync(PRDT_CLI, 'utf-8')
    const start = src.indexOf('# ── resource ownership markers (T-591)')
    const end = src.indexOf('# ── resident machine resources')
    expect(start).toBeGreaterThan(0)
    expect(end).toBeGreaterThan(start)
    const section = src.slice(start, end)
    expect(section).not.toMatch(/subprocess\.(run|call|Popen|check_call|check_output)/)
    expect(section).not.toMatch(/\bos\.kill\b/)
    // The only filesystem removal in this section is `p.unlink()` — a marker
    // file, never a directory tree, never anything resembling a resource.
    const rmCalls = [...section.matchAll(/\.unlink\(/g)]
    expect(rmCalls.length).toBeGreaterThan(0)
    expect(section).not.toMatch(/shutil\.rmtree|shutdown|\bquit\b/i)
  })

  test('up writes a marker with resource · dispatch · project · since, and reports the held count', () => {
    const { out, code } = run(['resource', 'up', 'cua', '--dispatch', 'd1'])
    expect(code).toBe(0)
    expect(out).toContain('cua')
    expect(out).toContain('marker=d1')
    expect(out).toContain('project=proj')
    expect(out).toContain('held=1')
    const p = markerPath('cua', 'd1')
    expect(fs.existsSync(p)).toBe(true)
    const marker = JSON.parse(fs.readFileSync(p, 'utf-8'))
    expect(marker).toMatchObject({ resource: 'cua', dispatch: 'd1', project: 'proj' })
    expect(typeof marker.since).toBe('string')
  })

  test('up is idempotent for the same dispatch: re-running never doubles the held count', () => {
    run(['resource', 'up', 'cua', '--dispatch', 'd1'])
    const { out } = run(['resource', 'up', 'cua', '--dispatch', 'd1'])
    expect(out).toContain('held=1')
  })

  test('two dispatches marking the same resource both count, and neither down orphans the other (A boots, B joins, A leaves first — B stays marked, resource stays up per the count)', () => {
    run(['resource', 'up', 'cua', '--dispatch', 'A'])
    run(['resource', 'up', 'cua', '--dispatch', 'B'])
    const downA = run(['resource', 'down', 'cua', '--dispatch', 'A'])
    expect(downA.out).toContain('left: 1')
    expect(fs.existsSync(markerPath('cua', 'B'))).toBe(true)
    const downB = run(['resource', 'down', 'cua', '--dispatch', 'B'])
    expect(downB.out).toContain('left: 0')
  })

  test('down on a marker that is not there reports removed=false and never throws', () => {
    const { out, code } = run(['resource', 'down', 'cua', '--dispatch', 'ghost'])
    expect(code).toBe(0)
    expect(out).toContain('removed=false')
    expect(out).toContain('left: 0')
  })

  test('up with no --dispatch is refused, not defaulted to session identity (T-644): no marker is written, exit is non-zero, and the message names [ctx].dispatch_id', () => {
    const { out, code } = run(['resource', 'up', 'cua'], { CLAUDE_CODE_SESSION_ID: 'abc12345' })
    expect(code).not.toBe(0)
    expect(out).toMatch(/--dispatch/)
    expect(out).toMatch(/\[ctx\]\.dispatch_id/)
    expect(fs.existsSync(markerPath('cua', 'abc12345'))).toBe(false)
    expect(fs.existsSync(path.join(machineHome, 'run', 'resources', 'cua'))).toBe(false)
  })

  test('down with no --dispatch is refused, not defaulted to a "local" fallback (T-644): no session env, still a hard failure', () => {
    const cleanEnv: Record<string, string> = { CLAUDE_CODE_SESSION_ID: '' }
    const { out, code } = run(['resource', 'down', 'daum-mini-games'], cleanEnv)
    expect(code).not.toBe(0)
    expect(out).toMatch(/--dispatch/)
    expect(out).toMatch(/\[ctx\]\.dispatch_id/)
  })

  test('two parallel dispatches in one session no longer collide on a shared "local"/session marker: each must carry its own --dispatch', () => {
    // Before T-644 both of these bare calls resolved to the SAME marker file
    // (session id, or "local" with no session env) — the first `down` would
    // have stopped a resource the second dispatch still held. Now both are
    // refused outright: there is no shared default left to collide on.
    const a = run(['resource', 'up', 'cua'], { CLAUDE_CODE_SESSION_ID: 'shared-session' })
    const b = run(['resource', 'up', 'cua'], { CLAUDE_CODE_SESSION_ID: 'shared-session' })
    expect(a.code).not.toBe(0)
    expect(b.code).not.toBe(0)
    expect(_resourceHasAnyMarker()).toBe(false)
  })

  test('ls reports nothing when no markers exist, and groups multiple dispatches under one resource once they do', () => {
    const empty = run(['resource', 'ls'])
    expect(empty.out.trim()).toBe('no resource markers')
    run(['resource', 'up', 'cua', '--dispatch', 'A'])
    run(['resource', 'up', 'cua', '--dispatch', 'B'])
    const { out } = run(['resource', 'ls'])
    expect(out).toContain('cua: 2 held')
    expect(out).toContain('dispatch=A')
    expect(out).toContain('dispatch=B')
  })

  test('ls --json emits machine-readable records', () => {
    run(['resource', 'up', 'cua', '--dispatch', 'A'])
    const { out } = run(['resource', 'ls', '--json'])
    const rows = JSON.parse(out)
    expect(Array.isArray(rows)).toBe(true)
    expect(rows[0]).toMatchObject({ resource: 'cua', dispatch: 'A', project: 'proj' })
  })

  test('a resource name outside the machine-hostname-safe charset is refused, never written as a path', () => {
    const { out, code } = run(['resource', 'up', '../escape'])
    expect(code).not.toBe(0)
    expect(out).toMatch(/must match/)
    expect(fs.existsSync(path.join(machineHome, 'run', 'resources', '..'))).toBe(false)
  })

  test('the source carries no session-keyed or "local" default, and no comment claiming qa/habit.md skips --dispatch (T-644)', () => {
    const src = fs.readFileSync(PRDT_CLI, 'utf-8')
    expect(src).not.toMatch(/_resource_default_dispatch_id/)
    expect(src).not.toMatch(/qa\/habit\.md never passes/)
    expect(src).not.toMatch(/default is this session/)
  })

  test('top-level --help states --dispatch is required for up/down, not optional, and per-flag help matches contracts §Dispatch language', () => {
    const top = run(['--help']).out
    expect(top).toMatch(/up <name> --dispatch <id>/)
    expect(top).toMatch(/down <name>\s+--dispatch <id>/)
    expect(top).not.toMatch(/\[--dispatch <id>\]/)
    const flag = run(['resource', '--help']).out
    expect(flag).toMatch(/required, the PO's/)
    expect(flag).not.toMatch(/default is this session/)
  })

  test('a corrupt marker file on disk is skipped by ls, never crashes the read', () => {
    const dir = path.join(machineHome, 'run', 'resources', 'cua')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'broken.json'), '{not json')
    const { out, code } = run(['resource', 'ls'])
    expect(code).toBe(0)
    expect(out.trim()).toBe('no resource markers')
  })
})
