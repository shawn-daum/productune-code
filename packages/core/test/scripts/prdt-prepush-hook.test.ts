/**
 * prdt-prepush-hook.test.ts — the managed pre-push hook, T-481.
 *
 * contracts §Git says `main` direct push is blocked. Nothing installed the hook
 * that blocks it: core's TS `installPrePushHook` was a dead export (tests only),
 * so a teammate's fresh clone had ZERO protection and this repo's compliance came
 * from a hand-set org `core.hooksPath` — infrastructure outside the product. The
 * install now lives in the python CLI (`prdt init` + `prdt doctor`).
 *
 * Every case below is a REAL `git push` against a local bare remote, in a
 * sandbox HOME, so what is asserted is git's own behavior — not that a file
 * exists. The three that decide whether the contracts sentence is true:
 *   1. fresh clone → push to main SUCCEEDS, then `prdt doctor` → it is REFUSED,
 *      and the `ALLOW_MAIN_PUSH=1` hotfix path works on that same clone;
 *   2. a machine carrying a pre-T-465 managed hook (no escape) has the emergency
 *      path STUCK, and doctor's upgrade restores it;
 *   3. under any `core.hooksPath` we write nothing and doctor SAYS the block is
 *      inactive — the false-positive report is what T-481 was raised on.
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync, spawnSync } from 'child_process'
import { test, expect, describe, beforeEach, afterEach } from 'vitest'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const PRDT_CLI = path.join(CORE_ROOT, 'scripts', 'prdt')

function has(bin: string, args: string[]): boolean {
  try { execFileSync(bin, args, { stdio: 'ignore' }); return true } catch { return false }
}
const CAN_RUN = has('python3', ['--version']) && has('git', ['--version'])
/** A system-level core.hooksPath would make .git/hooks inert for the fixtures
 *  too — the very case §hooksPath asserts. Never observed; skip if present. */
const SYSTEM_HOOKSPATH = (() => {
  try { return execFileSync('git', ['config', '--system', '--get', 'core.hooksPath'], { encoding: 'utf8' }).trim() } catch { return '' }
})()

const MANAGED_MARKER = '# productune managed pre-push hook'
/** The pre-T-465 managed hook: same marker, no ALLOW_MAIN_PUSH escape. */
const STALE_MANAGED = `#!/bin/sh
${MANAGED_MARKER}
while read a b remote_ref d; do
  if [ "\${remote_ref#refs/heads/}" = "main" ]; then echo "blocked (stale hook)" >&2; exit 1; fi
done
exit 0
`
/** The NTF org hook (tracked, `core.hooksPath=.githooks`): not ours, but it
 *  refuses main AND honors the one documented escape. */
const ORG_HOOK = `#!/usr/bin/env bash
while read -r a b remote_ref d; do
  if [ "$remote_ref" = "refs/heads/main" ]; then
    if [ "\${ALLOW_MAIN_PUSH:-}" = "1" ]; then echo "org: permitted" >&2; else echo "org: BLOCKED" >&2; exit 1; fi
  fi
done
exit 0
`

let sandbox: string
let env: NodeJS.ProcessEnv
let remote: string
let projectRoot: string
let codeRoot: string

/** Sandbox HOME (no user gitconfig, no real ~/.prdt) + a bare remote + a project
 *  whose code root is a genuine `git clone` — i.e. carrying no hooks, exactly
 *  what a teammate has. */
function makeFixture(): void {
  sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-prepush-'))
  const home = path.join(sandbox, 'home')
  fs.mkdirSync(home, { recursive: true })
  fs.writeFileSync(path.join(home, '.gitconfig'),
    '[user]\n\tname = t\n\temail = t@t\n[init]\n\tdefaultBranch = main\n')
  env = {
    ...process.env,
    HOME: home,
    PRDT_HOME: path.join(home, '.prdt'),
    PRDT_DISCIPLINE: path.join(CORE_ROOT, 'discipline'),
    GIT_CONFIG_NOSYSTEM: '1',
  }
  remote = path.join(sandbox, 'origin.git')
  git(['init', '-q', '--bare', remote], sandbox)
  const seed = path.join(sandbox, 'seed')
  fs.mkdirSync(seed)
  git(['init', '-q', '-b', 'main'], seed)
  fs.writeFileSync(path.join(seed, 'a.txt'), 'hi\n')
  git(['add', '-A'], seed); git(['commit', '-qm', 'init'], seed)
  git(['push', '-q', remote, 'main'], seed)

  projectRoot = path.join(sandbox, 'proj')
  codeRoot = path.join(projectRoot, 'code')
  fs.mkdirSync(projectRoot)
  git(['clone', '-q', remote, codeRoot], sandbox)
  fs.mkdirSync(path.join(projectRoot, '.prdt'), { recursive: true })
  fs.writeFileSync(path.join(projectRoot, '.prdt', 'po-state.json'),
    JSON.stringify({ schema_version: 1, stage: 'build', version: 'v1.6', current_task: null }))
  fs.writeFileSync(path.join(projectRoot, '.prdt', 'config.json'),
    JSON.stringify({ slug: 'proj', code: { dir: 'code' } }))
  for (const d of ['docs/prd', 'docs/tickets', 'docs/wiki']) {
    fs.mkdirSync(path.join(projectRoot, d), { recursive: true })
  }
}

