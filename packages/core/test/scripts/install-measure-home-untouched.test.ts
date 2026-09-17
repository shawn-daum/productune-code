/**
 * Measuring injected bytes must never write the user's Claude config — T-640.
 *
 * OBSERVED BY RUNNING (PO, 2026-09-16): `PRDT_HOME=<scratch> bash install.sh --plan po`,
 * run twice, put 112 extra hook registrations into the REAL ~/.claude/settings.json
 * (every hook then fired three times) and repointed ~/.local/bin/prdt at the
 * scratch tree; deleting the scratch dirs killed the `prdt` command. Two things
 * conspired: install.sh had no `--plan` flag and silently ignored the unknown
 * argument, and §3/§4/§5 follow $HOME / $CLAUDE_DIR, not $PRDT_HOME — so a
 * "scratch" run mirrored into the scratch home and registered into the real one.
 *
 * Everything here runs against a throwaway payload copy + a fixture HOME. The
 * developer's real ~/.claude / ~/.local/bin / ~/.prdt are never touched; the
 * three locations the ticket names are content-hashed before and after every
 * run (an `ls -la | md5` snapshot gave a false positive — the `..` row carries
 * the parent's mtime — so hashes are over file contents + symlink targets).
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import crypto from 'crypto'
import { execFileSync, spawnSync } from 'child_process'
import { test, expect, describe, afterEach, afterAll } from 'vitest'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const MANIFEST_SRC = path.join(CORE_ROOT, 'scripts', 'hook-manifest.json')

function hasJq(): boolean {
  try { execFileSync('jq', ['--version'], { stdio: 'ignore' }); return true } catch { return false }
}

let payloadTemplate: string | undefined
function payloadSrc(): string {
  if (payloadTemplate === undefined) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'core-install-measure-payload-'))
    for (const entry of ['discipline', 'agents', 'scripts', 'doctrine.md']) {
      execFileSync('cp', ['-R', path.join(CORE_ROOT, entry), path.join(dir, entry)])
    }
    payloadTemplate = dir
  }
  return payloadTemplate
}

interface Fixture {
  root: string
  payload: string
  home: string        // the fixture $HOME — its .claude and .local/bin are "the user's"
  settings: string    // $HOME/.claude/settings.json
  agentsDir: string   // $HOME/.claude/agents
  localBin: string    // $HOME/.local/bin
  scratch: string     // a PRDT_HOME OUTSIDE the fixture home, like /private/tmp/prdt-injXX
}

let roots: string[] = []

const USER_SETTINGS = {
  hooks: { SessionStart: [{ hooks: [{ type: 'command', command: '/usr/local/bin/someone-elses-hook.sh' }] }] },
  statusLine: { type: 'command', command: '"/Users/someone/custom-statusline.sh"' },
}

/** A fixture home that LOOKS installed: a user settings.json with a foreign hook and
 *  a custom statusline, one agent stub, and ~/.local/bin/prdt pointing at the
 *  home's own ~/.prdt/bin/prdt — the state a real machine is in. */
function makeFixture(): Fixture {
  // realpath'd: install.sh resolves paths physically and writes the resolved ones, so
  // the fixture's own paths are canonical and every spelling variant below is one this
  // test asked for, not one os.tmpdir() smuggled in (/var → /private/var on macOS).
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'core-install-measure-')))
  roots.push(root)
  const payload = path.join(root, 'payload')
  fs.cpSync(payloadSrc(), payload, { recursive: true })
  const home = path.join(root, 'home')
  const claudeDir = path.join(home, '.claude')
  const agentsDir = path.join(claudeDir, 'agents')
  const localBin = path.join(home, '.local', 'bin')
  fs.mkdirSync(agentsDir, { recursive: true })
  fs.mkdirSync(localBin, { recursive: true })
  const settings = path.join(claudeDir, 'settings.json')
  fs.writeFileSync(settings, JSON.stringify(USER_SETTINGS, null, 2))
  fs.writeFileSync(path.join(agentsDir, 'my-own-agent.md'), '# mine\n')
  fs.symlinkSync(path.join(home, '.prdt', 'bin', 'prdt'), path.join(localBin, 'prdt'))
  const scratch = path.join(root, 'prdt-injXX')
  return { root, payload, home, settings, agentsDir, localBin, scratch }
}

