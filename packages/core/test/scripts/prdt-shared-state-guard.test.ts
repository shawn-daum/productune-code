/**
 * prdt-shared-state-guard.test.ts — T-601, black-box over the REAL `prdt` CLI
 * and the REAL install.sh (idiom: prdt-artifacts-buckets.test.ts /
 * install-audience-hook.test.ts).
 *
 * WHY: PO-observed 2026-09-10, 3x same day, same cause — the PO ran
 * `prdt wiki reindex` from their own session while a worker's own dispatch
 * was mid-run; a shared derived path's mtime moved under the worker and its
 * own real-home tripwire read that as contamination and failed an otherwise
 * clean run. `live_dispatch_warning()` (scripts/prdt) reads
 * $PRDT_HOME/run/call-governor/<sid>.<aid> counter mtimes, read-only, with a
 * 900s freshness window, and WARNS (never refuses) before a write to a path
 * SHARED_DERIVED_STATE_WRITERS names as shared. install.sh calls the same
 * logic through a hidden `prdt _shared-state-guard <label>` seam, since it
 * cannot import the Python module.
 *
 * This file reproduces the observed incident shape directly: a fresh
 * call-governor counter (a live dispatch) makes each of the three writer
 * paths warn; a stale one (or none, or only excluded filename shapes) does
 * not. Acceptance line 5 ("오늘 관측 3건이 이 가드로 잡혔을지를 재현으로
 * 보인다") is exactly the fresh-counter cases below.
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { spawnSync } from 'child_process'
import { test, expect, describe, beforeEach, afterEach } from 'vitest'
import { subprocessTimeout } from '../helpers/subprocess-timeout'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const PRDT_CLI = path.join(CORE_ROOT, 'scripts', 'prdt')
const INSTALL_SH = path.join(CORE_ROOT, 'scripts', 'install.sh')

function hasJq(): boolean {
  const r = spawnSync('jq', ['--version'], { stdio: 'ignore' })
  return r.status === 0
}

let projectDir: string
let machineHome: string

beforeEach(() => {
  projectDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-ssg-proj-')))
  machineHome = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-ssg-home-')))
  const r = spawnSync('python3', [PRDT_CLI, 'init', '--json', '--slug', 'proj', '--yes'], {
    cwd: projectDir,
    env: { ...process.env, PRDT_HOME: machineHome },
    encoding: 'utf-8',
    timeout: subprocessTimeout('cli'),
  })
  if (r.status !== 0) throw new Error(`prdt init failed: ${r.stderr}`)
})

afterEach(() => {
  fs.rmSync(projectDir, { recursive: true, force: true })
  fs.rmSync(machineHome, { recursive: true, force: true })
})

function runPrdt(args: string[]): { out: string; err: string; code: number | null } {
  const r = spawnSync('python3', [PRDT_CLI, ...args], {
    cwd: projectDir,
    env: { ...process.env, PRDT_HOME: machineHome },
    encoding: 'utf-8',
    timeout: subprocessTimeout('cli'),
  })
  return { out: r.stdout ?? '', err: r.stderr ?? '', code: r.status }
}

const RUN_DIR = () => path.join(machineHome, 'run', 'call-governor')
/** A counter filename shaped exactly like call-governor's own `$SID.$AID`
 *  key (RE_SID='^[A-Za-z0-9_-]{8,64}$', RE_AID='^[A-Za-z0-9_-]{4,64}$' in
 *  scripts/hooks/prdt-call-governor.sh — pinned against the CLI's own
 *  `_RUN_COUNTER_RE` in §pin below). */
const COUNTER_NAME = 'abcd1234-sess.aid1'

/** Seeds one live-dispatch counter file `ageS` seconds old. `ageS=0` is a
 *  counter that just ticked — the exact shape of "a dispatch is running
 *  right now" the 2026-09-10 incidents were. */
function seedCounter(ageS: number, name = COUNTER_NAME): string {
  const dir = RUN_DIR()
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, name)
  fs.writeFileSync(file, '.')
  const t = new Date(Date.now() - ageS * 1000)
  fs.utimesSync(file, t, t)
  return file
}

const WARN_MARK = 'a dispatch looks live on this machine'