/** spawnSync, not execFileSync: the hook's own message goes to STDERR and is
 *  part of the evidence on both the blocked and the permitted path. */
function git(args: string[], cwd: string, extraEnv: NodeJS.ProcessEnv = {}): { code: number; out: string } {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...(env ?? process.env), ...extraEnv } })
  return { code: r.status ?? 1, out: `${r.stdout ?? ''}${r.stderr ?? ''}` }
}

/** One commit, then `git push <remote> main` — returns git's exit code. */
function pushMain(extraEnv: NodeJS.ProcessEnv = {}): { code: number; out: string } {
  fs.appendFileSync(path.join(codeRoot, 'a.txt'), 'x\n')
  git(['commit', '-qam', 'c'], codeRoot)
  return git(['push', remote, 'main'], codeRoot, extraEnv)
}

/** `prdt doctor` from the CODE root (a session's usual cwd). */
function doctor(): string {
  return execFileSync('python3', [PRDT_CLI, 'doctor'], { cwd: codeRoot, encoding: 'utf8', env, timeout: 60000 })
}

const hookFile = () => path.join(codeRoot, '.git', 'hooks', 'pre-push')

beforeEach(() => { if (CAN_RUN) makeFixture() })
afterEach(() => { if (sandbox) fs.rmSync(sandbox, { recursive: true, force: true }) })

