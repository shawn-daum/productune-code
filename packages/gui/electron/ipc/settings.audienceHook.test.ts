/**
 * settings.audienceHook.test.ts — T-420.
 *
 * v1.5 review #8: on a version-skewed machine (GUI newer than the ~/.prdt
 * mirror — install.sh hasn't re-run since T-326/T-413 added the audience
 * hook), Settings' audience toggle still writes ~/.prdt/audience-mode and
 * claims "applies next session" — but prdt-audience-inject.sh is never
 * actually registered, so the setting is silently inert. This pins
 * checkAudienceHookRegistered (electron/ipc/settings.ts), the read-only
 * detector the Settings audience section uses to decide whether to show the
 * "prdt update required" hint instead of the routine next-session note.
 *
 * Deliberately narrower than onboarding.ts's checkPrdtHooksStatus (which
 * requires ALL 6 prdt hooks): a missing UNRELATED hook (e.g. overrides-inject)
 * must not make the audience section lie about the audience hook specifically.
 *
 * Framework-free case-list + vitest driver, matching the established idiom
 * in onboarding.prdtHooksStatus.test.ts / onboarding.hooks.test.ts. All cases
 * run against mkdtemp fixture homes — the developer's real ~/.claude is
 * NEVER touched.
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { test, expect } from 'vitest'
import { checkAudienceHookRegistered } from './settings'

interface Case {
  readonly label: string
  readonly run: () => { ok: boolean; detail?: string }
}

const ok = { ok: true } as const
const fail = (detail: string) => ({ ok: false, detail })

function makeHome(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t420-home-'))
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
      if (checkAudienceHookRegistered(home) !== false) return fail('expected false')
      return ok
    },
  },
  {
    label: 'settings.json present but no hooks key → not registered',
    run: () => {
      const home = makeHome()
      fs.mkdirSync(path.dirname(settingsPath(home)), { recursive: true })
      fs.writeFileSync(settingsPath(home), JSON.stringify({}))
      if (checkAudienceHookRegistered(home) !== false) return fail('expected false')
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
        result = checkAudienceHookRegistered(home)
      } catch (e) {
        return fail(`threw: ${String(e)}`)
      }
      if (result !== false) return fail('expected false')
      return ok
    },
  },
  {
    label: 'version-skew case (T-420 core defect): other prdt hooks registered, audience-inject absent → false',
    run: () => {
      const home = makeHome()
      writeSettings(home, {
        SessionStart: [
          { matcher: 'startup|resume|clear', hooks: [hookEntry(home, 'prdt-session-start.sh')] },
          { matcher: 'compact', hooks: [hookEntry(home, 'prdt-post-compact.sh')] },
        ],
        SubagentStop: [{ matcher: '^prdt-', hooks: [hookEntry(home, 'prdt-post-dispatch.sh')] }],
        UserPromptSubmit: [{ hooks: [hookEntry(home, 'prdt-user-prompt.sh')] }],
      })
      if (checkAudienceHookRegistered(home) !== false) return fail('expected false — audience-inject not in this settings.json')
      return ok
    },
  },
  {
    label: 'audience-inject registered alongside session-start (real install.sh shape) → true',
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
        ],
      })
      if (checkAudienceHookRegistered(home) !== true) return fail('expected true')
      return ok
    },
  },
  {
    label: 'unrelated hook (e.g. overrides-inject) missing but audience-inject present → still true (narrower than the all-6 aggregate check)',
    run: () => {
      const home = makeHome()
      writeSettings(home, {
        SessionStart: [
          {
            matcher: 'startup|resume|clear',
            hooks: [hookEntry(home, 'prdt-session-start.sh'), hookEntry(home, 'prdt-audience-inject.sh')],
          },
        ],
      })
      if (checkAudienceHookRegistered(home) !== true) return fail('expected true — audience-inject alone is present')
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
        result = checkAudienceHookRegistered(home)
      } catch (e) {
        return fail(`threw: ${String(e)}`)
      }
      if (result !== false) return fail('expected false')
      return ok
    },
  },
]

test('T-420: checkAudienceHookRegistered cases pass', () => {
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