describe('T-601 shared-derived-state CLI guard', () => {
  // ── wiki reindex ────────────────────────────────────────────────────────

  test('wiki reindex warns when a call-governor counter just ticked (reproduces the 2026-09-10 incident shape)', () => {
    seedCounter(0)
    const r = runPrdt(['wiki', 'reindex'])
    expect(r.code).toBe(0) // warns, never blocks
    expect(r.err).toContain(WARN_MARK)
    expect(r.err).toContain('prdt wiki reindex')
    expect(r.err).toContain('T-601')
    expect(r.out).toContain('reindexed') // the write still happens
  })

  test('wiki reindex is silent when the counter is well past the 900s freshness window', () => {
    seedCounter(901)
    const r = runPrdt(['wiki', 'reindex'])
    expect(r.code).toBe(0)
    expect(r.err).not.toContain(WARN_MARK)
  })

  test('wiki reindex is silent when no run/call-governor directory exists at all', () => {
    expect(fs.existsSync(RUN_DIR())).toBe(false)
    const r = runPrdt(['wiki', 'reindex'])
    expect(r.code).toBe(0)
    expect(r.err).not.toContain(WARN_MARK)
  })

  // ── artifacts sync ──────────────────────────────────────────────────────

  test('artifacts sync warns when a call-governor counter just ticked', () => {
    seedCounter(0)
    const r = runPrdt(['artifacts', 'sync'])
    expect(r.code).toBe(0)
    expect(r.err).toContain(WARN_MARK)
    expect(r.err).toContain('prdt artifacts sync')
    expect(r.err).toContain('docs/artifacts/manifest.json')
  })

  test('artifacts sync is silent when the counter is stale', () => {
    seedCounter(901)
    const r = runPrdt(['artifacts', 'sync'])
    expect(r.code).toBe(0)
    expect(r.err).not.toContain(WARN_MARK)
  })

  // ── excluded filename shapes never count as a live signal ─────────────────

  test('the fire marker, witness and band marker never count as a live dispatch (only the plain sid.aid counter does)', () => {
    // .fired-<event> fires on EVERY tool call in EVERY project on the
    // machine — far too broad; .hw-<sid>.<aid> is the tamper witness, a
    // leading dot; <sid>.<aid>.w<band> is the warn-band marker, two dots.
    // None of these is "a worker's own counter just advanced".
    fs.mkdirSync(RUN_DIR(), { recursive: true })
    const stamp = (name: string) => {
      const f = path.join(RUN_DIR(), name)
      fs.writeFileSync(f, '.')
      fs.utimesSync(f, new Date(), new Date())
    }
    stamp('.fired-PreToolUse')
    stamp('.hw-abcd1234-sess.aid1')
    stamp('abcd1234-sess.aid1.w40')
    const r = runPrdt(['wiki', 'reindex'])
    expect(r.err).not.toContain(WARN_MARK)
  })

  // ── read-only (contracts §Return: run/ is never written or cleared here) ──

  test('the guard never writes, touches or removes anything under run/call-governor', () => {
    const f = seedCounter(0)
    const before = fs.statSync(f)
    const beforeEntries = fs.readdirSync(RUN_DIR()).sort()
    runPrdt(['wiki', 'reindex'])
    const after = fs.statSync(f)
    const afterEntries = fs.readdirSync(RUN_DIR()).sort()
    expect(afterEntries).toEqual(beforeEntries) // no file added or removed
    expect(after.mtimeMs).toBe(before.mtimeMs) // not touched
    expect(after.size).toBe(before.size)
  })

  // ── install.sh's own seam onto the same logic ──────────────────────────────

  describe('install.sh mirror write', () => {
    let root: string, home: string, prdtHome: string, claudeDir: string

    beforeEach(() => {
      root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-ssg-install-')))
      home = path.join(root, 'home')
      prdtHome = path.join(root, 'prdt')
      claudeDir = path.join(root, 'claude')
      for (const d of [home, prdtHome, claudeDir]) fs.mkdirSync(d, { recursive: true })
      fs.writeFileSync(path.join(claudeDir, 'settings.json'), '{}')
    })
    afterEach(() => fs.rmSync(root, { recursive: true, force: true }))

    function runInstall() {
      const r = spawnSync('bash', [INSTALL_SH], {
        env: { ...process.env, HOME: home, PRDT_HOME: prdtHome, CLAUDE_DIR: claudeDir },
        encoding: 'utf-8',
        timeout: subprocessTimeout('cli'),
      })
      return { out: r.stdout ?? '', err: r.stderr ?? '', code: r.status }
    }

    test.skipIf(!hasJq())('warns on stderr, and still completes the mirror, when a dispatch looks live', () => {
      const dir = path.join(prdtHome, 'run', 'call-governor')
      fs.mkdirSync(dir, { recursive: true })
      const f = path.join(dir, COUNTER_NAME)
      fs.writeFileSync(f, '.')
      const now = new Date()
      fs.utimesSync(f, now, now)

      const r = runInstall()
      expect(r.code).toBe(0) // warns, never blocks the install
      expect(r.err).toContain(WARN_MARK)
      expect(r.err).toContain('install.sh mirror write')
      // and the mirror write this warning is ABOUT actually happened
      expect(fs.existsSync(path.join(prdtHome, 'discipline'))).toBe(true)
      expect(fs.existsSync(path.join(prdtHome, 'doctrine.md'))).toBe(true)
    })

    test.skipIf(!hasJq())('is silent on a fresh install with no run/call-governor directory yet', () => {
      const r = runInstall()
      expect(r.code).toBe(0)
      expect(r.err).not.toContain(WARN_MARK)
      expect(fs.existsSync(path.join(prdtHome, 'discipline'))).toBe(true)
    })

    test.skipIf(!hasJq())('is silent when the counter under PRDT_HOME is stale', () => {
      const dir = path.join(prdtHome, 'run', 'call-governor')
      fs.mkdirSync(dir, { recursive: true })
      const f = path.join(dir, COUNTER_NAME)
      fs.writeFileSync(f, '.')
      const old = new Date(Date.now() - 901 * 1000)
      fs.utimesSync(f, old, old)

      const r = runInstall()
      expect(r.code).toBe(0)
      expect(r.err).not.toContain(WARN_MARK)
    })
  })

  // ── the counter shape the guard reads is the shape call-governor writes ───

  test('§pin: the CLI\'s counter regex accepts exactly what call-governor\'s RE_SID.RE_AID accepts, on real sample keys', () => {
    // scripts/hooks/prdt-call-governor.sh is bash-only (no forks on its hot
    // path) so it cannot import scripts/prdt's `_RUN_COUNTER_RE` — the two
    // are necessarily separate literals. This pins them against each other
    // on the concrete boundary values both source comments describe, so a
    // future edit to either shape (widen/narrow a bound) is caught here
    // rather than silently diverging.
    const governorSrc = fs.readFileSync(
      path.join(CORE_ROOT, 'scripts', 'hooks', 'prdt-call-governor.sh'), 'utf-8')
    const sidLine = governorSrc.match(/^RE_SID='(.+)'$/m)
    const aidLine = governorSrc.match(/^RE_AID='(.+)'$/m)
    if (!sidLine || !aidLine) throw new Error('RE_SID/RE_AID not found in prdt-call-governor.sh')
    // Bash extended regex bracket classes are valid JS regex too for this shape.
    const sidBody = sidLine[1].replace(/^\^/, '').replace(/\$$/, '')
    const aidBody = aidLine[1].replace(/^\^/, '').replace(/\$$/, '')
    const bashKeyRe = new RegExp(`^${sidBody}\\.${aidBody}$`)

    const prdtSrc = fs.readFileSync(PRDT_CLI, 'utf-8')
    const counterLine = prdtSrc.match(/_RUN_COUNTER_RE = re\.compile\(r'(.+)'\)/)
    if (!counterLine) throw new Error('_RUN_COUNTER_RE not found in scripts/prdt')
    const cliKeyRe = new RegExp(counterLine[1])

    const accept = ['abcd1234-sess.aid1', 'a'.repeat(8) + '.' + 'b'.repeat(4), 'a'.repeat(64) + '.' + 'b'.repeat(64)]
    const reject = ['.fired-PreToolUse', '.hw-abcd1234-sess.aid1', 'abcd1234-sess.aid1.w40', 'short.aid1', 'abcd1234.abc']
    for (const k of accept) {
      expect(bashKeyRe.test(k), `bash: ${k}`).toBe(true)
      expect(cliKeyRe.test(k), `cli: ${k}`).toBe(true)
    }
    for (const k of reject) {
      expect(bashKeyRe.test(k), `bash: ${k}`).toBe(false)
      expect(cliKeyRe.test(k), `cli: ${k}`).toBe(false)
    }
  })
})