describe.skipIf(!CAN_RUN || !!SYSTEM_HOOKSPATH)('managed pre-push hook (T-481)', () => {
  test('a fresh clone is UNPROTECTED, and `prdt doctor` is what makes the contracts claim true', () => {
    // the teammate's starting point: nothing configured, no hook on disk
    expect(git(['config', '--get', 'core.hooksPath'], codeRoot).code).not.toBe(0)
    expect(fs.existsSync(hookFile())).toBe(false)

    // before: the block contracts asserts does not exist
    expect(pushMain().code).toBe(0)

    const rep = doctor()
    expect(rep).toContain('main-push block installed at')
    expect(fs.readFileSync(hookFile(), 'utf8')).toContain(MANAGED_MARKER)
    expect(fs.statSync(hookFile()).mode & 0o111).toBeTruthy()

    // after: git itself refuses, with the product's message
    const blocked = pushMain()
    expect(blocked.code).not.toBe(0)
    expect(blocked.out).toContain('직접 보낼 수 없어요')

    // the emergency hotfix path works on that same clone, and says so
    const hotfix = pushMain({ ALLOW_MAIN_PUSH: '1' })
    expect(hotfix.code).toBe(0)
    expect(hotfix.out).toContain('ALLOW_MAIN_PUSH=1')
  })

  test('the escape is per-command env only — no file or config can pre-grant it', () => {
    doctor()
    // a project file and a repo-local config key both claiming the escape
    fs.writeFileSync(path.join(codeRoot, '.env'), 'ALLOW_MAIN_PUSH=1\n')
    git(['config', '--local', 'prdt.allowMainPush', '1'], codeRoot)
    expect(pushMain().code).not.toBe(0)
    // and only the exact value passes
    expect(pushMain({ ALLOW_MAIN_PUSH: 'yes' }).code).not.toBe(0)
  })

  test('`dev` residence pushes stay untouched', () => {
    doctor()
    git(['checkout', '-qb', 'dev'], codeRoot)
    fs.appendFileSync(path.join(codeRoot, 'a.txt'), 'z\n')
    git(['commit', '-qam', 'c'], codeRoot)
    expect(git(['push', remote, 'dev'], codeRoot).code).toBe(0)
  })

  test('doctor is idempotent — one repair, then silence and no rewrite', () => {
    expect(doctor()).toContain('main-push block installed at')
    const stamp = fs.statSync(hookFile()).mtimeMs
    const second = doctor()
    expect(second).not.toContain('main-push block')
    expect(second).not.toContain('pre-push')
    expect(fs.statSync(hookFile()).mtimeMs).toBe(stamp)
  })

  test('a pre-T-465 managed hook has the emergency path STUCK — doctor restores it', () => {
    fs.mkdirSync(path.dirname(hookFile()), { recursive: true })
    fs.writeFileSync(hookFile(), STALE_MANAGED, { mode: 0o755 })
    // the stale hook blocks main (good) but does not know the escape (the defect)
    expect(pushMain().code).not.toBe(0)
    expect(pushMain({ ALLOW_MAIN_PUSH: '1' }).code).not.toBe(0)

    expect(doctor()).toContain('ALLOW_MAIN_PUSH hotfix escape restored')

    expect(pushMain().code).not.toBe(0)
    expect(pushMain({ ALLOW_MAIN_PUSH: '1' }).code).toBe(0)
  })

  test('under a global core.hooksPath we write nothing and doctor names the gap', () => {
    const dotfiles = path.join(sandbox, 'home', 'dotfiles-hooks')
    fs.mkdirSync(dotfiles, { recursive: true })
    fs.appendFileSync(path.join(sandbox, 'home', '.gitconfig'), `[core]\n\thooksPath = ${dotfiles}\n`)

    const rep = doctor()
    expect(rep).toContain('main-push block INACTIVE')
    expect(rep).toContain(dotfiles)
    // no write into .git/hooks (git would ignore it) and none into the user's
    // own hooks dir (that would reach every repo on the machine)
    expect(fs.existsSync(hookFile())).toBe(false)
    expect(fs.readdirSync(dotfiles)).toEqual([])
    // git config untouched — still the user's setting
    expect(git(['config', '--get', 'core.hooksPath'], codeRoot).out.trim()).toBe(dotfiles)
    // and the report is honest: the push really does go through
    expect(pushMain().code).toBe(0)
  })

  test('a tracked org hook that blocks main is recognized, never overwritten', () => {
    const orgDir = path.join(codeRoot, '.githooks')
    fs.mkdirSync(orgDir, { recursive: true })
    fs.writeFileSync(path.join(orgDir, 'pre-push'), ORG_HOOK, { mode: 0o755 })
    git(['config', 'core.hooksPath', '.githooks'], codeRoot)

    const rep = doctor()
    expect(rep).not.toContain('pre-push')
    expect(fs.readFileSync(path.join(orgDir, 'pre-push'), 'utf8')).toBe(ORG_HOOK)
    expect(fs.existsSync(hookFile())).toBe(false)
    expect(pushMain().code).not.toBe(0)
    expect(pushMain({ ALLOW_MAIN_PUSH: '1' }).code).toBe(0)
  })

  test('an unmanaged pre-push we cannot show to block main is reported, not replaced', () => {
    fs.mkdirSync(path.dirname(hookFile()), { recursive: true })
    fs.writeFileSync(hookFile(), '#!/bin/sh\nexit 0\n', { mode: 0o755 })
    const rep = doctor()
    expect(rep).toContain('is not managed and does not honor ALLOW_MAIN_PUSH')
    expect(fs.readFileSync(hookFile(), 'utf8')).toBe('#!/bin/sh\nexit 0\n')
  })

  test('a cloned `exit 0` hook behind a tracked core.hooksPath is flagged, never trusted', () => {
    // The S4b case: core.hooksPath pointing at a TRACKED dir means whatever the
    // clone carried IS the hook — one `exit 0` and the block is gone. We cannot
    // overwrite it (it is the user's tracked content), so it must be reported.
    const orgDir = path.join(codeRoot, '.githooks')
    fs.mkdirSync(orgDir, { recursive: true })
    fs.writeFileSync(path.join(orgDir, 'pre-push'), '#!/bin/sh\nexit 0\n', { mode: 0o755 })
    git(['add', '-A'], codeRoot); git(['commit', '-qm', 'hooks'], codeRoot)
    git(['config', 'core.hooksPath', '.githooks'], codeRoot)

    const rep = doctor()
    expect(rep).toContain('is not managed and does not honor ALLOW_MAIN_PUSH')
    expect(rep).toContain(path.join(orgDir, 'pre-push'))
    expect(fs.existsSync(hookFile())).toBe(false)
    expect(fs.readFileSync(path.join(orgDir, 'pre-push'), 'utf8')).toBe('#!/bin/sh\nexit 0\n')
    expect(pushMain().code).toBe(0)   // genuinely unprotected — and doctor said so
  })

  test('`prdt init` installs the block at project creation', () => {
    const fresh = path.join(sandbox, 'fresh')
    fs.mkdirSync(fresh)
    const out = execFileSync('python3', [PRDT_CLI, 'init', '--yes', '--json'],
      { cwd: fresh, encoding: 'utf8', env, timeout: 60000 })
    const res = JSON.parse(out)
    expect(res.status).toBe('created')
    expect(res.prepush).toBe('installed')
    const hook = path.join(fresh, 'code', '.git', 'hooks', 'pre-push')
    expect(fs.readFileSync(hook, 'utf8')).toContain(MANAGED_MARKER)
  })
})
