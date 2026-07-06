/**
 * Legacy → read-only downgrade proof (T-311), against REAL core paths.
 *
 * The pre-T-311 hook tests composed paths from a FAKE coreDir ('/bundle/core'),
 * so a green run proved only string composition — NOT that the onboarding flow
 * refrains from actually provisioning legacy artifacts when a real core (with
 * real `agents/pdt-*.md`, `po/po-instructions.md`, `scripts/statusline-*.sh`,
 * `scripts/hooks/*.sh`) is on disk. This test closes that gap: it points
 * `provisionUserGlobals` at the REPO's real `packages/core` and asserts, against
 * a throwaway fixture HOME, that ZERO legacy install happens:
 *
 *   - `~/.productune/productune.env` IS seeded (the GUI onboarding-complete marker
 *     App.tsx's checkEnv() gates on) — this is the only survivor.
 *   - NO `pdt-*.md` (nor any agent) is symlinked into `~/.claude/agents`.
 *   - NO `po-instructions.md` is copied into `~/.productune`.
 *   - NO `~/.claude/settings.json` is written (no 18-hook legacy set).
 *
 * REAL_CORE is the repo's `packages/core`. T-293 removed the legacy tree
 * (`agents/pdt-*.md` etc.), so a reintroduced `readdir(coreDir/agents)+symlink`
 * loop would now find the prdt-*.md specs — the "zero agents symlinked"
 * assertion still catches that regression. Intentionally NOT gated on any
 * legacy artifact existing.
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { fileURLToPath } from 'url'
import { provisionUserGlobals } from './onboarding'

interface Case {
  readonly label: string
  readonly run: () => { ok: boolean; detail?: string }
}

const ok = { ok: true } as const
const fail = (detail: string) => ({ ok: false, detail })

// packages/gui/electron/ipc → packages/core
const HERE = path.dirname(fileURLToPath(import.meta.url))
const REAL_CORE = path.resolve(HERE, '..', '..', '..', 'core')

function makeHome(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t311-home-'))
}

/** All `.md` entries under `~/.claude/agents`, or [] if the dir was never created. */
function agentEntries(home: string): string[] {
  const dir = path.join(home, '.claude', 'agents')
  try {
    return fs.readdirSync(dir).filter((f) => f.endsWith('.md'))
  } catch {
    return []
  }
}

export const CASES: readonly Case[] = [
  {
    label: 'REAL_CORE resolves to a real packages/core directory',
    run: () => {
      // Not gated on any legacy artifact (T-293 will remove those) — just that the
      // path resolution points at a real core dir, so the outcome cases exercise a
      // genuine filesystem path rather than a nonexistent one.
      if (!fs.existsSync(path.join(REAL_CORE, 'package.json'))) return fail(`REAL_CORE not a package: ${REAL_CORE}`)
      return ok
    },
  },
  {
    label: 'provisionUserGlobals seeds productune.env with the expected keys',
    run: () => {
      const home = makeHome()
      provisionUserGlobals(REAL_CORE, home)
      const envPath = path.join(home, '.productune', 'productune.env')
      if (!fs.existsSync(envPath)) return fail('productune.env not written')
      const body = fs.readFileSync(envPath, 'utf8')
      if (!/^MY_PO_ENGINE=claude$/m.test(body)) return fail(`missing MY_PO_ENGINE=claude — got:\n${body}`)
      if (!body.includes(`PRODUCTUNE_REPO=${REAL_CORE}`)) return fail(`missing PRODUCTUNE_REPO=${REAL_CORE} — got:\n${body}`)
      if (!/^created_at=/m.test(body)) return fail(`missing created_at — got:\n${body}`)
      return ok
    },
  },
  {
    label: 'provisionUserGlobals installs ZERO legacy artifacts (no pdt-* symlinks / po-instructions / hooks)',
    run: () => {
      const home = makeHome()
      provisionUserGlobals(REAL_CORE, home)

      const agents = agentEntries(home)
      const pdt = agents.filter((f) => f.startsWith('pdt-'))
      if (pdt.length > 0) return fail(`pdt-* agent symlinks created: ${pdt.join(', ')}`)
      if (agents.length > 0) return fail(`agents symlinked into ~/.claude/agents: ${agents.join(', ')}`)

      if (fs.existsSync(path.join(home, '.productune', 'po-instructions.md'))) return fail('po-instructions.md copied into ~/.productune')
      if (fs.existsSync(path.join(home, '.claude', 'settings.json'))) return fail('~/.claude/settings.json written (legacy 18-hook set installed)')
      return ok
    },
  },
]

export function runCases(): { passed: number; failures: string[] } {
  const failures: string[] = []
  for (const c of CASES) {
    let res: { ok: boolean; detail?: string }
    try {
      res = c.run()
    } catch (e) {
      res = { ok: false, detail: String(e) }
    }
    if (!res.ok) failures.push(`${c.label}${res.detail ? `: ${res.detail}` : ''}`)
  }
  return { passed: CASES.length - failures.length, failures }
}

// ── vitest driver ─────────────────────────────────────────────────────────────

import { test, expect } from 'vitest'

test('T-311: legacy onboarding downgraded to read-only (real-core proof)', () => {
  const { passed, failures } = runCases()
  if (failures.length > 0) {
    throw new Error(`${failures.length} failure(s):\n  ${failures.join('\n  ')}`)
  }
  expect(passed).toBe(CASES.length)
})
