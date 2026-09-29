/**
 * prdt-update-nudge-direction.test.ts — T-456 direction gates + T-749 prompt shape.
 *
 * The nudge greets the user in every project on the machine, before their actual
 * command, and T-393 made silence the failure mode on every degrade path. The
 * T-456 defect was the one path whose polarity was backwards: `remote_ahead`
 * compared SHAs without direction, so a clone AHEAD of origin (every dev clone,
 * all cycle long) got a daily prompt no choice could satisfy — and the version it
 * offered came from the REMOTE RELEASES.md, i.e. a downgrade.
 *
 * T-749 replaced the gum/fzf arrow-select the prompt used to call with a plain
 * `1`/`2` number prompt: the reproduced defect (ticket `outcome`) was gum/fzf's
 * arrow-select confirming its PRE-HIGHLIGHTED first option — "update now" — on a
 * single bare Enter with zero navigation, so a reflexive keypress (typed for the
 * command the nudge interrupted) silently installed. A typed digit has no such
 * default. It also made the non-tty path print the pending version instead of
 * staying fully silent (CI keeps the fully-silent, no-network-call degrade).
 *
 * Fixtures are throwaway clones off a local BARE remote in a temp dir — this suite
 * never touches ~/.prdt or the real install (the update path re-runs install.sh).
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync, spawnSync } from 'child_process'
import { test, expect, describe, beforeEach, afterEach } from 'vitest'
import { subprocessTimeout } from '../helpers/subprocess-timeout'

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

/** A no-op `scripts/install.sh` that only marks it ran (`.install-ran`) — T-749b
 * "answer 1" coverage needs the run-time path to actually be able to install. */
function writeInstallSh(repo: string): void {
  fs.mkdirSync(path.join(repo, 'scripts'), { recursive: true })
  fs.writeFileSync(
    path.join(repo, 'scripts', 'install.sh'),
    '#!/bin/sh\ntouch "$(dirname "$0")/../.install-ran"\nexit 0\n',
  )
  fs.chmodSync(path.join(repo, 'scripts', 'install.sh'), 0o755)
}

/**
 * A bare `origin` on branch `dev` with one commit + RELEASES.md at v1.5 + a
 * no-op install.sh, and a clone of it. Returns both paths; callers move either
 * side to shape the case.
 */
