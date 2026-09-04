/**
 * install.sh / uninstall.sh must fail LOUDLY — T-485 (Ship-entry security pass S5/S6).
 *
 * S5 repro: §4's settings merge was written `jq … > "$TMP" && mv "$TMP" "$SETTINGS"`.
 * `set -e` does NOT abort on a non-terminal failure inside an `&&` list (measured on
 * this machine's bash 3.2.57), so a missing / corrupt hook-manifest.json made jq fail,
 * the mv never ran, and the installer still printed "prdt install done." and exited 0
 * with ZERO hooks registered — the whole discipline injection silently gone on a
 * teammate's machine while the install reported success.
 *
 * S6 repro: uninstall.sh stripped prdt hook entries from four hardcoded event keys
 * (SessionStart / SubagentStart / SubagentStop / PostToolUse) while the manifest also
 * registers UserPromptSubmit — so after uninstall, settings.json still pointed at the
 * just-deleted ~/.prdt/hooks/prdt-user-prompt.sh and every prompt failed.
 *
 * Everything runs against a throwaway payload copy + sandboxed HOME / PRDT_HOME /
 * CLAUDE_DIR — the developer's real ~/.prdt / ~/.claude are never touched.
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync, spawnSync } from 'child_process'
import { test, expect, afterEach, afterAll } from 'vitest'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const MANIFEST_SRC = path.join(CORE_ROOT, 'scripts', 'hook-manifest.json')

function hasJq(): boolean {
  try { execFileSync('jq', ['--version'], { stdio: 'ignore' }); return true } catch { return false }
}

interface Sandbox {
  payload: string
  home: string
  prdtHome: string
  claudeDir: string
  settings: string
}

/** The installer payload (packages/core minus src/node_modules), pulled out of
 *  the repo ONCE per file — T-557. Four `cp -R` per case, five cases over, for
 *  a tree no case reads differently: only the CORRUPTION of it differs, and
 *  that stays per-case below, applied to this template's own private copy.
 *  Lazy rather than module-scope so a jq-less machine (every test here is
 *  `skipIf(!hasJq())`) still pays nothing. */
let payloadTemplate: string | undefined
function payloadSrc(): string {
  if (payloadTemplate === undefined) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'core-install-loud-payload-'))
    for (const entry of ['discipline', 'agents', 'scripts', 'doctrine.md']) {
      execFileSync('cp', ['-R', path.join(CORE_ROOT, entry), path.join(dir, entry)])
    }
    payloadTemplate = dir
  }
  return payloadTemplate
}

/** Roots created by makeSandbox() during the CURRENT test, swept in afterEach
 *  below — a plain array rather than one-sandbox-per-test bookkeeping so it
 *  needs no change if a future case ever calls makeSandbox() more than once.
 *  afterEach runs on a FAILING test exactly the same as a passing one, which
 *  is the property this whole file was missing: 516 leftover
 *  core-install-loud-* dirs (1.8 GB) were measured with zero cleanup on
 *  either path. */
let sandboxRoots: string[] = []

/** A sandbox with this case's OWN writable copy of the payload — every case
 *  corrupts it differently and runs its own installer against the result. */
function makeSandbox(seedSettings?: unknown): Sandbox {
  const sb = fs.mkdtempSync(path.join(os.tmpdir(), 'core-install-loud-'))
  sandboxRoots.push(sb)
  const payload = path.join(sb, 'payload')
  fs.cpSync(payloadSrc(), payload, { recursive: true })
  const home = path.join(sb, 'home')
  const prdtHome = path.join(sb, 'prdt')
  const claudeDir = path.join(sb, 'claude')
  for (const d of [home, prdtHome, claudeDir]) fs.mkdirSync(d, { recursive: true })
  const settings = path.join(claudeDir, 'settings.json')
  if (seedSettings !== undefined) fs.writeFileSync(settings, JSON.stringify(seedSettings, null, 2))
  return { payload, home, prdtHome, claudeDir, settings }
}

