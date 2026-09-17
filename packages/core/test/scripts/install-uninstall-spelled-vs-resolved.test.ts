/**
 * install.sh / uninstall.sh must agree on "is this registration ours" — T-645.
 *
 * install.sh's strip() (since T-640) matched the CURRENT run's RESOLVED
 * $PRDT_HOME/hooks/ path prefix; uninstall.sh matched the SPELLED
 * $PRDT_HOME/hooks/ prefix, never resolved. On a machine whose spelled
 * $PRDT_HOME (or $HOME) differs from its resolved one — a dotfiles-symlinked
 * ~/.prdt, or any HOME with a symlinked path component — that mismatch means:
 *
 *   - an UPGRADE never replaces an existing registration written under the
 *     other spelling, only adds a second one for the same hook (T-640's
 *     112-entry incident, reproduced here by a symlink instead of a stray
 *     `--plan` flag);
 *   - an UNINSTALL's strip matches nothing (wrong prefix), its own verify
 *     passes VACUOUSLY (nothing it looked for was ever registered under that
 *     prefix to begin with), and the mirror is deleted out from under every
 *     registration settings.json still holds.
 *
 * Fixed by keying "is this ours" on hook BASENAME (matched against the
 * manifest roster) everywhere, instead of on path-prefix text — a spelled and
 * a resolved registration of the same hook are now the same registration
 * regardless of which text carries it.
 *
 * Drives the REAL install.sh / uninstall.sh under a sandboxed HOME whose
 * `.prdt` is a symlink to elsewhere on disk — the named target population
 * (T-645's own ticket: "dotfiles 로 ~/.prdt 를 symlink 한 기기"). The
 * developer's real ~/.prdt / ~/.claude are never touched.
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync } from 'child_process'
import { test, expect, describe } from 'vitest'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const INSTALL_SH = path.join(CORE_ROOT, 'scripts', 'install.sh')
const UNINSTALL_SH = path.join(CORE_ROOT, 'scripts', 'uninstall.sh')
const MANIFEST_PATH = path.join(CORE_ROOT, 'scripts', 'hook-manifest.json')
const MANIFEST = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'))

function hasJq(): boolean {
  try { execFileSync('jq', ['--version'], { stdio: 'ignore' }); return true } catch { return false }
}

interface Sandbox {
  root: string
  home: string
  claudeDir: string
  settingsPath: string
  /** what $HOME/.prdt SPELLS — the literal string install.sh/uninstall.sh are handed */
  prdtHomeSpelled: string
  /** what $HOME/.prdt physically RESOLVES to — a different directory entirely */
  prdtHomeResolved: string
  env: NodeJS.ProcessEnv
}

/** HOME whose `.prdt` is a symlink to elsewhere on disk, PRDT_HOME left UNSET
 *  so every run's default ($HOME/.prdt) spells identically while resolving to
 *  the same physical target through the link — the exact shape a dotfiles
 *  repo produces. */
function makeSymlinkedSandbox(prefix: string): Sandbox {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)))
  const home = path.join(root, 'home')
  const claudeDir = path.join(root, 'claude')
  const prdtHomeResolved = path.join(root, 'actual-prdt') // never created directly — install.sh mkdir -p's it
  fs.mkdirSync(home, { recursive: true })
  fs.mkdirSync(claudeDir, { recursive: true })
  fs.symlinkSync(prdtHomeResolved, path.join(home, '.prdt'))
  const settingsPath = path.join(claudeDir, 'settings.json')
  fs.writeFileSync(settingsPath, JSON.stringify({}))
  // PRDT_HOME must be genuinely ABSENT, not set to the string "undefined" —
  // Node's execFileSync env handling does not filter `undefined` values on
  // every platform, so the key is deleted rather than set.
  const env: NodeJS.ProcessEnv = { ...process.env, HOME: home, CLAUDE_DIR: claudeDir }
  delete env.PRDT_HOME
  return {
    root, home, claudeDir, settingsPath,
    prdtHomeSpelled: path.join(home, '.prdt'),
    prdtHomeResolved,
    env,
  }
}

