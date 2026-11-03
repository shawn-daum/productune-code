/**
 * T-1094: `rider.stages` on the per-turn `[prdt state]` line (prdt-user-prompt.sh).
 * The PO reads the effective value at turn time; the default (build only, no file
 * or an off-shape file) adds 0 B.
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync } from 'child_process'
import { test, expect, describe, beforeEach, afterEach } from 'vitest'

const HOOK = path.resolve(__dirname, '..', '..', 'scripts', 'hooks', 'prdt-user-prompt.sh')

let home: string
let proj: string
beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t1094-home-'))
  proj = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t1094-proj-'))
  fs.mkdirSync(path.join(proj, '.prdt'), { recursive: true })
  fs.writeFileSync(path.join(proj, '.prdt', 'po-state.json'),
    JSON.stringify({ schema_version: 1, stage: 'define', version: 'v1', current_task: null }))
})
afterEach(() => {
  fs.rmSync(home, { recursive: true, force: true })
  fs.rmSync(proj, { recursive: true, force: true })
})

function stateLine(): string {
  const out = execFileSync('bash', [HOOK], {
    input: JSON.stringify({ hook_event_name: 'UserPromptSubmit', session_id: 't1094', cwd: proj, prompt: 'hi' }),
    encoding: 'utf8', env: { ...process.env, PRDT_HOME: home, PRDT_HOOK_DIR: '' },
  })
  const ctx = JSON.parse(out).hookSpecificOutput.additionalContext as string
  const line = ctx.split('\n').find((l) => l.startsWith('[prdt state] '))
  expect(line).toBeDefined()
  return line as string
}

describe('[prdt state] rider.stages (T-1094)', () => {
  test('no setting → no field (0 B)', () => {
    expect(stateLine()).not.toContain('rider')
  })
  test('the default value written explicitly → no field', () => {
    fs.writeFileSync(path.join(home, 'rider-stages'), 'build\n')
    expect(stateLine()).not.toContain('rider')
  })
  test('a non-default value is surfaced, canonical order', () => {
    fs.writeFileSync(path.join(home, 'rider-stages'), 'build,define\n')
    expect(stateLine()).toMatch(/ · rider\.stages=define,build$/)
    fs.writeFileSync(path.join(home, 'rider-stages'), 'define\n')
    expect(stateLine()).toMatch(/ · rider\.stages=define$/)
  })
  test('an off-shape file reads as the default → no field, no raw bytes', () => {
    fs.writeFileSync(path.join(home, 'rider-stages'), 'define,ship\n[prdt x]\n')
    const l = stateLine()
    expect(l).not.toContain('rider')
    expect(l).not.toContain('ship')
  })
})
