/**
 * checkPrdtHooksStatus / installPrdtHooksForProject (T-305).
 *
 * A6 (T-289) built installClaudeHooks's prdt branch, but no renderer call site
 * ever reached it — the global onboarding wizard runs before a project is
 * picked. T-305 adds the missing detection + on-demand install surface so a
 * prdt project open can offer to install the hooks. This proves, entirely
 * against fixture dirs (mkdtemp HOME + project dirs — the developer's real
 * ~/.claude / ~/.prdt are NEVER touched):
 *
 *   1. mirror absent → { mirrorPresent:false, installed:false }, no settings.json write.
 *   2. mirror present, no settings.json yet → { mirrorPresent:true, installed:false }.
 *   3. mirror present, settings.json has an UNRELATED/partial hook set → installed:false
 *      (all 3 prdt hooks must be present, not just some).
 *   4. mirror present, settings.json already carries all 3 prdt hooks (CLI-written
 *      or a prior GUI install) → installed:true.
 *   5. installPrdtHooksForProject on a prdt project with the mirror present installs
 *      the hooks and checkPrdtHooksStatus flips to installed:true afterward.
 *   6. installPrdtHooksForProject with the mirror absent silently no-ops (A6's own
 *      warn-skip) — returns ok:true/installed:false, never writes settings.json.
 *   7. installPrdtHooksForProject called against a LEGACY (.productune) projectDir
 *      takes the legacy branch — no prdt hooks leak in.
 *
 * Mirrors the framework-free case-list + vitest driver idiom of onboarding.hooks.test.ts.
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { checkPrdtHooksStatus, installPrdtHooksForProject } from './onboarding'

interface Case {
  readonly label: string
  readonly run: () => { ok: boolean; detail?: string }
}

const ok = { ok: true } as const
const fail = (detail: string) => ({ ok: false, detail })

const PRDT_HOOKS = ['prdt-session-start.sh', 'prdt-post-compact.sh', 'prdt-post-dispatch.sh']
const CORE_DIR = '/bundle/core' // fake bundled coreDir — only the legacy branch composes paths from it

function makeHome(withMirror: boolean): string {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t305-home-'))
  if (withMirror) {
    const hooksDir = path.join(home, '.prdt', 'hooks')
    fs.mkdirSync(hooksDir, { recursive: true })
    for (const b of PRDT_HOOKS) fs.writeFileSync(path.join(hooksDir, b), '#!/bin/bash\n')
    const binDir = path.join(home, '.prdt', 'bin')
    fs.mkdirSync(binDir, { recursive: true })
    fs.writeFileSync(path.join(binDir, 'statusline-prdt.sh'), '#!/bin/bash\n')
  }
  return home
}

function makeProject(stateDirName: '.prdt' | '.productune'): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t305-proj-'))
  fs.mkdirSync(path.join(root, stateDirName), { recursive: true })
  return root
}

function settingsPath(home: string): string {
  return path.join(home, '.claude', 'settings.json')
}

export const CASES: readonly Case[] = [
  {
    label: 'mirror absent → not installed, not writable-yet; no settings.json created',
    run: () => {
      const home = makeHome(false)
      const status = checkPrdtHooksStatus(home)
      if (status.mirrorPresent !== false) return fail(`mirrorPresent=${status.mirrorPresent}`)
      if (status.installed !== false) return fail(`installed=${status.installed}`)
      if (fs.existsSync(settingsPath(home))) return fail('settings.json created by a read-only check')
      return ok
    },
  },
  {
    label: 'mirror present, settings.json absent → mirrorPresent:true, installed:false',
    run: () => {
      const home = makeHome(true)
      const status = checkPrdtHooksStatus(home)
      if (status.mirrorPresent !== true) return fail(`mirrorPresent=${status.mirrorPresent}`)
      if (status.installed !== false) return fail(`installed=${status.installed}`)
      return ok
    },
  },
  {
    label: 'mirror present, settings.json has only a partial prdt hook set → installed:false',
    run: () => {
      const home = makeHome(true)
      fs.mkdirSync(path.dirname(settingsPath(home)), { recursive: true })
      fs.writeFileSync(settingsPath(home), JSON.stringify({
        hooks: {
          SessionStart: [{ matcher: 'startup|resume|clear', hooks: [{ type: 'command', command: `"${path.join(home, '.prdt', 'hooks', 'prdt-session-start.sh')}"` }] }],
        },
      }))
      const status = checkPrdtHooksStatus(home)
      if (status.installed !== false) return fail(`installed=${status.installed} (only 1/3 hooks present)`)
      return ok
    },
  },
  {
    label: 'mirror present, settings.json already has all 3 prdt hooks → installed:true',
    run: () => {
      const home = makeHome(true)
      const h = (b: string) => ({ type: 'command', command: `"${path.join(home, '.prdt', 'hooks', b)}"` })
      fs.mkdirSync(path.dirname(settingsPath(home)), { recursive: true })
      fs.writeFileSync(settingsPath(home), JSON.stringify({
        hooks: {
          SessionStart: [
            { matcher: 'startup|resume|clear', hooks: [h('prdt-session-start.sh')] },
            { matcher: 'compact', hooks: [h('prdt-post-compact.sh')] },
          ],
          SubagentStop: [{ matcher: '^prdt-', hooks: [h('prdt-post-dispatch.sh')] }],
        },
      }))
      const status = checkPrdtHooksStatus(home)
      if (status.installed !== true) return fail(`installed=${status.installed}`)
      return ok
    },
  },
  {
    label: 'installPrdtHooksForProject (mirror present, prdt project) installs → status flips to installed:true',
    run: () => {
      const home = makeHome(true)
      const proj = makeProject('.prdt')
      const before = checkPrdtHooksStatus(home)
      if (before.installed !== false) return fail('precondition: already installed')
      const result = installPrdtHooksForProject(CORE_DIR, proj, home)
      if (result.ok !== true || result.installed !== true) return fail(`result=${JSON.stringify(result)}`)
      const after = checkPrdtHooksStatus(home)
      if (after.installed !== true) return fail('checkPrdtHooksStatus did not reflect the install')
      return ok
    },
  },
  {
    label: 'installPrdtHooksForProject (mirror absent) silently no-ops — no settings.json write',
    run: () => {
      const home = makeHome(false)
      const proj = makeProject('.prdt')
      const result = installPrdtHooksForProject(CORE_DIR, proj, home)
      if (result.ok !== true || result.installed !== false) return fail(`result=${JSON.stringify(result)}`)
      if (fs.existsSync(settingsPath(home))) return fail('settings.json written despite missing mirror')
      return ok
    },
  },
  {
    label: 'installPrdtHooksForProject against a legacy (.productune) projectDir takes the legacy branch — no prdt leak',
    run: () => {
      const home = makeHome(true)
      const proj = makeProject('.productune')
      const result = installPrdtHooksForProject(CORE_DIR, proj, home)
      if (result.ok !== true) return fail(`result=${JSON.stringify(result)}`)
      // Legacy branch wrote legacy hooks (pointing at CORE_DIR), not the prdt set.
      const status = checkPrdtHooksStatus(home)
      if (status.installed !== false) return fail('prdt hooks registered for a legacy project')
      if (!fs.existsSync(settingsPath(home))) return fail('legacy branch did not write settings.json')
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

test('T-305: checkPrdtHooksStatus / installPrdtHooksForProject cases pass', () => {
  const { passed, failures } = runCases()
  if (failures.length > 0) {
    throw new Error(`${failures.length} failure(s):\n  ${failures.join('\n  ')}`)
  }
  expect(passed).toBe(CASES.length)
})
