/**
 * prdt doctor — hook mirror↔repo drift (T-532).
 *
 * `~/.claude/settings.json` registers commands under the MIRROR path
 * (`~/.prdt/hooks/<basename>`), never the repo path — so a hook fix
 * committed to `packages/core/scripts/hooks/` binds nothing on a real
 * machine until `install.sh` resyncs the mirror. T-507 added the same class
 * of check for the discipline tree (`discipline_mirror_drift_warnings`) and
 * the CLI script itself (`prdt_script_drift_warnings`); this covers the gap
 * neither named. Measured live (PO, 2026-08-31): two hook fixes landed on
 * `dev`, both mirrored hooks differed from the repo, doctor's 27 warnings
 * named none of it, and the defect one of the fixes had just repaired fired
 * again in the same session because the harness was still running the
 * stale mirror copy.
 *
 * Both mirror-vs-repo drift checks this ticket builds on
 * (`discipline_mirror_drift_warnings`, `prdt_script_drift_warnings`)
 * resolve their own repo-checkout path relative to `Path(__file__)` — the
 * running script's OWN location. So does `hook_mirror_drift_warnings`'s
 * `_hooks_repo_path()`. That makes the check untestable against a
 * synthetic repo unless the CLI script itself is copied to a location that
 * recreates the `packages/core/scripts/{prdt,hooks/}` shape — which is what
 * this file does: a throwaway git checkout under a temp dir, with the real
 * CLI copied in and hook files committed to ITS OWN git history, never the
 * real repo's.
 *
 * Positive control first (machine:fact--discipline-editing): a clean pass
 * proves nothing on its own, so every scenario below that expects silence
 * has a sibling scenario proving the same fixture-shape reports when
 * deliberately drifted.
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync } from 'child_process'
import { test, expect, describe, beforeEach, afterEach } from 'vitest'
import { freshInstall, hasJq } from '../helpers/install-fixture'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const REAL_PRDT_CLI = path.join(CORE_ROOT, 'scripts', 'prdt')

function which(bin: string): string | null {
  try { return execFileSync('which', [bin], { encoding: 'utf8' }).trim() || null } catch { return null }
}
const PYTHON3 = which('python3')
const GIT = which('git')

const GIT_ENV = {
  GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t.example',
  GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t.example',
}

let sandbox: string
let repoRoot: string       // throwaway git checkout, shaped like the real repo
let hooksRepoDir: string   // <repoRoot>/packages/core/scripts/hooks
let cliCopy: string        // <repoRoot>/packages/core/scripts/prdt — a copy of the REAL script
let machineHome: string    // PRDT_HOME (the mirror lives at <machineHome>/hooks)
let projectDir: string

function git(args: string[], cwd: string) {
  execFileSync('git', args, { cwd, encoding: 'utf-8', env: { ...process.env, ...GIT_ENV } })
}

function writeHook(basename: string, content: string) {
  fs.writeFileSync(path.join(hooksRepoDir, basename), content)
}

function commitRepo(message: string) {
  git(['add', '-A'], repoRoot)
  git(['commit', '-q', '-m', message], repoRoot)
}

function mirrorHook(basename: string, content: string) {
  fs.mkdirSync(path.join(machineHome, 'hooks'), { recursive: true })
  fs.writeFileSync(path.join(machineHome, 'hooks', basename), content)
}

/** Runs the COPIED cli (never the real one) so `Path(__file__)` inside it
 *  resolves to the throwaway checkout, not the real repo. */
function doctor(env: Record<string, string> = {}): string[] {
  const out = execFileSync('python3', [cliCopy, 'doctor'], {
    cwd: projectDir,
    env: { ...process.env, PRDT_HOME: machineHome, ...env },
    encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000,
  })
  return out.split('\n').filter((l) => l.includes('hooks: mirror'))
}

beforeEach(() => {
  sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-doctor-hook-drift-'))
  repoRoot = path.join(sandbox, 'repo')
  hooksRepoDir = path.join(repoRoot, 'packages', 'core', 'scripts', 'hooks')
  cliCopy = path.join(repoRoot, 'packages', 'core', 'scripts', 'prdt')
  fs.mkdirSync(hooksRepoDir, { recursive: true })
  fs.copyFileSync(REAL_PRDT_CLI, cliCopy)
  fs.chmodSync(cliCopy, 0o755)
  execFileSync('git', ['init', '-q'], { cwd: repoRoot })

  machineHome = path.join(sandbox, 'prdt-home')
  fs.mkdirSync(path.join(machineHome, 'wiki'), { recursive: true })
  projectDir = path.join(sandbox, 'proj')
  fs.mkdirSync(projectDir, { recursive: true })
})

