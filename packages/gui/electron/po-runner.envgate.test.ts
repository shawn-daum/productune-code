/**
 * po-runner env-file gate — dual-mode resolution (T-289 / adapter A6).
 *
 * canSpawnClaude's onboarding-done precondition is the presence of an env file;
 * the file it checks now branches on project kind (A1 detectProjectKind):
 *   - prdt project (`.prdt/` marker)    → ~/.prdt/prdt.env  (install.sh SoT)
 *   - legacy `.productune/` project     → ~/.productune/productune.env (unchanged)
 *   - fresh/unknown dir                 → legacy default (unchanged)
 *
 * Tested via the exported poEnvGatePath(projectDir, homeDir) resolver with a
 * fixture homeDir — the developer's real HOME is never read for assertions.
 * Mirrors the case-list + vitest driver idiom of project-paths.test.ts.
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { poEnvGatePath } from './po-runner'

interface Case {
  readonly label: string
  readonly run: () => { ok: boolean; detail?: string }
}

const HOME = '/fixture/home'

function makeProject(subdirs: string[]): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-envgate-'))
  for (const s of subdirs) fs.mkdirSync(path.join(root, s), { recursive: true })
  return root
}

const eq = (got: string, want: string) =>
  got === want ? { ok: true as const } : { ok: false as const, detail: `got=${got} want=${want}` }

export const ENV_GATE_CASES: readonly Case[] = [
  {
    label: 'prdt project → ~/.prdt/prdt.env',
    run: () => eq(
      poEnvGatePath(makeProject(['.prdt']), HOME),
      path.join(HOME, '.prdt', 'prdt.env'),
    ),
  },
  {
    label: 'legacy project → ~/.productune/productune.env (unchanged)',
    run: () => eq(
      poEnvGatePath(makeProject(['.productune']), HOME),
      path.join(HOME, '.productune', 'productune.env'),
    ),
  },
  {
    label: 'both state dirs present → prdt wins (A1 precedence)',
    run: () => eq(
      poEnvGatePath(makeProject(['.prdt', '.productune']), HOME),
      path.join(HOME, '.prdt', 'prdt.env'),
    ),
  },
  {
    label: 'fresh dir (no state dir) → legacy default (unchanged)',
    run: () => eq(
      poEnvGatePath(makeProject([]), HOME),
      path.join(HOME, '.productune', 'productune.env'),
    ),
  },
]

export function runEnvGateCases(): { passed: number; failures: string[] } {
  const failures: string[] = []
  for (const c of ENV_GATE_CASES) {
    let res: { ok: boolean; detail?: string }
    try {
      res = c.run()
    } catch (e) {
      res = { ok: false, detail: String(e) }
    }
    if (!res.ok) failures.push(`${c.label}${res.detail ? `: ${res.detail}` : ''}`)
  }
  return { passed: ENV_GATE_CASES.length - failures.length, failures }
}

// ── vitest driver ─────────────────────────────────────────────────────────────

import { test, expect } from 'vitest'

test('adapter A6: po-runner env-gate dual-mode cases pass', () => {
  const { passed, failures } = runEnvGateCases()
  if (failures.length > 0) {
    throw new Error(`${failures.length} failure(s):\n  ${failures.join('\n  ')}`)
  }
  expect(passed).toBe(ENV_GATE_CASES.length)
})
