/**
 * install.sh legacy pdt-* cleanup — C3a (T-316).
 *
 * Repro: a machine that ran the pre-T-293 installer carries settings.json hook
 * entries whose commands point at `packages/core/scripts/hooks/<basename>.sh`
 * scripts deleted in T-293/T-311, plus a legacy `statusline-productune.sh`
 * statusLine. Pulling the new version + running install.sh must strip those
 * (they fail command-not-found every session) WITHOUT touching other apps' /
 * users' own hooks, and must still register the 3 prdt hooks.
 *
 * Drives the REAL install.sh end-to-end under a fully sandboxed HOME / PRDT_HOME
 * / CLAUDE_DIR (the developer's real ~/.claude / ~/.prdt are never touched), then
 * asserts on the resulting settings.json. Skips cleanly if `jq` is unavailable.
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync } from 'child_process'
import { test, expect } from 'vitest'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const INSTALL_SH = path.join(CORE_ROOT, 'scripts', 'install.sh')

function hasJq(): boolean {
  try { execFileSync('jq', ['--version'], { stdio: 'ignore' }); return true } catch { return false }
}

const LEGACY_SETTINGS = {
  hooks: {
    PreToolUse: [
      { matcher: 'Write|Edit|Bash', hooks: [{ type: 'command', command: '/old/repo/packages/core/scripts/hooks/pre-doctrine-guard.sh' }] },
      { matcher: 'Bash', hooks: [{ type: 'command', command: '/Users/me/otherapp/hooks/my-guard.sh' }] },
    ],
    PostToolUse: [
      { matcher: 'Bash', hooks: [{ type: 'command', command: '/old/repo/packages/core/scripts/hooks/post-bash-strip-cost.sh' }] },
    ],
    Stop: [
      { matcher: 'pdt-developer', hooks: [{ type: 'command', command: '/old/repo/packages/core/scripts/hooks/stop-verify.sh' }] },
    ],
    SessionStart: [
      { matcher: 'startup|resume', hooks: [{ type: 'command', command: '/old/repo/packages/core/scripts/hooks/session-start-doctrine.sh' }] },
      { matcher: 'startup', hooks: [{ type: 'command', command: '/Users/me/mysession.sh' }] },
    ],
  },
  statusLine: { type: 'command', command: '/old/repo/packages/core/scripts/statusline-productune.sh' },
  permissions: { allow: ['Bash(ls *)'] },
}

/** Run install.sh in a throwaway sandbox seeded with `settings`; return the result. */
function runInstall(settings: unknown): any {
  const sb = fs.mkdtempSync(path.join(os.tmpdir(), 'core-install-c3a-'))
  const home = path.join(sb, 'home')
  const prdtHome = path.join(sb, 'prdt')
  const claudeDir = path.join(sb, 'claude')
  for (const d of [home, prdtHome, claudeDir]) fs.mkdirSync(d, { recursive: true })
  fs.writeFileSync(path.join(claudeDir, 'settings.json'), JSON.stringify(settings, null, 2))
  execFileSync('bash', [INSTALL_SH], {
    env: { ...process.env, HOME: home, PRDT_HOME: prdtHome, CLAUDE_DIR: claudeDir },
    stdio: 'ignore',
  })
  return JSON.parse(fs.readFileSync(path.join(claudeDir, 'settings.json'), 'utf8'))
}

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

const LEGACY_BASENAMES = [
  'pre-doctrine-guard.sh', 'post-bash-strip-cost.sh', 'stop-verify.sh', 'session-start-doctrine.sh',
]

test.skipIf(!hasJq())('install.sh strips deleted legacy pdt-* hooks + legacy statusline, preserves foreign hooks + registers prdt', () => {
  const s = runInstall(LEGACY_SETTINGS)
  const cmds = allCommands(s)

  // 1. No deleted legacy hook command survives.
  for (const b of LEGACY_BASENAMES) {
    expect(cmds.some((c) => c.includes(b)), `legacy hook ${b} should be stripped`).toBe(false)
  }
  // 2. Legacy statusline stripped, then the prdt statusline registers in its place
  //    (T-330: default-on when nothing was registered — no --statusline needed).
  expect(JSON.stringify(s.statusLine ?? '')).not.toContain('statusline-productune.sh')
  expect(s.statusLine?.command).toContain('statusline-prdt.sh')

  // 3. Other apps' / users' own hooks are preserved.
  expect(cmds).toContain('/Users/me/otherapp/hooks/my-guard.sh')
  expect(cmds).toContain('/Users/me/mysession.sh')

  // 4. The 3 prdt hooks are registered (idempotent go-forward path).
  for (const b of ['prdt-session-start.sh', 'prdt-post-compact.sh', 'prdt-post-dispatch.sh']) {
    expect(cmds.some((c) => c.includes(b)), `prdt hook ${b} should be registered`).toBe(true)
  }

  // 5. Unrelated settings untouched.
  expect(s.permissions?.allow).toEqual(['Bash(ls *)'])

  // 6. A legacy-only event array left empty after cleanup is dropped (no dangling key).
  expect(s.hooks?.Stop).toBeUndefined()
})

test.skipIf(!hasJq())('install.sh preserves a user custom statusLine (only the repo-distributed one is stripped)', () => {
  const withCustomStatusline = {
    ...LEGACY_SETTINGS,
    statusLine: { type: 'command', command: '/Users/me/mystatusline.sh' },
  }
  const s = runInstall(withCustomStatusline)
  expect(s.statusLine?.command).toBe('/Users/me/mystatusline.sh')
})