afterEach(() => { fs.rmSync(sandbox, { recursive: true, force: true }) })

/** Common fixture: repo history carries an old (v1) and current (v2) body
 *  for one hook, a second hook with only one commit, and nothing else —
 *  then `prdt init` runs against the copied CLI so `doctor` has a project. */
function seedRepoHistory() {
  writeHook('prdt-hook-a.sh', '#!/usr/bin/env bash\necho v1\n')
  writeHook('prdt-hook-b.sh', '#!/usr/bin/env bash\necho b\n')
  commitRepo('v1')
  writeHook('prdt-hook-a.sh', '#!/usr/bin/env bash\necho v2\n')
  commitRepo('v2')
  execFileSync('python3', [cliCopy, 'init', '--json', '--slug', 'proj', '--yes'], {
    cwd: projectDir,
    env: { ...process.env, PRDT_HOME: machineHome },
    encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000,
  })
}

describe.skipIf(!PYTHON3 || !GIT)('prdt doctor — hook mirror↔repo drift (T-532)', () => {
  test('a fully synced mirror is silent (clean-pass baseline)', () => {
    seedRepoHistory()
    mirrorHook('prdt-hook-a.sh', '#!/usr/bin/env bash\necho v2\n')
    mirrorHook('prdt-hook-b.sh', '#!/usr/bin/env bash\necho b\n')
    expect(doctor()).toEqual([])
  })

  test('positive control: a stale (BEHIND) mirror copy fires, and reports BEHIND', () => {
    seedRepoHistory()
    // mirror still serves the v1 body — a real past commit of this same file
    mirrorHook('prdt-hook-a.sh', '#!/usr/bin/env bash\necho v1\n')
    mirrorHook('prdt-hook-b.sh', '#!/usr/bin/env bash\necho b\n')
    const out = doctor().join('\n')
    expect(out).toContain('BEHIND repo')
    expect(out).toContain('prdt-hook-a.sh')
    expect(out).not.toContain('AHEAD')
  })

  test('a hand-edited mirror body matching no commit is reported AHEAD, not BEHIND', () => {
    seedRepoHistory()
    mirrorHook('prdt-hook-a.sh', '#!/usr/bin/env bash\necho v2\n')
    mirrorHook('prdt-hook-b.sh', '#!/usr/bin/env bash\necho HAND-EDITED, never committed\n')
    const out = doctor().join('\n')
    expect(out).toContain('AHEAD OF / HAND-EDITED')
    expect(out).toContain('prdt-hook-b.sh')
    expect(out).not.toContain('BEHIND')
  })

  test('a hook added to the repo but never mirrored is reported (roster-as-a-set, not file-by-file)', () => {
    seedRepoHistory()
    // mirror carries hook-a only — hook-b exists in the repo, never mirrored at all
    mirrorHook('prdt-hook-a.sh', '#!/usr/bin/env bash\necho v2\n')
    const out = doctor().join('\n')
    expect(out).toContain('BEHIND repo')
    expect(out).toContain('prdt-hook-b.sh')
  })

  test('a stale hook left in the mirror after the repo drops it is reported (roster-as-a-set, not file-by-file)', () => {
    seedRepoHistory()
    mirrorHook('prdt-hook-a.sh', '#!/usr/bin/env bash\necho v2\n')
    mirrorHook('prdt-hook-b.sh', '#!/usr/bin/env bash\necho b\n')
    mirrorHook('prdt-removed-from-repo.sh', '#!/usr/bin/env bash\necho gone\n')
    const out = doctor().join('\n')
    expect(out).toContain('AHEAD OF / HAND-EDITED')
    expect(out).toContain('prdt-removed-from-repo.sh')
  })

  test('an untracked stray file in the repo tree (e.g. .DS_Store) is not reported as BEHIND (T-532 QA G2)', () => {
    seedRepoHistory()
    mirrorHook('prdt-hook-a.sh', '#!/usr/bin/env bash\necho v2\n')
    mirrorHook('prdt-hook-b.sh', '#!/usr/bin/env bash\necho b\n')
    // Never committed — a Finder/editor artifact merely sitting in the
    // checkout, present only in the repo tree the same way a real hook
    // added-but-not-yet-mirrored would be. Roster membership must tell
    // these apart by name shape (_hook_roster_files' prdt-*.sh filter), or
    // this reports BEHIND with wording claiming "these committed changes" —
    // false, it was never committed — and the repair it would name (re-run
    // install.sh) can never clear it, since install.sh only ever copies the
    // manifest's own basenames.
    fs.writeFileSync(path.join(hooksRepoDir, '.DS_Store'), 'finder junk, never git add-ed')
    expect(doctor()).toEqual([])
  })

  test('a stray file in the mirror only (editor swap file, .DS_Store) is not reported as AHEAD (T-532 QA G2)', () => {
    seedRepoHistory()
    mirrorHook('prdt-hook-a.sh', '#!/usr/bin/env bash\necho v2\n')
    mirrorHook('prdt-hook-b.sh', '#!/usr/bin/env bash\necho b\n')
    // Same finding, mirror side: real machines accumulate these on their own
    // (~/.prdt/hooks on the machine this ticket was measured on already
    // carries a Finder-recreated .DS_Store) — neither is a hand-edited hook.
    fs.writeFileSync(path.join(machineHome, 'hooks', '.prdt-hook-a.sh.swp'), 'vim swap junk')
    fs.writeFileSync(path.join(machineHome, 'hooks', '.DS_Store'), 'finder junk')
    expect(doctor()).toEqual([])
  })

  test('PRDT_DISCIPLINE set does NOT silence the hook check — settings.json hardcodes the mirror path regardless (T-532 QA G4, T-507 precedent does NOT hold here)', () => {
    seedRepoHistory()
    // Identical drift to the positive control above: PRDT_DISCIPLINE only
    // redirects discipline_root()'s own fallback choice, never where
    // ~/.claude/settings.json points its hook commands (install.sh §4
    // hardcodes $PRDT_HOME/hooks/<basename> at install time) — so a stale
    // mirrored hook keeps executing whether or not this var is set, and
    // inheriting T-507's silence here would hide exactly the drift this
    // check exists to catch.
    mirrorHook('prdt-hook-a.sh', '#!/usr/bin/env bash\necho v1\n')
    mirrorHook('prdt-hook-b.sh', '#!/usr/bin/env bash\necho b\n')
    const out = doctor({ PRDT_DISCIPLINE: path.join(sandbox, 'unused-discipline-dir') }).join('\n')
    expect(out).toContain('BEHIND repo')
    expect(out).toContain('prdt-hook-a.sh')
  })

  test('no install mirror on this machine (~/.prdt/hooks absent) → not doctor’s business', () => {
    seedRepoHistory()
    // never call mirrorHook() — machineHome/hooks stays absent. Reachability:
    // assert the precondition this early-out actually depends on, not just
    // the eventual silence (T-532 QA G1 pattern — a fixture that never
    // reaches the branch it means to test still passes on the wrong signal).
    expect(fs.existsSync(path.join(machineHome, 'hooks'))).toBe(false)
    expect(doctor()).toEqual([])
  })

  test('no source tree nearby (repo hooks dir absent) → silent', () => {
    // no seedRepoHistory(): hooksRepoDir stays empty, but more importantly
    // simulate "no repo nearby" by removing the repo checkout's hooks dir
    // and git history entirely, then run `prdt init` off the copied CLI.
    fs.rmSync(hooksRepoDir, { recursive: true, force: true })
    execFileSync('python3', [cliCopy, 'init', '--json', '--slug', 'proj', '--yes'], {
      cwd: projectDir,
      env: { ...process.env, PRDT_HOME: machineHome },
      encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000,
    })
    mirrorHook('prdt-hook-a.sh', '#!/usr/bin/env bash\necho anything\n')
    // Reachability: the branch this test means to exercise is `_hooks_repo_path()`
    // returning None because the directory genuinely doesn't exist, reached only
    // once the mirror-dir early-out is passed — assert both preconditions
    // explicitly (T-532 QA G1 pattern), not just the eventual silence.
    expect(fs.existsSync(hooksRepoDir)).toBe(false)
    expect(fs.existsSync(path.join(machineHome, 'hooks'))).toBe(true)
    expect(doctor()).toEqual([])
  })

  test('mirror-equals-repo path collapse (PRDT_HOME pointed at the repo checkout itself) → silent', () => {
    seedRepoHistory()
    // PRDT_HOME must resolve so its "hooks" child IS hooksRepoDir for this to
    // reach the collapse branch at all. packages/core/scripts, not
    // packages/core: `_hooks_repo_path()` computes `parent.parent/scripts/hooks`
    // from the copied CLI at packages/core/scripts/prdt, i.e. `parent.parent`
    // is packages/core — so PRDT_HOME=packages/core makes PRDT_HOME/hooks
    // resolve to packages/core/hooks, a directory that does not exist, not
    // packages/core/scripts/hooks. That fixture took the mirror-absent
    // early-out instead of this one and duplicated the "no install" test
    // above — a tripwire placed in the collapse branch never fired, and
    // deleting the early return changed nothing, because the fixture never
    // got there (T-532 QA G1). PRDT_HOME=packages/core/scripts is the
    // corrected fixture: its "hooks" child IS hooksRepoDir.
    const collapsedHome = path.join(repoRoot, 'packages', 'core', 'scripts')
    // Reachability, asserted directly rather than inferred from the outcome:
    // prove the fixture produces the exact collapse this test means to
    // exercise, independent of what doctor() then does with it.
    expect(path.join(collapsedHome, 'hooks')).toBe(hooksRepoDir)
    // This branch is behaviourally unobservable from outside even once
    // reached: repo.resolve() === mirror.resolve() means every subsequent
    // "differing" check compares a file's bytes against its own bytes, so
    // the result is silence whether or not the early return exists — QA
    // confirmed this two ways (a tripwire inside the branch never fires;
    // deleting the early return changes nothing). The assertion below is
    // therefore honest only as a reachability proof, not as a proof the
    // early return itself does anything — see the two notes above.
    expect(doctor({ PRDT_HOME: collapsedHome })).toEqual([])
  })
})

