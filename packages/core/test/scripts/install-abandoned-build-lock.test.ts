/**
 * install.sh — the node-bridge build lock does not stay stuck forever (T-732).
 *
 * WHY: T-731 added a `dist/.build.lock` mkdir-mutex around the bridge build
 * (install.sh §1b) so several installs racing on the same repo never invoke
 * the compiler concurrently. QA (grilling T-731 on an isolated fixture) found
 * three ways that lock recreated the exact "bridge stays stale" symptom
 * T-731 exists to remove:
 *   1. an install SIGKILLed mid-build leaves the lock behind (its cleanup
 *      trap never runs for an untrappable signal) — every later install then
 *      waited the ~30s ceiling and skipped its rebuild, FOREVER, since
 *      nothing ever broke the lock;
 *   2. that ~30s "busy" message never named which lock it meant;
 *   3. an install SIGTERMed mid-build released the lock immediately (its
 *      cleanup trap ran) while the npm child it started — a SEPARATE
 *      process — kept building, unsupervised: a second install racing in
 *      right after could start a CONCURRENT build against the same dist/.
 * Plus a fourth, unrelated finding: with node_modules absent (a fresh
 * clone), the build fails and the failure line pointed at `npm run build`,
 * which fails for the identical reason — the real remedy is `npm install`.
 *
 * The fix (install.sh, this same commit): the lock's holder writes the
 * actual npm child's OWN pid into `<lock>/pid` the moment it starts that
 * child (backgrounded, not command-substituted, so the pid is knowable
 * WHILE it runs). A waiter — or the holder's own exit trap — judges the lock
 * by that pid's liveness: dead → abandoned, safe to break and rebuild; alive
 * → genuinely busy, named by path, never broken out from under it.
 *
 * Every test here runs the REAL install.sh against a throwaway fixture root
 * standing in for packages/core (its own copy of discipline/ + agents/ +
 * scripts/ + doctrine.md, per the same "no source tree" contract
 * install-fail-loud.test.ts / install-fixture-contract.test.ts already rely
 * on, plus a minimal package.json + src/bin/meta-cli.ts so §1b's build path
 * is actually reached) — never the developer's real HOME, PRDT_HOME or
 * CLAUDE_DIR, and never the shared real CORE_ROOT/dist the T-731 tests use.
 * A fake `npm` on PATH stands in for the compiler in three of the four
 * cases, so this file controls build TIMING deterministically (marker file
 * + a controllable sleep) instead of racing the real tsc/esbuild; the
 * node_modules-absent case runs the REAL npm, because that finding is
 * specifically about what real npm prints when it fails.
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync, spawn, spawnSync } from 'child_process'
import { test, expect, describe, afterEach, afterAll } from 'vitest'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

function hasJq(): boolean {
  try { execFileSync('jq', ['--version'], { stdio: 'ignore' }); return true } catch { return false }
}
function hasNpm(): boolean {
  try { execFileSync('npm', ['--version'], { stdio: 'ignore' }); return true } catch { return false }
}

// --- fixture root (packages/core stand-in, WITH a bridge to build) --------

let payloadTemplate: string | undefined
function payloadSrc(): string {
  if (payloadTemplate === undefined) {
    const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'core-install-lock-payload-')))
    for (const entry of ['discipline', 'agents', 'scripts', 'doctrine.md']) {
      execFileSync('cp', ['-R', path.join(CORE_ROOT, entry), path.join(dir, entry)])
    }
    // A minimal, real package.json whose `build` script fails deterministically
    // (and quickly — no globally-installed tsc needed) when node_modules is
    // absent, and which a fake `npm` on PATH simply never reads.
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
      name: 'bridge-fixture', private: true, version: '0.0.0',
      scripts: { build: 'node_modules/.bin/tsc -p tsconfig.json' },
    }))
    fs.mkdirSync(path.join(dir, 'src', 'bin'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'src', 'bin', 'meta-cli.ts'), '// fixture entry — content never read by these tests\n')
    payloadTemplate = dir
  }
  return payloadTemplate
}

let sandboxRoots: string[] = []
interface Sandbox { sb: string; root: string; home: string; prdtHome: string; claudeDir: string }
function makeSandbox(): Sandbox {
  const sb = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'core-install-lock-')))
  sandboxRoots.push(sb)
  const root = path.join(sb, 'root')
  fs.cpSync(payloadSrc(), root, { recursive: true })
  const home = path.join(sb, 'home')
  const prdtHome = path.join(sb, 'prdt')
  const claudeDir = path.join(sb, 'claude')
  for (const d of [home, prdtHome, claudeDir]) fs.mkdirSync(d, { recursive: true })
  return { sb, root, home, prdtHome, claudeDir }
}
function installEnv(sbx: Sandbox, extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return { ...process.env, HOME: sbx.home, PRDT_HOME: sbx.prdtHome, CLAUDE_DIR: sbx.claudeDir, ...extra }
}
function installSh(sbx: Sandbox): string {
  return path.join(sbx.root, 'scripts', 'install.sh')
}

afterEach(() => {
  for (const root of sandboxRoots) fs.rmSync(root, { recursive: true, force: true })
  sandboxRoots = []
})
afterAll(() => {
  if (payloadTemplate !== undefined) fs.rmSync(payloadTemplate, { recursive: true, force: true })
})

// --- fake npm: a controllable stand-in for the compiler --------------------
//
// Reads its behavior from env vars set per test (never regenerated per case):
//   FAKE_NPM_LOG    — append this invocation's pid, one per line
//   FAKE_NPM_MARKER — write this invocation's pid here the instant it starts
//   FAKE_NPM_SLEEP  — seconds to sleep before finishing (simulates "building")
//   FAKE_NPM_BRIDGE — on completion, create this file (simulates a built bridge)
//   FAKE_NPM_EXIT   — exit code (default 0)

let fakeNpmDir: string | undefined
function fakeNpmPathPrefix(): string {
  if (fakeNpmDir === undefined) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'core-install-lock-fakenpm-'))
    const script = [
      '#!/usr/bin/env bash',
      'set -u',
      '[ -z "${FAKE_NPM_LOG:-}" ] || printf \'%s\\n\' "$$" >> "$FAKE_NPM_LOG"',
      '[ -z "${FAKE_NPM_MARKER:-}" ] || printf \'%s\\n\' "$$" > "$FAKE_NPM_MARKER"',
      '[ -z "${FAKE_NPM_SLEEP:-}" ] || sleep "$FAKE_NPM_SLEEP"',
      'if [ -n "${FAKE_NPM_BRIDGE:-}" ]; then mkdir -p "$(dirname "$FAKE_NPM_BRIDGE")"; printf \'built\\n\' > "$FAKE_NPM_BRIDGE"; fi',
      'exit "${FAKE_NPM_EXIT:-0}"',
      '',
    ].join('\n')
    fs.writeFileSync(path.join(dir, 'npm'), script)
    fs.chmodSync(path.join(dir, 'npm'), 0o755)
    fakeNpmDir = dir
  }
  return fakeNpmDir
}
afterAll(() => {
  if (fakeNpmDir !== undefined) fs.rmSync(fakeNpmDir, { recursive: true, force: true })
})
function withFakeNpm(): string {
  return `${fakeNpmPathPrefix()}:${process.env.PATH ?? ''}`
}

/** SIGKILL a process and every descendant (bash install.sh → its backgrounded
 *  npm-run-build subshell → fake npm → its `sleep`), found by walking the
 *  host's `ps` parent links — same technique dispatch-gate-hook.test.ts uses
 *  for a real process tree, never `detached` (T-442 isolation rule). */