afterEach(() => {
  for (const r of roots) fs.rmSync(r, { recursive: true, force: true })
  roots = []
})
afterAll(() => {
  if (payloadTemplate !== undefined) fs.rmSync(payloadTemplate, { recursive: true, force: true })
})

/** Content hash of a path: file bytes, or a symlink's target, or every entry of a
 *  directory (recursively, names included). Missing → 'absent'. */
function contentHash(p: string): string {
  const h = crypto.createHash('sha256')
  const walk = (q: string) => {
    let st: fs.Stats
    try { st = fs.lstatSync(q) } catch { h.update(`absent:${q}\n`); return }
    if (st.isSymbolicLink()) { h.update(`link:${q}->${fs.readlinkSync(q)}\n`); return }
    if (st.isDirectory()) {
      for (const name of fs.readdirSync(q).sort()) walk(path.join(q, name))
      return
    }
    h.update(`file:${q}\n`); h.update(fs.readFileSync(q))
  }
  walk(p)
  return h.digest('hex')
}

function snapshot(f: Fixture) {
  return { settings: contentHash(f.settings), agents: contentHash(f.agentsDir), localBin: contentHash(f.localBin) }
}

/** Run a payload script with HOME = the fixture home and ONLY the env the caller
 *  names on top — a run with `PRDT_HOME` set and `CLAUDE_DIR` unset is exactly
 *  the PO's command line. */
function run(f: Fixture, script: string, args: string[], env: Record<string, string>, cwd?: string) {
  const base: Record<string, string | undefined> = { ...process.env, HOME: f.home }
  delete base.PRDT_HOME; delete base.CLAUDE_DIR; delete base.PRDT_DISCIPLINE
  const r = spawnSync('bash', [path.join(f.payload, 'scripts', script), ...args], {
    env: { ...base, ...env } as NodeJS.ProcessEnv, cwd,
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000,
  })
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' }
}

function hookCommands(settingsPath: string): string[] {
  const s = JSON.parse(fs.readFileSync(settingsPath, 'utf8'))
  const out: string[] = []
  for (const entries of Object.values(s.hooks ?? {})) {
    for (const entry of (entries as any[]) ?? []) for (const hk of entry?.hooks ?? []) out.push(String(hk.command))
  }
  return out
}

