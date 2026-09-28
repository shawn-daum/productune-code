/**
 * prdt-track.test.ts — T-775 (T-681 slice S4), black-box over the REAL CLI and
 * hooks: `prdt track open | review | land` and the dispatch gate's
 * one-live-developer/qa-dispatch-per-checkout rule.
 *
 * Design SoT: docs/artifacts/v1.11/critical-path.html, tab 「체크아웃 격리」.
 * contracts/git.md ③: cut from `dev` by `prdt track open` (branch
 * `track/<T-NNN>`) — never Agent isolation:"worktree", which fails where the
 * meta root is not a git work tree; adopt = PO local review → PO commit →
 * `prdt track land` (tests on the merged tree, dev fast-forwards, branch
 * deleted) — no remote PR, no push.
 *
 * Every repo is a sandbox under os.tmpdir(); HOME and PRDT_HOME point at
 * scratch dirs so neither the user's gitconfig nor the real ~/.prdt is read.
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { spawnSync } from 'child_process'
import { test, expect, describe, beforeEach } from 'vitest'
import { subprocessTimeout } from '../helpers/subprocess-timeout'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const PRDT_CLI = path.join(CORE_ROOT, 'scripts', 'prdt')
const GATE = path.join(CORE_ROOT, 'scripts', 'hooks', 'prdt-dispatch-gate.sh')
const POST = path.join(CORE_ROOT, 'scripts', 'hooks', 'prdt-post-dispatch.sh')

function tmp(prefix: string): string {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)))
}

// An under-every-cap machine for the gate (same shim as dispatch-gate-hook.test.ts).
const BIN = (() => {
  const bin = tmp('prdt-t775-bin-')
  const write = (name: string, body: string) => {
    fs.writeFileSync(path.join(bin, name), `#!/bin/sh\n${body}\n`)
    fs.chmodSync(path.join(bin, name), 0o755)
  }
  write('sysctl', [
    'for k in "$@"; do case "$k" in',
    "  vm.loadavg) echo '{ 1.00 1.00 1.00 }';;",
    "  hw.ncpu) echo '14';;",
    "  hw.memsize) echo '38654705664';;",
    'esac; done',
  ].join('\n'))
  write('memory_pressure', "echo 'System-wide memory free percentage: 60%'")
  write('ps', "echo '/sbin/launchd'")
  return bin
})()

let proj: string
let code: string
let home: string
let userHome: string

function env(): NodeJS.ProcessEnv {
  return { ...process.env, HOME: userHome, PATH: `${BIN}:${process.env.PATH}`, PRDT_HOME: home, PRDT_LANG: 'en', PRDT_META_BACKUP: '0', TZ: 'UTC' }
}

function git(cwd: string, ...args: string[]): string {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...env(), GIT_CONFIG_NOSYSTEM: '1' } })
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`)
  return r.stdout.trim()
}

function commit(cwd: string, file: string, body: string, msg: string) {
  fs.mkdirSync(path.dirname(path.join(cwd, file)), { recursive: true })
  fs.writeFileSync(path.join(cwd, file), body)
  git(cwd, 'add', file)
  git(cwd, 'commit', '-q', '-m', msg)
}

function cli(...args: string[]): { out: string; err: string; status: number } {
  const r = spawnSync('python3', [PRDT_CLI, ...args], { cwd: proj, encoding: 'utf8', env: env(), timeout: subprocessTimeout('cli') })
  return { out: r.stdout, err: r.stderr, status: r.status ?? 1 }
}

function setConfig(extra: Record<string, unknown>) {
  const p = path.join(proj, '.prdt', 'config.json')
  const cur = JSON.parse(fs.readFileSync(p, 'utf8'))
  fs.writeFileSync(p, JSON.stringify({ ...cur, ...extra }))
}

/** A split project: meta root is NOT a git work tree; the code repo is `code/` on `dev`. */
function makeProject(split = true) {
  proj = tmp('prdt-t775-proj-')
  home = tmp('prdt-t775-home-')
  userHome = tmp('prdt-t775-user-')
  fs.mkdirSync(path.join(proj, '.prdt'), { recursive: true })
  fs.writeFileSync(path.join(proj, '.prdt', 'po-state.json'),
    JSON.stringify({ schema_version: 1, stage: 'build', version: 'v1.11', current_task: null }))
  fs.writeFileSync(path.join(proj, '.prdt', 'config.json'), JSON.stringify(split ? { slug: 'x', code: { dir: 'code' } } : { slug: 'x' }))
  code = split ? path.join(proj, 'code') : proj
  fs.mkdirSync(code, { recursive: true })
  git(code, 'init', '-q', '-b', 'main')
  git(code, 'config', 'user.name', 'T'); git(code, 'config', 'user.email', 't@example.com'); git(code, 'config', 'commit.gpgsign', 'false')
  commit(code, '.gitignore', 'node_modules/\n' + (split ? '' : '.prdt/\n'), 'chore: init')
  commit(code, 'a.txt', 'one\ntwo\nthree\n', 'feat: a')
  git(code, 'checkout', '-q', '-b', 'dev')
  setConfig({ track: { setup: 'mkdir -p node_modules && touch node_modules/.setup-ran', test: 'test -f a.txt' } })
}

