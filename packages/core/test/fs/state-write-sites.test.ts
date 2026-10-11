/**
 * state-write-sites.test.ts — T-848 S4: the core writers migrated to
 * stateWriteFileSync refuse a link at each path component and keep file modes.
 */
import fs from 'fs'
import os from 'os'
import path from 'path'
import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import { appendPendingPromotion, listPendingPromotions } from '../../src/state/pending-promotions'
import { StateWriteRefused } from '../../src/fs/state-write'

let proj: string
let outside: string
const cand = { persona: 'developer', turn_id: 't1', scope: 'project' as const, kind: 'habit' as const, target: 'docs/x.md', delta: 'd', rationale: 'r' }

beforeEach(() => {
  proj = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sws-proj-')))
  outside = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sws-out-')))
  fs.mkdirSync(path.join(proj, '.prdt'))
})
afterEach(() => {
  fs.rmSync(proj, { recursive: true, force: true })
  fs.rmSync(outside, { recursive: true, force: true })
})

describe('pending-promotions (po-state.json)', () => {
  test('po-state.json is a link to a victim → refused, victim byte-identical', () => {
    const v = path.join(outside, 'victim')
    fs.writeFileSync(v, '{"keep":1}\n')
    fs.symlinkSync(v, path.join(proj, '.prdt', 'po-state.json'))
    expect(() => appendPendingPromotion(proj, cand)).toThrow(StateWriteRefused)
    expect(fs.readFileSync(v, 'utf-8')).toBe('{"keep":1}\n')
  })

  test('po-state.json is a dangling link → nothing created at its target', () => {
    const missing = path.join(outside, 'missing')
    fs.symlinkSync(missing, path.join(proj, '.prdt', 'po-state.json'))
    expect(() => appendPendingPromotion(proj, cand)).toThrow(StateWriteRefused)
    expect(fs.existsSync(missing)).toBe(false)
  })

  test('.prdt is a link to a directory → refused, nothing written outside', () => {
    fs.rmSync(path.join(proj, '.prdt'), { recursive: true })
    fs.symlinkSync(outside, path.join(proj, '.prdt'))
    expect(() => appendPendingPromotion(proj, cand)).toThrow(StateWriteRefused)
    expect(fs.readdirSync(outside)).toEqual([])
  })

  test('existing po-state.json keeps its mode; a new one is 0600', () => {
    const f = path.join(proj, '.prdt', 'po-state.json')
    fs.writeFileSync(f, '{}')
    fs.chmodSync(f, 0o640)
    appendPendingPromotion(proj, cand)
    expect(fs.statSync(f).mode & 0o7777).toBe(0o640)
    expect(listPendingPromotions(proj)).toHaveLength(1)
    fs.rmSync(f)
    const old = process.umask(0o022)
    try {
      appendPendingPromotion(proj, cand)
    } finally {
      process.umask(old)
    }
    expect(fs.statSync(f).mode & 0o7777).toBe(0o600)
  })
})
