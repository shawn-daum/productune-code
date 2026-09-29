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
  write('pnpm', 'echo "pnpm $*"')   // T-778: a no-op shim so `--frozen-lockfile` is verifiable without real pnpm
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

/** T-778: a real (bare, `core.worktree`-anchored) `.prdt/meta.git`, exactly the
 * shape `prdt init` leaves behind — `makeProject` itself stays meta-git-free
 * (most tests don't need one), so this is opt-in per test. */
function metaGit(root: string, ...args: string[]): string {
  const gd = path.join(root, '.prdt', 'meta.git')
  const r = spawnSync('git', ['--git-dir', gd, '--work-tree', root, ...args],
    { cwd: root, encoding: 'utf8', env: { ...env(), GIT_CONFIG_NOSYSTEM: '1' } })
  if (r.status !== 0) throw new Error(`meta git ${args.join(' ')}: ${r.stderr}`)
  return r.stdout.trim()
}

function initMetaGit(root: string) {
  const gd = path.join(root, '.prdt', 'meta.git')
  fs.mkdirSync(gd, { recursive: true })
  const r = spawnSync('git', ['init', '-q', '--bare', gd], { cwd: root, encoding: 'utf8', env: env() })
  if (r.status !== 0) throw new Error(`meta git init: ${r.stderr}`)
  metaGit(root, 'config', 'user.name', 'T')
  metaGit(root, 'config', 'user.email', 't@example.com')
  metaGit(root, 'config', 'commit.gpgsign', 'false')
  metaGit(root, 'config', 'core.worktree', root)
  fs.writeFileSync(path.join(root, 'meta-placeholder.txt'), 'x\n')
  metaGit(root, 'add', 'meta-placeholder.txt')
  metaGit(root, 'commit', '-q', '-m', 'chore: init meta')
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

  test('a pnpm lockfile installs with --frozen-lockfile (no track.setup override)', () => {
    commit(code, 'pnpm-lock.yaml', 'lockfileVersion: 9\n', 'chore: lock')
    setConfig({ track: { test: 'test -f a.txt' } })
    const r = cli('track', 'open', 'T-1')
    expect(r.status, r.err).toBe(0)
    expect(r.out).toContain('setup: pnpm install --frozen-lockfile')
  })

  // T-778: split project — meta root is `proj`, code root is `proj/code`, both
  // are their own git work tree (`.prdt/meta.git` for meta) — `tracks/` sits
  // under `proj` and must stay out of the META repo's own `git status` too,
  // not just the code repo's (the T-775 grill: it didn't, before this fix).
  test('split layout: tracks/ is kept out of the META repo\'s git status', () => {
    initMetaGit(proj)
    expect(cli('track', 'open', 'T-1').status).toBe(0)
    expect(metaGit(proj, 'status', '--porcelain')).not.toContain('tracks')
  })

  test('legacy layout: tracks/ is kept out of the META repo\'s git status too', () => {
    makeProject(false)
    initMetaGit(proj)
    expect(cli('track', 'open', 'T-1').status).toBe(0)
    expect(metaGit(proj, 'status', '--porcelain')).not.toContain('tracks')
    expect(git(code, 'status', '--porcelain')).not.toContain('tracks')
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

  // T-778 (T-775 grill): `--base main` — dev stays checked out in code/, so the
  // old `git branch -d` (which always checks the CURRENT checkout's HEAD, not
  // the land target) refused to delete track/T-2 forever, since track/T-2 was
  // never merged into dev. Land must check against `main` — the actual target
  // — instead.
  //
  // T-784: a main land now also takes the explicit `--base main` PO flag AT
  // LAND TIME (not just at open) — see the F1 test below for why.
  test('--base main at both open and land: main is fast-forwarded and the branch is deleted, dev checkout untouched', () => {
    cli('track', 'open', 'T-2', '--base', 'main')
    commit(wt('T-2'), 'm.txt', 'main only\n', 'feat: m')
    const r = cli('track', 'land', 'T-2', '--base', 'main')
    expect(r.status, r.err).toBe(0)
    expect(r.out).toContain('main fast-forwarded')
    expect(r.out).toContain('branch track/T-2 deleted')
    expect(git(code, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('dev')    // main ref moved without touching the dev checkout
    expect(git(code, 'show', 'main:m.txt')).toBe('main only')
    expect(spawnSync('git', ['rev-parse', '--verify', '--quiet', 'refs/heads/track/T-2'], { cwd: code }).status).not.toBe(0)
  })

  // T-784 (F1, security pass, sandbox repro): the land target used to come
  // from `branch.<branch>.prdtbase`, a git config value written by `open`
  // into the CODE REPO'S SHARED config — a value any git command the worker
  // runs inside the track worktree can rewrite. A worker sets it to `main`;
  // a plain `prdt track land` (no PO flag) must still land `dev` and leave
  // `main` untouched — the land target is only ever an explicit `--base` on
  // THIS invocation, never that config.
  test('F1: a worker-set prdtbase=main does not redirect a plain land — dev lands, main is untouched', () => {
    const mainBefore = git(code, 'rev-parse', 'main')
    commit(wt(), 'c.txt', 'new\n', 'feat: c')
    git(wt(), 'config', 'branch.track/T-1.prdtbase', 'main')   // the worker's attack
    const r = cli('track', 'land', 'T-1')
    expect(r.status, r.err).toBe(0)
    expect(r.out).toContain('dev fast-forwarded')
    expect(r.out).not.toContain('main fast-forwarded')
    expect(fs.readFileSync(path.join(code, 'c.txt'), 'utf8')).toBe('new\n')
    expect(git(code, 'rev-parse', 'main')).toBe(mainBefore)
  })

  // T-833 (decision T-828 「D」): `open --base main` records the track's origin
  // in a PO-side record under $PRDT_HOME/run/tracks/ — outside the code repo,
  // outside its git config, outside the worktree. A bare land of such a track
  // is REFUSED (nothing merged, nothing moved) and names both flags; main
  // still moves only on an explicit `--base main` at land time (T-784).
  describe('T-833: a track cut from main refuses a bare land', () => {
    const recordDir = () => path.join(home, 'run', 'tracks')
    const recordFiles = (): string[] => {
      if (!fs.existsSync(recordDir())) return []
      return fs.readdirSync(recordDir()).flatMap(k => fs.readdirSync(path.join(recordDir(), k)).map(f => path.join(recordDir(), k, f)))
    }
    const recordOf = (t: string) => recordFiles().find(f => path.basename(f) === `${t}.json`)
    const refs = () => ({ dev: git(code, 'rev-parse', 'dev'), main: git(code, 'rev-parse', 'main') })
    const expectRefusal = (r: { out: string; err: string; status: number }) => {
      expect(r.status).not.toBe(0)
      expect(r.err).toContain('--base main')
      expect(r.err).toContain('--base dev')
      expect(r.out).not.toContain('fast-forwarded')
      expect(r.out).not.toContain('merged ')
    }

    beforeEach(() => {
      const o = cli('track', 'open', 'T-2', '--base', 'main')
      expect(o.status, o.err).toBe(0)
      commit(wt('T-2'), 'm.txt', 'main only\n', 'feat: m')
    })

    test('open --base main writes the record outside the code repo and its git config; open without it records dev', () => {
      const rec = recordOf('T-2')
      expect(rec).toBeDefined()
      expect(rec!.startsWith(home + path.sep)).toBe(true)
      expect(rec!.startsWith(proj + path.sep)).toBe(false)
      expect(JSON.parse(fs.readFileSync(rec!, 'utf8'))).toMatchObject({ ticket: 'T-2', branch: 'track/T-2', base: 'main' })
      expect(JSON.parse(fs.readFileSync(recordOf('T-1')!, 'utf8'))).toMatchObject({ ticket: 'T-1', base: 'dev' })
    })

    test('bare land: exits non-zero, merges nothing, names --base main and --base dev; the track stays open', () => {
      const before = refs()
      const tip = git(wt('T-2'), 'rev-parse', 'HEAD')
      const r = cli('track', 'land', 'T-2')
      expectRefusal(r)
      expect(r.err).toContain('cut from main')
      expect(refs()).toEqual(before)
      expect(git(wt('T-2'), 'rev-parse', 'HEAD')).toBe(tip)          // no merge commit on the track either
      expect(fs.existsSync(wt('T-2'))).toBe(true)
      expect(recordOf('T-2')).toBeDefined()
    })

    test('--base main lands to main (dev untouched) and removes the record', () => {
      const before = refs()
      const r = cli('track', 'land', 'T-2', '--base', 'main')
      expect(r.status, r.err).toBe(0)
      expect(git(code, 'show', 'main:m.txt')).toBe('main only')
      expect(git(code, 'rev-parse', 'dev')).toBe(before.dev)
      expect(recordOf('T-2')).toBeUndefined()
    })

    test('--base dev lands to dev (main untouched)', () => {
      const before = refs()
      const r = cli('track', 'land', 'T-2', '--base', 'dev')
      expect(r.status, r.err).toBe(0)
      expect(r.out).toContain('dev fast-forwarded')
      expect(git(code, 'show', 'dev:m.txt')).toBe('main only')
      expect(git(code, 'rev-parse', 'main')).toBe(before.main)
      expect(recordOf('T-2')).toBeUndefined()
    })

    test('F1 against the record: a worker-set prdtbase=dev/main in git config + a commit changes nothing — the record still governs, main untouched', () => {
      const before = refs()
      git(wt('T-2'), 'config', 'branch.track/T-2.prdtbase', 'dev')    // try to talk the tool out of the refusal
      commit(wt('T-2'), 'n.txt', 'x\n', 'feat: n')
      expectRefusal(cli('track', 'land', 'T-2'))
      git(wt('T-2'), 'config', 'branch.track/T-2.prdtbase', 'main')   // and the T-784 F1 attack on a dev track
      git(wt(), 'config', 'branch.track/T-1.prdtbase', 'main')
      commit(wt(), 'c.txt', 'new\n', 'feat: c')
      const r = cli('track', 'land', 'T-1')
      expect(r.status, r.err).toBe(0)
      expect(r.out).toContain('dev fast-forwarded')
      expect(git(code, 'rev-parse', 'main')).toBe(before.main)
      expectRefusal(cli('track', 'land', 'T-2'))
      expect(git(code, 'rev-parse', 'main')).toBe(before.main)
    })

    test('a corrupt or unreadable record fails closed: a bare land is refused, an explicit --base still works', () => {
      const rec = recordOf('T-2')!
      for (const body of ['{not json', '{"ticket":"T-2","branch":"track/T-2","base":"staging"}', '[]',
                          '{"ticket":"T-9","branch":"track/T-9","base":"dev"}']) {
        fs.writeFileSync(rec, body)
        const before = refs()
        const r = cli('track', 'land', 'T-2')
        expectRefusal(r)
        expect(refs()).toEqual(before)
      }
      fs.rmSync(rec)
      fs.symlinkSync(path.join(proj, 'nowhere.json'), rec)             // a symlinked record is not trusted either
      fs.writeFileSync(path.join(proj, 'nowhere.json'), JSON.stringify({ ticket: 'T-2', branch: 'track/T-2', base: 'dev' }))
      expectRefusal(cli('track', 'land', 'T-2'))
      const r = cli('track', 'land', 'T-2', '--base', 'main')
      expect(r.status, r.err).toBe(0)
      expect(git(code, 'show', 'main:m.txt')).toBe('main only')
    })

    test('a worker rewriting the record to dev cannot move main; deleting it falls back to the pre-T-833 dev default — main still untouched', () => {
      const before = refs()
      fs.writeFileSync(recordOf('T-2')!, JSON.stringify({ ticket: 'T-2', branch: 'track/T-2', base: 'dev' }))
      commit(wt(), 'c.txt', 'new\n', 'feat: c')
      fs.writeFileSync(recordOf('T-1')!, JSON.stringify({ ticket: 'T-1', branch: 'track/T-1', base: 'main' }))
      expectRefusal(cli('track', 'land', 'T-1'))                        // forging main only ever refuses
      expect(refs()).toEqual(before)
      fs.rmSync(recordOf('T-2')!)
      const r = cli('track', 'land', 'T-2')                            // no record = the pre-change behaviour: dev
      expect(r.status, r.err).toBe(0)
      expect(r.out).toContain('dev fast-forwarded')
      expect(git(code, 'rev-parse', 'main')).toBe(before.main)
    })

    test('--base given twice is refused before anything runs, whichever order', () => {
      const before = refs()
      for (const pair of [['main', 'dev'], ['dev', 'main'], ['main', 'main']]) {
        const r = cli('track', 'land', 'T-2', '--base', pair[0], '--base', pair[1])
        expect(r.status).toBe(2)
        expect(r.err).toContain('--base given more than once')
        expect(refs()).toEqual(before)
      }
      expect(cli('track', 'open', 'T-3', '--base', 'dev', '--base', 'main').status).toBe(2)
      expect(fs.existsSync(wt('T-3'))).toBe(false)
      expect(recordOf('T-3')).toBeUndefined()
    })

    test('unusual track names are refused and write no record', () => {
      for (const t of ['T-2\n', 'T-2/../T-1', '../T-2', 'T-2.json', 'T-2 ', 't-2', 'T-']) {
        const r = cli('track', 'open', t, '--base', 'main')
        expect(r.status).toBe(2)
        expect(r.err).toContain('T-NNN')
        expect(cli('track', 'land', t).status).toBe(2)
      }
      expect(recordFiles().map(f => path.basename(f)).sort()).toEqual(['T-1.json', 'T-2.json'])
    })

    test('drop removes the record', () => {
      expect(cli('track', 'drop', 'T-2', '--force').status).toBe(0)
      expect(recordOf('T-2')).toBeUndefined()
      expect(cli('track', 'drop', 'T-1').status).toBe(0)
      expect(recordOf('T-1')).toBeUndefined()
    })

    test('a track opened before T-833 (no record) lands to dev without a flag, as before', () => {
      fs.rmSync(recordOf('T-1')!)
      commit(wt(), 'c.txt', 'new\n', 'feat: c')
      const mainBefore = git(code, 'rev-parse', 'main')
      const r = cli('track', 'land', 'T-1')
      expect(r.status, r.err).toBe(0)
      expect(r.out).toContain('dev fast-forwarded')
      expect(git(code, 'rev-parse', 'main')).toBe(mainBefore)
    })
  })

  // T-778 (T-775 grill): a test command that leaves a stray file behind must
  // fail the land (rc != 0), not print "landed" — dev stays put and the track
  // keeps the merge so the worker can clean it up and land again.
  test('tests that leave an untracked file behind report failure instead of landing', () => {
    commit(wt(), 'c.txt', 'new\n', 'feat: c')
    const before = git(code, 'rev-parse', 'dev')
    const r = cli('track', 'land', 'T-1', '--test', 'echo leftover > stray.txt')
    expect(r.status).toBe(1)
    expect(r.err).toContain('tests left the merged tree dirty')
    expect(r.err).toContain('stray.txt')
    expect(r.out).not.toContain('landed')
    expect(git(code, 'rev-parse', 'dev')).toBe(before)
    expect(fs.existsSync(wt())).toBe(true)
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

  // T-813: `--test '<cmd> | tail'` used to end with tail's exit code, so a
  // failing test landed as a pass — the command now runs under pipefail.
  test('a failing test piped into tail still fails the land; a passing piped one lands', () => {
    commit(wt(), 'c.txt', 'new\n', 'feat: c')
    const before = git(code, 'rev-parse', 'dev')
    const red = cli('track', 'land', 'T-1', '--test', 'sh -c "echo boom; exit 3" | tail -n 5')
    expect(red.status).toBe(1)
    expect(red.err).toContain('tests failed on the merged tree — dev is unchanged')
    expect(git(code, 'rev-parse', 'dev')).toBe(before)
    expect(fs.existsSync(wt())).toBe(true)
    const green = cli('track', 'land', 'T-1', '--test', 'test -f c.txt && echo ok | tail -n 1')
    expect(green.status).toBe(0)
    expect(git(code, 'rev-parse', 'dev')).not.toBe(before)
  })

  // T-835 (T-822 「C」): exit 141 = a later pipeline stage closed the pipe. Still a
  // failed land, with one extra line saying why; other failures stay unchanged.
  test('exit 141 (`| head` cut the run short) fails the land with an extra line; other failures get none; a short pipe lands', () => {
    commit(wt(), 'c.txt', 'new\n', 'feat: c')
    const before = git(code, 'rev-parse', 'dev')
    const cut = cli('track', 'land', 'T-1', '--test', 'seq 1 200000 | head -n 1')
    expect(cut.status).toBe(1)
    expect(cut.err).toContain('tests failed on the merged tree — dev is unchanged')
    expect(cut.err).toContain('exit 141')
    expect(cut.err).toContain('| head')
    expect(cut.err).toContain('result is unknown')
    expect(cut.err).toContain('write the output to a file')
    expect(git(code, 'rev-parse', 'dev')).toBe(before)
    const plain = cli('track', 'land', 'T-1', '--test', 'false | tail -n 1')
    expect(plain.status).toBe(1)
    expect(plain.err).toContain('tests failed on the merged tree — dev is unchanged')
    expect(plain.err).not.toContain('exit 141')
    expect(plain.err).not.toContain('result is unknown')
    expect(git(code, 'rev-parse', 'dev')).toBe(before)
    expect(cli('track', 'land', 'T-1', '--test', 'seq 1 3 | head -n 5').status).toBe(0)
    expect(git(code, 'rev-parse', 'dev')).not.toBe(before)
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

describe('prdt track drop', () => {
  beforeEach(() => { makeProject(); cli('track', 'open', 'T-1') })

  test('a track with no unique commits is dropped without --force', () => {
    const r = cli('track', 'drop', 'T-1')
    expect(r.status, r.err).toBe(0)
    expect(r.out).toContain(`worktree ${wt()} removed`)
    expect(r.out).toContain('branch track/T-1 deleted')
    expect(fs.existsSync(wt())).toBe(false)
    expect(spawnSync('git', ['rev-parse', '--verify', '--quiet', 'refs/heads/track/T-1'], { cwd: code }).status).not.toBe(0)
  })

  // code review #2 (2026-09-29): worker output is uncommitted until the PO
  // commits it (review → PO commit → land) — a plain drop must not discard
  // it silently.
  test('a track with uncommitted changes is refused without --force, dropped with it', () => {
    fs.writeFileSync(path.join(wt(), 'wip.txt'), 'x\n')
    const r = cli('track', 'drop', 'T-1')
    expect(r.status).toBe(1)
    expect(r.err).toContain('has uncommitted changes')
    expect(fs.existsSync(wt())).toBe(true)
    const f = cli('track', 'drop', 'T-1', '--force')
    expect(f.status, f.err).toBe(0)
    expect(fs.existsSync(wt())).toBe(false)
  })

  test('a track with commits not on dev or main is refused without --force, dropped with it', () => {
    commit(wt(), 'c.txt', 'new\n', 'feat: c')
    const r = cli('track', 'drop', 'T-1')
    expect(r.status).toBe(1)
    expect(r.err).toContain('holds commits not on dev or main')
    expect(fs.existsSync(wt())).toBe(true)
    expect(spawnSync('git', ['rev-parse', '--verify', '--quiet', 'refs/heads/track/T-1'], { cwd: code }).status).toBe(0)
    const f = cli('track', 'drop', 'T-1', '--force')
    expect(f.status, f.err).toBe(0)
    expect(fs.existsSync(wt())).toBe(false)
    expect(spawnSync('git', ['rev-parse', '--verify', '--quiet', 'refs/heads/track/T-1'], { cwd: code }).status).not.toBe(0)
  })

  test('a track merged onto dev (e.g. after land elsewhere advanced dev to include it) drops clean', () => {
    commit(wt(), 'c.txt', 'new\n', 'feat: c')
    git(code, 'merge', '--no-ff', '--no-edit', 'track/T-1')
    const r = cli('track', 'drop', 'T-1')
    expect(r.status, r.err).toBe(0)
    expect(fs.existsSync(wt())).toBe(false)
  })

  test('an unopened track is refused', () => {
    const r = cli('track', 'drop', 'T-9')
    expect(r.status).toBe(1)
    expect(r.err).toContain('prdt track open T-9')
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
    agent_id: name, persona: 'developer', ticket_id: 'T-7', since, transcript: t, project_root: proj, model: 'default', pairing: 'confirmed', ...m,
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

describe('T-814: a QA dispatch that writes only meta documents occupies no checkout', () => {
  beforeEach(() => {
    makeProject()
    setConfig({ meta: { allowlist: ['.prdt', 'docs/tickets', 'docs/wiki'] } })
  })

  const files = (f: string[]) => ({ change_meta: { files: f, user_facing: false, risk_flags: [], stage: 'build' } })
  /** A live QA marker whose worker's own first prompt carries `c`. */
  function qaMarker(name: string, c: Record<string, unknown>, m: Record<string, unknown> = {}) {
    marker(name, { checkout: 'code', persona: 'qa', ...m })
    const t = path.join(home, 'transcripts', 'subagents', `agent-${name}.jsonl`)
    fs.writeFileSync(t, JSON.stringify({ type: 'user', message: { role: 'user', content: `[ctx] ${JSON.stringify(c)}\n\nGo.` } }) + '\n' + REAL_LAST + '\n')
  }

  test('meta-only QA alongside a live developer dispatch: both allowed, in either order', () => {
    const meta = ['docs/tickets/v1.11/T-775.md', path.join(proj, 'docs', 'wiki', 'inbox.md')]
    // a developer is live in the shared code checkout; the meta-only QA is admitted
    marker('dev1', { checkout: 'code' })
    expect(denied(gate(ctx(files(meta)), 'prdt-qa'))).toBeNull()
    // a meta-only QA is live; the developer is admitted (the v1.11 refusal)
    fs.rmSync(path.join(home, 'run'), { recursive: true })
    qaMarker('qa1', ctx({ dispatch_id: 'd-qa', ...files(meta) }))
    expect(denied(gate(ctx()))).toBeNull()
    // unconfirmed pairing: judged by the worker's own prompt all the same
    fs.rmSync(path.join(home, 'run'), { recursive: true })
    qaMarker('qa2', ctx({ dispatch_id: 'd-qa2', ...files(meta) }), { pairing: 'unconfirmed', dispatch_id: 'd-qa2' })
    expect(denied(gate(ctx()))).toBeNull()
    // a developer dispatch naming only meta paths is unaffected: still denied
    fs.rmSync(path.join(home, 'run'), { recursive: true })
    marker('dev1', { checkout: 'code' })
    expect(denied(gate(ctx(files(meta))))).toContain('the shared code checkout already has a live developer dispatch (T-7)')
  })

  test('a QA with any code path is still counted and denied', () => {
    const mixed = ['docs/tickets/v1.11/T-775.md', 'packages/core/scripts/hooks/prdt-dispatch-gate.sh']
    marker('dev1', { checkout: 'code' })
    expect(denied(gate(ctx(files(mixed)), 'prdt-qa'))).toContain('the shared code checkout already has a live developer dispatch')
    // `code/…` from the project root, and an absolute path under the code checkout, are code too
    expect(denied(gate(ctx(files(['code/docs/tickets/x.md'])), 'prdt-qa'))).not.toBeNull()
    expect(denied(gate(ctx(files([path.join(proj, 'code', 'a.txt')])), 'prdt-qa'))).not.toBeNull()
    // a path escaping the project, or outside it, is never meta
    expect(denied(gate(ctx(files(['docs/tickets/../../../etc/x'])), 'prdt-qa'))).not.toBeNull()
    expect(denied(gate(ctx(files(['/elsewhere/docs/tickets/x.md'])), 'prdt-qa'))).not.toBeNull()
    // and a live QA marker naming a code path still occupies the checkout
    fs.rmSync(path.join(home, 'run'), { recursive: true })
    qaMarker('qa1', ctx({ dispatch_id: 'd-qa', ...files(mixed) }))
    expect(denied(gate(ctx()))).toContain('already has a live qa dispatch')
  })

  test('a QA with empty files is still counted and denied', () => {
    marker('dev1', { checkout: 'code' })
    expect(denied(gate(ctx(files([])), 'prdt-qa'))).toContain('already has a live developer dispatch')
    fs.rmSync(path.join(home, 'run'), { recursive: true })
    qaMarker('qa1', ctx({ dispatch_id: 'd-qa', ...files([]) }))
    expect(denied(gate(ctx()))).toContain('already has a live qa dispatch')
    // no readable worker prompt yet: counted as before
    fs.rmSync(path.join(home, 'run'), { recursive: true })
    marker('qa2', { checkout: 'code', persona: 'qa' })
    expect(denied(gate(ctx()))).toContain('already has a live qa dispatch')
  })

  test('live QA markers whose transcript first line is JSON without text content still count (in-flight cap)', () => {
    for (let i = 0; i < 6; i++) {
      marker(`qs${i}`, { checkout: wt(`T-${i + 1}`), persona: 'qa' })
      const t = path.join(home, 'transcripts', 'subagents', `agent-qs${i}.jsonl`)
      fs.writeFileSync(t, '{"type":"summary"}\n' + REAL_LAST + '\n')
    }
    expect(denied(gate(ctx()))).toContain('in-flight dispatches 6 machine-wide')
  })

  test('a project that persists no meta allowlist exempts nothing', () => {
    setConfig({ meta: {} })
    marker('dev1', { checkout: 'code' })
    expect(denied(gate(ctx(files(['docs/tickets/v1.11/T-775.md'])), 'prdt-qa'))).not.toBeNull()
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

describe('T-780: no gate deny rests on a marker whose pairing is unconfirmed', () => {
  beforeEach(() => makeProject())

  /** The worker transcript's FIRST record is the worker's own prompt. */
  function workerPrompt(name: string, c: Record<string, unknown>) {
    const t = path.join(home, 'transcripts', 'subagents', `agent-${name}.jsonl`)
    fs.writeFileSync(t, JSON.stringify({ type: 'user', message: { role: 'user', content: `[ctx] ${JSON.stringify(c)}\n\nGo.` } }) + '\n' + REAL_LAST + '\n')
  }

  test('unconfirmed with no readable worker prompt: its checkout never denies', () => {
    marker('ag1', { checkout: 'code', pairing: 'unconfirmed', dispatch_id: 'd-1' })
    marker('ag2', { checkout: 'code', dispatch_id: 'd-2', pairing: undefined })  // pre-T-780 marker: no pairing field
    expect(denied(gate(ctx()))).toBeNull()
  })

  test('unconfirmed, worker prompt carries the marker\'s own dispatch_id: the pairing is confirmed and denies as before', () => {
    marker('ag1', { checkout: wt('T-1'), pairing: 'unconfirmed', dispatch_id: 'd-1' })
    workerPrompt('ag1', ctx({ dispatch_id: 'd-1', worktree: wt('T-1') }))
    expect(denied(gate(ctx({ worktree: wt('T-1') })))).toContain('already has a live developer dispatch (T-7)')
  })

  test('mispaired (a sibling\'s call): the checkout comes from the worker\'s own prompt, never the marker; ticket unresolved', () => {
    // the marker claims the shared code checkout, but this worker was dispatched into tracks/T-2
    marker('ag1', { checkout: 'code', pairing: 'unconfirmed', dispatch_id: 'd-sibling' })
    workerPrompt('ag1', ctx({ dispatch_id: 'd-1', worktree: wt('T-2') }))
    expect(denied(gate(ctx()))).toBeNull()
    expect(denied(gate(ctx({ worktree: wt('T-2') })))).toContain('already has a live developer dispatch (ticket unresolved)')
  })

  test('end to end: a reversed fan-out start swaps the provisional markers; the gate judges each by its own worker, and the next event repairs the files', () => {
    const A = ctx({ slug: 'a', dispatch_id: 'd-T701-a', worktree: wt('T-1') })
    const B = ctx({ slug: 'b', dispatch_id: 'd-T702-b', worktree: wt('T-2') })
    const tp = path.join(proj, 'parent.jsonl')
    const call = (id: string, c: Record<string, unknown>, model: string) => JSON.stringify({ type: 'assistant', message: { content: [
      { type: 'tool_use', name: 'Agent', id, input: { subagent_type: 'prdt-developer', model, prompt: `[ctx] ${JSON.stringify(c)}\n\nGo.` } }] } })
    fs.writeFileSync(tp, call('tu-a', A, 'opus') + '\n' + call('tu-b', B, 'sonnet') + '\n')
    const post = (ev: Record<string, unknown>) => {
      const r = spawnSync('bash', [POST], { input: JSON.stringify({ session_id: 'sess-1', cwd: proj, transcript_path: tp, ...ev }), encoding: 'utf8', env: env(), timeout: subprocessTimeout('hook') })
      expect(r.status).toBe(0)
    }
    const dir = path.join(home, 'run', 'dispatches')
    const markers = () => Object.fromEntries(fs.readdirSync(dir).map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))).map((m) => [m.agent_id, m]))
    // agB runs call B but starts FIRST: FIFO hands it call A — the swap QA reproduced
    post({ hook_event_name: 'SubagentStart', agent_id: 'agB', agent_type: 'prdt-developer' })
    post({ hook_event_name: 'SubagentStart', agent_id: 'agA', agent_type: 'prdt-developer' })
    expect(markers().agB).toMatchObject({ checkout: wt('T-1'), pairing: 'unconfirmed' })
    // before the workers write anything, the swapped markers deny nothing
    expect(denied(gate(ctx({ worktree: wt('T-1') })))).toBeNull()
    expect(denied(gate(ctx({ worktree: wt('T-2') })))).toBeNull()
    // the workers start writing: each one's first record is its own prompt
    const sub = path.join(proj, 'sess-1', 'subagents')
    fs.mkdirSync(sub, { recursive: true })
    fs.writeFileSync(path.join(sub, 'agent-agA.jsonl'), JSON.stringify({ type: 'user', message: { role: 'user', content: `[ctx] ${JSON.stringify(A)}\n\nGo.` } }) + '\n')
    fs.writeFileSync(path.join(sub, 'agent-agB.jsonl'), JSON.stringify({ type: 'user', message: { role: 'user', content: `[ctx] ${JSON.stringify(B)}\n\nGo.` } }) + '\n')
    // the gate, still reading the swapped files, denies T-1 because of agA's OWN worker — not agB's marker
    expect(denied(gate(ctx({ worktree: wt('T-1') })))).toContain('(ticket unresolved)')
    // the next dispatch event repairs both files
    post({ hook_event_name: 'SubagentStart', agent_id: 'agD', agent_type: 'prdt-designer' })
    expect(markers().agA).toMatchObject({ dispatch_id: 'd-T701-a', checkout: wt('T-1'), tool_use_id: 'tu-a', model: 'opus', pairing: 'confirmed' })
    expect(markers().agB).toMatchObject({ dispatch_id: 'd-T702-b', checkout: wt('T-2'), tool_use_id: 'tu-b', model: 'sonnet', pairing: 'confirmed' })
    expect(denied(gate(ctx({ worktree: wt('T-2') })))).toContain('already has a live developer dispatch (T-702)')
  })
})