describe.skipIf(!hasJq())('T-640 — measuring bytes leaves the user home untouched', () => {
  test('the command the PO ran (`install.sh --plan po` with a scratch PRDT_HOME) writes NOTHING to settings.json / agents / ~/.local/bin', () => {
    const f = makeFixture()
    const before = snapshot(f)
    const r = run(f, 'install.sh', ['--plan', 'po'], { PRDT_HOME: f.scratch })
    expect(snapshot(f)).toEqual(before)
    // and it is refused by name, not silently ignored
    expect(r.status).not.toBe(0)
    expect(r.stderr).toContain('--plan')
    expect(r.stderr).toContain('prdt-session-start.sh')
    // it also did not build a half mirror in the scratch home
    expect(fs.existsSync(path.join(f.scratch, 'hooks'))).toBe(false)
  })

  test('a scratch PRDT_HOME with the real CLAUDE_DIR is refused BEFORE any write, naming the three places it would have touched', () => {
    const f = makeFixture()
    const before = snapshot(f)
    const r = run(f, 'install.sh', [], { PRDT_HOME: f.scratch })
    expect(r.status).not.toBe(0)
    expect(snapshot(f)).toEqual(before)
    expect(fs.existsSync(f.scratch)).toBe(false)
    expect(r.stderr).toContain(f.settings)
    expect(r.stderr).toContain(f.agentsDir)
    expect(r.stderr).toContain(path.join(f.localBin, 'prdt'))
    expect(r.stderr).toContain('CLAUDE_DIR')
  })

  test('an unknown flag is refused, never ignored (a run that installs must have asked for exactly that)', () => {
    const f = makeFixture()
    const before = snapshot(f)
    const r = run(f, 'install.sh', ['--dry-run'], {})
    expect(r.status).not.toBe(0)
    expect(r.stderr).toContain('--dry-run')
    expect(snapshot(f)).toEqual(before)
  })

  test('the measurement path — hook `--plan <persona>` on a scratch copy, stdin closed — prints the plan and writes nothing', () => {
    const f = makeFixture()
    fs.mkdirSync(f.scratch, { recursive: true })
    fs.cpSync(path.join(f.payload, 'discipline'), path.join(f.scratch, 'discipline'), { recursive: true })
    fs.copyFileSync(path.join(f.payload, 'doctrine.md'), path.join(f.scratch, 'doctrine.md'))
    const before = snapshot(f)
    const scratchBefore = contentHash(f.scratch)
    for (const persona of ['po', 'designer', 'developer', 'qa']) {
      const r = run(f, path.join('hooks', 'prdt-session-start.sh'), ['--plan', persona], { PRDT_HOME: f.scratch })
      expect(r.status).toBe(0)
      const plan = JSON.parse(r.stdout)
      expect(plan.parts_needed).toBeGreaterThan(0)
      expect(plan.docs_bytes).toBeGreaterThan(0)
    }
    expect(snapshot(f)).toEqual(before)
    expect(contentHash(f.scratch)).toBe(scratchBefore)
    // no ~/.prdt appeared in the fixture home either
    expect(fs.existsSync(path.join(f.home, '.prdt'))).toBe(false)
  })

  test('a real install (no PRDT_HOME / CLAUDE_DIR override) still registers the whole roster, the agents and the symlink — and SAYS where it writes before it does', () => {
    const f = makeFixture()
    const r = run(f, 'install.sh', [], {})
    expect(r.status).toBe(0)
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_SRC, 'utf8'))
    const want = manifest.registrations.reduce((n: number, reg: any) => n + reg.hooks.length, 0)
    const prdtHome = path.join(f.home, '.prdt')
    const cmds = hookCommands(f.settings)
    expect(cmds.filter(c => c.replace(/^"|"$/g, '').startsWith(prdtHome + '/hooks/')).length).toBe(want)
    // the user's own hook + custom statusline survive
    expect(cmds).toContain('/usr/local/bin/someone-elses-hook.sh')
    expect(JSON.parse(fs.readFileSync(f.settings, 'utf8')).statusLine.command).toContain('custom-statusline')
    expect(fs.existsSync(path.join(f.agentsDir, 'prdt-po.md'))).toBe(true)
    expect(fs.existsSync(path.join(f.agentsDir, 'my-own-agent.md'))).toBe(true)
    expect(fs.readlinkSync(path.join(f.localBin, 'prdt'))).toBe(path.join(prdtHome, 'bin', 'prdt'))
    // the announcement precedes the first write
    const announce = r.stdout.indexOf(f.settings)
    expect(announce).toBeGreaterThanOrEqual(0)
    expect(announce).toBeLessThan(r.stdout.indexOf('1) Mirroring'))
    const announceLine = r.stdout.split('\n').find(l => l.includes(f.settings)) ?? ''
    expect(announceLine).toContain(path.join(f.localBin, 'prdt'))
    expect(announceLine).toContain(f.agentsDir)
    // idempotent: a second run adds no registrations
    const r2 = run(f, 'install.sh', [], {})
    expect(r2.status).toBe(0)
    expect(hookCommands(f.settings).length).toBe(cmds.length)
  })

  test('a fixture install (PRDT_HOME + CLAUDE_DIR both redirected) does NOT repoint $HOME/.local/bin/prdt at the relocated mirror', () => {
    const f = makeFixture()
    const claudeDir = path.join(f.root, 'claude')
    fs.mkdirSync(claudeDir, { recursive: true })
    const linkBefore = fs.readlinkSync(path.join(f.localBin, 'prdt'))
    const settingsBefore = contentHash(f.settings)
    const r = run(f, 'install.sh', [], { PRDT_HOME: f.scratch, CLAUDE_DIR: claudeDir })
    expect(r.status).toBe(0)
    expect(fs.readlinkSync(path.join(f.localBin, 'prdt'))).toBe(linkBefore)
    expect(r.stdout).toContain('left')   // said, not silent
    // the redirected Claude dir got the roster; the fixture home's did not
    expect(hookCommands(path.join(claudeDir, 'settings.json')).length).toBeGreaterThan(0)
    expect(contentHash(f.settings)).toBe(settingsBefore)
  })
})

