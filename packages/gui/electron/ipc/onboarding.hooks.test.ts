/**
 * installClaudeHooks — dual-mode hook install (T-289 / adapter A6).
 *
 * Proves the acceptance at the settings-merge layer, entirely against fixture
 * dirs (mkdtemp HOME + project dirs) — the developer's real ~/.claude / ~/.prdt
 * are NEVER touched:
 *   1. prdt project → EXACTLY the 3 prdt hooks (prdt-session-start /
 *      prdt-post-compact / prdt-post-dispatch) + statusline-prdt.sh are
 *      registered, pointing at the ~/.prdt mirror with the same matchers and
 *      quoted-command form prdt-install.sh §4/§6 writes; no legacy pdt hook
 *      leaks in.
 *   2. legacy project (and the projectDir-less default) → the T-PATCH-246
 *      18-hook set + statusline-productune.sh, byte-identical to before.
 *   3. prdt install is idempotent (re-run → no change), CLI-parity idempotent
 *      (a settings.json already written by prdt-install.sh stays identical),
 *      and preserves unrelated user hooks AND coexisting legacy pdt entries.
 *   4. ~/.prdt/hooks mirror absent (prdt-install.sh never ran) → skip, never
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

const CORE_DIR = '/bundle/core' // fake bundled coreDir — legacy branch path composition only

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

/** The exact hooks block prdt-install.sh §4 produces for a given prdt home. */
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
      installClaudeHooks(CORE_DIR, proj, home)
      const s = readSettings(home)

      const cmds = allCommands(s)
      // Every registered command is one of the 3 prdt hooks, quoted, under ~/.prdt/hooks.
      const mirrorPrefix = `"${path.join(home, '.prdt', 'hooks')}${path.sep}`
      const nonPrdt = cmds.filter(c => !(c.startsWith(mirrorPrefix) && PRDT_HOOKS.some(b => c.endsWith(`${b}"`))))
      if (nonPrdt.length > 0) return fail(`unexpected hooks registered: ${nonPrdt.join(', ')}`)
      for (const b of PRDT_HOOKS) {
        if (!cmds.some(c => c.includes(b))) return fail(`missing hook ${b}`)
      }
      // Registration shape mirrors prdt-install.sh §4 exactly.
      const want = cliHooksBlock(home)
      if (JSON.stringify(s.hooks) !== JSON.stringify(want)) {
        return fail(`hooks block deviates from prdt-install.sh shape: ${JSON.stringify(s.hooks)}`)
      }
      // Statusline = quoted ~/.prdt/bin/statusline-prdt.sh (prdt-install.sh §6 shape).
      const wantSl = `"${path.join(home, '.prdt', 'bin', 'statusline-prdt.sh')}"`
      if (s.statusLine?.command !== wantSl) return fail(`statusLine=${s.statusLine?.command}`)
      return ok
    },
  },
  {
    label: 'legacy project → T-PATCH-246 hook set + statusline-productune.sh (unchanged)',
    run: () => {
      const home = makeHome()
      const proj = makeProject('.productune')
      installClaudeHooks(CORE_DIR, proj, home)
      const s = readSettings(home)
      const cmds = allCommands(s)
      // Representative legacy hooks present, pointing at the bundled coreDir; no prdt leak.
      for (const b of ['pre-doctrine-guard.sh', 'session-start-doctrine.sh', 'prompt-gate-inject.sh', 'stop-verify.sh']) {
        if (!cmds.some(c => c === path.join(CORE_DIR, 'scripts', 'hooks', b))) return fail(`missing legacy hook ${b}`)
      }
      if (cmds.some(c => PRDT_HOOKS.some(b => c.includes(b)))) return fail('prdt hook leaked into legacy install')
      if (s.statusLine?.command !== path.join(CORE_DIR, 'scripts', 'statusline-productune.sh')) {
        return fail(`statusLine=${s.statusLine?.command}`)
      }
      return ok
    },
  },
  {
    label: 'projectDir omitted (current onboarding:complete call site) → legacy branch',
    run: () => {
      const home = makeHome()
      installClaudeHooks(CORE_DIR, undefined, home)
      const s = readSettings(home)
      if (s.statusLine?.command !== path.join(CORE_DIR, 'scripts', 'statusline-productune.sh')) {
        return fail(`statusLine=${s.statusLine?.command}`)
      }
      if (allCommands(s).some(c => PRDT_HOOKS.some(b => c.includes(b)))) return fail('prdt hooks on default branch')
      return ok
    },
  },
  {
    label: 'prdt install is idempotent — re-run changes nothing',
    run: () => {
      const home = makeHome()
      const proj = makeProject('.prdt')
      installClaudeHooks(CORE_DIR, proj, home)
      const once = fs.readFileSync(settingsPath(home), 'utf8')
      installClaudeHooks(CORE_DIR, proj, home)
      const twice = fs.readFileSync(settingsPath(home), 'utf8')
      if (once !== twice) return fail('second run changed settings.json')
      return ok
    },
  },
  {
    label: 'CLI parity — settings already written by prdt-install.sh stay identical',
    run: () => {
      const home = makeHome()
      const proj = makeProject('.prdt')
      // Seed settings.json exactly as prdt-install.sh --statusline leaves it.
      fs.mkdirSync(path.dirname(settingsPath(home)), { recursive: true })
      const cliWritten = {
        hooks: cliHooksBlock(home),
        statusLine: { type: 'command', command: `"${path.join(home, '.prdt', 'bin', 'statusline-prdt.sh')}"` },
      }
      fs.writeFileSync(settingsPath(home), JSON.stringify(cliWritten, null, 2))
      installClaudeHooks(CORE_DIR, proj, home)
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
      installClaudeHooks(CORE_DIR, proj, home)
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
      const home = makeHome(false) // no mirror — prdt-install.sh never ran
      const proj = makeProject('.prdt')
      installClaudeHooks(CORE_DIR, proj, home)
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
