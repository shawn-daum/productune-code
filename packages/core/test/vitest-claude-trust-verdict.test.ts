/**
 * T-846 — the run's floor for `~/.claude.json` trust entries.
 * The home tripwire deliberately skips ~/.claude.json (the agent harness
 * rewrites it continuously), so a test that writes a trust entry for a temp dir
 * into the REAL file was invisible. The floor compares only the set of
 * `projects` keys that live under the temp roots — churn-proof.
 */
import fs from 'fs'
import os from 'os'
import path from 'path'
import { test, expect, beforeEach, afterEach } from 'vitest'
import { tempTrustKeys, newTempTrustKeys } from '../../../scripts/vitest-claude-trust-verdict'

let dir: string
let file: string
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 't846-'))
  file = path.join(dir, 'claude.json')
})
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

const write = (projects: Record<string, unknown>) =>
  fs.writeFileSync(file, JSON.stringify({ projects, oauthAccount: 'SECRET' }))

test('only project keys under a temp root are collected', () => {
  write({ '/Users/x/real': {}, '/private/tmp/a/proj': {}, '/private/var/folders/ab/cd/T/prdt-init-meta-1/proj': {} })
  expect([...tempTrustKeys(file)].sort()).toEqual([
    '/private/tmp/a/proj',
    '/private/var/folders/ab/cd/T/prdt-init-meta-1/proj',
  ])
})

test('a new temp key is reported; unrelated churn and removals are not', () => {
  write({ '/private/tmp/old': {}, '/Users/x/a': {} })
  const before = tempTrustKeys(file)
  write({ '/Users/x/b': { changed: true }, '/private/tmp/new': {} })
  expect(newTempTrustKeys(before, tempTrustKeys(file))).toEqual(['/private/tmp/new'])
})

test('claude\'s own session scratch dirs are not counted', () => {
  write({ '/private/tmp/claude-501/x/scratchpad': {} })
  expect(tempTrustKeys(file).size).toBe(0)
})

test('missing or corrupt file yields an empty set, never a throw', () => {
  expect(tempTrustKeys(path.join(dir, 'nope')).size).toBe(0)
  fs.writeFileSync(file, '{not json')
  expect(tempTrustKeys(file).size).toBe(0)
})