const wt = (t = 'T-1') => path.join(proj, 'tracks', t)

describe('prdt track open', () => {
  beforeEach(() => makeProject())

  test('cuts <meta root>/tracks/<T> on track/<T> from dev, runs the setup step — with a meta root that is not a git work tree', () => {
    expect(spawnSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd: proj, env: env() }).status).not.toBe(0)
    const r = cli('track', 'open', 'T-1')
    expect(r.status, r.err).toBe(0)
    expect(r.out).toContain(`track T-1 open: ${wt()}`)
    expect(r.out).toContain(`[ctx].worktree\` = ${wt()}`)
    expect(git(wt(), 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('track/T-1')
    expect(git(wt(), 'rev-parse', 'HEAD')).toBe(git(code, 'rev-parse', 'dev'))
    expect(fs.existsSync(path.join(wt(), 'node_modules', '.setup-ran'))).toBe(true)
  })

  test('--base main cuts from main', () => {
    commit(code, 'b.txt', 'dev only\n', 'feat: b')
    expect(cli('track', 'open', 'T-1', '--base', 'main').status).toBe(0)
    expect(git(wt(), 'rev-parse', 'HEAD')).toBe(git(code, 'rev-parse', 'main'))
  })

  test('a second open of the same ticket, a malformed id, and a failing setup step are refused', () => {
    expect(cli('track', 'open', 'T-1').status).toBe(0)
    const again = cli('track', 'open', 'T-1')
    expect(again.status).toBe(1)
    expect(again.err).toContain('already exists')
    expect(cli('track', 'open', 'bogus').status).toBe(2)
    setConfig({ track: { setup: 'exit 3' } })
    const bad = cli('track', 'open', 'T-2')
    expect(bad.status).toBe(1)
    expect(bad.err).toContain('the setup step failed')
  })

  test('no setup configured and no lockfile: the setup step is reported as none', () => {
    setConfig({ track: {} })
    const r = cli('track', 'open', 'T-1')
    expect(r.status).toBe(0)
    expect(r.out).toContain('setup: none')
  })

  test('legacy layout (code root == meta root): tracks/ is kept out of git status', () => {
    makeProject(false)
    expect(cli('track', 'open', 'T-1').status).toBe(0)
    expect(git(code, 'status', '--porcelain')).toBe('')
  })
})