/**
 * The guard is about PATHS, not spellings — T-640 round 2.
 *
 * OBSERVED BY RUNNING (QA, fixture homes): the first cut compared strings
 * (`[ "$CLAUDE_DIR" = "$HOME/.claude" ]`), so five spellings of the same directory
 * walked through it and each appended a full roster to the fixture user's
 * settings.json (57 → 113 → 169 → 225 → 281), while four spellings of the DEFAULT
 * tree were refused with "PRDT_HOME=/x/.prdt/ is not /x/.prdt".
 *
 * Every case below is a spelling. The first group must be REFUSED with the three
 * user locations byte-identical afterwards; the second must INSTALL, completely.
 */
type Run = ReturnType<typeof run>

function rosterSize(): number {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_SRC, 'utf8'))
  return manifest.registrations.reduce((n: number, reg: any) => n + reg.hooks.length, 0)
}
const unquote = (c: string) => c.replace(/^"|"$/g, '')

/** Refused before the first write: exit non-zero, the three locations unchanged, and
 *  not even a half-built mirror left in the scratch dir. */
function expectRefusedNothingWritten(f: Fixture, r: Run, before: ReturnType<typeof snapshot>) {
  expect(r.status, `expected a refusal, got exit 0\n${r.stdout}`).not.toBe(0)
  expect(snapshot(f)).toEqual(before)
  expect(fs.existsSync(f.scratch)).toBe(false)
  expect(r.stderr).toContain('refused, nothing written')
}

/** A complete default install into the fixture home: the whole roster registered under
 *  <home>/.prdt/hooks/, the agents, the PATH symlink, and the user's own hook and
 *  statusline still standing. */
function expectInstalledInFixtureHome(f: Fixture, r: Run) {
  expect(r.status, `expected an install, got exit ${r.status}\n${r.stderr}`).toBe(0)
  const prdtHome = path.join(f.home, '.prdt')
  const cmds = hookCommands(f.settings)
  expect(cmds.filter(c => unquote(c).startsWith(prdtHome + '/hooks/')).length).toBe(rosterSize())
  expect(cmds.some(c => c.includes('//hooks/'))).toBe(false)
  expect(cmds).toContain('/usr/local/bin/someone-elses-hook.sh')
  expect(JSON.parse(fs.readFileSync(f.settings, 'utf8')).statusLine.command).toContain('custom-statusline')
  expect(fs.existsSync(path.join(f.agentsDir, 'prdt-po.md'))).toBe(true)
  expect(fs.existsSync(path.join(f.agentsDir, 'my-own-agent.md'))).toBe(true)
  expect(fs.readlinkSync(path.join(f.localBin, 'prdt'))).toBe(path.join(prdtHome, 'bin', 'prdt'))
  expect(fs.existsSync(path.join(prdtHome, 'hooks', 'prdt-session-start.sh'))).toBe(true)
}