// Two cleanup levels, same shape as prdt-doctor-hook-mirror-drift.test.ts:
// afterEach sweeps every per-case sandbox (payload + home + prdt + claude all
// live under one mkdtemp root, so one rmSync per root is enough), afterAll
// removes the once-built payload template those sandboxes were copied from.
afterEach(() => {
  for (const root of sandboxRoots) fs.rmSync(root, { recursive: true, force: true })
  sandboxRoots = []
})

afterAll(() => {
  if (payloadTemplate !== undefined) fs.rmSync(payloadTemplate, { recursive: true, force: true })
})

function run(sb: Sandbox, script: string, args: string[] = []) {
  const r = spawnSync('bash', [path.join(sb.payload, 'scripts', script), ...args], {
    env: { ...process.env, HOME: sb.home, PRDT_HOME: sb.prdtHome, CLAUDE_DIR: sb.claudeDir },
    encoding: 'utf8',
  })
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' }
}

/** Every hook command string registered in settings.json, with its event + matcher. */
function registrations(settingsPath: string): { event: string; matcher: string; command: string }[] {
  if (!fs.existsSync(settingsPath)) return []
  const s = JSON.parse(fs.readFileSync(settingsPath, 'utf8'))
  const out: { event: string; matcher: string; command: string }[] = []
  for (const [event, entries] of Object.entries(s.hooks ?? {})) {
    for (const entry of (entries as any[]) ?? []) {
      for (const hk of entry?.hooks ?? []) {
        if (typeof hk?.command === 'string') {
          out.push({ event, matcher: entry?.matcher ?? '', command: hk.command })
        }
      }
    }
  }
  return out
}

const unquote = (c: string) => c.replace(/^"|"$/g, '')
const prdtRegistrations = (sb: Sandbox) =>
  registrations(sb.settings).filter(r => unquote(r.command).startsWith(sb.prdtHome + '/hooks/'))

/** The roster the manifest asks for, as tab-joined `event / matcher / command`
 *  keys — tab, because matchers themselves contain `|` (`startup|resume|clear`). */
function expectedRoster(prdtHome: string): string[] {
  const m = JSON.parse(fs.readFileSync(MANIFEST_SRC, 'utf8'))
  return m.registrations.flatMap((r: any) =>
    r.hooks.map((b: string) => `${r.event}\t${r.matcher ?? ''}\t${prdtHome}/hooks/${b}`),
  )
}

/** Same key shape, read back off the installed settings.json. */
const rosterKeys = (sb: Sandbox) =>
  prdtRegistrations(sb).map(r => `${r.event}\t${r.matcher}\t${unquote(r.command)}`).sort()

const OTHER_HOOK = '/Users/me/otherapp/hooks/my-guard.sh'
const SEED_WITH_FOREIGN = {
  hooks: { UserPromptSubmit: [{ hooks: [{ type: 'command', command: OTHER_HOOK }] }] },
  permissions: { allow: ['Bash(ls *)'] },
}

test.skipIf(!hasJq())('missing manifest → non-zero exit, names the manifest, registers nothing', () => {
  const sb = makeSandbox(SEED_WITH_FOREIGN)
  const before = fs.readFileSync(sb.settings, 'utf8')
  fs.rmSync(path.join(sb.payload, 'scripts', 'hook-manifest.json'))

  const r = run(sb, 'install.sh')

  expect(r.status, `expected non-zero exit, got ${r.status}\n${r.stdout}${r.stderr}`).not.toBe(0)
  expect(r.stdout).not.toMatch(/prdt install done/)
  // names WHAT is missing
  expect(r.stderr).toMatch(/hook-manifest\.json/)
  // no partial state: settings.json never claims a registration it did not make
  expect(prdtRegistrations(sb)).toEqual([])
  expect(fs.readFileSync(sb.settings, 'utf8')).toBe(before)
})

