/**
 * pending-promotions.test.ts — T-284 QA-HIGH regression.
 *
 * Repro (QA): open a project that has ONLY `.prdt/` (a prdt/v1 project, no
 * `.productune/`) and call `appendPendingPromotion()`. Before the fix,
 * `statePath()` hardcoded `.productune`, so this silently created a shadow
 * `.productune/po-state.json` next to the real `.prdt/po-state.json` —
 * promotion data split across two stores every PO turn.
 *
 * Also covers the legacy-unchanged requirement: a `.productune`-only project
 * must keep writing to `.productune` byte-for-byte as before.
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { test, expect } from 'vitest'
import { appendPendingPromotion, listPendingPromotions } from '../../src/state/pending-promotions'

function makeProject(subdirs: string[]): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'core-pending-promotions-'))
  for (const s of subdirs) fs.mkdirSync(path.join(root, s), { recursive: true })
  return root
}

const candidate = {
  persona: 'developer',
  turn_id: 'turn-1',
  target: 'docs/wiki/index.md',
  delta: 'sample delta',
  rationale: 'sample rationale',
}

test('prdt project (.prdt only): promotion is written under .prdt, no shadow .productune created', () => {
  const d = makeProject(['.prdt'])

  appendPendingPromotion(d, candidate)

  expect(fs.existsSync(path.join(d, '.prdt', 'po-state.json'))).toBe(true)
  expect(fs.existsSync(path.join(d, '.productune'))).toBe(false)

  const pending = listPendingPromotions(d)
  expect(pending).toHaveLength(1)
  expect(pending[0].target).toBe('docs/wiki/index.md')
})

test('legacy project (.productune only): promotion still written under .productune (unchanged)', () => {
  const d = makeProject(['.productune'])

  appendPendingPromotion(d, candidate)

  expect(fs.existsSync(path.join(d, '.productune', 'po-state.json'))).toBe(true)
  expect(fs.existsSync(path.join(d, '.prdt'))).toBe(false)
})