/** Adds the rest of what a REAL `install.sh` run needs beyond the hooks/
 *  history `seedRepoHistory()` already seeds — a copy of install.sh itself,
 *  a manifest naming exactly the two synthetic hooks, and the handful of
 *  other files §1/§3 touch. None of this is git-committed (install.sh
 *  doesn't care), so it never perturbs the git-history fixtures BEHIND/AHEAD
 *  verdicts read. `root` is the synthetic repo's `packages/core`. */
function addInstallScaffolding(root: string) {
  const scriptsDir = path.join(root, 'scripts')
  fs.copyFileSync(path.join(CORE_ROOT, 'scripts', 'install.sh'), path.join(scriptsDir, 'install.sh'))
  fs.chmodSync(path.join(scriptsDir, 'install.sh'), 0o755)
  fs.writeFileSync(path.join(scriptsDir, 'hook-manifest.json'), JSON.stringify({
    basenames: ['prdt-hook-a.sh', 'prdt-hook-b.sh'],
    registrations: [{ event: 'SessionStart', hooks: ['prdt-hook-a.sh', 'prdt-hook-b.sh'] }],
  }))
  fs.writeFileSync(path.join(scriptsDir, 'statusline-prdt.sh'), '#!/usr/bin/env bash\necho ok\n')
  fs.mkdirSync(path.join(root, 'discipline'), { recursive: true })
  fs.writeFileSync(path.join(root, 'doctrine.md'), 'test doctrine\n')
  fs.mkdirSync(path.join(root, 'agents'), { recursive: true })
  fs.writeFileSync(path.join(root, 'agents', 'prdt-x.md'), 'test agent\n')
}

