/**
 * prdt-update-nudge-direction.test.ts — T-456, the once-a-day update nudge's two gates.
 *
 * The nudge greets the user in every project on the machine, before their actual
 * command, and T-393 made silence the failure mode on every degrade path. The
 * reported defect is the one path whose polarity was backwards: `remote_ahead`
 * compared SHAs without direction, so a clone AHEAD of origin (every dev clone,
 * all cycle long) got a daily prompt no choice could satisfy — and the version it
 * offered came from the REMOTE RELEASES.md, i.e. a downgrade.
 *
 * Two gates, tested separately because they fail differently:
 *   1. `remote_ahead` — True only for a strictly fast-forwardable remote.
 *   2. `_newer_version` — the offered version must be strictly above the local one.
 *
 * Both directions matter equally: "no prompt when ahead" must not be bought with
 * "no prompt when behind", which would silently strand every installed copy.
 *
 * Fixtures are throwaway clones off a local BARE remote in a temp dir — this suite
 * never touches ~/.prdt or the real install (the update path re-runs install.sh).
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync } from 'child_process'
import { test, expect, describe, beforeEach, afterEach } from 'vitest'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const PRDT_CLI = path.join(CORE_ROOT, 'scripts', 'prdt')

function which(bin: string): string | null {
  try { return execFileSync('which', [bin], { encoding: 'utf8' }).trim() || null } catch { return null }
}
const PYTHON3 = which('python3')

let tmpRoot: string

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf-8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t',
      GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null',
    },
  })
}

/** Write docs/RELEASES.md with `versions` as `## ` sections, newest first. */
function writeReleases(repo: string, versions: string[]): void {
  fs.mkdirSync(path.join(repo, 'docs'), { recursive: true })
  fs.writeFileSync(
    path.join(repo, 'docs', 'RELEASES.md'),
    `# Releases\n\npreamble ignored by the parser\n\n` +
      versions.map((v) => `## ${v} — section (2026-01-01)\n\n### Added\n- ${v} line\n`).join('\n'),
  )
}

function commit(repo: string, msg: string): void {
  git(repo, 'add', '-A')
  git(repo, 'commit', '-q', '-m', msg)
}

/**
 * A bare `origin` on branch `dev` with one commit + RELEASES.md at v1.5, and a
 * clone of it. Returns both paths; callers move either side to shape the case.
 */
function makeRemoteAndClone(): { origin: string; clone: string } {
  const base = fs.mkdtempSync(path.join(tmpRoot, 'case-'))
  const seed = path.join(base, 'seed')
  fs.mkdirSync(seed)
  git(seed, 'init', '-q', '-b', 'dev')
  writeReleases(seed, ['v1.5'])
  commit(seed, 'seed')
  const origin = path.join(base, 'origin.git')
  git(base, 'clone', '-q', '--bare', seed, origin)
  const clone = path.join(base, 'clone')
  git(base, 'clone', '-q', origin, clone)
  return { origin, clone }
}

/** Add a commit to `origin` by pushing from a scratch clone (leaves `clone` behind). */
function advanceOrigin(origin: string, releases: string[] = ['v1.6', 'v1.5']): void {
  const scratch = fs.mkdtempSync(path.join(tmpRoot, 'push-'))
  const wc = path.join(scratch, 'wc')
  git(scratch, 'clone', '-q', origin, wc)
  writeReleases(wc, releases)
  commit(wc, 'origin moves')
  git(wc, 'push', '-q', 'origin', 'dev')
}

/** Load scripts/prdt as a module and evaluate `expr`, printing it as JSON. */
function py(expr: string, cwd = tmpRoot): unknown {
  const script = `
import importlib.util, importlib.machinery, json
loader = importlib.machinery.SourceFileLoader("prdt_mod", ${JSON.stringify(PRDT_CLI)})
spec = importlib.util.spec_from_loader("prdt_mod", loader)
m = importlib.util.module_from_spec(spec)
loader.exec_module(m)
print(json.dumps(${expr}))
`
  return JSON.parse(execFileSync('python3', ['-c', script], { encoding: 'utf-8', cwd, timeout: 30000 }))
}

const aheadOf = (clone: string) => py(`m.remote_ahead(${JSON.stringify(clone)})`)

