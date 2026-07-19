/**
 * project-paths — unit cases for project-kind detection + dual-mode path
 * resolution (T-284 / adapter A1).
 *
 * Detection reads the real filesystem (existsSync on `.prdt`), so these cases
 * build throwaway project dirs under an os.tmpdir mkdtemp root and assert the
 * resolver picks the right state directory:
 *   - `.prdt/` present            → 'prdt'      → paths under `.prdt`
 *   - only `.productune/` present → 'productune'→ paths under `.productune` (legacy unchanged)
 *   - both present                → 'prdt' wins
 *   - neither present             → 'productune' default (fresh / creating)
 *
 * Mirrors the framework-free case-list + vitest driver idiom of
 * electron/ipc/costArchive.test.ts.
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import {
  detectProjectKind,
  stateDir,
  poStatePath,
  configPath,
  chatJsonPath,
  onboardingPath,
  turnsJsonlPath,
  codeDirName,
  codeRoot,
  isPhysicallySplit,
  CODE_DIR_DEFAULT,
} from './project-paths'

interface Case {
  readonly label: string
  readonly run: (dir: string) => { ok: boolean; detail?: string }
}

/** Make a temp project dir seeded with the given state subdirs. */
function makeProject(subdirs: string[]): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-paths-'))
  for (const s of subdirs) fs.mkdirSync(path.join(root, s), { recursive: true })
  return root
}

/** Make a temp project seeded with a state dir + config.json. */
function withConfig(stateDirName: string, cfg: unknown): string {
  const root = makeProject([stateDirName])
  fs.writeFileSync(path.join(root, stateDirName, 'config.json'), JSON.stringify(cfg))
  return root
}

const eq = (a: unknown, b: unknown): { ok: boolean; detail?: string } =>
  a === b ? { ok: true } : { ok: false, detail: `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}` }