/** The settings.json `.hooks` block a v1.8-era install.sh would have written
 *  — every manifest registration, commands quoted under the given hooks-dir
 *  PREFIX (spelled or resolved; the shape is identical either way, only the
 *  prefix text differs — exactly install.sh §4's own jq output shape). */
function legacyHooksBlock(hooksDirWithTrailingSlash: string): any {
  const hooks: any = {}
  for (const reg of MANIFEST.registrations as any[]) {
    if (!hooks[reg.event]) hooks[reg.event] = []
    hooks[reg.event].push({
      ...(reg.matcher !== undefined ? { matcher: reg.matcher } : {}),
      hooks: reg.hooks.map((b: string) => ({ type: 'command', command: `"${hooksDirWithTrailingSlash}${b}"` })),
    })
  }
  return hooks
}

const EXPECTED_TOTAL = (MANIFEST.registrations as any[]).reduce((n, r) => n + r.hooks.length, 0)

/** Every hook command in settings.json whose BASENAME is one of ours,
 *  regardless of which path prefix carries it. */
function ourCommands(settingsPath: string): string[] {
  const s = JSON.parse(fs.readFileSync(settingsPath, 'utf8'))
  const basenames = new Set(MANIFEST.basenames as string[])
  const out: string[] = []
  for (const entries of Object.values(s.hooks ?? {})) {
    for (const entry of (entries as any[]) ?? []) {
      for (const hk of entry?.hooks ?? []) {
        if (typeof hk?.command !== 'string') continue
        const bare = hk.command.replace(/^"|"$/g, '')
        const base = bare.slice(bare.lastIndexOf('/') + 1)
        if (basenames.has(base)) out.push(bare)
      }
    }
  }
  return out
}

let roots: string[] = []
function cleanup() { for (const r of roots) fs.rmSync(r, { recursive: true, force: true }); roots = [] }

describe.skipIf(!hasJq())('install.sh / uninstall.sh vs a spelled≠resolved $HOME/.prdt (T-645)', () => {
  test('a pre-existing SPELLED-path registration is not doubled by an install run that resolves differently', () => {
    const sb = makeSymlinkedSandbox('t645-upgrade-')
    roots.push(sb.root)
    try {
      // simulate the state a v1.8-era install left behind: registered under
      // the SPELLED prefix, because pre-T-640 install.sh never resolved
      fs.writeFileSync(sb.settingsPath, JSON.stringify({
        hooks: legacyHooksBlock(sb.prdtHomeSpelled + '/hooks/'),
      }, null, 2))
      const before = ourCommands(sb.settingsPath)
      expect(before.length).toBe(EXPECTED_TOTAL) // sanity: the seed itself is not already doubled

      const r = execFileSync('bash', [INSTALL_SH], { env: sb.env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
      expect(r).toMatch(/prdt install done/)

      const after = ourCommands(sb.settingsPath)
      expect(after.length, `expected ${EXPECTED_TOTAL} prdt commands after an upgrade, got ${after.length}: ` +
        `${JSON.stringify(after, null, 2)}`).toBe(EXPECTED_TOTAL)
    } finally { cleanup() }
  }, 60_000)

  test('uninstall actually removes the registration and the PATH symlink, whatever spelling wrote them', () => {
    const sb = makeSymlinkedSandbox('t645-uninstall-')
    roots.push(sb.root)
    try {
      execFileSync('bash', [INSTALL_SH], { env: sb.env, stdio: 'ignore' })
      expect(ourCommands(sb.settingsPath).length).toBe(EXPECTED_TOTAL) // sanity: install actually registered

      const localBin = path.join(sb.home, '.local', 'bin', 'prdt')
      expect(fs.existsSync(localBin)).toBe(true) // sanity: install actually symlinked it

      const r = execFileSync('bash', [UNINSTALL_SH], { env: sb.env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
      expect(r).toMatch(/prdt uninstall done/)

      expect(ourCommands(sb.settingsPath), 'settings.json must carry 0 prdt commands after uninstall').toEqual([])
      expect(fs.existsSync(localBin), '~/.local/bin/prdt must not remain as a dangling symlink').toBe(false)
    } finally { cleanup() }
  }, 60_000)
})
