/**
 * Shared installed-machine fixture — T-536.
 *
 * WHY: dozens of whole-install.sh invocations spread across the install test
 * files, with no shared setup — every test case ran its own full install
 * (dozens of file copies + 11 hook registrations, ~1s cold, several seconds
 * under full-suite parallel contention). ~549s of real work packed into a
 * ~53s wall clock pushed the slowest cases over vitest's default 5s timeout,
 * with a different failing set every run. A file that only ASSERTS on an
 * installed machine now installs once and reuses it.
 *
 * WHAT THIS IS NOT (T-450): this module builds throwaway DIRECTORIES and the
 * env that points install.sh at them. The containment predicate — what counts
 * as the real home, and the run-fails-if-touched verdict — lives in
 * packages/gui/tests/isolation-rules.cjs + real-home-tripwire.cjs, reached via
 * vitest.config.ts. One copy on purpose; nothing here re-implements it, and a
 * future edit here must not grow one.
 *
 * Two lanes:
 *   installedMachine()  ONE default install per test FILE (vitest isolates
 *                       each test file in its own worker process, so module
 *                       scope is per-file), chmod'd a-w after installing — a
 *                       test that mutates it fails RIGHT THERE with
 *                       EACCES/EPERM instead of leaking the mutation into the
 *                       next test. install-fixture-contract.test.ts is the
 *                       test that fails if that enforcement is removed.
 *   freshInstall()      a private sandbox + its own real install.sh run(s),
 *                       for tests whose SUBJECT is the install run itself —
 *                       idempotency on re-run, seeded pre-state (foreign
 *                       hooks, legacy cleanup), flag behavior. Those must
 *                       never be pointed at the shared machine: a warm-state
 *                       assertion is not a fresh-install assertion.
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync } from 'child_process'

export const CORE_ROOT = path.resolve(__dirname, '..', '..')
export const INSTALL_SH = path.join(CORE_ROOT, 'scripts', 'install.sh')

export function hasJq(): boolean {
  try { execFileSync('jq', ['--version'], { stdio: 'ignore' }); return true } catch { return false }
}

export interface InstallSandbox {
  root: string
  home: string
  prdtHome: string
  claudeDir: string
  settingsPath: string
  env: NodeJS.ProcessEnv
}

/** HOME / PRDT_HOME / CLAUDE_DIR all inside one fresh tmpdir + a seeded
 *  settings.json — the sandbox shape every install test already used. */
export function makeSandbox(prefix = 'core-install-', seedSettings: unknown = {}): InstallSandbox {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  const home = path.join(root, 'home')
  const prdtHome = path.join(root, 'prdt')
  const claudeDir = path.join(root, 'claude')
  for (const d of [home, prdtHome, claudeDir]) fs.mkdirSync(d, { recursive: true })
  const settingsPath = path.join(claudeDir, 'settings.json')
  if (seedSettings !== undefined) fs.writeFileSync(settingsPath, JSON.stringify(seedSettings))
  return {
    root, home, prdtHome, claudeDir, settingsPath,
    env: { ...process.env, HOME: home, PRDT_HOME: prdtHome, CLAUDE_DIR: claudeDir },
  }
}

/** Run the REAL install.sh against the sandbox — never the developer's HOME. */
export function runInstall(sb: InstallSandbox, args: string[] = []): void {
  execFileSync('bash', [INSTALL_SH, ...args], { env: sb.env, stdio: 'ignore' })
}

export function settingsOf(sb: InstallSandbox): any {
  return JSON.parse(fs.readFileSync(sb.settingsPath, 'utf8'))
}

export interface InstalledMachine extends InstallSandbox { settings: any }

/** A private sandbox + its own install.sh run(s) — for tests about the run itself. */
export function freshInstall(
  opts: { seedSettings?: unknown; args?: string[]; times?: number } = {},
): InstalledMachine {
  const sb = makeSandbox('core-install-fresh-', opts.seedSettings ?? {})
  for (let i = 0; i < (opts.times ?? 1); i++) runInstall(sb, opts.args)
  return { ...sb, settings: settingsOf(sb) }
}

let golden: InstallSandbox | null = null

/** The one installed machine this test file shares. Default flags. READ-ONLY:
 *  every write bit is stripped after the install, so a mutating test fails at
 *  its own write site instead of poisoning the machine for the tests after it. */
export function installedMachine(): InstalledMachine {
  if (!golden) {
    const sb = makeSandbox('core-install-golden-')
    runInstall(sb)
    execFileSync('chmod', ['-R', 'a-w', sb.root])
    process.once('exit', () => {
      try {
        execFileSync('chmod', ['-R', 'u+w', sb.root])
        fs.rmSync(sb.root, { recursive: true, force: true })
      } catch { /* tmpdir cleanup is best-effort */ }
    })
    golden = sb
  }
  return { ...golden, settings: settingsOf(golden) }
}
