/**
 * project-kind.test.ts — detection contract for core's project-kind resolver
 * (T-284 QA-HIGH fix). Mirrors the case list in
 * packages/gui/electron/project-paths.test.ts so the two independent
 * implementations stay behaviorally identical.
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { test, expect } from 'vitest'
import { detectProjectKind, stateDir } from '../../src/state/project-kind'

function makeProject(subdirs: string[]): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'core-project-kind-'))
  for (const s of subdirs) fs.mkdirSync(path.join(root, s), { recursive: true })
  return root
}

test('.prdt present -> kind prdt', () => {
  const d = makeProject(['.prdt'])
  expect(detectProjectKind(d)).toBe('prdt')
  expect(stateDir(d)).toBe(path.join(d, '.prdt'))
})

test('only .productune present -> kind productune (legacy)', () => {
  const d = makeProject(['.productune'])
  expect(detectProjectKind(d)).toBe('productune')
  expect(stateDir(d)).toBe(path.join(d, '.productune'))
})

test('both present -> prdt wins', () => {
  const d = makeProject(['.prdt', '.productune'])
  expect(detectProjectKind(d)).toBe('prdt')
})

test('neither present -> productune default', () => {
  const d = makeProject([])
  expect(detectProjectKind(d)).toBe('productune')
})

test('missing directory -> productune default (no throw)', () => {
  expect(detectProjectKind('/no/such/dir/anywhere-xyz')).toBe('productune')
})
