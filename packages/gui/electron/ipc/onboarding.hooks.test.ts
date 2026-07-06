/**
 * installClaudeHooks — prdt-only hook install (T-289 A6; legacy → read-only, T-311).
 *
 * Proves the acceptance at the settings-merge layer, entirely against fixture
 * dirs (mkdtemp HOME + project dirs) — the developer's real ~/.claude / ~/.prdt
 * are NEVER touched:
 *   1. prdt project → EXACTLY the 3 prdt hooks (prdt-session-start /
 *      prdt-post-compact / prdt-post-dispatch) + statusline-prdt.sh are
 *      registered, pointing at the ~/.prdt mirror with the same matchers and
 *      quoted-command form install.sh §4/§6 writes; no legacy pdt hook
 *      leaks in.
 *   2. legacy project (and the projectDir-less default) → NO-OP: T-311 downgraded
 *      legacy dual-mode to read-only, so the GUI no longer installs the 18-hook
 *      legacy set. settings.json is not written at all for a legacy/omitted path.
 *   3. prdt install is idempotent (re-run → no change), CLI-parity idempotent
 *      (a settings.json already written by install.sh stays identical),
 *      and preserves unrelated user hooks AND coexisting legacy pdt entries.
 *   4. ~/.prdt/hooks mirror absent (install.sh never ran) → skip, never
 *      register hook commands that point at nonexistent scripts.
 *
 * Mirrors the framework-free case-list + vitest driver idiom of
 * costArchive.test.ts / project-paths.test.ts.
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { installClaudeHooks } from './onboarding'

interface Case {
  readonly label: string
  readonly run: () => { ok: boolean; detail?: string }
}

const ok = { ok: true } as const
const fail = (detail: string) => ({ ok: false, detail })

const PRDT_HOOKS = ['prdt-session-start.sh', 'prdt-post-compact.sh', 'prdt-post-dispatch.sh']

/** Throwaway HOME fixture. `withMirror` seeds ~/.prdt/hooks/* + bin/statusline. */
function makeHome(withMirror = true): string {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-a6-home-'))
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

/** Throwaway project dir with the given state dir ('.prdt' | '.productune'). */
function makeProject(stateDirName: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-a6-proj-'))
  fs.mkdirSync(path.join(root, stateDirName), { recursive: true })
  return root
}

function settingsPath(home: string): string {
  return path.join(home, '.claude', 'settings.json')
}

function readSettings(home: string): any {
  return JSON.parse(fs.readFileSync(settingsPath(home), 'utf8'))
}

/** Flatten every hook command string across all events. */
function allCommands(settings: any): string[] {
  const out: string[] = []
  for (const entries of Object.values(settings.hooks ?? {})) {
    for (const entry of entries as any[]) {
      for (const hk of entry?.hooks ?? []) {
        if (typeof hk?.command === 'string') out.push(hk.command)
      }
    }
  }
  return out
}

/** The exact hooks block install.sh §4 produces for a given prdt home. */
function cliHooksBlock(home: string): any {
  const h = (b: string) => ({ type: 'command', command: `"${path.join(home, '.prdt', 'hooks', b)}"` })
  return {
    SessionStart: [
      { matcher: 'startup|resume|clear', hooks: [h('prdt-session-start.sh')] },
      { matcher: 'compact', hooks: [h('prdt-post-compact.sh')] },
    ],
    SubagentStart: [{ matcher: '^prdt-', hooks: [h('prdt-session-start.sh')] }],
    SubagentStop: [{ matcher: '^prdt-', hooks: [h('prdt-post-dispatch.sh')] }],
    PostToolUse: [{ matcher: 'Agent', hooks: [h('prdt-post-dispatch.sh')] }],
  }
}

export const A6_CASES: readonly Case[] = [
  {
    label: 'prdt project → exactly the 3 prdt hooks (mirror paths) + statusline-prdt.sh',
    run: () => {
      const home = makeHome()
      const proj = makeProject('.prdt')
      installClaudeHooks(proj, home)
      const s = readSettings(home)

      const cmds = allCommands(s)
      // Every registered command is one of the 3 prdt hooks, quoted, under ~/.prdt/hooks.
      const mirrorPrefix = `"${path.join(home, '.prdt', 'hooks')}${path.sep}`
      const nonPrdt = cmds.filter(c => !(c.startsWith(mirrorPrefix) && PRDT_HOOKS.some(b => c.endsWith(`${b}"`))))
      if (nonPrdt.length > 0) return fail(`unexpected hooks registered: ${nonPrdt.join(', ')}`)
      for (const b of PRDT_HOOKS) {
        if (!cmds.some(c => c.includes(b))) return fail(`missing hook ${b}`)
      }
      // Registration shape mirrors install.sh §4 exactly.
      const want = cliHooksBlock(home)
      if (JSON.stringify(s.hooks) !== JSON.stringify(want)) {
        return fail(`hooks block deviates from install.sh shape: ${JSON.stringify(s.hooks)}`)
      }
      // Statusline = quoted ~/.prdt/bin/statusline-prdt.sh (install.sh §6 shape).
      const wantSl = `"${path.join(home, '.prdt', 'bin', 'statusline-prdt.sh')}"`
      if (s.statusLine?.command !== wantSl) return fail(`statusLine=${s.statusLine?.command}`)
      return ok
    },
  },
  {
    label: 'legacy project → NO-OP (read-only downgrade): settings.json not written, no hooks',
    run: () => {
      const home = makeHome()
      const proj = makeProject('.productune')
      installClaudeHooks(proj, home)
      if (fs.existsSync(settingsPath(home))) return fail('settings.json written for a legacy project (should be read-only)')
      return ok
    },
  },
  {
    label: 'projectDir omitted (current onboarding:complete call site) → NO-OP',
    run: () => {
      const home = makeHome()
      installClaudeHooks(undefined, home)
      if (fs.existsSync(settingsPath(home))) return fail('settings.json written for the projectDir-less default (should be read-only)')
      return ok
    },
  },
  {
    label: 'legacy no-op preserves a pre-existing settings.json untouched',
    run: () => {
      const home = makeHome()
      const proj = makeProject('.productune')
      fs.mkdirSync(path.dirname(settingsPath(home)), { recursive: true })
      const preexisting = JSON.stringify({ hooks: { SessionStart: [{ matcher: 'startup', hooks: [{ type: 'command', command: '/Users/me/custom-hook.sh' }] }] }, otherSetting: true }, null, 2)
      fs.writeFileSync(settingsPath(home), preexisting)
      installClaudeHooks(proj, home)
      if (fs.readFileSync(settingsPath(home), 'utf8') !== preexisting) return fail('legacy no-op mutated an existing settings.json')
      return ok
    },
  },
  {
    label: 'prdt install is idempotent — re-run changes nothing',
    run: () => {
      const home = makeHome()
      const proj = makeProject('.prdt')
      installClaudeHooks(proj, home)
      const once = fs.readFileSync(settingsPath(home), 'utf8')
      installClaudeHooks(proj, home)
      const twice = fs.readFileSync(settingsPath(home), 'utf8')
      if (once !== twice) return fail('second run changed settings.json')
      return ok
    },
  },
  {
    label: 'CLI parity — settings already written by install.sh stay identical',
    run: () => {
      const home = makeHome()
      const proj = makeProject('.prdt')
      // Seed settings.json exactly as install.sh --statusline leaves it.
      fs.mkdirSync(path.dirname(settingsPath(home)), { recursive: true })
      const cliWritten = {
        hooks: cliHooksBlock(home),
        statusLine: { type: 'command', command: `"${path.join(home, '.prdt', 'bin', 'statusline-prdt.sh')}"` },
      }
      fs.writeFileSync(settingsPath(home), JSON.stringify(cliWritten, null, 2))
      installClaudeHooks(proj, home)
      const after = readSettings(home)
      if (JSON.stringify(after) !== JSON.stringify(cliWritten)) {
        return fail(`GUI run altered CLI-written settings: ${JSON.stringify(after)}`)
      }
      return ok
    },
  },
  {
    label: 'prdt install preserves user hooks AND coexisting legacy pdt entries',
    run: () => {
      const home = makeHome()
      const proj = makeProject('.prdt')
      fs.mkdirSync(path.dirname(settingsPath(home)), { recursive: true })
      fs.writeFileSync(settingsPath(home), JSON.stringify({
        hooks: {
          SessionStart: [
            { matcher: 'startup', hooks: [{ type: 'command', command: '/Users/me/custom-hook.sh' }] },
            { matcher: 'startup|resume', hooks: [{ type: 'command', command: '/legacy/core/scripts/hooks/session-start-doctrine.sh' }] },
          ],
        },
        otherSetting: true,
      }))
      installClaudeHooks(proj, home)
      const s = readSettings(home)
      const cmds = allCommands(s)
      if (!cmds.includes('/Users/me/custom-hook.sh')) return fail('user hook dropped')
      if (!cmds.some(c => c.includes('session-start-doctrine.sh'))) return fail('coexisting legacy pdt hook dropped')
      if (s.otherSetting !== true) return fail('unrelated setting dropped')
      return ok
    },
  },
  {
    label: '~/.prdt/hooks mirror absent → skip (no broken hook registration)',
    run: () => {
      const home = makeHome(false) // no mirror — install.sh never ran
      const proj = makeProject('.prdt')
      installClaudeHooks(proj, home)
      if (fs.existsSync(settingsPath(home))) return fail('settings.json written despite missing mirror')
      return ok
    },
  },
]

export function runA6Cases(): { passed: number; failures: string[] } {
  const failures: string[] = []
  for (const c of A6_CASES) {
    let res: { ok: boolean; detail?: string }
    try {
      res = c.run()
    } catch (e) {
      res = { ok: false, detail: String(e) }
    }
    if (!res.ok) failures.push(`${c.label}${res.detail ? `: ${res.detail}` : ''}`)
  }
  return { passed: A6_CASES.length - failures.length, failures }
}

// ── vitest driver ─────────────────────────────────────────────────────────────

import { test, expect } from 'vitest'

test('adapter A6: installClaudeHooks dual-mode cases pass', () => {
  const { passed, failures } = runA6Cases()
  if (failures.length > 0) {
    throw new Error(`${failures.length} failure(s):\n  ${failures.join('\n  ')}`)
  }
  expect(passed).toBe(A6_CASES.length)
})
