/**
 * set-trust-accepted.test.ts — T-418: setTrustAccepted must never clobber a
 * corrupt ~/.claude.json.
 *
 * This is the JS twin of the Python set_trust_accepted (packages/core/scripts/prdt,
 * covered black-box in prdt-trust-accept.test.ts). The JS twin is the HOT path:
 * the GUI po-runner calls it on every PO spawn (po-runner.ts). The prior code read
 * a present-but-unparseable file as {} (readClaudeJsonSafe), then rewrote the whole
 * file — wiping Claude Code's oauth account + project history. It must now abort the
 * write on a parse failure, while leaving the absent/valid paths unchanged.
 *
 * os.homedir() honors $HOME on POSIX, so a sandboxed HOME isolates the real file
 * (same technique as init-project-config-merge.test.ts).
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { test, expect, describe, beforeEach, afterEach } from 'vitest'
// @ts-expect-error — plain .mjs SoT with .d.mts companion resolved at build; vitest imports it directly
import { setTrustAccepted } from '../../scripts/lib/init-project.mjs'

let projectDir: string
let fakeHome: string
let savedHome: string | undefined

function claudeJsonPath(): string {
  return path.join(fakeHome, '.claude.json')
}
function readClaudeJson(): any {
  return JSON.parse(fs.readFileSync(claudeJsonPath(), 'utf-8'))
}
function trustKey(dir: string): string {
  return fs.realpathSync(dir)
}
function baks(): string[] {
  return fs.readdirSync(fakeHome).filter((n) => n.startsWith('.claude.json.bak.'))
}

beforeEach(() => {
  projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trust-js-'))
  fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'trust-js-home-'))
  savedHome = process.env.HOME
  process.env.HOME = fakeHome
})
afterEach(() => {
  process.env.HOME = savedHome
  fs.rmSync(projectDir, { recursive: true, force: true })
  fs.rmSync(fakeHome, { recursive: true, force: true })
})

describe('setTrustAccepted (T-418 — never clobber a corrupt ~/.claude.json)', () => {
  test('corrupt file: byte-untouched, no backup, no throw', () => {
    const corrupt = '{not json'
    fs.writeFileSync(claudeJsonPath(), corrupt)

    expect(() => setTrustAccepted(projectDir)).not.toThrow()

    // Aborted BEFORE any mutation — file identical, not even a backup taken.
    expect(fs.readFileSync(claudeJsonPath(), 'utf-8')).toBe(corrupt)
    expect(baks().length).toBe(0)
  })

  test('absent file: created fresh with the trust key (normal path unaffected)', () => {
    expect(fs.existsSync(claudeJsonPath())).toBe(false)

    setTrustAccepted(projectDir)

    const data = readClaudeJson()
    expect(data.projects[trustKey(projectDir)]?.hasTrustDialogAccepted).toBe(true)
  })

  test('valid file: merges trust + preserves every other key (normal path unaffected)', () => {
    fs.writeFileSync(claudeJsonPath(), JSON.stringify({
      oauthAccount: { emailAddress: 'x@y.z' },
      projects: { '/elsewhere': { allowedTools: ['Bash'] } },
    }))

    setTrustAccepted(projectDir)

    const data = readClaudeJson()
    expect(data.oauthAccount).toEqual({ emailAddress: 'x@y.z' })
    expect(data.projects['/elsewhere']).toEqual({ allowedTools: ['Bash'] })
    expect(data.projects[trustKey(projectDir)]?.hasTrustDialogAccepted).toBe(true)
    // A pre-existing valid file IS backed up once before mutation.
    expect(baks().length).toBe(1)
  })
})