function killTree(rootPid: number): void {
  const ps = spawnSync('ps', ['-axo', 'pid=,ppid='], { encoding: 'utf8' }).stdout
  const kids = new Map<number, number[]>()
  for (const line of ps.split('\n')) {
    const m = /^\s*(\d+)\s+(\d+)\s*$/.exec(line)
    if (m) kids.set(Number(m[2]), [...(kids.get(Number(m[2])) ?? []), Number(m[1])])
  }
  const order: number[] = []
  const walk = (pid: number) => { for (const k of kids.get(pid) ?? []) walk(k); order.push(pid) }
  walk(rootPid)
  for (const pid of order) { try { process.kill(pid, 'SIGKILL') } catch { /* already gone */ } }
}

function isAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true } catch { return false }
}

describe.skipIf(!hasJq())('T-732: abandoned build lock', () => {
  test('a lock left by an install SIGKILLed mid-build is judged abandoned — a later install rebuilds, fast', async () => {
    const sbx = makeSandbox()
    const marker = path.join(sbx.sb, 'npm-started')
    const log = path.join(sbx.sb, 'npm-invocations.log')
    const lockPath = path.join(sbx.root, 'dist', '.build.lock')

    const child = spawn('bash', [installSh(sbx)], {
      env: installEnv(sbx, {
        PATH: withFakeNpm(), FAKE_NPM_MARKER: marker, FAKE_NPM_LOG: log, FAKE_NPM_SLEEP: '30',
      }),
      stdio: 'ignore',
    })
    const deadline = Date.now() + 15000
    while (!fs.existsSync(marker) && Date.now() < deadline) await sleep(20)
    expect(fs.existsSync(marker), 'fake npm never started — the build/lock path was not reached').toBe(true)
    expect(fs.existsSync(lockPath)).toBe(true)
    expect(fs.existsSync(path.join(lockPath, 'pid')), 'the lock must record its builder\'s pid').toBe(true)

    // SIGKILL the whole tree: install.sh's cleanup trap never runs for an
    // untrappable signal (this IS the reproduction — no code path releases
    // the lock), and the recorded pid dies along with everything else.
    killTree(child.pid!)
    await new Promise<void>(res => child.on('exit', () => res()))
    await sleep(300) // let the OS finish tearing the tree down before we probe pids

    expect(fs.existsSync(lockPath), 'the killed install left its lock behind').toBe(true)

    const bridge = path.join(sbx.root, 'dist', 'bin', 'meta-cli.cjs')
    const start = Date.now()
    const r = execFileSync('bash', [installSh(sbx)], {
      env: installEnv(sbx, { PATH: withFakeNpm(), FAKE_NPM_LOG: log, FAKE_NPM_BRIDGE: bridge }),
      encoding: 'utf8',
    })
    const elapsed = Date.now() - start

    expect(r).toMatch(/Building node bridge/)
    expect(r).not.toMatch(/busy 30s\+/)
    expect(elapsed, 'must not sit out anything close to the ~30s busy ceiling').toBeLessThan(15000)
    expect(fs.existsSync(bridge), 'the later install must actually rebuild the bridge').toBe(true)
  }, 45000)

  test('while genuinely busy, the printed line names the lock path', async () => {
    const sbx = makeSandbox()
    const lockPath = path.join(sbx.root, 'dist', '.build.lock')
    fs.mkdirSync(path.join(sbx.root, 'dist'), { recursive: true })
    fs.mkdirSync(lockPath)
    // A real, long-lived process standing in for another install's still-
    // building npm child — outlives this test on purpose; reaped in finally.
    const holder = spawn('sleep', ['40'], { stdio: 'ignore' })
    await sleep(50)
    fs.writeFileSync(path.join(lockPath, 'pid'), String(holder.pid))
    try {
      const r = execFileSync('bash', [installSh(sbx)], {
        env: installEnv(sbx, { PATH: withFakeNpm() }),
        encoding: 'utf8',
      })
      expect(r).toContain(`node bridge build lock (${lockPath}) busy 30s+`)
    } finally {
      try { holder.kill('SIGKILL') } catch { /* already gone */ }
    }
  }, 45000)

  test('SIGTERM mid-build does not let a second install start a concurrent build while the child is still running', async () => {
    const sbx = makeSandbox()
    const marker = path.join(sbx.sb, 'npm-started')
    const log = path.join(sbx.sb, 'npm-invocations.log')
    const bridge = path.join(sbx.root, 'dist', 'bin', 'meta-cli.cjs')
    const lockPath = path.join(sbx.root, 'dist', '.build.lock')
    const npmPath = withFakeNpm()

    const child1 = spawn('bash', [installSh(sbx)], {
      env: installEnv(sbx, {
        PATH: npmPath, FAKE_NPM_MARKER: marker, FAKE_NPM_LOG: log, FAKE_NPM_SLEEP: '15', FAKE_NPM_BRIDGE: bridge,
      }),
      stdio: 'ignore',
    })
    const deadline = Date.now() + 15000
    while (!fs.existsSync(marker) && Date.now() < deadline) await sleep(20)
    expect(fs.existsSync(marker)).toBe(true)
    const buildPid = Number(fs.readFileSync(marker, 'utf8').trim())
    expect(isAlive(buildPid), 'the npm child should genuinely be running').toBe(true)

    // SIGTERM the INSTALLER only — never the npm child. This is the bug: the
    // installer's own cleanup trap fires (unlike SIGKILL) and used to drop
    // the lock immediately even though the child it started keeps building.
    child1.kill('SIGTERM')
    await new Promise<void>(res => child1.on('exit', () => res()))
    await sleep(200)
    expect(isAlive(buildPid), 'the npm child must still be running, now orphaned').toBe(true)
    expect(fs.existsSync(lockPath), 'the lock must stay standing while its build is still alive').toBe(true)

    const countInvocations = () => fs.readFileSync(log, 'utf8').split('\n').filter(l => l.trim()).length
    expect(countInvocations()).toBe(1)

    const child2 = spawn('bash', [installSh(sbx)], {
      env: installEnv(sbx, { PATH: npmPath, FAKE_NPM_LOG: log }),
      stdio: 'ignore',
    })
    await sleep(4000) // well inside the first child's remaining sleep window
    expect(countInvocations(), 'a second npm build must not start while the first is still running').toBe(1)
    expect(fs.existsSync(bridge)).toBe(false)

    killTree(child2.pid!)
    try { process.kill(buildPid, 'SIGKILL') } catch { /* already gone */ }
    await sleep(200)
  }, 30000)
})

describe.skipIf(!hasJq() || !hasNpm())('T-732: build-failure remedy', () => {
  test('node_modules absent: the failure line names npm install as the remedy, not only npm run build', () => {
    const sbx = makeSandbox()
    // No node_modules (a fresh clone) — the real npm genuinely fails, for the
    // exact reason QA reproduced.
    const r = execFileSync('bash', [installSh(sbx)], { env: installEnv(sbx), encoding: 'utf8' })
    expect(r).toMatch(/node bridge build FAILED/)
    expect(r).toMatch(/npm install/)
    expect(r).not.toMatch(/warn until it's fixed \(`cd [^`]* && npm run build`\)/)
  }, 20000)
})
