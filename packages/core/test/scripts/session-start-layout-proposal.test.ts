/**
 * T-1105 — the PO session-start hook proposes the docs-layout migration while a
 * project is still on the pre-product layout; nothing is proposed in a migrated one.
 *
 * Copy: the approved screen set `layout-start` (define-screen-set.html — propose ·
 * none · half). State: the SHALLOW `layout_state` via `prdt layout check
 * --session-start` (filesystem only — no git process on the session-start path).
 * Real hook runs against a sandboxed PRDT_HOME carrying the repo's real discipline.
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync, spawnSync } from 'child_process'
import { test, expect, describe } from 'vitest'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const SESSION_HOOK = path.join(CORE_ROOT, 'scripts', 'hooks', 'prdt-session-start.sh')
const PRDT_CLI = path.join(CORE_ROOT, 'scripts', 'prdt')
const PART_BUDGET_BYTES = 8000
const ONBOARD_RESERVE_BYTES = 3600

function hasBin(bin: string, args: string[]): boolean {
  try { execFileSync(bin, args, { stdio: 'ignore' }); return true } catch { return false }
}
const READY = hasBin('jq', ['--version']) && hasBin('python3', ['--version'])

function realHome(): string {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t1105-home-'))
  fs.cpSync(path.join(CORE_ROOT, 'discipline'), path.join(home, 'discipline'), { recursive: true })
  fs.copyFileSync(path.join(CORE_ROOT, 'doctrine.md'), path.join(home, 'doctrine.md'))
  return home
}

/** A bare project: `.prdt/` marker + config, the named docs entries (file = `name:`-suffixed). */
function project(entries: string[], opts: { slug?: string } = {}): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t1105-proj-'))
  fs.mkdirSync(path.join(root, '.prdt'), { recursive: true })
  fs.writeFileSync(path.join(root, '.prdt', 'po-state.json'), '{"stage":"define","version":"v1.14"}\n')
  fs.writeFileSync(path.join(root, '.prdt', 'config.json'), JSON.stringify({ slug: opts.slug ?? 'proj' }) + '\n')
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true })
  for (const e of entries) {
    const p = path.join(root, 'docs', e)
    fs.mkdirSync(path.dirname(p), { recursive: true })
    fs.writeFileSync(p, `# ${e}\n`)
  }
  return root
}

function runHook(root: string, o: { event?: string; persona?: string; env?: Record<string, string>; home?: string } = {}): string {
  const out = execFileSync('bash', [SESSION_HOOK, '--part', '1'], {
    input: JSON.stringify({ hook_event_name: o.event ?? 'SessionStart', agent_type: `prdt-${o.persona ?? 'po'}`, cwd: root }),
    encoding: 'utf8',
    env: { ...process.env, PRDT_HOME: o.home ?? realHome(), PRDT_BIN: PRDT_CLI, PRDT_META_BACKUP: '0', PRDT_VIEWER_ENSURE: '0', ...o.env },
  })
  return out.trim() ? (JSON.parse(out).hookSpecificOutput.additionalContext as string) : ''
}

const OLD = ['tickets/v1/T-1.md', 'prd/PRD.md', 'wiki/a.md']