describe('prdt track review', () => {
  beforeEach(() => { makeProject(); cli('track', 'open', 'T-1') })

  test('shows the diff (committed + uncommitted), a clean merge preview, and the out-of-scope files', () => {
    commit(wt(), 'c.txt', 'new\n', 'feat: c')
    fs.writeFileSync(path.join(wt(), 'd.txt'), 'wip\n')
    fs.writeFileSync(path.join(proj, '.prdt', 'schedule.jsonl'),
      JSON.stringify({ kind: 'dispatch', ticket: 'T-1', persona: 'developer', dispatch_id: 'd-1', tool_use_id: 'tu1', files: ['c.txt'], ts: '2026-09-28T00:00:00Z' }) + '\n'
      + JSON.stringify({ kind: 'stop', tool_use_id: 'tu1', outcome: 'returned' }) + '\n')
    const r = cli('track', 'review', 'T-1')
    expect(r.status, r.err).toBe(0)
    expect(r.out).toContain('1 commit(s) ahead')
    expect(r.out).toContain('A  c.txt')
    expect(r.out).toContain('?? d.txt  (uncommitted)')
    expect(r.out).toContain("outside the dispatch record's change_meta.files: d.txt")
    expect(r.out).toContain('(git merge-tree, committed work only): clean')
    expect(r.out).toContain('1 uncommitted file(s) are not in this preview')
    expect(r.out).toContain('developer d-1 → returned')
    expect(r.out).toContain('no qa dispatch recorded')
    expect(r.out).toContain('+new')
    expect(r.out).toContain('untracked: d.txt')
  })

  test('a conflicting dev change: the preview names the file and the overlap shows dev\'s hunk', () => {
    commit(wt(), 'a.txt', 'one\nTRACK\nthree\n', 'feat: track edit')
    commit(code, 'a.txt', 'one\nDEV\nthree\n', 'feat: dev edit')
    const r = cli('track', 'review', 'T-1')
    expect(r.status, r.err).toBe(0)
    expect(r.out).toContain('CONFLICT in a.txt')
    expect(r.out).toContain('this track also changed: a.txt')
    expect(r.out).toContain('+DEV')
  })

  test('a discipline file in the diff flags the DoD extra step', () => {
    commit(wt(), 'packages/core/discipline/contracts.md', 'x\n', 'docs: d')
    expect(cli('track', 'review', 'T-1').out).toContain('packages/core/discipline/contracts.md — the DoD annex')
  })

  test('an unopened track is refused', () => {
    const r = cli('track', 'review', 'T-9')
    expect(r.status).toBe(1)
    expect(r.err).toContain('prdt track open T-9')
  })
})