/** Runs the extracted repair line for REAL — never a hand-written equivalent
 *  — against the synthetic repo's own copied install.sh, with HOME/PRDT_HOME/
 *  CLAUDE_DIR all pointed at a scratch sandbox (never the real machine). The
 *  bare `install.sh` word doctor's own text prints resolves via PATH here,
 *  exactly as a developer's shell would resolve it once cd'd next to the
 *  script. */
function runPrintedRepair(cmd: string) {
  const scriptsDir = path.join(repoRoot, 'packages', 'core', 'scripts')
  const installHome = path.join(sandbox, 'install-home')
  const installClaude = path.join(sandbox, 'install-claude')
  fs.mkdirSync(installHome, { recursive: true })
  fs.mkdirSync(installClaude, { recursive: true })
  execFileSync('bash', ['-c', cmd], {
    cwd: scriptsDir,
    env: { ...process.env, HOME: installHome, PRDT_HOME: machineHome, CLAUDE_DIR: installClaude,
           PATH: `${scriptsDir}:${process.env.PATH}` },
    stdio: 'ignore', timeout: 30000,
  })
}

describe.skipIf(!PYTHON3 || !GIT || !hasJq())('prdt doctor — hook mirror repair actually converges (T-532 QA H1/H2)', () => {
  test('BEHIND: the printed repair (re-run install.sh) actually clears it', () => {
    seedRepoHistory()
    addInstallScaffolding(path.join(repoRoot, 'packages', 'core'))
    mirrorHook('prdt-hook-a.sh', '#!/usr/bin/env bash\necho v1\n') // stale — matches the v1 commit
    mirrorHook('prdt-hook-b.sh', '#!/usr/bin/env bash\necho b\n')
    const before = doctor()
    expect(before.length).toBe(1)
    expect(before[0]).toContain('BEHIND repo')
    const match = before[0].match(/`([^`]+)`\s*$/)
    expect(match).not.toBeNull()
    runPrintedRepair(match![1])
    expect(doctor()).toEqual([])
  })

  test('AHEAD hand-edited (still shipped by the repo): the printed repair actually clears it', () => {
    seedRepoHistory()
    addInstallScaffolding(path.join(repoRoot, 'packages', 'core'))
    mirrorHook('prdt-hook-a.sh', '#!/usr/bin/env bash\necho v2\n')
    mirrorHook('prdt-hook-b.sh', '#!/usr/bin/env bash\necho HAND-EDITED, never committed\n')
    const before = doctor()
    expect(before.length).toBe(1)
    expect(before[0]).toContain('AHEAD OF / HAND-EDITED')
    const match = before[0].match(/`([^`]+)`\s*$/)
    expect(match).not.toBeNull()
    runPrintedRepair(match![1])
    expect(doctor()).toEqual([])
    expect(fs.readFileSync(path.join(machineHome, 'hooks', 'prdt-hook-b.sh'), 'utf8'))
      .toBe('#!/usr/bin/env bash\necho b\n')
  })

  test('AHEAD orphan + hand-edited together: the printed compound repair (rm ... && install.sh) actually clears both', () => {
    seedRepoHistory()
    addInstallScaffolding(path.join(repoRoot, 'packages', 'core'))
    mirrorHook('prdt-hook-a.sh', '#!/usr/bin/env bash\necho v2\n')
    mirrorHook('prdt-hook-b.sh', '#!/usr/bin/env bash\necho HAND-EDITED, never committed\n')
    mirrorHook('prdt-removed-from-repo.sh', '#!/usr/bin/env bash\necho gone\n')
    const before = doctor()
    expect(before.length).toBe(1)
    expect(before[0]).toContain('AHEAD OF / HAND-EDITED')
    expect(before[0]).toContain('prdt-removed-from-repo.sh')
    const match = before[0].match(/`([^`]+)`\s*$/)
    expect(match).not.toBeNull()
    expect(match![1]).toContain('&&') // compound: rm the orphan, then install.sh for the hand-edit
    runPrintedRepair(match![1])
    expect(doctor()).toEqual([])
    expect(fs.existsSync(path.join(machineHome, 'hooks', 'prdt-removed-from-repo.sh'))).toBe(false)
  })
})

describe.skipIf(!PYTHON3 || !hasJq())('prdt doctor — hook mirror AHEAD orphan repair, real repo (T-532 QA H1)', () => {
  // No synthetic repo needed here: `only_mirror` is unconditionally "ahead"
  // regardless of git history, so this drives the REAL install.sh against
  // the real repo (`freshInstall()`, HOME/PRDT_HOME/CLAUDE_DIR sandboxed —
  // never the developer's real mirror) — the closest thing to QA's own
  // "fully sandboxed install" repro.
  test('a hook-shaped file with no counterpart anywhere in the repo: the printed rm actually clears it, install.sh alone never would', () => {
    const sb = freshInstall()
    const orphan = 'prdt-t532-orphan-never-shipped.sh'
    fs.writeFileSync(path.join(sb.prdtHome, 'hooks', orphan), '#!/usr/bin/env bash\necho orphan\n')
    const projDir = path.join(sb.root, 'proj')
    fs.mkdirSync(projDir, { recursive: true })
    execFileSync('python3', [REAL_PRDT_CLI, 'init', '--json', '--slug', 'proj', '--yes'], {
      cwd: projDir, env: sb.env, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000,
    })
    const doctorLines = () => execFileSync('python3', [REAL_PRDT_CLI, 'doctor'], {
      cwd: projDir, env: sb.env, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000,
    }).split('\n').filter((l) => l.includes('hooks: mirror'))

    const before = doctorLines()
    expect(before.length).toBe(1)
    expect(before[0]).toContain('AHEAD')
    expect(before[0]).toContain(orphan)
    expect(before[0]).not.toContain('BEHIND')

    const match = before[0].match(/`([^`]+)`\s*$/)
    expect(match).not.toBeNull()
    expect(match![1]).not.toContain('install.sh') // rm-only: install.sh's copy loop could never clear this alone
    execFileSync('bash', ['-c', match![1]], { cwd: sb.root, env: sb.env, stdio: 'ignore', timeout: 30000 })

    expect(doctorLines()).toEqual([])
    expect(fs.existsSync(path.join(sb.prdtHome, 'hooks', orphan))).toBe(false)
  })
})
