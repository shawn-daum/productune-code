/**
 * rules.test.ts — T-284 QA-HIGH regression (same-pattern defect #2).
 *
 * `loadRules`/`saveRules` hardcoded `<projectDir>/.productune/git-rules.json`.
 * In a prdt (`.prdt`-only) project this would create a shadow `.productune/`
 * dir on any git-rules write. Legacy `.productune` projects must be unaffected.
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { test, expect } from 'vitest'
import { saveRules, loadRules, getDefault } from '../../src/git-workflow/rules'

function makeProject(subdirs: string[]): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'core-rules-'))
  for (const s of subdirs) fs.mkdirSync(path.join(root, s), { recursive: true })
  return root
}

test('prdt project (.prdt only): git-rules.json written under .prdt, no shadow .productune created', () => {
  const d = makeProject(['.prdt'])
  const rules = { ...getDefault(), featureBranchPrefix: 'feat-test' }

  saveRules(d, rules)

  expect(fs.existsSync(path.join(d, '.prdt', 'git-rules.json'))).toBe(true)
  expect(fs.existsSync(path.join(d, '.productune'))).toBe(false)

  const loaded = loadRules(d)
  expect(loaded.featureBranchPrefix).toBe('feat-test')
})

test('legacy project (.productune only): git-rules.json still written under .productune (unchanged)', () => {
  const d = makeProject(['.productune'])
  const rules = { ...getDefault(), featureBranchPrefix: 'feat-legacy' }

  saveRules(d, rules)

  expect(fs.existsSync(path.join(d, '.productune', 'git-rules.json'))).toBe(true)
  expect(fs.existsSync(path.join(d, '.prdt'))).toBe(false)
})