describe('prdt track land', () => {
  let remote: string
  beforeEach(() => {
    makeProject()
    remote = tmp('prdt-t775-remote-')
    git(remote, 'init', '-q', '--bare')
    git(code, 'remote', 'add', 'origin', remote)
    cli('track', 'open', 'T-1')
  })

  const remoteRefs = () => spawnSync('git', ['for-each-ref'], { cwd: remote, encoding: 'utf8' }).stdout

  test('green: dev (checked out in code/) takes dev\'s new commit + the track, worktree and branch are gone, nothing pushed', () => {
    commit(wt(), 'c.txt', 'new\n', 'feat: c (T-1)')
    commit(code, 'b.txt', 'dev moved\n', 'feat: b')
    const r = cli('track', 'land', 'T-1')
    expect(r.status, r.err).toBe(0)
    expect(r.out).toContain('merged dev')
    expect(r.out).toContain('dev fast-forwarded')
    expect(r.out).toContain('nothing pushed')
    expect(fs.readFileSync(path.join(code, 'c.txt'), 'utf8')).toBe('new\n')
    expect(fs.readFileSync(path.join(code, 'b.txt'), 'utf8')).toBe('dev moved\n')
    expect(fs.existsSync(wt())).toBe(false)
    expect(spawnSync('git', ['rev-parse', '--verify', '--quiet', 'refs/heads/track/T-1'], { cwd: code }).status).not.toBe(0)
    expect(remoteRefs()).toBe('')
  })

  test('green with dev not checked out anywhere: the ref is fast-forwarded in place', () => {
    git(code, 'checkout', '-q', 'main')
    commit(wt(), 'c.txt', 'new\n', 'feat: c')
    const tip = git(wt(), 'rev-parse', 'HEAD')
    const r = cli('track', 'land', 'T-1')
    expect(r.status, r.err).toBe(0)
    expect(git(code, 'rev-parse', 'dev')).toBe(tip)
    expect(git(code, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('main')
  })

  test('red tests on the merged tree: dev is unchanged and the track stays', () => {
    commit(wt(), 'c.txt', 'new\n', 'feat: c')
    const before = git(code, 'rev-parse', 'dev')
    const r = cli('track', 'land', 'T-1', '--test', 'exit 1')
    expect(r.status).toBe(1)
    expect(r.err).toContain('tests failed on the merged tree — dev is unchanged')
    expect(git(code, 'rev-parse', 'dev')).toBe(before)
    expect(fs.existsSync(wt())).toBe(true)
  })

  test('the tests run on the MERGED tree (dev\'s change is visible to them)', () => {
    commit(wt(), 'c.txt', 'new\n', 'feat: c')
    commit(code, 'b.txt', 'dev moved\n', 'feat: b')
    expect(cli('track', 'land', 'T-1', '--test', 'test -f b.txt && test -f c.txt').status).toBe(0)
  })

  test('a merge conflict stops before dev moves and names the file', () => {
    commit(wt(), 'a.txt', 'one\nTRACK\nthree\n', 'feat: track edit')
    commit(code, 'a.txt', 'one\nDEV\nthree\n', 'feat: dev edit')
    const before = git(code, 'rev-parse', 'dev')
    const r = cli('track', 'land', 'T-1')
    expect(r.status).toBe(1)
    expect(r.err).toContain('conflicts in: a.txt')
    expect(git(code, 'rev-parse', 'dev')).toBe(before)
    expect(git(wt(), 'status', '--porcelain')).toBe('')
  })

  test('an unclean worktree, a missing test command and a held land lock are refused', () => {
    fs.writeFileSync(path.join(wt(), 'wip.txt'), 'x\n')
    expect(cli('track', 'land', 'T-1').err).toContain('has uncommitted changes')
    fs.rmSync(path.join(wt(), 'wip.txt'))
    setConfig({ track: {} })
    expect(cli('track', 'land', 'T-1').err).toContain('no test command')
    const lock = path.join(code, '.git', 'prdt-track-land.lock')
    fs.writeFileSync(lock, `${process.pid}\n`)
    const r = cli('track', 'land', 'T-1', '--test', 'true')
    expect(r.status).toBe(1)
    expect(r.err).toContain('another `prdt track land` is running')
    fs.writeFileSync(lock, '999999\n')   // a dead owner: taken over
    expect(cli('track', 'land', 'T-1', '--test', 'true').status).toBe(0)
    expect(fs.existsSync(lock)).toBe(false)
  })
})

// ── the gate: one live developer/qa dispatch per checkout ────────────────────

const REAL_LAST = '{"type":"assistant","message":{"model":"claude-sonnet-5","role":"assistant","content":[{"type":"text","text":"Working."}]}}'

function marker(name: string, m: Record<string, unknown>) {
  const dir = path.join(home, 'run', 'dispatches')
  fs.mkdirSync(dir, { recursive: true })
  const tdir = path.join(home, 'transcripts', 'subagents')
  fs.mkdirSync(tdir, { recursive: true })
  const t = path.join(tdir, `agent-${name}.jsonl`)
  fs.writeFileSync(t, REAL_LAST + '\n')
  const since = new Date(Date.now() - 60_000).toISOString().replace(/\.\d{3}Z$/, 'Z')
  fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify({
    agent_id: name, persona: 'developer', ticket_id: 'T-7', since, transcript: t, project_root: proj, model: 'default', ...m,
  }))
}

function ctx(extra: Record<string, unknown> = {}) {
  return {
    slug: 's', goal: 'Build.', change_meta: { files: [], user_facing: false, risk_flags: [], stage: 'build' },
    acceptance: 'x', wiki_refs: [], user_lang: 'ko', prd_path: 'docs/prd/PRD.md#v1.11', dispatch_id: 'd-9', ...extra,
  }
}

function gate(c: Record<string, unknown>, subagentType = 'prdt-developer'): any {
  const ev = {
    session_id: 'sess-1', transcript_path: path.join(proj, 'parent.jsonl'), cwd: proj, hook_event_name: 'PreToolUse',
    tool_name: 'Agent', tool_input: { description: 'x', prompt: `[ctx] ${JSON.stringify(c)}\n\nGo.`, subagent_type: subagentType }, tool_use_id: 'tu-9',
  }
  const r = spawnSync('bash', [GATE], { input: JSON.stringify(ev), encoding: 'utf8', env: env(), timeout: subprocessTimeout('hook') })
  expect(r.stderr).toBe('')
  expect(r.status).toBe(0)
  return r.stdout.trim() === '' ? null : JSON.parse(r.stdout).hookSpecificOutput
}

const denied = (o: any) => o?.permissionDecision === 'deny' ? o.permissionDecisionReason as string : null

describe('dispatch gate: one live developer/qa dispatch per checkout', () => {
  beforeEach(() => makeProject())

  test('a second developer dispatch into the shared code checkout is denied, naming the live one and `prdt track open`', () => {
    marker('ag1', { checkout: 'code' })
    const d = denied(gate(ctx()))
    expect(d).toContain('the shared code checkout already has a live developer dispatch (T-7)')
    expect(d).toContain('`prdt track open <T-NNN>`')
    expect(d).toContain('Nothing was spawned')
    expect(denied(gate(ctx(), 'prdt-qa'))).not.toBeNull()
  })

  test('the same worktree (absolute, or trailing slash) is denied; `<project>/code` is the shared checkout', () => {
    marker('ag1', { checkout: wt('T-1'), persona: 'qa' })
    expect(denied(gate(ctx({ worktree: wt('T-1') + '/' })))).toContain("this dispatch's `[ctx].worktree` checkout already has a live qa dispatch")
    marker('ag2', { checkout: 'code' })
    expect(denied(gate(ctx({ worktree: path.join(proj, 'code') })))).toContain('the shared code checkout')
  })

  test('a different checkout, a stopped or legacy marker, another project, a designer dispatch, a designer marker: allowed', () => {
    marker('ag1', { checkout: 'code' })
    expect(denied(gate(ctx({ worktree: wt('T-2') })))).toBeNull()
    expect(denied(gate(ctx(), 'prdt-designer'))).toBeNull()
    fs.rmSync(path.join(home, 'run'), { recursive: true })
    marker('ag1', { checkout: 'code', stopped_at: '2026-09-28T00:00:00Z' })
    marker('ag2', {})                              // pre-T-775 marker: no checkout field
    marker('ag3', { checkout: 'code', project_root: '/elsewhere' })
    marker('ag4', { checkout: 'code', persona: 'designer' })
    expect(denied(gate(ctx()))).toBeNull()
  })
})

describe('post-dispatch: the marker records its checkout', () => {
  beforeEach(() => makeProject())

  function start(c: Record<string, unknown>, aid: string) {
    const tp = path.join(proj, `parent-${aid}.jsonl`)
    fs.writeFileSync(tp, JSON.stringify({ type: 'assistant', message: { content: [
      { type: 'tool_use', name: 'Agent', id: `tu-${aid}`, input: { subagent_type: 'prdt-developer', prompt: `[ctx] ${JSON.stringify(c)}\n\nGo.` } },
    ] } }) + '\n')
    const r = spawnSync('bash', [POST], { input: JSON.stringify({ session_id: 'sess-1', cwd: proj, hook_event_name: 'SubagentStart', agent_id: aid, agent_type: 'prdt-developer', transcript_path: tp }), encoding: 'utf8', env: env(), timeout: subprocessTimeout('hook') })
    expect(r.status).toBe(0)
    const dir = path.join(home, 'run', 'dispatches')
    return fs.readdirSync(dir).map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))).find((m) => m.agent_id === aid)
  }

  test('`[ctx].worktree` verbatim, "code" when absent', () => {
    expect(start(ctx({ worktree: wt('T-1') }), 'agA').checkout).toBe(wt('T-1'))
    expect(start(ctx(), 'agB').checkout).toBe('code')
  })
})
