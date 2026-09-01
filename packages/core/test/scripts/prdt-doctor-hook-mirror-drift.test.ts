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

  test('PRDT_DISCIPLINE set silences the check even with real drift present (T-507 precedent held)', () => {
    seedRepoHistory()
    mirrorHook('prdt-hook-a.sh', '#!/usr/bin/env bash\necho v1\n') // stale, would otherwise fire
    mirrorHook('prdt-hook-b.sh', '#!/usr/bin/env bash\necho b\n')
    expect(doctor({ PRDT_DISCIPLINE: path.join(sandbox, 'unused-discipline-dir') })).toEqual([])
  })

  test('no install mirror on this machine (~/.prdt/hooks absent) → not doctor’s business', () => {
    seedRepoHistory()
    // never call mirrorHook() — machineHome/hooks stays absent
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
    expect(doctor()).toEqual([])
  })

  test('mirror-equals-repo path collapse (PRDT_HOME pointed at the repo checkout itself) → silent', () => {
    seedRepoHistory()
    // Point PRDT_HOME at packages/core itself, so PRDT_HOME/hooks IS hooksRepoDir —
    // the same path collapse discipline_mirror_drift_warnings/prdt_script_drift_warnings
    // both early-out on.
    const collapsedHome = path.join(repoRoot, 'packages', 'core')
    expect(doctor({ PRDT_HOME: collapsedHome })).toEqual([])
  })
})
