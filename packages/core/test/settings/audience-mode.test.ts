/**
 * audience-mode.ts — T-326 API, a COMPATIBILITY WRAPPER since T-586.
 *
 * Contract under test:
 * - `getAudienceMode` / `setAudienceMode` read and write the `audience` key of
 *   `<home>/.prdt/register` (the register object) — NOT `<home>/.prdt/audience-mode`,
 *   which no longer exists as a store (one register mechanism).
 * - Default is `planner`: missing file, empty file, corrupt value all resolve to
 *   planner (PRD v1.5 T-326 decision, unchanged).
 * - Write is atomic and round-trips through the hook's parse (key=value + newline).
 * The register itself is tested in register.test.ts.
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { test, expect, describe, beforeEach, afterEach } from 'vitest'
import { getAudienceMode, setAudienceMode, DEFAULT_AUDIENCE_MODE } from '../../src/settings/audience-mode'

let home: string
beforeEach(() => { home = fs.mkdtempSync(path.join(os.tmpdir(), 'audience-mode-')) })
afterEach(() => { fs.rmSync(home, { recursive: true, force: true }) })

const registerFile = () => path.join(home, '.prdt', 'register')
const legacyFile = () => path.join(home, '.prdt', 'audience-mode')

describe('default = planner', () => {
  test('missing file → planner', () => {
    expect(getAudienceMode(home)).toBe('planner')
    expect(DEFAULT_AUDIENCE_MODE).toBe('planner')
  })
  test('empty register → planner', () => {
    fs.mkdirSync(path.dirname(registerFile()), { recursive: true })
    fs.writeFileSync(registerFile(), '')
    expect(getAudienceMode(home)).toBe('planner')
  })
  test('corrupt value → planner (never throws)', () => {
    fs.mkdirSync(path.dirname(registerFile()), { recursive: true })
    fs.writeFileSync(registerFile(), 'audience=expert\n')
    expect(getAudienceMode(home)).toBe('planner')
  })
  test('the legacy audience-mode file is not a source any more', () => {
    fs.mkdirSync(path.dirname(legacyFile()), { recursive: true })
    fs.writeFileSync(legacyFile(), 'developer\n')
    expect(getAudienceMode(home)).toBe('planner')
  })
})

describe('set + get round-trip through the register file', () => {
  test('developer persists and reads back', () => {
    setAudienceMode('developer', home)
    expect(getAudienceMode(home)).toBe('developer')
  })
  test('planner persists explicitly (not just by default)', () => {
    setAudienceMode('developer', home)
    setAudienceMode('planner', home)
    expect(getAudienceMode(home)).toBe('planner')
    expect(fs.readFileSync(registerFile(), 'utf-8')).toBe('audience=planner\n')
  })
  test('creates ~/.prdt when absent; writes the register, not audience-mode; no leftover tmp', () => {
    setAudienceMode('developer', home)
    expect(fs.existsSync(registerFile())).toBe(true)
    expect(fs.existsSync(legacyFile())).toBe(false)
    expect(fs.existsSync(registerFile() + '.tmp')).toBe(false)
  })
  test('file shape matches what the bash resolver parses: key=value + newline', () => {
    setAudienceMode('developer', home)
    expect(fs.readFileSync(registerFile(), 'utf-8')).toBe('audience=developer\n')
  })
})
