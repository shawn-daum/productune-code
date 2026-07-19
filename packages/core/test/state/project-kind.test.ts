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
import {
  detectProjectKind,
  stateDir,
  codeRoot,
  codeDirName,
  isPhysicallySplit,
  CODE_DIR_DEFAULT,
} from '../../src/state/project-kind'

function makeProject(subdirs: string[]): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'core-project-kind-'))
  for (const s of subdirs) fs.mkdirSync(path.join(root, s), { recursive: true })
  return root
}

function withConfig(stateDirName: string, cfg: unknown): string {
  const root = makeProject([stateDirName])
  fs.writeFileSync(path.join(root, stateDirName, 'config.json'), JSON.stringify(cfg))
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

// ── Code root resolution (PRD §v1.3 설계 결정 4, T-376) ──────────────────────────

test('legacy: no state dir → codeRoot == projectRoot, not split', () => {
  const d = makeProject([])
  expect(codeDirName(d)).toBeNull()
  expect(codeRoot(d)).toBe(d)
  expect(isPhysicallySplit(d)).toBe(false)
})

test('legacy: config present but no code.dir → codeRoot == projectRoot', () => {
  const d = withConfig('.prdt', { slug: 'proj', meta: { allowlist: ['.prdt'] } })
  expect(codeDirName(d)).toBeNull()
  expect(codeRoot(d)).toBe(d)
  expect(isPhysicallySplit(d)).toBe(false)
})

test('split: code.dir present → codeRoot = <projectRoot>/<code.dir>', () => {
  const d = withConfig('.prdt', { slug: 'proj', code: { dir: CODE_DIR_DEFAULT } })
  expect(codeDirName(d)).toBe('code')
  expect(codeRoot(d)).toBe(path.join(d, 'code'))
  expect(isPhysicallySplit(d)).toBe(true)
})

test('split: a custom code.dir name is honored', () => {
  const d = withConfig('.prdt', { code: { dir: 'app' } })
  expect(codeRoot(d)).toBe(path.join(d, 'app'))
})

test('code.dir read from the detected state dir (.productune legacy kind)', () => {
  const d = withConfig('.productune', { code: { dir: 'code' } })
  expect(codeDirName(d)).toBe('code')
  expect(codeRoot(d)).toBe(path.join(d, 'code'))
})

test('corrupt config → legacy fallback, never throws', () => {
  const d = makeProject(['.prdt'])
  fs.writeFileSync(path.join(d, '.prdt', 'config.json'), '{ not json')
  expect(codeDirName(d)).toBeNull()
  expect(codeRoot(d)).toBe(d)
})

test('empty / non-string code.dir is ignored (treated as legacy)', () => {
  expect(codeDirName(withConfig('.prdt', { code: { dir: '' } }))).toBeNull()
  expect(codeDirName(withConfig('.prdt', { code: { dir: 42 } }))).toBeNull()
})
