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
import crypto from 'crypto'
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

/** A hook that blocks NOTHING but carries both words the old substring verdict
 *  keyed on, in comments. This is the shape that made `prdt doctor` print clean
 *  while `git push origin main` succeeded (T-493 item 5). */
const PERMISSIVE_WITH_RIGHT_WORDS = `#!/bin/sh
# This repo protects main.
# Set ALLOW_MAIN_PUSH=1 for an emergency hotfix.
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
    // The claim is "doctor reports no FINDING about the hook", not "the string
    // pre-push never appears": the promotion check names the pre-push hook as
    // one of the two signals it read, and says so on doctor's report channel
    // (T-564's measurement, moved onto the verdict line by T-560). Filtering to
    // ⚠ lines states the claim as what it actually is — doctor has one severity
    // and findings are the ⚠ ones.
    const aboutTheHook = second
      .split('\n')
      .filter((l) => l.startsWith('⚠ ') && l.includes('pre-push'))
    expect(aboutTheHook).toEqual([])
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

  // T-493: a hook we did not write is reported UNVERIFIED whatever it contains.
  // The old verdict was `"ALLOW_MAIN_PUSH" in body and "main" in body`, so this
  // org hook passed as an effective block — and so did a permissive hook that
  // merely mentioned both words in a comment (the test right below). Ownership is
  // what prdt can verify; behavior would mean executing someone else's pre-push,
  // which a lint has no business doing. The honest cost is this line on a real
  // org-hook repo; the honest gain is the one below.
  test('a tracked org hook that really does block main is still reported unverified', () => {
    const orgDir = path.join(codeRoot, '.githooks')
    fs.mkdirSync(orgDir, { recursive: true })
    fs.writeFileSync(path.join(orgDir, 'pre-push'), ORG_HOOK, { mode: 0o755 })
    git(['config', 'core.hooksPath', '.githooks'], codeRoot)

    const rep = doctor()
    expect(rep).toContain('main-push block UNVERIFIED')
    expect(rep).toContain('verifies ownership only')
    // never claimed as effective, and never touched
    expect(rep).not.toMatch(/block installed|block is (active|effective)/)
    expect(fs.readFileSync(path.join(orgDir, 'pre-push'), 'utf8')).toBe(ORG_HOOK)
    expect(fs.existsSync(hookFile())).toBe(false)
    // ground truth, by different means than the verdict: a REAL push
    expect(pushMain().code).not.toBe(0)
    expect(pushMain({ ALLOW_MAIN_PUSH: '1' }).code).toBe(0)
  })

  // The exact failure T-493 item 5 names, and the reason the substring test had
  // to go: doctor said clean, `git push origin main` went through.
  test('a permissive hook naming main + ALLOW_MAIN_PUSH only in comments does not pass', () => {
    fs.mkdirSync(path.dirname(hookFile()), { recursive: true })
    fs.writeFileSync(hookFile(), PERMISSIVE_WITH_RIGHT_WORDS, { mode: 0o755 })

    const rep = doctor()
    expect(rep).toContain('main-push block UNVERIFIED')
    // the words are acknowledged as words, never as a block
    expect(rep).toContain('words in a file are not a block')
    // ground truth: the push really does succeed, so "clean" would have been a lie
    expect(pushMain().code).toBe(0)
    expect(fs.readFileSync(hookFile(), 'utf8')).toBe(PERMISSIVE_WITH_RIGHT_WORDS)
  })

  test('an unmanaged pre-push we cannot vouch for is reported, not replaced', () => {
    fs.mkdirSync(path.dirname(hookFile()), { recursive: true })
    fs.writeFileSync(hookFile(), '#!/bin/sh\nexit 0\n', { mode: 0o755 })
    const rep = doctor()
    expect(rep).toContain('main-push block UNVERIFIED')
    expect(rep).toContain('Nothing in it mentions')
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
    expect(rep).toContain('main-push block UNVERIFIED')
    expect(rep).toContain(path.join(orgDir, 'pre-push'))
    expect(fs.existsSync(hookFile())).toBe(false)
    expect(fs.readFileSync(path.join(orgDir, 'pre-push'), 'utf8')).toBe('#!/bin/sh\nexit 0\n')
    expect(pushMain().code).toBe(0)   // genuinely unprotected — and doctor said so
  })

  // T-581 QA P0, the pre-existing half: git runs a hook only if it is
  // EXECUTABLE — otherwise it prints a `hint:` line and pushes anyway. Nothing
  // in prdt looked at the mode, so `chmod -x` on our OWN managed hook produced
  // doctor output with ZERO lines about the block while `git push origin main`
  // returned 0. Total silence, on the one boundary doctor exists to report.
  test('the managed hook losing its exec bit is a real hole — doctor names it and restores it', () => {
    doctor()
    expect(pushMain().code).not.toBe(0)

    fs.chmodSync(hookFile(), 0o644)
    const bytes = fs.readFileSync(hookFile(), 'utf8')
    // ground truth first: the block is OFF, with every byte of the hook intact
    expect(pushMain().code).toBe(0)

    const rep = doctor()
    expect(rep).toMatch(/⚠ .*pre-push at .* exec bit/)
    expect(fs.readFileSync(hookFile(), 'utf8')).toBe(bytes)   // repaired by mode, not rewritten
    expect(fs.statSync(hookFile()).mode & 0o111).toBeTruthy()
    // ground truth again: git refuses once more
    expect(pushMain().code).not.toBe(0)
  }, 120_000)

  test('a non-executable managed hook we may NOT write is reported, never silently accepted', () => {
    // core.hooksPath puts the hook outside .git/hooks, so prdt cannot repair
    // the mode — but the block is off all the same, and that must be said.
    const orgDir = path.join(codeRoot, '.githooks')
    fs.mkdirSync(orgDir, { recursive: true })
    fs.writeFileSync(path.join(orgDir, 'pre-push'), STALE_MANAGED, { mode: 0o644 })
    git(['config', 'core.hooksPath', '.githooks'], codeRoot)

    const rep = doctor()
    expect(rep).toContain('main-push block INACTIVE')
    expect(rep).toContain('not executable')
    expect(fs.statSync(path.join(orgDir, 'pre-push')).mode & 0o111).toBeFalsy()   // not repaired
    expect(pushMain().code).toBe(0)   // and the report is true: main is open
  }, 120_000)

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

// ── T-581: a HUMAN's reading of a foreign hook, recorded ──────────────────────
//
// T-493 fixed the boundary: doctor verifies ownership and never executes a hook
// it did not write, so an org hook is UNVERIFIED however well it behaves. The
// cost was a standing warning that a person had already resolved by reading the
// hook. T-581 gives that reading a home — `prdt attest prepush` writes it to
// `.prdt/config.json git.prepush_reading`, pinned to the sha256 of the exact
// bytes read — and doctor honours it ONLY while those bytes are still the hook
// in force. What is pinned below, in order of how much it matters:
//   1. a changed hook makes the record inert and the warning comes BACK (a quiet
//      false warning is this project's named defect class, worse than the noise);
//   2. the verdict keeps "we verified" and "a person told us" apart — an
//      `attested` count and a `human record` line, never a bare clean;
//   3. doctor still never executes the hook, record or no record;
//   4. the record can carry a NEGATIVE reading, which is a violation, not a mute.
describe.skipIf(!CAN_RUN || !!SYSTEM_HOOKSPATH)('foreign pre-push — human reading record (T-581)', () => {
  let orgDir: string
  let tracePath: string

  /** The org hook again, but it leaves a footprint when EXECUTED — so "doctor
   *  ran the hook" would be observable as a file, not inferred from silence. */
  const tracedOrgHook = () => `#!/usr/bin/env bash
