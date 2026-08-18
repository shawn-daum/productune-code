/**
 * Roster parity (T-413 → T-414): the GUI hook roster and install.sh §4's
 * registration MUST be equal — not just as a basename SET, but as the full
 * event/matcher/order SHAPE Claude Code actually reads from settings.json.
 *
 * Before T-413 the two were hand-synced and drifted: install.sh registered 6
 * hooks (session-start, post-compact, post-dispatch, user-prompt,
 * audience-inject, overrides-inject) while the GUI list carried only 4 — so a
 * GUI-only user (the north-star persona) never got audience-inject (T-326) or
 * overrides-inject (T-358). T-413 closed the immediate risk with a basename-set
 * parity test (loud-fail on a missing/extra basename) but left the two
 * derivations as separate hand-written literals — the root cause of the drift.
 *
 * T-414 extracted a single machine-readable SoT — packages/core/scripts/
 * hook-manifest.json — that BOTH install.sh (jq --slurpfile) and onboarding.ts's
 * installPrdtHooks (a plain reduce over the same JSON, imported at build time)
 * derive their registration from. A basename-set test can no longer catch a
 * matcher or entry-order regression in either derivation (both could rename an
 * event's matcher identically and a set-only test would stay green), so this
 * file now:
 *
 *   1. Asserts PRDT_HOOK_BASENAMES literally IS hook-manifest.json's `basenames`
 *      (the cheap invariant — catches a stray re-hardcoded literal creeping
 *      back in).
 *   2. ACTUALLY RUNS install.sh against a throwaway PRDT_HOME/CLAUDE_DIR fixture
 *      (real jq, real mirror-copy — no ~/.claude / ~/.prdt touched) and reads
 *      the resulting settings.json `.hooks`.
 *   3. ACTUALLY RUNS installClaudeHooks (the GUI's TS derivation) against a
 *      FRESH settings.json under the SAME fixture home (so both sides resolve
 *      identical ~/.prdt/hooks/* mirror paths) and reads its `.hooks`.
 *   4. Deep-equals the two — event keys, per-event entry order, matcher
 *      presence/value, and per-entry hook command order all have to match
 *      exactly, or this fails loudly. Because both are the REAL production
 *      code paths (not a third hand-typed "expected" literal), an
 *      event/matcher/order drift in either implementation is caught even if it
 *      never touches hook-manifest.json at all.
 */

import fs from 'fs'
import path from 'path'
import os from 'os'
import { execFileSync } from 'child_process'
import { fileURLToPath } from 'url'
import { test, expect } from 'vitest'
import { PRDT_HOOK_BASENAMES, installClaudeHooks } from './onboarding'
import hookManifest from '../../../core/scripts/hook-manifest.json'

const HERE = path.dirname(fileURLToPath(import.meta.url))
// packages/gui/electron/ipc → packages/core/scripts
const CORE_SCRIPTS = path.resolve(HERE, '..', '..', '..', 'core', 'scripts')
const INSTALL_SH = path.join(CORE_SCRIPTS, 'install.sh')

test('T-414: GUI PRDT_HOOK_BASENAMES equals hook-manifest.json basenames (no re-hardcoded literal)', () => {
  expect([...PRDT_HOOK_BASENAMES]).toEqual(hookManifest.basenames)
})

test('T-414: GUI hook roster equals install.sh registered roster in full shape (event/matcher/order), not just basename-set', () => {
  // Fixture "home": install.sh is told (via env) to use <fixture>/.prdt and
  // <fixture>/.claude directly — no fallback to the real $HOME is exercised.
  // HOME itself is ALSO sandboxed here (mirroring core's
  // install-audience-hook.test.ts:36) because install.sh §5 symlinks
  // $HOME/.local/bin/prdt to a CLI fixture it creates under this same
  // directory — without an isolated HOME that symlink lands on the REAL
  // machine's ~/.local/bin/prdt, and once the fixture dir below is rm -rf'd
  // at the end of this test, the real CLI is left dangling (T-414 QA P1).
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-roster-parity-'))
  const home = path.join(fixture, 'home')
  const prdtHome = path.join(fixture, '.prdt')
  const claudeDir = path.join(fixture, '.claude')
  fs.mkdirSync(home, { recursive: true })
  let projectDir: string | undefined
  try {
    // 1) Run the REAL install.sh — mirrors discipline + hooks into prdtHome and
    //    registers hooks into claudeDir/settings.json via the manifest-driven jq.
    execFileSync('bash', [INSTALL_SH, '--no-statusline'], {
      env: { ...process.env, HOME: home, PRDT_HOME: prdtHome, CLAUDE_DIR: claudeDir },
      timeout: 60_000,
    })
    const settingsPath = path.join(claudeDir, 'settings.json')
    const cliHooks = JSON.parse(fs.readFileSync(settingsPath, 'utf8')).hooks

    // 2) Reset settings.json to a clean slate, then run the GUI's TS derivation
    //    against the SAME fixture home — installPrdtHooks requires the ~/.prdt/
    //    hooks mirror install.sh's §1 step just populated, so no separate stub
    //    mirror is needed; command paths resolve identically on both sides.
    fs.writeFileSync(settingsPath, '{}')
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-roster-parity-proj-'))
    fs.mkdirSync(path.join(projectDir, '.prdt'), { recursive: true })
    installClaudeHooks(projectDir, fixture)
    const guiHooks = JSON.parse(fs.readFileSync(settingsPath, 'utf8')).hooks

    expect(
      guiHooks,
      `install.sh and the GUI's installClaudeHooks produced DIFFERENT .hooks shapes ` +
        `from the same hook-manifest.json.\n  install.sh: ${JSON.stringify(cliHooks)}\n` +
        `  GUI:        ${JSON.stringify(guiHooks)}`,
    ).toEqual(cliHooks)
  } finally {
    // try/finally: an assert failure above must not leak the fixture (or,
    // pre-HOME-isolation, leave the real machine's CLI dangling) — T-414 QA
    // found leaked /var/folders dirs from the prior bare cleanup-at-tail-only
    // version whenever the toEqual above threw.
    fs.rmSync(fixture, { recursive: true, force: true })
    if (projectDir) fs.rmSync(projectDir, { recursive: true, force: true })
  }
})