describe.skipIf(!READY)('layout proposal on PO session start', () => {
  test('old layout: the approved line, the file count, both folders, and the confirm rule', () => {
    const ctx = runHook(project(OLD))
    expect(ctx).toContain('[prdt layout: this project is on the pre-product docs layout]')
    expect(ctx).toContain('docs 폴더가 아직 예전 구조예요. 문서 3개가 제품 폴더 없이 `docs/` 바로 아래에 있어요.')
    expect(ctx).toContain('`docs/_shared` · `docs/proj` 두 폴더로 옮길 수 있어요. 옮길 목록부터 보여 드릴까요?')
    expect(ctx).toContain('"목록 보기"')
    expect(ctx).toContain('"이번 세션은 넘기기"')
    expect(ctx).toMatch(/`prdt layout migrate --apply` only on the user's confirm/)
    expect(ctx).toContain('Otherwise nothing this session.')
  })

  test('old layout: proposed again on every session start (no state file)', () => {
    const root = project(OLD)
    const home = realHome()
    expect(runHook(root, { home })).toContain('pre-product docs layout')
    expect(runHook(root, { home })).toContain('pre-product docs layout')
    expect(fs.readdirSync(path.join(root, '.prdt')).sort()).toEqual(['config.json', 'po-state.json'])
  })

  test('new layout: no line at all', () => {
    const ctx = runHook(project(['_shared/wiki/a.md', 'proj/tickets/v1/T-1.md']))
    expect(ctx).not.toContain('LAYOUT PROPOSAL')
    expect(ctx).not.toContain('docs layout')
  })

  test('nothing to move (docs without tickets/PRD): no line', () => {
    expect(runHook(project(['notes.txt']))).not.toContain('LAYOUT PROPOSAL')
  })

  test('half-moved: the approved half line, no migrate proposal', () => {
    const root = project(['_shared/wiki/a.md', 'tickets/v1/T-1.md', 'tickets/v1/T-2.md'])
    const ctx = runHook(root)
    expect(ctx).toContain("[prdt layout: this project's docs layout is half-moved]")
    expect(ctx).toContain('docs 폴더 일부만 새 구조로 옮겨졌어요. `docs/_shared/` 는 새 구조인데 `docs/tickets/` 는 예전 구조 그대로예요.')
    expect(ctx).toContain('이 상태에서는 옮기기를 제안하지 않아요. `prdt doctor` 로 남은 문서 2개를 확인하세요.')
    expect(ctx).toContain('Do NOT propose `prdt layout migrate`')
    expect(ctx).toContain('then run `prdt layout check` and show its ✗ line.')
    expect(ctx).not.toContain('목록 보기')
  })

  test('half-moved with a leftover FILE: no trailing slash on the name', () => {
    const ctx = runHook(project(['_shared/wiki/a.md', 'design.md']))
    expect(ctx).toContain('`docs/design.md` 는 예전 구조 그대로예요')
  })

  test('only the PO session start: a sub-agent start and other personas get nothing', () => {
    const root = project(OLD)
    expect(runHook(root, { event: 'SubagentStart', persona: 'po' })).not.toContain('LAYOUT PROPOSAL')
    for (const persona of ['developer', 'qa', 'designer']) {
      expect(runHook(root, { event: 'SessionStart', persona })).not.toContain('LAYOUT PROPOSAL')
    }
  })

  test('PRDT_LAYOUT_PROPOSAL=0 silences it', () => {
    expect(runHook(project(OLD), { env: { PRDT_LAYOUT_PROPOSAL: '0' } })).not.toContain('LAYOUT PROPOSAL')
  })

  test('a CLI that predates the flag (or is absent) leaves the session start silent, not broken', () => {
    const stub = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t1105-stub-')), 'prdt')
    fs.writeFileSync(stub, '#!/bin/sh\necho "usage: prdt" >&2\nexit 2\n', { mode: 0o755 })
    const ctx = runHook(project(OLD), { env: { PRDT_BIN: stub } })
    expect(ctx).toContain('prdt discipline')
    expect(ctx).not.toContain('LAYOUT PROPOSAL')
  })

  test('budget: part 1 stays within the part budget with the proposal, and beside the onboarding block', () => {
    const root = project(OLD)
    const home = realHome()
    const withBlock = runHook(root, { home })
    expect(Buffer.byteLength(withBlock)).toBeLessThanOrEqual(PART_BUDGET_BYTES)
    const block = withBlock.slice(withBlock.indexOf('----- BEGIN LAYOUT PROPOSAL'), withBlock.indexOf('----- END LAYOUT PROPOSAL'))
    expect(Buffer.byteLength(block)).toBeLessThan(ONBOARD_RESERVE_BYTES / 2)
    fs.writeFileSync(path.join(root, '.prdt', 'migration-briefing-pending'), '{"kind":"full","open_tickets":3}\n')
    const both = runHook(root, { home })
    expect(both).toContain('BEGIN MIGRATION ONBOARDING')
    expect(both).toContain('BEGIN LAYOUT PROPOSAL')
    expect(Buffer.byteLength(both)).toBeLessThanOrEqual(PART_BUDGET_BYTES)
  })

  test('a fat onboarding record leaves no room: the proposal is dropped whole, the budget holds', () => {
    const root = project(OLD)
    fs.writeFileSync(path.join(root, '.prdt', 'migration-briefing-pending'), JSON.stringify({ pad: 'x'.repeat(1500) }) + '\n')
    const ctx = runHook(root)
    expect(ctx).toContain('BEGIN MIGRATION ONBOARDING')
    expect(ctx).not.toContain('BEGIN LAYOUT PROPOSAL')
    expect(ctx).not.toContain('pre-product docs layout]')
    expect(Buffer.byteLength(ctx)).toBeLessThanOrEqual(PART_BUDGET_BYTES)
  })
})

describe('shallow path: no git on the session start', () => {
  test.skipIf(!READY)('an uncommitted-move shape that only meta git can see is not probed (none, silent)', () => {
    // docs/<product>/ present, old paths gone, meta git unusable: the deep probe degrades to silence.
    const root = project(['proj/tickets/v1/T-1.md'])
    fs.mkdirSync(path.join(root, '.prdt', 'meta.git'), { recursive: true })   // a poisoned git dir: any git call would error/hang
    expect(runHook(root)).not.toContain('LAYOUT PROPOSAL')
    const r = execFileSync('python3', [PRDT_CLI, 'layout', 'check', '--session-start'], {
      cwd: root, encoding: 'utf8', env: { ...process.env, PRDT_HOME: realHome() },
    })
    expect(r).toBe('')
  })

  test('the hook gate list mirrors LAYOUT_OWNED_TOPS in scripts/prdt', () => {
    const cli = fs.readFileSync(PRDT_CLI, 'utf8')
    const py = /LAYOUT_OWNED_TOPS = \(([^)]*)\)/.exec(cli)![1].match(/"([^"]+)"/g)!.map((s) => s.slice(1, -1))
    const hook = fs.readFileSync(SESSION_HOOK, 'utf8')
    const sh = /for LP_N in ([^;]+); do/.exec(hook)![1].trim().split(/\s+/)
    expect([...sh].sort()).toEqual([...py].sort())
  })
})