export const PROJECT_PATHS_CASES: readonly Case[] = [
  {
    label: '.prdt present → kind prdt',
    run: () => {
      const d = makeProject(['.prdt'])
      return eq(detectProjectKind(d), 'prdt')
    },
  },
  {
    label: 'only .productune present → kind productune (legacy)',
    run: () => {
      const d = makeProject(['.productune'])
      return eq(detectProjectKind(d), 'productune')
    },
  },
  {
    label: 'both present → prdt wins',
    run: () => {
      const d = makeProject(['.prdt', '.productune'])
      return eq(detectProjectKind(d), 'prdt')
    },
  },
  {
    label: 'neither present → productune default',
    run: () => {
      const d = makeProject([])
      return eq(detectProjectKind(d), 'productune')
    },
  },
  {
    label: 'missing directory → productune default (no throw)',
    run: () => {
      return eq(detectProjectKind('/no/such/dir/anywhere-xyz'), 'productune')
    },
  },
  {
    label: 'prdt project → state files resolve under .prdt',
    run: () => {
      const d = makeProject(['.prdt'])
      const r1 = eq(stateDir(d), path.join(d, '.prdt'))
      if (!r1.ok) return r1
      const r2 = eq(poStatePath(d), path.join(d, '.prdt', 'po-state.json'))
      if (!r2.ok) return r2
      const r3 = eq(configPath(d), path.join(d, '.prdt', 'config.json'))
      if (!r3.ok) return r3
      const r4 = eq(chatJsonPath(d), path.join(d, '.prdt', 'chat.json'))
      if (!r4.ok) return r4
      const r5 = eq(onboardingPath(d), path.join(d, '.prdt', 'onboarding.json'))
      if (!r5.ok) return r5
      return eq(turnsJsonlPath(d), path.join(d, '.prdt', 'turns.jsonl'))
    },
  },
  {
    label: 'legacy project → state files resolve under .productune (unchanged)',
    run: () => {
      const d = makeProject(['.productune'])
      const r1 = eq(stateDir(d), path.join(d, '.productune'))
      if (!r1.ok) return r1
      const r2 = eq(poStatePath(d), path.join(d, '.productune', 'po-state.json'))
      if (!r2.ok) return r2
      return eq(configPath(d), path.join(d, '.productune', 'config.json'))
    },
  },

  // ── Code root resolution (PRD §v1.3 설계 결정 4, T-377) ──────────────────────
  // Byte-identical case list to core's project-kind.test.ts so the two + python
  // stay behaviorally in lockstep (3-way parity acceptance).
  {
    label: 'legacy: no state dir → codeRoot == projectRoot, not split',
    run: () => {
      const d = makeProject([])
      const r1 = eq(codeDirName(d), null)
      if (!r1.ok) return r1
      const r2 = eq(codeRoot(d), d)
      if (!r2.ok) return r2
      return eq(isPhysicallySplit(d), false)
    },
  },
  {
    label: 'legacy: config present but no code.dir → codeRoot == projectRoot',
    run: () => {
      const d = withConfig('.prdt', { slug: 'proj', meta: { allowlist: ['.prdt'] } })
      const r1 = eq(codeDirName(d), null)
      if (!r1.ok) return r1
      const r2 = eq(codeRoot(d), d)
      if (!r2.ok) return r2
      return eq(isPhysicallySplit(d), false)
    },
  },
  {
    label: 'split: code.dir present → codeRoot = <projectRoot>/<code.dir>',
    run: () => {
      const d = withConfig('.prdt', { slug: 'proj', code: { dir: CODE_DIR_DEFAULT } })
      const r1 = eq(codeDirName(d), 'code')
      if (!r1.ok) return r1
      const r2 = eq(codeRoot(d), path.join(d, 'code'))
      if (!r2.ok) return r2
      return eq(isPhysicallySplit(d), true)
    },
  },
  {
    label: 'split: a custom code.dir name is honored',
    run: () => {
      const d = withConfig('.prdt', { code: { dir: 'app' } })
      return eq(codeRoot(d), path.join(d, 'app'))
    },
  },
  {
    label: 'code.dir read from the detected state dir (.productune legacy kind)',
    run: () => {
      const d = withConfig('.productune', { code: { dir: 'code' } })
      const r1 = eq(codeDirName(d), 'code')
      if (!r1.ok) return r1
      return eq(codeRoot(d), path.join(d, 'code'))
    },
  },
  {
    label: 'corrupt config → legacy fallback, never throws',
    run: () => {
      const d = makeProject(['.prdt'])
      fs.writeFileSync(path.join(d, '.prdt', 'config.json'), '{ not json')
      const r1 = eq(codeDirName(d), null)
      if (!r1.ok) return r1
      return eq(codeRoot(d), d)
    },
  },
  {
    label: 'empty / non-string code.dir is ignored (treated as legacy)',
    run: () => {
      const r1 = eq(codeDirName(withConfig('.prdt', { code: { dir: '' } })), null)
      if (!r1.ok) return r1
      return eq(codeDirName(withConfig('.prdt', { code: { dir: 42 } })), null)
    },
  },
]

export function runProjectPathsCases(): { passed: number; failures: string[] } {
  const failures: string[] = []
  for (const c of PROJECT_PATHS_CASES) {
    let res: { ok: boolean; detail?: string }
    try {
      res = c.run('')
    } catch (e) {
      res = { ok: false, detail: String(e) }
    }
    if (!res.ok) failures.push(`${c.label}${res.detail ? `: ${res.detail}` : ''}`)
  }
  return { passed: PROJECT_PATHS_CASES.length - failures.length, failures }
}

// ── vitest driver ─────────────────────────────────────────────────────────────

import { test, expect } from 'vitest'

test('project-paths: all detection + resolution cases pass', () => {
  const { passed, failures } = runProjectPathsCases()
  if (failures.length > 0) {
    throw new Error(`${failures.length} failure(s):\n  ${failures.join('\n  ')}`)
  }
  expect(passed).toBe(PROJECT_PATHS_CASES.length)
})