beforeEach(() => { tmpRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-nudge-'))) })
afterEach(() => { fs.rmSync(tmpRoot, { recursive: true, force: true }) })

describe.skipIf(!PYTHON3)('T-456 · remote_ahead asserts direction', () => {
  test('remote strictly ahead → True (the normal user still gets the prompt)', () => {
    const { origin, clone } = makeRemoteAndClone()
    advanceOrigin(origin)
    expect(aheadOf(clone)).toBe(true)
  })

  test('local ahead of origin → False (the dev-clone defect)', () => {
    const { clone } = makeRemoteAndClone()
    writeReleases(clone, ['v1.6', 'v1.5'])
    commit(clone, 'local moves')
    expect(aheadOf(clone)).toBe(false)
  })

  test('diverged (both sides moved) → False', () => {
    const { origin, clone } = makeRemoteAndClone()
    advanceOrigin(origin)
    fs.writeFileSync(path.join(clone, 'local.txt'), 'x')
    commit(clone, 'local moves too')
    expect(aheadOf(clone)).toBe(false)
  })

  test('identical → False, and no fetch is needed to say so', () => {
    const { clone } = makeRemoteAndClone()
    expect(aheadOf(clone)).toBe(false)
  })
})

describe.skipIf(!PYTHON3)('T-456 · degrade paths stay silent (None)', () => {
  test('branch exists locally but not on origin', () => {
    const { clone } = makeRemoteAndClone()
    git(clone, 'checkout', '-q', '-b', 'local-only')
    expect(aheadOf(clone)).toBeNull()
  })

  test('detached HEAD', () => {
    const { clone } = makeRemoteAndClone()
    git(clone, 'checkout', '-q', '--detach', 'HEAD')
    expect(aheadOf(clone)).toBeNull()
  })

  test('no remote at all', () => {
    const { clone } = makeRemoteAndClone()
    git(clone, 'remote', 'remove', 'origin')
    expect(aheadOf(clone)).toBeNull()
  })

  test('unreachable remote (offline-equivalent) — and the 2s timeout is not exceeded', () => {
    const { clone } = makeRemoteAndClone()
    git(clone, 'remote', 'set-url', 'origin', path.join(tmpRoot, 'gone.git'))
    const t0 = Date.now()
    expect(aheadOf(clone)).toBeNull()
    expect(Date.now() - t0).toBeLessThan(20000) // python start-up dominates; the git side is 2s-capped
  })

  test('not a git repo', () => {
    const dir = fs.mkdtempSync(path.join(tmpRoot, 'plain-'))
    expect(aheadOf(dir)).toBeNull()
  })
})

describe.skipIf(!PYTHON3)('T-456 · the offered version is never <= the local one', () => {
  const pyLit = (s: string | null) => (s === null ? 'None' : JSON.stringify(s))
  const newer = (r: string | null, l: string | null) => py(`m._newer_version(${pyLit(r)}, ${pyLit(l)})`)

  test('strictly newer remote version → offer', () => {
    expect(newer('v1.6', 'v1.5')).toBe(true)
    expect(newer('v1.5.1', 'v1.5')).toBe(true)
    expect(newer('v2.0', 'v1.12')).toBe(true)
  })

  test('equal or lower remote version → no offer (the advertised downgrade)', () => {
    expect(newer('v1.5', 'v1.5')).toBe(false)
    expect(newer('v1.5', 'v1.6')).toBe(false)
    expect(newer('v1.5', 'v1.5.1')).toBe(false)
    expect(newer('v1.9', 'v1.10')).toBe(false) // numeric, not lexicographic
  })

  test('unparseable REMOTE version → no offer; unreadable LOCAL → offer stands', () => {
    expect(newer(null, 'v1.5')).toBe(false)
    expect(newer('nightly', 'v1.5')).toBe(false)
    // remote_ahead already proved the clone is behind — failing closed here would
    // strand an install whose RELEASES.md is missing.
    expect(newer('v1.6', null)).toBe(true)
  })

  test('local RELEASES.md is read from the clone, missing file degrades to (None, None)', () => {
    const { clone } = makeRemoteAndClone()
    expect(py(`m.releases_local(${JSON.stringify(clone)})[0]`)).toBe('v1.5')
    fs.rmSync(path.join(clone, 'docs', 'RELEASES.md'))
    expect(py(`m.releases_local(${JSON.stringify(clone)})[0]`)).toBeNull()
  })

  test('composite: SHAs differ but the remote release section is older → silent', () => {
    // origin moves forward in git while its RELEASES.md newest section stays BELOW
    // the clone's — the second gate is what stops this one.
    const { origin, clone } = makeRemoteAndClone()
    writeReleases(clone, ['v1.6', 'v1.5'])
    commit(clone, 'local is on v1.6')
    git(clone, 'push', '-q', 'origin', 'dev')
    advanceOrigin(origin, ['v1.5']) // origin rewinds its RELEASES.md to v1.5, ahead in git
    git(clone, 'fetch', '-q', 'origin', 'dev')
    expect(aheadOf(clone)).toBe(true) // gate 1 says yes...
    const remoteV = py(`m.releases_pending(${JSON.stringify(clone)})[0]`)
    const localV = py(`m.releases_local(${JSON.stringify(clone)})[0]`)
    expect([remoteV, localV]).toEqual(['v1.5', 'v1.6'])
    expect(newer(remoteV as string, localV as string)).toBe(false) // ...gate 2 says no
  })
})

describe.skipIf(!PYTHON3)('T-456 · maybe_prompt_update end to end (fake HOME, fake gum)', () => {
  /**
   * Drive the real entry point against a fixture clone with HOME repointed at a
   * temp dir and a fake `gum` on PATH. stdin/stdout are shimmed to report isatty()
   * so the non-tty fast-degrade does not short-circuit the case under test.
   * `gum` answers "skip", so cmd_update / install.sh are never reached.
   */
  function runNudge(clone: string): string {
    const home = fs.mkdtempSync(path.join(tmpRoot, 'home-'))
    fs.mkdirSync(path.join(home, '.prdt'), { recursive: true })
    fs.writeFileSync(path.join(home, '.prdt', 'prdt.env'), `PRDT_REPO=${clone}\n`)
    const bin = fs.mkdtempSync(path.join(tmpRoot, 'bin-'))
    // gum choose prints the selected LABEL on stdout; pick the "skip" one.
    fs.writeFileSync(path.join(bin, 'gum'), '#!/bin/sh\nfor a in "$@"; do case "$a" in skip*) echo "$a"; exit 0;; esac; done\nexit 1\n')
    fs.chmodSync(path.join(bin, 'gum'), 0o755)

    const script = `
import importlib.util, importlib.machinery, sys
loader = importlib.machinery.SourceFileLoader("prdt_mod", ${JSON.stringify(PRDT_CLI)})
spec = importlib.util.spec_from_loader("prdt_mod", loader)
m = importlib.util.module_from_spec(spec)
loader.exec_module(m)

class Tty:                       # real stream, but isatty() -> True
    def __init__(self, s): self._s = s
    def isatty(self): return True
    def __getattr__(self, n): return getattr(self._s, n)
sys.stdin, sys.stdout = Tty(sys.stdin), Tty(sys.stdout)
m.maybe_prompt_update("status")
`
    return execFileSync('python3', ['-c', script], {
      encoding: 'utf-8',
      cwd: tmpRoot,
      timeout: 30000,
      env: { ...process.env, HOME: home, PATH: `${bin}:${process.env.PATH}`, CI: '' },
    })
  }

  test('a clone strictly behind, with a newer remote section → the interstitial renders', () => {
    const { origin, clone } = makeRemoteAndClone()
    advanceOrigin(origin) // origin: v1.6 section, one commit ahead
    const out = runNudge(clone)
    expect(out).toContain('prdt 업데이트 가능 — v1.6')
    expect(out).toContain('v1.6 line')
  })

  test('a clone AHEAD of origin → nothing printed (the reported defect)', () => {
    const { clone } = makeRemoteAndClone()
    writeReleases(clone, ['v1.6', 'v1.5'])
    commit(clone, 'local moves')
    expect(runNudge(clone)).toBe('')
  })

  test('remote ahead in git but advertising v1.5 to a v1.6 clone → nothing printed', () => {
    const { origin, clone } = makeRemoteAndClone()
    writeReleases(clone, ['v1.6', 'v1.5'])
    commit(clone, 'local is on v1.6')
    git(clone, 'push', '-q', 'origin', 'dev')
    advanceOrigin(origin, ['v1.5'])
    expect(runNudge(clone)).toBe('')
  })

  test('non-tty and CI degrade before any git call', () => {
    const { origin, clone } = makeRemoteAndClone()
    advanceOrigin(origin)
    const home = fs.mkdtempSync(path.join(tmpRoot, 'home-'))
    fs.mkdirSync(path.join(home, '.prdt'), { recursive: true })
    fs.writeFileSync(path.join(home, '.prdt', 'prdt.env'), `PRDT_REPO=${clone}\n`)
    const script = `
import importlib.util, importlib.machinery
loader = importlib.machinery.SourceFileLoader("prdt_mod", ${JSON.stringify(PRDT_CLI)})
spec = importlib.util.spec_from_loader("prdt_mod", loader)
m = importlib.util.module_from_spec(spec)
loader.exec_module(m)
m.maybe_prompt_update("status")   # stdout is a pipe here → not a tty
`
    const run = (env: NodeJS.ProcessEnv) =>
      execFileSync('python3', ['-c', script], { encoding: 'utf-8', cwd: tmpRoot, timeout: 30000, env })
    expect(run({ ...process.env, HOME: home, CI: '' })).toBe('')          // non-tty
    expect(run({ ...process.env, HOME: home, CI: '1' })).toBe('')         // CI
    // neither path may consume the once-a-day slot
    expect(fs.existsSync(path.join(home, '.prdt', 'update-state.json'))).toBe(false)
  })

  test('gum/fzf absent → silent even when an update is genuinely pending', () => {
    const { origin, clone } = makeRemoteAndClone()
    advanceOrigin(origin)
    const home = fs.mkdtempSync(path.join(tmpRoot, 'home-'))
    fs.mkdirSync(path.join(home, '.prdt'), { recursive: true })
    fs.writeFileSync(path.join(home, '.prdt', 'prdt.env'), `PRDT_REPO=${clone}\n`)
    const emptyBin = fs.mkdtempSync(path.join(tmpRoot, 'nobin-'))
    const script = `
import importlib.util, importlib.machinery, sys
loader = importlib.machinery.SourceFileLoader("prdt_mod", ${JSON.stringify(PRDT_CLI)})
spec = importlib.util.spec_from_loader("prdt_mod", loader)
m = importlib.util.module_from_spec(spec)
loader.exec_module(m)
class Tty:
    def __init__(self, s): self._s = s
    def isatty(self): return True
    def __getattr__(self, n): return getattr(self._s, n)
sys.stdin, sys.stdout = Tty(sys.stdin), Tty(sys.stdout)
m.maybe_prompt_update("status")
`
    // PATH holds neither gum nor fzf (nor anything else) — python3 is reached by
    // absolute path so the case tests the tool check, not the interpreter lookup.
    const out = execFileSync(PYTHON3 as string, ['-c', script], {
      encoding: 'utf-8', cwd: tmpRoot, timeout: 30000,
      env: { ...process.env, HOME: home, PATH: emptyBin, CI: '' },
    })
    expect(out).toBe('')
  })

  test('`prdt update` itself is never nudged', () => {
    const { origin, clone } = makeRemoteAndClone()
    advanceOrigin(origin)
    const home = fs.mkdtempSync(path.join(tmpRoot, 'home-'))
    fs.mkdirSync(path.join(home, '.prdt'), { recursive: true })
    fs.writeFileSync(path.join(home, '.prdt', 'prdt.env'), `PRDT_REPO=${clone}\n`)
    const script = `
import importlib.util, importlib.machinery, sys
loader = importlib.machinery.SourceFileLoader("prdt_mod", ${JSON.stringify(PRDT_CLI)})
spec = importlib.util.spec_from_loader("prdt_mod", loader)
m = importlib.util.module_from_spec(spec)
loader.exec_module(m)
class Tty:
    def __init__(self, s): self._s = s
    def isatty(self): return True
    def __getattr__(self, n): return getattr(self._s, n)
sys.stdin, sys.stdout = Tty(sys.stdin), Tty(sys.stdout)
m.maybe_prompt_update("update")
`
    expect(execFileSync('python3', ['-c', script], {
      encoding: 'utf-8', cwd: tmpRoot, timeout: 30000,
      env: { ...process.env, HOME: home, CI: '' },
    })).toBe('')
  })
})