describe.skipIf(!hasJq())('T-640 — the guard compares paths, not spellings', () => {
  describe('a scratch mirror is refused however the user config is spelled', () => {
    test('trailing slash: CLAUDE_DIR=$HOME/.claude/', () => {
      const f = makeFixture()
      const before = snapshot(f)
      const r = run(f, 'install.sh', [], { PRDT_HOME: f.scratch, CLAUDE_DIR: path.join(f.home, '.claude') + '/' })
      expectRefusedNothingWritten(f, r, before)
    })

    test('dot suffix: CLAUDE_DIR=$HOME/.claude/.', () => {
      const f = makeFixture()
      const before = snapshot(f)
      // concatenated, not path.join'd — path.join normalizes `/.` away, which would
      // hand install.sh the canonical spelling and test nothing.
      const r = run(f, 'install.sh', [], { PRDT_HOME: f.scratch, CLAUDE_DIR: path.join(f.home, '.claude') + '/.' })
      expectRefusedNothingWritten(f, r, before)
    })

    test('symlink: CLAUDE_DIR is an alias pointing at $HOME/.claude', () => {
      const f = makeFixture()
      const alias = path.join(f.root, 'claude-alias')
      fs.symlinkSync(path.join(f.home, '.claude'), alias)
      const before = snapshot(f)
      const r = run(f, 'install.sh', [], { PRDT_HOME: f.scratch, CLAUDE_DIR: alias })
      expectRefusedNothingWritten(f, r, before)
    })

    test('relative: CLAUDE_DIR=.claude with the working directory at $HOME', () => {
      const f = makeFixture()
      const before = snapshot(f)
      const r = run(f, 'install.sh', [], { PRDT_HOME: f.scratch, CLAUDE_DIR: '.claude' }, f.home)
      expectRefusedNothingWritten(f, r, before)
    })

    test('$HOME moved elsewhere, CLAUDE_DIR naming the user config explicitly', () => {
      const f = makeFixture()
      const otherHome = path.join(f.root, 'somewhere-else')
      fs.mkdirSync(otherHome, { recursive: true })
      const before = snapshot(f)
      // $HOME no longer points at the config being written, so a guard keyed on
      // "$CLAUDE_DIR = $HOME/.claude" cannot see this one at all.
      const r = run(f, 'install.sh', [], {
        HOME: otherHome, PRDT_HOME: f.scratch, CLAUDE_DIR: path.join(f.home, '.claude'),
      })
      expectRefusedNothingWritten(f, r, before)
    })

    test('a $HOME/.claude symlinked into a dotfiles dir is still this HOME\'s config', () => {
      // resolution alone would LOSE this one: the resolved config is <root>/dotfiles-claude,
      // whose name is not `.claude`, so only the second arm (it is what $HOME loads) holds.
      const f = makeFixture()
      const claudeLink = path.join(f.home, '.claude')
      const dotfiles = path.join(f.root, 'dotfiles-claude')
      fs.renameSync(claudeLink, dotfiles)
      fs.symlinkSync(dotfiles, claudeLink)
      const before = snapshot(f)
      const r = run(f, 'install.sh', [], { PRDT_HOME: f.scratch })
      expectRefusedNothingWritten(f, r, before)
    })

    test('a scratch mirror INSIDE the user home is refused too', () => {
      const f = makeFixture()
      const before = snapshot(f)
      const r = run(f, 'install.sh', [], { PRDT_HOME: path.join(f.home, 'prdt-scratch') })
      expect(r.status).not.toBe(0)
      expect(snapshot(f)).toEqual(before)
      expect(r.stderr).toContain('refused, nothing written')
      expect(fs.existsSync(path.join(f.home, 'prdt-scratch'))).toBe(false)
    })
  })

  describe('the default tree installs however it is spelled', () => {
    test('PRDT_HOME=$HOME/.prdt/ (trailing slash)', () => {
      const f = makeFixture()
      const r = run(f, 'install.sh', [], { PRDT_HOME: path.join(f.home, '.prdt') + '/' })
      expectInstalledInFixtureHome(f, r)
    })

    test('PRDT_HOME=$HOME//.prdt (doubled separator)', () => {
      const f = makeFixture()
      const r = run(f, 'install.sh', [], { PRDT_HOME: f.home + '//.prdt' })
      expectInstalledInFixtureHome(f, r)
    })

    test('PRDT_HOME is a symlink alias for $HOME/.prdt', () => {
      const f = makeFixture()
      const alias = path.join(f.root, 'prdt-alias')
      fs.symlinkSync(path.join(f.home, '.prdt'), alias)   // target not created yet — a fresh install
      const r = run(f, 'install.sh', [], { PRDT_HOME: alias })
      expectInstalledInFixtureHome(f, r)
    })

    test('$HOME itself carries a trailing slash', () => {
      const f = makeFixture()
      const r = run(f, 'install.sh', [], { HOME: f.home + '/' })
      expectInstalledInFixtureHome(f, r)
    })

    test('a second run spelled differently updates the roster instead of doubling it', () => {
      const f = makeFixture()
      expectInstalledInFixtureHome(f, run(f, 'install.sh', [], {}))
      const after1 = hookCommands(f.settings)
      const r2 = run(f, 'install.sh', [], { PRDT_HOME: path.join(f.home, '.prdt') + '/' })
      expectInstalledInFixtureHome(f, r2)
      expect(hookCommands(f.settings).length).toBe(after1.length)
      expect(hookCommands(f.settings).sort()).toEqual(after1.sort())
    })
  })
})