touch ${JSON.stringify(tracePath)}
${ORG_HOOK.replace(/^#!.*\n/, '')}`

  function installOrgHook(body: string): void {
    orgDir = path.join(codeRoot, '.githooks')
    fs.mkdirSync(orgDir, { recursive: true })
    fs.writeFileSync(path.join(orgDir, 'pre-push'), body, { mode: 0o755 })
    git(['config', 'core.hooksPath', '.githooks'], codeRoot)
  }

  function attest(args: string[]): { code: number; out: string } {
    const r = spawnSync('python3', [PRDT_CLI, 'attest', 'prepush', ...args],
      { cwd: codeRoot, encoding: 'utf8', env, timeout: 60000 })
    return { code: r.status ?? 1, out: `${r.stdout ?? ''}${r.stderr ?? ''}` }
  }

  const readConfig = () => JSON.parse(fs.readFileSync(path.join(projectRoot, '.prdt', 'config.json'), 'utf8'))

  /** A record for `body` that is valid in every way — what `prdt attest` would
   *  have written. Built by hand so a test can vary ONE field and pin that the
   *  check refuses for that reason and no other. */
  const record = (body: string) => ({
    sha256: crypto.createHash('sha256').update(body).digest('hex'),
    blocks_main: true,
    hotfix_escape: true,
    reason: 'read it: exits 1 on refs/heads/main unless ALLOW_MAIN_PUSH=1',
    recorded_at: new Date().toISOString().slice(0, 10),
  })

  /** The machine tail of the one verdict line — the contract tests read. */
  function tail(rep: string): { verdict: string; violations: number; skipped: number; attested: number } {
    const line = rep.split('\n').find((l) => /\[verdict=/.test(l))
    expect(line, `no verdict line in:\n${rep}`).toBeDefined()
    const num = (k: string) => {
      const m = line!.match(new RegExp(`\\b${k}=(\\d+)`))
      expect(m, `${k}= missing from verdict tail: ${line}`).not.toBeNull()
      return Number(m![1])
    }
    return { verdict: line!.match(/\bverdict=([a-z-]+)/)![1], violations: num('violations'),
             skipped: num('skipped'), attested: num('attested') }
  }

  beforeEach(() => { tracePath = path.join(sandbox, 'hook-was-executed') })

  test('a recorded reading of the exact hook in force replaces UNVERIFIED with a human-record line — and the verdict says so', () => {
    installOrgHook(tracedOrgHook())
    const before = doctor()
    expect(before).toContain('main-push block UNVERIFIED')
    // the skip points at the surface, never at a hand edit of config.json
    expect(before).toContain('prdt attest prepush')

    const r = attest(['--blocks-main', 'yes', '--hotfix-escape', 'yes',
      '--reason', 'read .githooks/pre-push: exits 1 on refs/heads/main unless ALLOW_MAIN_PUSH=1'])
    expect(r.code, r.out).toBe(0)
    const rec = readConfig().git.prepush_reading
    expect(rec.sha256).toMatch(/^[0-9a-f]{64}$/)
    expect(rec.blocks_main).toBe(true)
    expect(rec.hotfix_escape).toBe(true)
    // testimony carries its date (QA P5): the content pin catches a hook that
    // changed, never a reading that has simply gone old, so the reader is told
    // when a person looked and can weigh it.
    expect(rec.recorded_at).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    // other config survives the write (field-preserving, like init)
    expect(readConfig().code.dir).toBe('code')

    const rep = doctor()
    expect(rep).not.toContain('main-push block UNVERIFIED')
    expect(rep).toMatch(/human record · main-push block/)
    // "a person told us" is visible in BOTH the detail line and the tail
    expect(rep).toMatch(/not prdt's own inspection/)
    const t = tail(rep)
    expect(t.attested).toBe(1)
    expect(t.violations).toBe(0)
    // the record is not a `ran` warning either: no ⚠ line about the block
    expect(rep.split('\n').some((l) => l.startsWith('⚠') && /main-push/.test(l))).toBe(false)
    // doctor never executed the hook, before or after the record
    expect(fs.existsSync(tracePath)).toBe(false)
    // ground truth by other means: the block the person recorded is real
    expect(pushMain().code).not.toBe(0)
    expect(pushMain({ ALLOW_MAIN_PUSH: '1' }).code).toBe(0)
    expect(fs.existsSync(tracePath)).toBe(true)   // git DID run it — the trace works
  }, 120_000)

  test('the record goes inert the moment the hook changes — the warning comes back and names the stale record', () => {
    installOrgHook(tracedOrgHook())
    expect(attest(['--blocks-main', 'yes', '--hotfix-escape', 'yes', '--reason', 'read it']).code).toBe(0)
    expect(doctor()).not.toContain('main-push block UNVERIFIED')

    // the hook is edited AFTER the reading — into one that blocks nothing
    fs.writeFileSync(path.join(orgDir, 'pre-push'), '#!/bin/sh\nexit 0\n', { mode: 0o755 })
    const rep = doctor()
    expect(rep).toContain('main-push block UNVERIFIED')
    expect(rep).toMatch(/record .* (changed|different)/)
    const t = tail(rep)
    expect(t.attested).toBe(0)
    expect(t.skipped).toBeGreaterThanOrEqual(1)
    expect(t.verdict).not.toBe('clean')
    // the record is still in config (nothing deleted a person's note) but silences nothing
    expect(readConfig().git.prepush_reading.blocks_main).toBe(true)
    // ground truth: the edited hook lets main through — and doctor did NOT stay quiet
    expect(pushMain().code).toBe(0)
  }, 120_000)

  test('a negative reading is a violation, never a mute', () => {
    installOrgHook('#!/bin/sh\nexit 0\n')
    const r = attest(['--blocks-main', 'no', '--hotfix-escape', 'no', '--reason', 'exit 0 — blocks nothing'])
    expect(r.code, r.out).toBe(0)
    const rep = doctor()
    expect(rep).not.toContain('main-push block UNVERIFIED')
    expect(rep.split('\n').some((l) => l.startsWith('⚠') && /main-push block/.test(l) && /does not stop a push/.test(l))).toBe(true)
    const t = tail(rep)
    expect(t.verdict).toBe('violations')
    expect(t.attested).toBe(0)
  }, 120_000)

  test('a block without the hotfix escape is recorded as a block, and the stuck escape is a ⚠ finding', () => {
    installOrgHook('#!/bin/sh\nwhile read a b r d; do [ "$r" = refs/heads/main ] && exit 1; done\nexit 0\n')
    expect(attest(['--blocks-main', 'yes', '--hotfix-escape', 'no', '--reason', 'blocks main, no escape']).code).toBe(0)
    const rep = doctor()
    expect(rep).not.toContain('main-push block UNVERIFIED')
    expect(rep.split('\n').some((l) => l.startsWith('⚠') && /ALLOW_MAIN_PUSH/.test(l) && /human/.test(l))).toBe(true)
    expect(tail(rep).verdict).toBe('violations')
  }, 120_000)

  test('`prdt attest prepush` refuses where there is nothing foreign to read, and refuses an empty reason', () => {
    // managed hook: doctor installed it and verifies it itself
    doctor()
    expect(fs.readFileSync(hookFile(), 'utf8')).toContain(MANAGED_MARKER)
    const r1 = attest(['--blocks-main', 'yes', '--hotfix-escape', 'yes', '--reason', 'x'])
    expect(r1.code).not.toBe(0)
    expect(r1.out).toMatch(/nothing to attest/)
    expect(readConfig().git).toBeUndefined()

    // foreign hook, but no reason: a record without one buys no silence
    installOrgHook(ORG_HOOK)
    const r2 = attest(['--blocks-main', 'yes', '--hotfix-escape', 'yes', '--reason', '   '])
    expect(r2.code).not.toBe(0)
    expect(r2.out).toMatch(/reason/)
    expect(readConfig().git).toBeUndefined()
  }, 120_000)

  test('a hand-written record that cannot be honoured is reported, and UNVERIFIED stays', () => {
    installOrgHook(ORG_HOOK)
    const cfg = readConfig()
    cfg.git = { prepush_reading: { sha256: 'deadbeef', blocks_main: true } }   // no reason, bad sha
    fs.writeFileSync(path.join(projectRoot, '.prdt', 'config.json'), JSON.stringify(cfg, null, 2))
    const rep = doctor()
    expect(rep).toContain('main-push block UNVERIFIED')
    expect(rep).toContain('git.prepush_reading')
    expect(tail(rep).attested).toBe(0)

    // QA P6: a record carrying keys prdt does not read used to be honoured
    // whole — so a hand-written one could look scoped to a path, or look like
    // it expires, while nothing on this side ever looked at either key. A
    // record that misstates its own reach is the same false reassurance the
    // content pin exists to prevent, so unknown fields are refused.
    cfg.git = { prepush_reading: { ...record(ORG_HOOK), path: '.githooks/pre-push', expires: '2020-01-01' } }
    fs.writeFileSync(path.join(projectRoot, '.prdt', 'config.json'), JSON.stringify(cfg, null, 2))
    const rep2 = doctor()
    expect(rep2).toContain('main-push block UNVERIFIED')
    expect(rep2).toMatch(/path, expires|expires, path/)
    expect(tail(rep2).attested).toBe(0)
  }, 120_000)

  // ── T-581 QA round ─────────────────────────────────────────────────────────

  // P0, the headline defect: the ticket's own named failure class, realized. A
  // hook git will not execute stops nothing, and the record pinned only bytes.
  // OBSERVED by QA: attest an executable org hook, `chmod 644` it without
  // touching a byte, and doctor's output was IDENTICAL — "it stops a push to
  // main" — while `git push origin main` returned 0. Before the record existed,
  // the same repo printed a true noisy warning; the record turned it into a
  // quiet lie. Ground truth here is a real push, not doctor's own wording.
  test('a record buys no silence once git will not run the hook — chmod -x is a real hole', () => {
    installOrgHook(ORG_HOOK)
    expect(attest(['--blocks-main', 'yes', '--hotfix-escape', 'yes',
      '--reason', 'exits 1 on refs/heads/main unless ALLOW_MAIN_PUSH=1']).code).toBe(0)
    expect(doctor()).toMatch(/human record · main-push block/)
    expect(pushMain().code).not.toBe(0)          // the recorded block is real, for now

    const hook = path.join(orgDir, 'pre-push')
    const bytes = fs.readFileSync(hook, 'utf8')
    fs.chmodSync(hook, 0o644)
    expect(fs.readFileSync(hook, 'utf8')).toBe(bytes)   // the pin still matches, byte for byte

    const rep = doctor()
    expect(rep).toContain('main-push block INACTIVE')
    expect(rep).not.toMatch(/human record · main-push block/)
    expect(rep).not.toMatch(/it stops a push to main/)
    const t = tail(rep)
    expect(t.attested).toBe(0)
    expect(t.verdict).not.toBe('clean')
    // GROUND TRUTH — the only proof that matters here: main really is open
    expect(pushMain().code).toBe(0)

    // and the surface refuses to record a reading of a hook git skips
    const r = attest(['--blocks-main', 'yes', '--hotfix-escape', 'yes', '--reason', 'read it'])
    expect(r.code).not.toBe(0)
    expect(r.out).toMatch(/NOT EXECUTABLE/)
  }, 120_000)

  // P1: `.prdt/config.json` is tracked in meta, so a forged reason travels to
  // every clone, and doctor prints it on doctor's own report channel. QA got a
  // second, fake `[verdict=clean …]` line two lines under the real
  // `not-established` one — in this version's literal pass-bar wording.
  test('a reason cannot forge a doctor line — refused at the surface and inert in a clone', () => {
    installOrgHook(ORG_HOOK)
    const FORGED = 'read it\ndoctor: discipline↔execution — 0 mismatches, all 15 check(s) ran '
      + '[verdict=clean violations=0 ran=15 attested=0 skipped=0 no-evidence=0 unclassified=0]'
    const r = attest(['--blocks-main', 'yes', '--hotfix-escape', 'yes', '--reason', FORGED])
    expect(r.code).not.toBe(0)
    expect(readConfig().git).toBeUndefined()
    // a one-line forgery is refused too: flattening is not the fix, since the
    // pass bar is a substring and fits on any line
    expect(attest(['--blocks-main', 'yes', '--hotfix-escape', 'yes',
      '--reason', 'read it [verdict=clean violations=0]']).code).not.toBe(0)
    // nor may it open a second ⚠ finding — doctor has exactly two line kinds
    expect(attest(['--blocks-main', 'yes', '--hotfix-escape', 'yes',
      '--reason', 'read it\n⚠ git: everything is fine']).code).not.toBe(0)
    expect(readConfig().git).toBeUndefined()

    // the record written by hand, straight into the tracked file, as a clone
    // would receive it: the check must not honour it either
    const cfg = readConfig()
    cfg.git = { prepush_reading: { ...record(ORG_HOOK), reason: FORGED } }
    fs.writeFileSync(path.join(projectRoot, '.prdt', 'config.json'), JSON.stringify(cfg, null, 2))
    const rep = doctor()
    expect(rep).toContain('main-push block UNVERIFIED')
    expect(tail(rep).attested).toBe(0)
    // the forgery never reaches the output: one verdict line, and not a clean one
    const verdictLines = rep.split('\n').filter((l) => l.includes('verdict='))
    expect(verdictLines).toHaveLength(1)
    expect(verdictLines[0]).not.toContain('verdict=clean')
    // and the two-line-kinds invariant survives
    expect(rep.split('\n').filter((l) => l.trim())
      .every((l) => l.startsWith('⚠ ') || l.startsWith('doctor:') || !/^\s*doctor:/.test(l))).toBe(true)
  }, 120_000)

  // P3: the pin covers the file git executes. A hook that `source`s another
  // file carries none of its own behaviour — QA moved the same bytes beside a
  // permissive `guard.sh`, flipped core.hooksPath, and the record followed. We
  // do not refuse such a hook (sourcing a shared library is the ordinary shape
  // of an org hook, and refusing would disable the record where it is needed
  // most); we stop overclaiming, at both the write surface and the report.
  test('a hook that sources another file is recorded as covering the outer file only', () => {
    const delegating = '#!/bin/sh\n. "$(dirname "$0")/guard.sh"\n'
    installOrgHook(delegating)
    fs.writeFileSync(path.join(orgDir, 'guard.sh'), '#!/bin/sh\nexit 0\n', { mode: 0o755 })
    const r = attest(['--blocks-main', 'yes', '--hotfix-escape', 'yes', '--reason', 'guard.sh blocks main'])
    expect(r.code, r.out).toBe(0)
    expect(r.out).toMatch(/RUN ANOTHER FILE/)
    const rep = doctor()
    expect(rep).toMatch(/human record · main-push block/)
    expect(rep).toMatch(/covers this file only/)
  }, 120_000)

  // P7: a compiled pre-push is a legal hook. Decoding it as UTF-8 raised
  // straight out of `prepush_status`, which took `prdt doctor` down with exit 1
  // — a diagnostic dying on the repository it diagnoses.
  test('a non-UTF-8 hook is reported, not a crash', () => {
    orgDir = path.join(codeRoot, '.githooks')
    fs.mkdirSync(orgDir, { recursive: true })
    fs.writeFileSync(path.join(orgDir, 'pre-push'), Buffer.from([0xca, 0xfe, 0xba, 0xbe, 0x00, 0xff]), { mode: 0o755 })
    git(['config', 'core.hooksPath', '.githooks'], codeRoot)

    const d = spawnSync('python3', [PRDT_CLI, 'doctor'], { cwd: codeRoot, encoding: 'utf8', env, timeout: 60000 })
    expect(d.status, `${d.stdout}${d.stderr}`).toBe(0)
    expect(`${d.stdout}`).toContain('main-push block UNVERIFIED')
    expect(`${d.stdout}${d.stderr}`).not.toContain('Traceback')

    const a = attest(['--blocks-main', 'yes', '--hotfix-escape', 'yes', '--reason', 'read the disassembly'])
    expect(a.out).not.toContain('Traceback')
    expect(a.code).toBe(0)   // bytes are bytes: the pin is over bytes, not text
  }, 120_000)
})

// ── T-581 QA P2: the write must never cost the file it writes into ───────────
//
// `cmd_attest` rewrites `.prdt/config.json` whole, and it started from
// `read_json(...) or {}` — one answer for "absent" and for "unparseable" alike.
// OBSERVED: attest on a project whose config.json had one bad byte exited 0
// with a success message and left `{"git": {...}}` behind — slug, surfaces,
// meta.allowlist and features.non_features gone. Contracts require merge-style
// writes; absent is the only case that may start from nothing.
//
// A LEGACY (non-split) project, because that is where the loss was observed and
// where it bites: with a split layout a corrupt config.json also loses
// `code.dir`, so the code root resolves elsewhere and attest never gets as far
// as the write.
describe.skipIf(!CAN_RUN || !!SYSTEM_HOOKSPATH)('attest and a config.json it did not write (T-581 QA P2)', () => {
  let legacy: string
  const RICH = {
    slug: 'legacy', created_at: '2026-01-01T00:00:00Z',
    surfaces: { web: 'apps/web' }, meta: { allowlist: ['docs', '.prdt'] },
    features: { non_features: [{ name: 'x', reason: 'y' }] },
  }
  const cfgPath = () => path.join(legacy, '.prdt', 'config.json')
  const attestIn = (cwd: string) => spawnSync('python3',
    [PRDT_CLI, 'attest', 'prepush', '--blocks-main', 'yes', '--hotfix-escape', 'yes', '--reason', 'read it'],
    { cwd, encoding: 'utf8', env, timeout: 60000 })

  beforeEach(() => {
    legacy = path.join(sandbox, 'legacy')
    git(['clone', '-q', remote, legacy], sandbox)
    fs.mkdirSync(path.join(legacy, '.prdt'), { recursive: true })
    fs.writeFileSync(path.join(legacy, '.prdt', 'po-state.json'),
      JSON.stringify({ schema_version: 1, stage: 'build', version: 'v1.9', current_task: null }))
    const hooks = path.join(legacy, '.githooks')
    fs.mkdirSync(hooks, { recursive: true })
    fs.writeFileSync(path.join(hooks, 'pre-push'), ORG_HOOK, { mode: 0o755 })
    git(['config', 'core.hooksPath', '.githooks'], legacy)
  })

  test('every other field survives a recorded reading', () => {
    fs.writeFileSync(cfgPath(), JSON.stringify(RICH, null, 2))
    const r = attestIn(legacy)
    expect(r.status, `${r.stdout}${r.stderr}`).toBe(0)
    const after = JSON.parse(fs.readFileSync(cfgPath(), 'utf8'))
    expect(after.slug).toBe('legacy')
    expect(after.surfaces).toEqual(RICH.surfaces)
    expect(after.meta).toEqual(RICH.meta)
    expect(after.features).toEqual(RICH.features)
    expect(after.git.prepush_reading.sha256).toMatch(/^[0-9a-f]{64}$/)
    expect(after.git.prepush_reading.recorded_at).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  }, 120_000)

  test('an unparseable config.json is refused, not overwritten', () => {
    const broken = '{\n  "slug": "legacy",\n  "surfaces": {\n'   // truncated by an editor crash
    fs.writeFileSync(cfgPath(), broken)
    const r = attestIn(legacy)
    expect(r.status).not.toBe(0)
    expect(`${r.stdout}${r.stderr}`).toMatch(/refusing to write/)
    expect(fs.readFileSync(cfgPath(), 'utf8')).toBe(broken)   // byte for byte
  }, 120_000)

  test('a config.json that is not an object is refused too', () => {
    fs.writeFileSync(cfgPath(), '[1, 2, 3]')
    const r = attestIn(legacy)
    expect(r.status).not.toBe(0)
    expect(fs.readFileSync(cfgPath(), 'utf8')).toBe('[1, 2, 3]')
  }, 120_000)
})
