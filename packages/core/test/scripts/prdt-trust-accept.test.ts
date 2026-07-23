/**
 * prdt-trust-accept.test.ts — T-408 trust auto-accept on the prdt line.
 *
 * v0.6's setTrustAccepted (init-project.mjs) never made it to the v1 prdt
 * flip: `prdt init` and the bare-`prdt` launcher wrote NO
 * `hasTrustDialogAccepted` entry, so a fresh project on a new machine spawned
 * its first PO session in an untrusted cwd. Empirical ground truth
 * (2026-07-23, Claude Code 2.1.218): `--permission-mode bypassPermissions`
 * (the GUI po-runner's exact spawn mode) SUPPRESSES global SessionStart hook
 * injection when the cwd is untrusted → the PO loses its discipline and can
 * fall into roleplay. Trust is keyed by the EXACT realpath'd cwd — a trusted
 * parent does NOT cover `<root>/code`, so both projectRoot and codeRoot must
 * be written.
 *
 * Black-box over the REAL `prdt` CLI with a faked $HOME (python Path.home()
 * honors it), mirroring prdt-init-meta-split.test.ts.
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync } from 'child_process'
import { test, expect, describe, beforeEach, afterEach } from 'vitest'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const PRDT_CLI = path.join(CORE_ROOT, 'scripts', 'prdt')

let projectDir: string
let fakeHome: string

function claudeJsonPath(): string {
  return path.join(fakeHome, '.claude.json')
}

function readClaudeJson(): any {
  return JSON.parse(fs.readFileSync(claudeJsonPath(), 'utf-8'))
}

function runPrdt(args: string[], extraEnv: Record<string, string> = {}): string {
  return execFileSync('python3', [PRDT_CLI, ...args], {
    cwd: projectDir,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 20000,
    env: { ...process.env, HOME: fakeHome, ...extraEnv },
  })
}

function runInit(): any {
  return JSON.parse(runPrdt(['init', '--json', '--slug', 'proj']))
}

/** realpath'd trust key for a dir — mirrors set_trust_accepted key derivation. */
function trustKey(dir: string): string {
  return fs.realpathSync(dir)
}

beforeEach(() => {
  projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-trust-'))
  fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-trust-home-'))
})

afterEach(() => {
  fs.rmSync(projectDir, { recursive: true, force: true })
  fs.rmSync(fakeHome, { recursive: true, force: true })
})

describe('prdt init — trust auto-accept (T-408)', () => {
  test('fresh init trusts BOTH projectRoot and codeRoot (exact-cwd keying)', () => {
    const res = runInit()
    expect(res.status).toBe('created')

    const data = readClaudeJson()
    expect(data.projects[trustKey(projectDir)]?.hasTrustDialogAccepted).toBe(true)
    // GUI po-runner spawns at codeRoot — parent trust does NOT inherit (empirical).
    expect(data.projects[trustKey(path.join(projectDir, 'code'))]?.hasTrustDialogAccepted).toBe(true)
  })

  test('legacy layout (own .git at root, no code/ dir) trusts projectRoot only', () => {
    execFileSync('git', ['init', '-q'], { cwd: projectDir })
    const res = runInit()
    expect(res.status).toBe('created')

    const data = readClaudeJson()
    expect(data.projects[trustKey(projectDir)]?.hasTrustDialogAccepted).toBe(true)
    expect(fs.existsSync(path.join(projectDir, 'code'))).toBe(false)
  })

  test('preserves every unrelated key and existing per-project fields', () => {
    fs.writeFileSync(claudeJsonPath(), JSON.stringify({
      theme: 'dark',
      projects: {
        '/somewhere/else': { allowedTools: ['Bash'], hasTrustDialogAccepted: false },
        [trustKey(projectDir)]: { allowedTools: ['Read'] },
      },
    }))

    runInit()
    const data = readClaudeJson()
    expect(data.theme).toBe('dark')
    expect(data.projects['/somewhere/else']).toEqual({ allowedTools: ['Bash'], hasTrustDialogAccepted: false })
    // Existing entry fields survive the trust merge.
    expect(data.projects[trustKey(projectDir)]).toEqual({ allowedTools: ['Read'], hasTrustDialogAccepted: true })
  })

  test('corrupt ~/.claude.json never blocks init (best-effort, exit 0)', () => {
    fs.writeFileSync(claudeJsonPath(), '{not json')
    const res = runInit()
    expect(res.status).toBe('created')
    // Trust write degrades to a fresh valid file.
    const data = readClaudeJson()
    expect(data.projects[trustKey(projectDir)]?.hasTrustDialogAccepted).toBe(true)
  })

  test('one-time backup of a pre-existing ~/.claude.json before first mutation', () => {
    fs.writeFileSync(claudeJsonPath(), JSON.stringify({ projects: {} }))
    runInit()
    const baks = fs.readdirSync(fakeHome).filter((n) => n.startsWith('.claude.json.bak.'))
    expect(baks.length).toBe(1)
  })
})

describe('bare `prdt` launch — trust self-heal (T-408, new-machine parity)', () => {
  test('already-init’d project with no trust entry gets healed before exec', () => {
    runInit()
    // Simulate a new machine: wipe the trust state written by init.
    fs.rmSync(claudeJsonPath(), { force: true })
    for (const n of fs.readdirSync(fakeHome).filter((x) => x.startsWith('.claude.json.bak.'))) {
      fs.rmSync(path.join(fakeHome, n), { force: true })
    }

    // Stub `claude` so execvp succeeds without a real session.
    const shimDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-trust-shim-'))
    const shim = path.join(shimDir, 'claude')
    fs.writeFileSync(shim, '#!/bin/sh\nexit 0\n', { mode: 0o755 })
    try {
      runPrdt([], { PATH: `${shimDir}:${process.env.PATH ?? ''}` })
      const data = readClaudeJson()
      expect(data.projects[trustKey(projectDir)]?.hasTrustDialogAccepted).toBe(true)
      expect(data.projects[trustKey(path.join(projectDir, 'code'))]?.hasTrustDialogAccepted).toBe(true)
    } finally {
      fs.rmSync(shimDir, { recursive: true, force: true })
    }
  })
})
