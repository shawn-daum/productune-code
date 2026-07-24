/**
 * audience-mode.ts — T-326 per-user audience mode (planner / developer).
 *
 * Contract under test:
 * - Storage is USER-level: `<home>/.prdt/audience-mode`, one token — the same
 *   file prdt-audience-inject.sh reads at PO session start. NOT the GUI's
 *   ~/.productune/settings.json (the bash hook must read it without JSON
 *   parsing) and NOT the project's .prdt/config.json (the register belongs to
 *   the operator, not the project).
 * - Default is `planner`: missing file, empty file, corrupt content all
 *   resolve to planner (PRD v1.5 T-326 decision).
 * - Write is atomic (tmp + rename) and round-trips through the hook's parse
 *   (trailing-newline tolerant).
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { test, expect, describe, beforeEach, afterEach } from 'vitest'
import {
  getAudienceMode,
  setAudienceMode,
  DEFAULT_AUDIENCE_MODE,
} from '../../src/settings/audience-mode'

let home: string

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'audience-mode-'))
})

afterEach(() => {
  fs.rmSync(home, { recursive: true, force: true })
})

const modeFile = () => path.join(home, '.prdt', 'audience-mode')

describe('default = planner', () => {
  test('missing file → planner', () => {
    expect(getAudienceMode(home)).toBe('planner')
    expect(DEFAULT_AUDIENCE_MODE).toBe('planner')
  })

  test('empty file → planner', () => {
    fs.mkdirSync(path.dirname(modeFile()), { recursive: true })
    fs.writeFileSync(modeFile(), '')
    expect(getAudienceMode(home)).toBe('planner')
  })

  test('corrupt content → planner (never throws)', () => {
    fs.mkdirSync(path.dirname(modeFile()), { recursive: true })
    fs.writeFileSync(modeFile(), 'expert\n')
    expect(getAudienceMode(home)).toBe('planner')
  })
})

describe('set + get round-trip', () => {
  test('developer persists and reads back', () => {
    setAudienceMode('developer', home)
    expect(getAudienceMode(home)).toBe('developer')
  })

  test('planner persists and reads back (explicit, not just default)', () => {
    setAudienceMode('developer', home)
    setAudienceMode('planner', home)
    expect(getAudienceMode(home)).toBe('planner')
    expect(fs.readFileSync(modeFile(), 'utf-8').trim()).toBe('planner')
  })

  test('creates ~/.prdt when absent; no leftover tmp file', () => {
    setAudienceMode('developer', home)
    expect(fs.existsSync(modeFile())).toBe(true)
    expect(fs.existsSync(modeFile() + '.tmp')).toBe(false)
  })

  test('file shape matches what the bash hook parses: single token + newline', () => {
    setAudienceMode('developer', home)
    expect(fs.readFileSync(modeFile(), 'utf-8')).toBe('developer\n')
  })
})
