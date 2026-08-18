/**
 * settings.planTierHook.test.ts — T-423.
 *
 * Same version-skew concern as T-420's audience check (settings.audienceHook.
 * test.ts), applied to the plan-tier hook: on a machine where install.sh
 * hasn't re-run since T-423 added prdt-plan-tier-inject.sh, Settings' plan-tier
 * choice still writes ~/.prdt/plan-tier and claims "applies next session" —
 * but the hook is never actually registered, so the PO never sees the stored
 * value and falls back to asking every session again, the exact friction T-423
 * exists to remove. This pins checkPlanTierHookRegistered (electron/ipc/
 * settings.ts), the read-only detector the Settings plan-tier section uses to
 * decide whether to show the "prdt update required" hint.
 *
 * Deliberately narrower than onboarding.ts's checkPrdtHooksStatus (which
 * requires ALL 7 prdt hooks): a missing UNRELATED hook (e.g. overrides-inject)
 * must not make the plan-tier section lie about the plan-tier hook specifically.
 *
 * Framework-free case-list + vitest driver, matching settings.audienceHook.
 * test.ts. All cases run against mkdtemp fixture homes — the developer's real
 * ~/.claude is NEVER touched.
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { test, expect } from 'vitest'
import { checkPlanTierHookRegistered } from './settings'

interface Case {
  readonly label: string
  readonly run: () => { ok: boolean; detail?: string }
}

const ok = { ok: true } as const
const fail = (detail: string) => ({ ok: false, detail })

function makeHome(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t423-home-'))
}

function settingsPath(home: string): string {
  return path.join(home, '.claude', 'settings.json')
}

function writeSettings(home: string, hooks: Record<string, unknown>): void {
  fs.mkdirSync(path.dirname(settingsPath(home)), { recursive: true })
  fs.writeFileSync(settingsPath(home), JSON.stringify({ hooks }))
}

function hookEntry(home: string, basename: string) {
  return { type: 'command', command: `"${path.join(home, '.prdt', 'hooks', basename)}"` }
}

export const CASES: readonly Case[] = [
  {
    label: 'no ~/.claude/settings.json at all → not registered',
    run: () => {
      const home = makeHome()
      if (checkPlanTierHookRegistered(home) !== false) return fail('expected false')
      return ok
    },
  },
  {
    label: 'settings.json present but no hooks key → not registered',
    run: () => {
      const home = makeHome()
      fs.mkdirSync(path.dirname(settingsPath(home)), { recursive: true })
      fs.writeFileSync(settingsPath(home), JSON.stringify({}))
      if (checkPlanTierHookRegistered(home) !== false) return fail('expected false')
      return ok
    },
  },
  {
    label: 'corrupt/unparsable settings.json → not registered (never throws)',
    run: () => {
      const home = makeHome()
      fs.mkdirSync(path.dirname(settingsPath(home)), { recursive: true })
      fs.writeFileSync(settingsPath(home), '{ not valid json')
      let result: boolean
      try {
        result = checkPlanTierHookRegistered(home)
      } catch (e) {
        return fail(`threw: ${String(e)}`)
      }
      if (result !== false) return fail('expected false')
      return ok
    },
  },
  {
    label: 'version-skew case: other prdt hooks registered, plan-tier-inject absent → false',
    run: () => {
      const home = makeHome()
      writeSettings(home, {
        SessionStart: [
          {
            matcher: 'startup|resume|clear',
            hooks: [
              hookEntry(home, 'prdt-session-start.sh'),
              hookEntry(home, 'prdt-audience-inject.sh'),
              hookEntry(home, 'prdt-overrides-inject.sh'),
            ],
          },
          { matcher: 'compact', hooks: [hookEntry(home, 'prdt-post-compact.sh')] },
        ],
        SubagentStop: [{ matcher: '^prdt-', hooks: [hookEntry(home, 'prdt-post-dispatch.sh')] }],
        UserPromptSubmit: [{ hooks: [hookEntry(home, 'prdt-user-prompt.sh')] }],
      })
      if (checkPlanTierHookRegistered(home) !== false) {
        return fail('expected false — plan-tier-inject not in this settings.json')
      }
      return ok
    },
  },
  {
    label: 'plan-tier-inject registered alongside session-start (real install.sh shape) → true',
    run: () => {
      const home = makeHome()
      writeSettings(home, {
        SessionStart: [
          {
            matcher: 'startup|resume|clear',
            hooks: [
              hookEntry(home, 'prdt-session-start.sh'),
              hookEntry(home, 'prdt-audience-inject.sh'),
              hookEntry(home, 'prdt-plan-tier-inject.sh'),
              hookEntry(home, 'prdt-overrides-inject.sh'),
            ],
          },
        ],
      })
      if (checkPlanTierHookRegistered(home) !== true) return fail('expected true')
      return ok
    },
  },
  {
    label: 'unrelated hook (e.g. overrides-inject) missing but plan-tier-inject present → still true (narrower than the all-7 aggregate check)',
    run: () => {
      const home = makeHome()
      writeSettings(home, {
        SessionStart: [
          {
            matcher: 'startup|resume|clear',
            hooks: [hookEntry(home, 'prdt-session-start.sh'), hookEntry(home, 'prdt-plan-tier-inject.sh')],
          },
        ],
      })
      if (checkPlanTierHookRegistered(home) !== true) {
        return fail('expected true — plan-tier-inject alone is present')
      }
      return ok
    },
  },
  {
    label: 'malformed hooks shape (non-array entries) → false, never throws',
    run: () => {
      const home = makeHome()
      fs.mkdirSync(path.dirname(settingsPath(home)), { recursive: true })
      fs.writeFileSync(settingsPath(home), JSON.stringify({ hooks: { SessionStart: 'not-an-array' } }))
      let result: boolean
      try {
        result = checkPlanTierHookRegistered(home)
      } catch (e) {
        return fail(`threw: ${String(e)}`)
      }
      if (result !== false) return fail('expected false')
      return ok
    },
  },
]

test('T-423: checkPlanTierHookRegistered cases pass', () => {
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
  if (failures.length > 0) {
    throw new Error(`${failures.length} failure(s):\n  ${failures.join('\n  ')}`)
  }
  expect(failures.length).toBe(0)
})