test.skipIf(!hasJq())('corrupt manifest → non-zero exit, settings.json untouched', () => {
  const sb = makeSandbox(SEED_WITH_FOREIGN)
  const before = fs.readFileSync(sb.settings, 'utf8')
  fs.writeFileSync(path.join(sb.payload, 'scripts', 'hook-manifest.json'), '{ "basenames": [ oops')

  const r = run(sb, 'install.sh')

  expect(r.status, `expected non-zero exit, got ${r.status}\n${r.stdout}${r.stderr}`).not.toBe(0)
  expect(r.stdout).not.toMatch(/prdt install done/)
  expect(r.stderr).toMatch(/hook-manifest\.json/)
  expect(prdtRegistrations(sb)).toEqual([])
  expect(fs.readFileSync(sb.settings, 'utf8')).toBe(before)
})

test.skipIf(!hasJq())('manifest naming a hook script that does not exist → fails, nothing registered', () => {
  const sb = makeSandbox(SEED_WITH_FOREIGN)
  const before = fs.readFileSync(sb.settings, 'utf8')
  const mPath = path.join(sb.payload, 'scripts', 'hook-manifest.json')
  const m = JSON.parse(fs.readFileSync(mPath, 'utf8'))
  m.basenames.push('prdt-ghost.sh')
  m.registrations.push({ event: 'SessionStart', matcher: 'startup', hooks: ['prdt-ghost.sh'] })
  fs.writeFileSync(mPath, JSON.stringify(m, null, 2))

  const r = run(sb, 'install.sh')

  expect(r.status, `expected non-zero exit, got ${r.status}\n${r.stdout}${r.stderr}`).not.toBe(0)
  expect(r.stderr).toMatch(/prdt-ghost\.sh/)
  expect(prdtRegistrations(sb)).toEqual([])
  expect(fs.readFileSync(sb.settings, 'utf8')).toBe(before)
})

test.skipIf(!hasJq())('fresh install and update reach the same roster, every command exists, exit 0', () => {
  const sb = makeSandbox(SEED_WITH_FOREIGN)

  const fresh = run(sb, 'install.sh')
  expect(fresh.status, fresh.stderr).toBe(0)
  const freshRoster = rosterKeys(sb)
  expect(freshRoster).toEqual(expectedRoster(sb.prdtHome).sort())
  for (const key of freshRoster) expect(fs.existsSync(key.split('\t')[2])).toBe(true)

  const update = run(sb, 'install.sh')
  expect(update.status, update.stderr).toBe(0)
  const updateRoster = rosterKeys(sb)
  expect(updateRoster).toEqual(freshRoster)

  // foreign hook preserved; no duplicate prdt entries after the update
  expect(registrations(sb.settings).map(r => r.command)).toContain(OTHER_HOOK)
  expect(new Set(updateRoster).size).toBe(updateRoster.length)
})

test.skipIf(!hasJq())('uninstall leaves no registration pointing at a removed script', () => {
  const sb = makeSandbox(SEED_WITH_FOREIGN)
  expect(run(sb, 'install.sh').status).toBe(0)
  expect(prdtRegistrations(sb).length).toBeGreaterThan(0)

  const r = run(sb, 'uninstall.sh')
  expect(r.status, r.stderr).toBe(0)

  // every surviving command must resolve to a file that still exists (the
  // prompt-triggering path: UserPromptSubmit was the one uninstall used to miss)
  const dangling = registrations(sb.settings).filter(reg => {
    const cmd = unquote(reg.command)
    return cmd.startsWith(sb.prdtHome) && !fs.existsSync(cmd)
  })
  expect(dangling, `dangling registrations: ${JSON.stringify(dangling)}`).toEqual([])
  expect(prdtRegistrations(sb)).toEqual([])
  expect(registrations(sb.settings).map(r => r.command)).toContain(OTHER_HOOK)
})