/** A real meta repo holding `files` committed, then the killed-`--apply` shape: the first
 *  rename done (tickets/ -> docs/<prod>/tickets/), the deletions uncommitted. */
function killedApply(): string {
  const root = project(['tickets/v1/T-1.md', 'tickets/v1/T-2.md'], { slug: 'proj' })
  const git = (...a: string[]) => execFileSync('git', ['--git-dir', path.join(root, '.prdt', 'meta.git'), '--work-tree', root, ...a],
    { cwd: root, stdio: 'pipe', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } })
  execFileSync('git', ['init', '-q', '--bare', path.join(root, '.prdt', 'meta.git')])
  git('add', 'docs', '.prdt/config.json')
  git('commit', '-q', '-m', 'meta')
  fs.mkdirSync(path.join(root, 'docs', 'proj'), { recursive: true })
  fs.renameSync(path.join(root, 'docs', 'tickets'), path.join(root, 'docs', 'proj', 'tickets'))
  return root
}

describe.skipIf(!READY || !hasBin('git', ['--version']))('killed --apply and in-flight dispatch (T-1105 QA)', () => {
  test('first-rename kill: the half block, never the migrate proposal — same verdict as `layout check`', () => {
    const root = killedApply()
    const ctx = runHook(root)
    expect(ctx).toContain("[prdt layout: this project's docs layout is half-moved]")
    expect(ctx).toContain('Do NOT propose `prdt layout migrate`')
    expect(ctx).not.toContain('목록 보기')
    expect(ctx).toContain('then run `prdt layout check`. Offer `prdt layout migrate --undo` only when its `다음:` line names it')
    expect(ctx).toContain('「docs 폴더 일부만 새 구조예요. 문서 2개가 아직 예전 구조예요. 이 상태에서는 옮기기를 제안하지 않아요.」')
    expect(ctx).not.toContain('prdt doctor')
    const chk = spawnSync('python3', [PRDT_CLI, 'layout', 'check', '--json'], {
      cwd: root, encoding: 'utf8', env: { ...process.env, PRDT_HOME: realHome() },
    })
    expect(JSON.parse(chk.stdout).state).toBe('partial')
  })

  function liveMarker(home: string, root: string, name: string): void {
    const dir = path.join(home, 'run', 'dispatches')
    fs.mkdirSync(dir, { recursive: true })
    const since = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
    fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify({ agent_id: name, persona: 'developer', since, project_root: root }))
  }

  test('a live dispatch in this project silences the old-layout proposal and the half block', () => {
    const home = realHome()
    const old = project(OLD)
    expect(runHook(old, { home })).toContain('pre-product docs layout')
    liveMarker(home, old, 'a1')
    expect(runHook(old, { home })).not.toContain('LAYOUT PROPOSAL')
    const half = project(['_shared/wiki/a.md', 'tickets/v1/T-1.md'])
    expect(runHook(half, { home })).toContain('half-moved')
    liveMarker(home, half, 'a2')
    expect(runHook(half, { home })).not.toContain('LAYOUT PROPOSAL')
  })

  test('a dispatch marker of ANOTHER project, or a stopped one, does not silence it', () => {
    const home = realHome()
    const old = project(OLD)
    liveMarker(home, project(OLD), 'other')
    expect(runHook(old, { home })).toContain('pre-product docs layout')
    const dir = path.join(home, 'run', 'dispatches')
    fs.writeFileSync(path.join(dir, 'done.json'), JSON.stringify({ agent_id: 'done', persona: 'developer', since: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'), stopped_at: 'x', project_root: old }))
    expect(runHook(old, { home })).toContain('pre-product docs layout')
  })

  test('plain old and new layouts stay git-free (poisoned meta.git changes nothing)', () => {
    const old = project(OLD)
    fs.mkdirSync(path.join(old, '.prdt', 'meta.git'), { recursive: true })
    expect(runHook(old)).toContain('pre-product docs layout')
  })
})

// ── T-1105 round 3: the in-progress marker — a killed --apply of ANY shape reads as half-moved ──
describe.skipIf(!READY || !hasBin('git', ['--version']))('killed --apply: the in-progress marker (T-1105 QA round 3)', () => {
  const HALF = "[prdt layout: this project's docs layout is half-moved]"
  const MARKER_REL = path.join('.prdt', 'layout-apply.inprogress')
  const marker = (root: string, count: number) =>
    fs.writeFileSync(path.join(root, MARKER_REL), JSON.stringify({ head: 'abc', count, pid: 1 }) + '\n')
  const poison = (root: string) => fs.mkdirSync(path.join(root, '.prdt', 'meta.git'), { recursive: true })  // any git call errors

  test('all moved, uncommitted (docs/_shared + docs/<prod>, nothing old left): the marker alone gives the half block — and no git runs', () => {
    const root = project(['_shared/wiki/a.md', 'proj/tickets/v1/T-1.md'])
    expect(runHook(root)).not.toContain('LAYOUT PROPOSAL')        // without the marker this is a finished new layout
    marker(root, 7)
    poison(root)
    const ctx = runHook(root)
    expect(ctx).toContain(HALF)
    expect(ctx).toContain('Do NOT propose `prdt layout migrate`')
    expect(ctx).toContain('「docs 폴더 일부만 새 구조예요. 문서 7개가 아직 예전 구조예요. 이 상태에서는 옮기기를 제안하지 않아요.」')
    expect(ctx).not.toContain('목록 보기')
  })

  test('first item moved was an EMPTY untracked folder (docs/<prod>/artifacts, no _shared): the half block, not the migrate proposal', () => {
    const root = project(['tickets/v1/T-1.md', 'prd/PRD.md'])
    fs.mkdirSync(path.join(root, 'docs', 'proj', 'artifacts'), { recursive: true })
    marker(root, 2)
    poison(root)
    const ctx = runHook(root)
    expect(ctx).toContain(HALF)
    expect(ctx).not.toContain('목록 보기')
    expect(ctx).not.toContain('pre-product docs layout')
  })

  test('plain old and new layouts stay git-free with the marker absent (poisoned meta.git changes nothing)', () => {
    const fresh = project(['_shared/wiki/a.md', 'proj/tickets/v1/T-1.md'])
    poison(fresh)
    expect(runHook(fresh)).not.toContain('LAYOUT PROPOSAL')
    const old = project(OLD)
    poison(old)
    expect(runHook(old)).toContain('pre-product docs layout')
  })

  test('a link planted at the marker path is read as the marker, never followed', () => {
    const root = project(['_shared/wiki/a.md', 'proj/tickets/v1/T-1.md'])
    const bait = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t1105-bait-')), 'x')
    fs.writeFileSync(bait, '{"count": 99}')
    fs.symlinkSync(bait, path.join(root, MARKER_REL))
    const ctx = runHook(root)
    expect(ctx).toContain(HALF)
    expect(ctx).toContain('문서 0개가')          // the link's target is not read
    expect(fs.readFileSync(bait, 'utf8')).toBe('{"count": 99}')
  })

  /** A bare `prdt init` project, then a real --apply killed by the given hook. */
  function killedFromBareInit(kill: string): string {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t1105-khome-'))
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t1105-bare-'))
    fs.mkdirSync(path.join(root, 'docs', 'prd'), { recursive: true })
    const env = { ...process.env, HOME: home, PRDT_HOME: path.join(home, '.prdt'), PRDT_LANG: 'en', NO_COLOR: '1' }
    execFileSync('python3', [PRDT_CLI, 'init', '--json', '--slug', 'proj', '--yes'], { cwd: root, env, stdio: 'pipe' })
    const loader = `
import importlib.machinery, importlib.util, sys, os, argparse
from pathlib import Path
l = importlib.machinery.SourceFileLoader("m", sys.argv[1]); s = importlib.util.spec_from_loader("m", l)
m = importlib.util.module_from_spec(s); l.exec_module(m)
os.chdir(sys.argv[2])
`
    const r = spawnSync('python3', ['-c', loader + kill + '\nm.cmd_layout(argparse.Namespace(action="migrate", apply=True, json=False))', PRDT_CLI, root], { encoding: 'utf8', env })
    expect(r.status).toBe(137)
    return root
  }

  test('real kill after the first rename (bare init: empty docs/artifacts/) → the hook shows the half block', () => {
    const root = killedFromBareInit(`
real = m._lay_rename
def fake(src, dst):
    real(src, dst)
    os._exit(137)
m._lay_rename = fake`)
    const ctx = runHook(root)
    expect(ctx).toContain(HALF)
    expect(ctx).toContain('Offer `prdt layout migrate --undo` only when its `다음:` line names it')
    expect(ctx).not.toContain('목록 보기')
    const chk = spawnSync('python3', [PRDT_CLI, 'layout', 'check'], { cwd: root, encoding: 'utf8', env: { ...process.env, PRDT_HOME: realHome() } })
    expect(chk.status).toBe(2)
    expect(chk.stdout).toContain('prdt layout migrate --undo')
  })

  test('real kill at the meta commit (bare init, everything moved) → the hook shows the half block', () => {
    const root = killedFromBareInit(`
real = m._lay_git
def fake(root, args, stdin=None):
    if args and args[0] == "commit":
        os._exit(137)
    return real(root, args, stdin)
m._lay_git = fake`)
    expect(fs.existsSync(path.join(root, 'docs', '_shared'))).toBe(true)
    const ctx = runHook(root)
    expect(ctx).toContain(HALF)
    expect(ctx).not.toContain('목록 보기')
  })
})
