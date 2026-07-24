/**
 * plan-tier.ts — T-423 per-user Claude plan tier (max-x20 / team-premium / other).
 *
 * Contract under test:
 * - Storage is USER-level: `<home>/.prdt/plan-tier`, one token — the same file
 *   prdt-plan-tier-inject.sh reads at PO session start (mirrors audience-mode).
 * - Default is `other`: missing file, empty file, corrupt content all resolve
 *   to `other` (the safe default — fable floors resolve to opus until the
 *   user confirms otherwise, T-391).
 * - `hasPlanTierSet` distinguishes "never answered" from the `other` default,
 *   so the PO's ask-once gate only fires when it's actually unset.
 * - `isFableEligible` — only max-x20 / team-premium are fable-eligible.
 * - Write is atomic (tmp + rename) and round-trips through the hook's parse
 *   (trailing-newline tolerant).
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { test, expect, describe, beforeEach, afterEach } from 'vitest'
import {
  getPlanTier,
  setPlanTier,
  hasPlanTierSet,
  isFableEligible,
  DEFAULT_PLAN_TIER,
} from '../../src/settings/plan-tier'

let home: string

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-tier-'))
})

afterEach(() => {
  fs.rmSync(home, { recursive: true, force: true })
})

const tierFile = () => path.join(home, '.prdt', 'plan-tier')

describe('default = other', () => {
  test('missing file → other', () => {
    expect(getPlanTier(home)).toBe('other')
    expect(DEFAULT_PLAN_TIER).toBe('other')
  })

  test('empty file → other', () => {
    fs.mkdirSync(path.dirname(tierFile()), { recursive: true })
    fs.writeFileSync(tierFile(), '')
    expect(getPlanTier(home)).toBe('other')
  })

  test('corrupt content → other (never throws)', () => {
    fs.mkdirSync(path.dirname(tierFile()), { recursive: true })
    fs.writeFileSync(tierFile(), 'pro\n')
    expect(getPlanTier(home)).toBe('other')
  })
})

describe('hasPlanTierSet — distinguishes unset from the other default', () => {
  test('missing file → false', () => {
    expect(hasPlanTierSet(home)).toBe(false)
  })

  test('corrupt content → false (not a real answer)', () => {
    fs.mkdirSync(path.dirname(tierFile()), { recursive: true })
    fs.writeFileSync(tierFile(), 'pro\n')
    expect(hasPlanTierSet(home)).toBe(false)
  })

  test('explicit other → true (a real, recorded answer)', () => {
    setPlanTier('other', home)
    expect(hasPlanTierSet(home)).toBe(true)
  })

  test('max-x20 → true', () => {
    setPlanTier('max-x20', home)
    expect(hasPlanTierSet(home)).toBe(true)
  })
})

describe('isFableEligible', () => {
  test('max-x20 and team-premium are eligible', () => {
    expect(isFableEligible('max-x20')).toBe(true)
    expect(isFableEligible('team-premium')).toBe(true)
  })

  test('other is not eligible', () => {
    expect(isFableEligible('other')).toBe(false)
  })
})

describe('set + get round-trip', () => {
  test('max-x20 persists and reads back', () => {
    setPlanTier('max-x20', home)
    expect(getPlanTier(home)).toBe('max-x20')
  })

  test('team-premium persists and reads back', () => {
    setPlanTier('team-premium', home)
    expect(getPlanTier(home)).toBe('team-premium')
  })

  test('other persists and reads back (explicit, not just default)', () => {
    setPlanTier('max-x20', home)
    setPlanTier('other', home)
    expect(getPlanTier(home)).toBe('other')
    expect(fs.readFileSync(tierFile(), 'utf-8').trim()).toBe('other')
  })

  test('creates ~/.prdt when absent; no leftover tmp file', () => {
    setPlanTier('max-x20', home)
    expect(fs.existsSync(tierFile())).toBe(true)
    expect(fs.existsSync(tierFile() + '.tmp')).toBe(false)
  })

  test('file shape matches what the bash hook parses: single token + newline', () => {
    setPlanTier('max-x20', home)
    expect(fs.readFileSync(tierFile(), 'utf-8')).toBe('max-x20\n')
  })
})