function makeRemoteAndClone(): { origin: string; clone: string } {
  const base = fs.mkdtempSync(path.join(tmpRoot, 'case-'))
  const seed = path.join(base, 'seed')
  fs.mkdirSync(seed)
  git(seed, 'init', '-q', '-b', 'dev')
  writeReleases(seed, ['v1.5'])
  writeInstallSh(seed)
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
  return JSON.parse(execFileSync('python3', ['-c', script], { encoding: 'utf-8', cwd, timeout: subprocessTimeout('cli') }))
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

describe.skipIf(!PYTHON3)('T-749 · releases_pending_between — notes for every version in the gap', () => {
  test('every remote section strictly above installed, newest first', () => {
    const { origin, clone } = makeRemoteAndClone()
    advanceOrigin(origin, ['v1.7', 'v1.6', 'v1.5'])
    const [newVersion, sections] = py(
      `list(m.releases_pending_between(${JSON.stringify(clone)}, "v1.5"))`,
    ) as [string, [string, string][]]
    expect(newVersion).toBe('v1.7')
    expect(sections.map(([v]) => v)).toEqual(['v1.7', 'v1.6'])
    expect(sections.every(([, text]) => text.includes('line'))).toBe(true)
  })

  test('installed already at the newest remote section → nothing qualifies', () => {
    const { origin, clone } = makeRemoteAndClone()
    advanceOrigin(origin, ['v1.6', 'v1.5'])
    expect(py(`list(m.releases_pending_between(${JSON.stringify(clone)}, "v1.6"))`)).toEqual([null, []])
  })

  test('unreadable/unset installed version → every parseable remote section qualifies', () => {
    const { origin, clone } = makeRemoteAndClone()
    advanceOrigin(origin, ['v1.6', 'v1.5'])
    const [newVersion, sections] = py(
      `list(m.releases_pending_between(${JSON.stringify(clone)}, None))`,
    ) as [string, [string, string][]]
    expect(newVersion).toBe('v1.6')
    expect(sections.map(([v]) => v)).toEqual(['v1.6', 'v1.5'])
  })

  test('offline/no-remote degrades to (None, [])', () => {
    const { clone } = makeRemoteAndClone()
    git(clone, 'remote', 'remove', 'origin')
    expect(py(`list(m.releases_pending_between(${JSON.stringify(clone)}, "v1.4"))`)).toEqual([null, []])
  })
})

describe.skipIf(!PYTHON3)('T-456/T-749 · maybe_prompt_update end to end (fake HOME, no gum needed)', () => {
  /**
   * Drive the real entry point against a fixture clone with HOME repointed at a
   * temp dir. stdin/stdout are shimmed to report isatty() so the non-tty
   * fast-degrade does not short-circuit the interactive case. `input()` is fed
   * the digit that answers the T-749 plain-number prompt — no gum/fzf on PATH
   * anywhere in this suite, proving the prompt no longer depends on either.
   */
  function runNudge(clone: string, stdinAnswer = ''): string {
    const home = fs.mkdtempSync(path.join(tmpRoot, 'home-'))
    fs.mkdirSync(path.join(home, '.prdt'), { recursive: true })
    fs.writeFileSync(path.join(home, '.prdt', 'prdt.env'), `PRDT_REPO=${clone}\n`)

    const script = `
import importlib.util, importlib.machinery, sys, io
loader = importlib.machinery.SourceFileLoader("prdt_mod", ${JSON.stringify(PRDT_CLI)})
spec = importlib.util.spec_from_loader("prdt_mod", loader)
m = importlib.util.module_from_spec(spec)
loader.exec_module(m)

class Tty:                       # real stream, but isatty() -> True
    def __init__(self, s): self._s = s
    def isatty(self): return True
    def __getattr__(self, n): return getattr(self._s, n)
sys.stdin = Tty(io.StringIO(${JSON.stringify(stdinAnswer)}))
sys.stdout = Tty(sys.stdout)
m.maybe_prompt_update("status")
`
    return execFileSync('python3', ['-c', script], {
      encoding: 'utf-8',
      cwd: tmpRoot,
      timeout: subprocessTimeout('cli'),
      env: { ...process.env, HOME: home, CI: '' },
    })
  }

  test('a clone strictly behind, answering "2" (skip) → box + both notes render, nothing installs', () => {
    const { origin, clone } = makeRemoteAndClone()
    advanceOrigin(origin, ['v1.6', 'v1.5']) // origin: v1.6 section (new), v1.5 already local
    const out = runNudge(clone, '2\n')
    expect(out).toContain('설치됨 v1.5 → 새 버전 v1.6')
    expect(out).toContain('v1.6 line')
    expect(out).toContain('1. update')
    expect(out).toContain('2. skip')
    expect(out).toContain('건너뜁니다 — 오늘은 다시 묻지 않아요.')
    // the local clone's HEAD did not move — nothing was pulled/installed
    expect(git(clone, 'rev-parse', 'HEAD').trim()).not.toBe(git(origin, 'rev-parse', 'HEAD').trim())
  })

  test('a bare Enter (no digit) never confirms anything — it re-prompts, then skip on "2"', () => {
    const { origin, clone } = makeRemoteAndClone()
    advanceOrigin(origin)
    const out = runNudge(clone, '\n2\n')
    expect(out).toContain('1 또는 2 를 입력하세요.')
    expect(out).toContain('건너뜁니다')
  })

  test('a clone AHEAD of origin → nothing printed (the T-456 defect)', () => {
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

  test('CI degrades before any git call, and never consumes the once-a-day slot', () => {
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
m.maybe_prompt_update("status")
`
    const out = execFileSync('python3', ['-c', script], {
      encoding: 'utf-8', cwd: tmpRoot, timeout: subprocessTimeout('cli'),
      env: { ...process.env, HOME: home, CI: '1' },
    })
    expect(out).toBe('')
    expect(fs.existsSync(path.join(home, '.prdt', 'update-state.json'))).toBe(false)
  })

  test('non-tty (piped, no CI) → one line naming the pending version on STDERR, stdout stays clean (T-785 F3)', () => {
    const { origin, clone } = makeRemoteAndClone()
    advanceOrigin(origin, ['v1.6', 'v1.5'])
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
    // T-785 F3: a piped/captured stdout (the auto-open hook's own \`| head -1\`,
    // any \`$(prdt …)\`) must never receive this line INSTEAD of the line the
    // caller actually asked for — it now goes to stderr whenever stdout is not
    // a real terminal, plain execFileSync (both streams piped) included.
    const r = spawnSync('python3', ['-c', script], {
      encoding: 'utf-8', cwd: tmpRoot, timeout: subprocessTimeout('cli'),
      env: { ...process.env, HOME: home, CI: '' },
    })
    expect(r.stdout.trim()).toBe('')
    expect(r.stderr.trim()).toBe('업데이트 가능: v1.5 → v1.6 — 묻지 않아요(비대화형 실행). 설치하려면 `prdt update` 를 직접 실행하세요.')
    // the once-a-day slot IS consumed (a real network check ran) — unlike CI
    expect(fs.existsSync(path.join(home, '.prdt', 'update-state.json'))).toBe(true)
  })

  test('no gum/fzf on PATH at all → the prompt still renders (T-749 dropped the dependency)', () => {
    const { origin, clone } = makeRemoteAndClone()
    advanceOrigin(origin)
    const home = fs.mkdtempSync(path.join(tmpRoot, 'home-'))
    fs.mkdirSync(path.join(home, '.prdt'), { recursive: true })
    fs.writeFileSync(path.join(home, '.prdt', 'prdt.env'), `PRDT_REPO=${clone}\n`)
    const emptyBin = fs.mkdtempSync(path.join(tmpRoot, 'nobin-'))
    const script = `
import importlib.util, importlib.machinery, sys, io
loader = importlib.machinery.SourceFileLoader("prdt_mod", ${JSON.stringify(PRDT_CLI)})
spec = importlib.util.spec_from_loader("prdt_mod", loader)
m = importlib.util.module_from_spec(spec)
loader.exec_module(m)
class Tty:
    def __init__(self, s): self._s = s
    def isatty(self): return True
    def __getattr__(self, n): return getattr(self._s, n)
sys.stdin = Tty(io.StringIO("2\\n"))
sys.stdout = Tty(sys.stdout)
m.maybe_prompt_update("status")
`
    // emptyBin (holding neither gum nor fzf) is FIRST on PATH — git/python3 still
    // resolve from the real PATH behind it, so this tests the tool check, not
    // whether a subprocess can find an interpreter.
    const out = execFileSync(PYTHON3 as string, ['-c', script], {
      encoding: 'utf-8', cwd: tmpRoot, timeout: subprocessTimeout('cli'),
      env: { ...process.env, HOME: home, PATH: `${emptyBin}:${process.env.PATH}`, CI: '' },
    })
    expect(out).toContain('1. update')
    expect(out).toContain('건너뜁니다')
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
      encoding: 'utf-8', cwd: tmpRoot, timeout: subprocessTimeout('cli'),
      env: { ...process.env, HOME: home, CI: '' },
    })).toBe('')
  })

  // T-749b (QA grill finding #1): `maybe_prompt_update`'s "update" branch used to
  // call `cmd_update(None)`, which re-ran the WHOLE version check and rendered the
  // same box + question a second time. `os.execv` is stubbed so the process isn't
  // actually replaced (it would leave nothing to assert on) — the stub prints a
  // marker instead, proving the real call would have re-run the original command.
  test('run-time check, "1" → installs once, box+question shown only once, then re-execs', () => {
    const { origin, clone } = makeRemoteAndClone()
    advanceOrigin(origin, ['v1.6', 'v1.5'])
    const home = fs.mkdtempSync(path.join(tmpRoot, 'home-'))
    fs.mkdirSync(path.join(home, '.prdt'), { recursive: true })
    fs.writeFileSync(path.join(home, '.prdt', 'prdt.env'), `PRDT_REPO=${clone}\n`)
    const script = `
import importlib.util, importlib.machinery, sys, io
loader = importlib.machinery.SourceFileLoader("prdt_mod", ${JSON.stringify(PRDT_CLI)})
spec = importlib.util.spec_from_loader("prdt_mod", loader)
m = importlib.util.module_from_spec(spec)
loader.exec_module(m)
class Tty:
    def __init__(self, s): self._s = s
    def isatty(self): return True
    def __getattr__(self, n): return getattr(self._s, n)
sys.stdin = Tty(io.StringIO("1\\n"))
sys.stdout = Tty(sys.stdout)
def fake_execv(path, argv):
    print("EXECV_CALLED")
m.os.execv = fake_execv
m.maybe_prompt_update("status")
`
    const out = execFileSync('python3', ['-c', script], {
      encoding: 'utf-8', cwd: tmpRoot, timeout: subprocessTimeout('cli'),
      env: { ...process.env, HOME: home, CI: '' },
    })
    // the box + question render exactly once — no second `cmd_update(None)` re-entry
    expect((out.match(/설치됨 v1\.5 → 새 버전 v1\.6/g) || []).length).toBe(1)
    expect((out.match(/1\. update/g) || []).length).toBe(1)
    expect(out).toContain('업데이트 완료: v1.5 → v1.6')
    expect(out).toContain('EXECV_CALLED')
    expect(fs.existsSync(path.join(clone, '.install-ran'))).toBe(true)
    expect(git(clone, 'rev-parse', 'HEAD').trim()).toBe(git(origin, 'rev-parse', 'HEAD').trim())
  })

  // T-749b (QA grill finding #4): EOF used to leave the cursor sitting right after
  // the prompt text with no newline, so the skip line ran on directly after it
  // ("번호를 고르세요 [1/2]: 건너뜁니다 …") instead of starting its own line.
  test('EOF (Ctrl-D) at the run-time prompt → the skip line prints on its own fresh line', () => {
    const { origin, clone } = makeRemoteAndClone()
    advanceOrigin(origin, ['v1.6', 'v1.5'])
    const out = runNudge(clone, '') // empty stdin → EOFError on the first input()
    const promptLine = '번호를 고르세요 [1/2]: '
    expect(out).toContain(promptLine + '\n')
    expect(out).not.toContain(promptLine + '건너뜁니다')
    expect(out).toContain('건너뜁니다 — 오늘은 다시 묻지 않아요.')
    expect(fs.existsSync(path.join(clone, '.install-ran'))).toBe(false)
  })

  // T-749b (QA grill finding #3): Ctrl-C used to propagate as an uncaught
  // KeyboardInterrupt out of `main()` — a traceback, AND it took the ORIGINAL
  // command (the one this nudge interrupted) down with it, since the process
  // died before ever falling through to dispatch it.
  test('Ctrl-C at the run-time prompt → one catalog line, no traceback, nothing installs, original command still runs', () => {
    const { origin, clone } = makeRemoteAndClone()
    advanceOrigin(origin)
    const before = git(clone, 'rev-parse', 'HEAD').trim()
    const home = fs.mkdtempSync(path.join(tmpRoot, 'home-'))
    fs.mkdirSync(path.join(home, '.prdt'), { recursive: true })
    fs.writeFileSync(path.join(home, '.prdt', 'prdt.env'), `PRDT_REPO=${clone}\n`)
    const script = `
import importlib.util, importlib.machinery, sys, io, builtins
loader = importlib.machinery.SourceFileLoader("prdt_mod", ${JSON.stringify(PRDT_CLI)})
spec = importlib.util.spec_from_loader("prdt_mod", loader)
m = importlib.util.module_from_spec(spec)
loader.exec_module(m)
class Tty:
    def __init__(self, s): self._s = s
    def isatty(self): return True
    def __getattr__(self, n): return getattr(self._s, n)
sys.stdin = Tty(io.StringIO(""))
sys.stdout = Tty(sys.stdout)
def raise_kbi(prompt=""):
    sys.stdout.write(prompt)
    raise KeyboardInterrupt()
builtins.input = raise_kbi
m.maybe_prompt_update("status")
print("ORIGINAL_COMMAND_RAN")   # stands in for main()'s dispatch, which resumes after the nudge
`
    const out = execFileSync('python3', ['-c', script], {
      encoding: 'utf-8', cwd: tmpRoot, timeout: subprocessTimeout('cli'),
      env: { ...process.env, HOME: home, CI: '' },
    })
    expect(out).not.toContain('Traceback')
    expect((out.match(/취소했어요/g) || []).length).toBe(1)
    expect(out).not.toContain('건너뜁니다') // no second, contradictory "skip" line
    expect(out).toContain('ORIGINAL_COMMAND_RAN')
    expect(git(clone, 'rev-parse', 'HEAD').trim()).toBe(before)
    expect(fs.existsSync(path.join(clone, '.install-ran'))).toBe(false)
  })
})

// T-785 F4: a remote docs/RELEASES.md is shown on a consent screen before the
// user has approved anything — a control character in there (cursor move,
// alt-screen switch, an OSC/BEL sequence) must never land on the terminal
// verbatim. `_strip_control_chars` is the one place that gets applied; these
// tests exercise every print site fed by REMOTE text (found by a grep sweep
// over every place `new_version`/`sections` reach a `print()` — two of the
// four sites below were still unstripped before this pass: `cmd_update`'s own
// non-tty line, and the "update.done" confirmation both callers print after
// an actual install).
// eslint-disable-next-line no-control-regex
const HAS_RAW_CONTROL = /[\x00-\x08\x0b-\x1f\x7f-\x9f]/
const POISON_VERSION = 'v1.6\x1b[31m\x07' // parses as v1.6 (_version_key stops at the digits), carries a raw ESC+BEL

function writeReleasesRaw(repo: string, body: string): void {
  fs.mkdirSync(path.join(repo, 'docs'), { recursive: true })
  fs.writeFileSync(path.join(repo, 'docs', 'RELEASES.md'), body)
}

describe.skipIf(!PYTHON3)('T-785 F4 · control characters never reach the terminal', () => {
  test('_strip_control_chars removes C0/C1/DEL, keeps tab and newline', () => {
    const script = `
import importlib.util, importlib.machinery, json
loader = importlib.machinery.SourceFileLoader("prdt_mod", ${JSON.stringify(PRDT_CLI)})
spec = importlib.util.spec_from_loader("prdt_mod", loader)
m = importlib.util.module_from_spec(spec)
loader.exec_module(m)
s = "a\\x00b\\x1bc\\x7fd\\x9ee\\tf\\ng"
print(json.dumps(m._strip_control_chars(s)))
`
    const out = JSON.parse(execFileSync('python3', ['-c', script], { encoding: 'utf-8', cwd: tmpRoot, timeout: subprocessTimeout('cli') }))
    expect(out).toBe('abcde\tf\ng')
  })

  test('_render_update_notes strips a poisoned version token and a poisoned body line', () => {
    const script = `
import importlib.util, importlib.machinery
loader = importlib.machinery.SourceFileLoader("prdt_mod", ${JSON.stringify(PRDT_CLI)})
spec = importlib.util.spec_from_loader("prdt_mod", loader)
m = importlib.util.module_from_spec(spec)
loader.exec_module(m)
msgs = m.load_messages()
section = ("v1.6", "## v1.6\\x1b[2J — title\\nbody line\\x07 with BEL\\n")
m._render_update_notes(msgs, "v1.5", ${JSON.stringify(POISON_VERSION)}, [section])
`
    const out = execFileSync('python3', ['-c', script], { encoding: 'utf-8', cwd: tmpRoot, timeout: subprocessTimeout('cli') })
    expect(HAS_RAW_CONTROL.test(out)).toBe(false)
    expect(out).toContain('v1.6[31m') // ESC gone, the literal bracket text it wrapped stays
    expect(out).toContain('body line with BEL')
  })

  test('non-tty nudge line (F3 path): a poisoned remote version is stripped on stderr', () => {
    const { origin, clone } = makeRemoteAndClone()
    advanceOrigin(origin, [POISON_VERSION, 'v1.5'])
    const home = fs.mkdtempSync(path.join(tmpRoot, 'home-'))
    fs.mkdirSync(path.join(home, '.prdt'), { recursive: true })
    fs.writeFileSync(path.join(home, '.prdt', 'prdt.env'), `PRDT_REPO=${clone}\n`)
    const script = `
import importlib.util, importlib.machinery
loader = importlib.machinery.SourceFileLoader("prdt_mod", ${JSON.stringify(PRDT_CLI)})
spec = importlib.util.spec_from_loader("prdt_mod", loader)
m = importlib.util.module_from_spec(spec)
loader.exec_module(m)
m.maybe_prompt_update("status")
`
    const r = spawnSync('python3', ['-c', script], {
      encoding: 'utf-8', cwd: tmpRoot, timeout: subprocessTimeout('cli'),
      env: { ...process.env, HOME: home, PRDT_HOME: fs.mkdtempSync(path.join(tmpRoot, 'prdthome-')), CI: '' },
    })
    expect(HAS_RAW_CONTROL.test(r.stderr)).toBe(false)
    expect(r.stderr).toContain('v1.6[31m')
  })

  test('cmd_update — its OWN non-tty branch (bypasses _render_update_notes entirely) strips the remote version too', () => {
    const { origin, clone } = makeRemoteAndClone()
    advanceOrigin(origin, [POISON_VERSION, 'v1.5'])
    const home = fs.mkdtempSync(path.join(tmpRoot, 'home-'))
    fs.mkdirSync(path.join(home, '.prdt'), { recursive: true })
    fs.writeFileSync(path.join(home, '.prdt', 'prdt.env'), `PRDT_REPO=${clone}\n`)
    const script = `
import importlib.util, importlib.machinery
loader = importlib.machinery.SourceFileLoader("prdt_mod", ${JSON.stringify(PRDT_CLI)})
spec = importlib.util.spec_from_loader("prdt_mod", loader)
m = importlib.util.module_from_spec(spec)
loader.exec_module(m)
m.cmd_update(None)   # stdin/stdout are real pipes here -> not a tty, hits cmd_update's own early branch
`
    const r = spawnSync('python3', ['-c', script], {
      encoding: 'utf-8', cwd: tmpRoot, timeout: subprocessTimeout('cli'),
      env: { ...process.env, HOME: home, PRDT_HOME: fs.mkdtempSync(path.join(tmpRoot, 'prdthome-')), CI: '' },
    })
    expect(r.status).toBe(0)
    expect(HAS_RAW_CONTROL.test(r.stdout)).toBe(false)
    expect(r.stdout).toContain('v1.6[31m')
  })

  test('the final "update.done" confirmation line strips the remote version too (both callers)', () => {
    // maybe_prompt_update's run-time "install now" path.
    const { origin, clone } = makeRemoteAndClone()
    advanceOrigin(origin, [POISON_VERSION, 'v1.5'])
    const home = fs.mkdtempSync(path.join(tmpRoot, 'home-'))
    fs.mkdirSync(path.join(home, '.prdt'), { recursive: true })
    fs.writeFileSync(path.join(home, '.prdt', 'prdt.env'), `PRDT_REPO=${clone}\n`)
    const script = `
import importlib.util, importlib.machinery, sys, io
loader = importlib.machinery.SourceFileLoader("prdt_mod", ${JSON.stringify(PRDT_CLI)})
spec = importlib.util.spec_from_loader("prdt_mod", loader)
m = importlib.util.module_from_spec(spec)
loader.exec_module(m)
class Tty:
    def __init__(self, s): self._s = s
    def isatty(self): return True
    def __getattr__(self, n): return getattr(self._s, n)
sys.stdin = Tty(io.StringIO("1\\n"))
sys.stdout = Tty(sys.stdout)
m.os.execv = lambda *a: print("EXECV_CALLED")
m.maybe_prompt_update("status")
`
    const out = execFileSync('python3', ['-c', script], {
      encoding: 'utf-8', cwd: tmpRoot, timeout: subprocessTimeout('cli'),
      env: { ...process.env, HOME: home, PRDT_HOME: fs.mkdtempSync(path.join(tmpRoot, 'prdthome-')), CI: '' },
    })
    expect(out).toContain('EXECV_CALLED')
    expect(HAS_RAW_CONTROL.test(out)).toBe(false)
    expect(out).toContain('v1.6[31m')

    // cmd_update's own "install now" path — separate call site, separate fixture.
    const { origin: origin2, clone: clone2 } = makeRemoteAndClone()
    advanceOrigin(origin2, [POISON_VERSION, 'v1.5'])
    const home2 = fs.mkdtempSync(path.join(tmpRoot, 'home-'))
    fs.mkdirSync(path.join(home2, '.prdt'), { recursive: true })
    fs.writeFileSync(path.join(home2, '.prdt', 'prdt.env'), `PRDT_REPO=${clone2}\n`)
    const script2 = `
import importlib.util, importlib.machinery, sys, io
loader = importlib.machinery.SourceFileLoader("prdt_mod", ${JSON.stringify(PRDT_CLI)})
spec = importlib.util.spec_from_loader("prdt_mod", loader)
m = importlib.util.module_from_spec(spec)
loader.exec_module(m)
class Tty:
    def __init__(self, s): self._s = s
    def isatty(self): return True
    def __getattr__(self, n): return getattr(self._s, n)
sys.stdin = Tty(io.StringIO("1\\n"))
sys.stdout = Tty(sys.stdout)
m.cmd_update(None)
`
    const out2 = execFileSync('python3', ['-c', script2], {
      encoding: 'utf-8', cwd: tmpRoot, timeout: subprocessTimeout('cli'),
      env: { ...process.env, HOME: home2, PRDT_HOME: fs.mkdtempSync(path.join(tmpRoot, 'prdthome-')), CI: '' },
    })
    expect(HAS_RAW_CONTROL.test(out2)).toBe(false)
    expect(out2).toContain('v1.6[31m')
    expect(fs.existsSync(path.join(clone2, '.install-ran'))).toBe(true)
  })
})

// T-785 F3 / code review #1: `main()`'s `skip_update_nudge` must make the
// nudge a full no-op — no daily-slot write, no network check — for every
// call a hook shells out to (`prdt viewer --no-open`, install.sh's own
// `_shared-state-guard` seam) or any `--json`-flagged command a tool parses
// (`prdt schedule --json`). Drives the REAL CLI entry point (`main()`), not
// `maybe_prompt_update` directly, since the skip decision lives in `main()`
// itself — a direct call would bypass the very branch under test.
describe.skipIf(!PYTHON3)('T-785 F3 / code review #1 · skip_update_nudge (main(), real subprocess)', () => {
  function homeWithRepo(clone: string): string {
    const home = fs.mkdtempSync(path.join(tmpRoot, 'home-'))
    fs.mkdirSync(path.join(home, '.prdt'), { recursive: true })
    fs.writeFileSync(path.join(home, '.prdt', 'prdt.env'), `PRDT_REPO=${clone}\n`)
    return home
  }

  const stateFile = (home: string) => path.join(home, '.prdt', 'update-state.json')

  /** Runs the real `prdt` CLI (not the module directly) so `main()`'s own
   * skip_update_nudge branch is exercised. HOME carries the daily-slot file
   * under test; PRDT_HOME is sandboxed per-call so no other machine state
   * (hooks lookups, meta-backup latches) leaks in or out. Exit status is
   * ignored — `require_root()` legitimately fails downstream in this
   * project-less fixture, but `main()` decides skip_update_nudge and (when
   * applicable) calls `maybe_prompt_update` BEFORE that dispatch, so the
   * assertion under test is already settled by then. */
  function runCli(args: string[], home: string): void {
    spawnSync('python3', [PRDT_CLI, ...args], {
      encoding: 'utf-8',
      cwd: tmpRoot,
      timeout: subprocessTimeout('cli'),
      env: {
        ...process.env, HOME: home,
        PRDT_HOME: fs.mkdtempSync(path.join(tmpRoot, 'prdthome-')),
        CI: '', PRDT_META_BACKUP: '0',
      },
    })
  }

  test('schedule --json / viewer --no-open / _shared-state-guard leave update-state.json absent even with a real update pending; an ordinary command then writes it', () => {
    const { origin, clone } = makeRemoteAndClone()
    advanceOrigin(origin) // origin strictly ahead — a real check here WOULD normally fire
    const home = homeWithRepo(clone)
    const target = path.join(tmpRoot, 'note.md')
    fs.writeFileSync(target, 'x')

    runCli(['schedule', '--json'], home)
    expect(fs.existsSync(stateFile(home))).toBe(false)

    runCli(['viewer', '--no-open', target], home)
    expect(fs.existsSync(stateFile(home))).toBe(false)

    runCli(['_shared-state-guard', 'artifacts sync'], home)
    expect(fs.existsSync(stateFile(home))).toBe(false)

    // same repo, same "ahead" fixture, but an ordinary nudge-eligible command
    // (no --json, not viewer --no-open, not _shared-state-guard) — the daily
    // slot IS consumed, proving the three calls above were skipped on their
    // own merits and not because the nudge can never fire against this fixture.
    runCli(['schedule'], home)
    expect(fs.existsSync(stateFile(home))).toBe(true)
  })
})
