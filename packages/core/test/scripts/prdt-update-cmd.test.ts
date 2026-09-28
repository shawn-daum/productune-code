/**
 * prdt-update-cmd.test.ts — T-749, explicit `prdt update`.
 *
 * As-is (ticket `problem`, read 2026-09-28): `cmd_update` pulled --ff-only and
 * ran install.sh unconditionally, with no prompt at all — it printed a commit
 * hash `old → new` and nothing about the version or what changed. T-749 makes it
 * show the installed → new VERSION and the RELEASES.md notes for every version
 * in the gap, then ask a plain `1. update` / `2. skip` number prompt — nothing
 * is pulled or installed before the answer.
 *
 * Fixtures are throwaway clones off a local BARE remote in a temp dir, with a
 * no-op `scripts/install.sh` — this suite never touches ~/.prdt, the real prdt
 * clone, or a real remote.
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync } from 'child_process'
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

function writeReleases(repo: string, versions: string[]): void {
  fs.mkdirSync(path.join(repo, 'docs'), { recursive: true })
  fs.writeFileSync(
    path.join(repo, 'docs', 'RELEASES.md'),
    `# Releases\n\npreamble ignored by the parser\n\n` +
      versions.map((v) => `## ${v} — section (2026-01-01)\n\n### Added\n- ${v} line\n`).join('\n'),
  )
}

function writeInstallSh(repo: string): void {
  fs.mkdirSync(path.join(repo, 'scripts'), { recursive: true })
  // marks that it ran, then no-ops — never touches the real install
  fs.writeFileSync(
    path.join(repo, 'scripts', 'install.sh'),
    '#!/bin/sh\ntouch "$(dirname "$0")/../.install-ran"\nexit 0\n',
  )
  fs.chmodSync(path.join(repo, 'scripts', 'install.sh'), 0o755)
}

function commit(repo: string, msg: string): void {
  git(repo, 'add', '-A')
  git(repo, 'commit', '-q', '-m', msg)
}

/** A bare `origin` on branch `dev`, one commit at v1.5 + a no-op install.sh, and a clone. */
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

function advanceOrigin(origin: string, releases: string[]): void {
  const scratch = fs.mkdtempSync(path.join(tmpRoot, 'push-'))
  const wc = path.join(scratch, 'wc')
  git(scratch, 'clone', '-q', origin, wc)
  writeReleases(wc, releases)
  commit(wc, 'origin moves')
  git(wc, 'push', '-q', 'origin', 'dev')
}

/** Run `cmd_update(None)` against `clone` (PRDT_REPO), feeding `stdinAnswer` when a tty. */
function runCmdUpdate(clone: string, opts: { tty: boolean; stdinAnswer?: string }): string {
  const home = fs.mkdtempSync(path.join(tmpRoot, 'home-'))
  fs.mkdirSync(path.join(home, '.prdt'), { recursive: true })
  fs.writeFileSync(path.join(home, '.prdt', 'prdt.env'), `PRDT_REPO=${clone}\n`)
  const ttyShim = opts.tty
    ? `
class Tty:
    def __init__(self, s): self._s = s
    def isatty(self): return True
    def __getattr__(self, n): return getattr(self._s, n)
sys.stdin = Tty(io.StringIO(${JSON.stringify(opts.stdinAnswer || '')}))
sys.stdout = Tty(sys.stdout)
`
    : '' // real streams here are pipes under execFileSync capture → isatty() False
  const script = `
import importlib.util, importlib.machinery, sys, io
loader = importlib.machinery.SourceFileLoader("prdt_mod", ${JSON.stringify(PRDT_CLI)})
spec = importlib.util.spec_from_loader("prdt_mod", loader)
m = importlib.util.module_from_spec(spec)
loader.exec_module(m)
${ttyShim}
m.cmd_update(None)
`
  return execFileSync('python3', ['-c', script], {
    encoding: 'utf-8', cwd: tmpRoot, timeout: subprocessTimeout('cli'),
    env: { ...process.env, HOME: home },
  })
}

beforeEach(() => { tmpRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-update-cmd-'))) })
afterEach(() => { fs.rmSync(tmpRoot, { recursive: true, force: true }) })

describe.skipIf(!PYTHON3)('T-749 · prdt update — nothing installs before the answer', () => {
  test('already up to date → one line, no prompt, no pull, but install.sh still re-runs (T-749b mirror refresh)', () => {
    const { clone } = makeRemoteAndClone()
    const before = git(clone, 'rev-parse', 'HEAD').trim()
    const out = runCmdUpdate(clone, { tty: true, stdinAnswer: '1\n' }) // even a "1" answer must never be reached
    expect(out.trim()).toBe('지금 버전이 최신이에요 (v1.5) — 업데이트할 것이 없어요.')
    expect(git(clone, 'rev-parse', 'HEAD').trim()).toBe(before)
    // T-749b: GUI settings (settings.ts:192,220) and both READMEs point at
    // `prdt update` always re-running install.sh to refresh the mirror/menu,
    // even with nothing new to pull — the pre-T-749 contract, restored.
    expect(fs.existsSync(path.join(clone, '.install-ran'))).toBe(true)
  })

  test('non-interactive (no tty) with a pending update → one line naming it, no install', () => {
    const { origin, clone } = makeRemoteAndClone()
    advanceOrigin(origin, ['v1.6', 'v1.5'])
    const before = git(clone, 'rev-parse', 'HEAD').trim()
    const out = runCmdUpdate(clone, { tty: false })
    expect(out.trim()).toBe(
      '업데이트 가능: v1.5 → v1.6 — 묻지 않아요(비대화형 실행). 설치하려면 `prdt update` 를 직접 실행하세요.',
    )
    expect(git(clone, 'rev-parse', 'HEAD').trim()).toBe(before)
    expect(fs.existsSync(path.join(clone, '.install-ran'))).toBe(false)
  })

  test('interactive, version+notes shown for every version in the gap, "1" → pulls and installs', () => {
    const { origin, clone } = makeRemoteAndClone()
    advanceOrigin(origin, ['v1.7', 'v1.6', 'v1.5'])
    const out = runCmdUpdate(clone, { tty: true, stdinAnswer: '1\n' })
    expect(out).toContain('설치됨 v1.5 → 새 버전 v1.7')
    expect(out).toContain('v1.7 line')
    expect(out).toContain('v1.6 line')
    expect(out).not.toContain('v1.5 line') // already installed — not "between"
    expect(out).toContain('1. update')
    expect(out).toContain('2. skip')
    expect(out).toContain('업데이트 완료: v1.5 → v1.7')
    expect(git(clone, 'rev-parse', 'HEAD').trim()).toBe(git(origin, 'rev-parse', 'HEAD').trim())
    expect(fs.existsSync(path.join(clone, '.install-ran'))).toBe(true)
  })

  test('interactive, "2" → skip, nothing pulled or installed', () => {
    const { origin, clone } = makeRemoteAndClone()
    advanceOrigin(origin, ['v1.6', 'v1.5'])
    const before = git(clone, 'rev-parse', 'HEAD').trim()
    const out = runCmdUpdate(clone, { tty: true, stdinAnswer: '2\n' })
    expect(out).toContain('1. update')
    expect(git(clone, 'rev-parse', 'HEAD').trim()).toBe(before)
    expect(fs.existsSync(path.join(clone, '.install-ran'))).toBe(false)
  })

  test('a bare Enter never confirms the update — it re-prompts', () => {
    const { origin, clone } = makeRemoteAndClone()
    advanceOrigin(origin, ['v1.6', 'v1.5'])
    const before = git(clone, 'rev-parse', 'HEAD').trim()
    const out = runCmdUpdate(clone, { tty: true, stdinAnswer: '\n2\n' })
    expect(out).toContain('1 또는 2 를 입력하세요.')
    expect(git(clone, 'rev-parse', 'HEAD').trim()).toBe(before)
  })

  test('notes come from the NEW version RELEASES.md, not the pre-update local copy', () => {
    const { origin, clone } = makeRemoteAndClone()
    // local copy (pre-update) has no idea what v1.6's note text will be
    advanceOrigin(origin, ['v1.6 — 원격 전용 제목', 'v1.5'])
    const out = runCmdUpdate(clone, { tty: true, stdinAnswer: '2\n' })
    expect(out).toContain('원격 전용 제목')
    // the local RELEASES.md on disk never got this text (nothing was pulled)
    expect(fs.readFileSync(path.join(clone, 'docs', 'RELEASES.md'), 'utf-8')).not.toContain('원격 전용 제목')
  })

  // T-749b (QA grill finding #2): origin ahead in git with NO qualifying RELEASES.md
  // section still has to ask — the pre-T-749 contract was "always pull+install", and
  // silently doing that again (no prompt at all) would install unreviewed commits.
  function pushWithoutReleaseSection(origin: string): void {
    const scratch = fs.mkdtempSync(path.join(tmpRoot, 'norelnotes-'))
    const wc = path.join(scratch, 'wc')
    git(scratch, 'clone', '-q', origin, wc)
    fs.writeFileSync(path.join(wc, 'unrelated.txt'), 'x')
    commit(wc, 'unrelated change, no release notes')
    git(wc, 'push', '-q', 'origin', 'dev')
  }

  test('ahead in git but no new RELEASES.md section → still asks, "no release notes" line, "1" pulls+installs', () => {
    const { origin, clone } = makeRemoteAndClone()
    pushWithoutReleaseSection(origin)
    const out = runCmdUpdate(clone, { tty: true, stdinAnswer: '1\n' })
    expect(out).toContain('설치됨 v1.5 →')
    expect(out).toContain('이 사이에 새 커밋은 있지만 릴리즈 노트는 없어요.')
    expect(out).toContain('1. update')
    expect(out).toContain('2. skip')
    expect(out).toContain('업데이트 완료:')
    expect(git(clone, 'rev-parse', 'HEAD').trim()).toBe(git(origin, 'rev-parse', 'HEAD').trim())
    expect(fs.existsSync(path.join(clone, '.install-ran'))).toBe(true)
  })

  test('ahead in git but no new RELEASES.md section, "2" → nothing pulls without a 1', () => {
    const { origin, clone } = makeRemoteAndClone()
    pushWithoutReleaseSection(origin)
    const before = git(clone, 'rev-parse', 'HEAD').trim()
    const out = runCmdUpdate(clone, { tty: true, stdinAnswer: '2\n' })
    expect(out).toContain('이 사이에 새 커밋은 있지만 릴리즈 노트는 없어요.')
    expect(git(clone, 'rev-parse', 'HEAD').trim()).toBe(before)
    expect(fs.existsSync(path.join(clone, '.install-ran'))).toBe(false)
  })

  // T-749b (QA grill finding #4): EOF used to leave the cursor on the prompt's own
  // line with no trailing newline, so whatever printed next ran on directly after it.
  test('EOF (Ctrl-D) at the prompt → prints on a fresh line, installs nothing', () => {
    const { origin, clone } = makeRemoteAndClone()
    advanceOrigin(origin, ['v1.6', 'v1.5'])
    const before = git(clone, 'rev-parse', 'HEAD').trim()
    const out = runCmdUpdate(clone, { tty: true }) // no stdinAnswer → empty stdin → EOFError
    expect(out.endsWith('번호를 고르세요 [1/2]: \n')).toBe(true)
    expect(git(clone, 'rev-parse', 'HEAD').trim()).toBe(before)
    expect(fs.existsSync(path.join(clone, '.install-ran'))).toBe(false)
  })

  // T-749b (QA grill finding #3): Ctrl-C used to propagate as an uncaught
  // KeyboardInterrupt — a Python traceback on stderr, nothing installed, but the
  // process itself died (fatal on the explicit `prdt update` path).
  test('Ctrl-C at the prompt → one catalog line, no traceback, installs nothing', () => {
    const { origin, clone } = makeRemoteAndClone()
    advanceOrigin(origin, ['v1.6', 'v1.5'])
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
m.cmd_update(None)
print("AFTER_CMD_UPDATE")
`
    const out = execFileSync('python3', ['-c', script], {
      encoding: 'utf-8', cwd: tmpRoot, timeout: subprocessTimeout('cli'),
      env: { ...process.env, HOME: home },
    })
    expect(out).not.toContain('Traceback')
    expect(out.match(/취소했어요/g) || []).toHaveLength(1)
    expect(out).toContain('AFTER_CMD_UPDATE') // cmd_update returned normally, no crash
    expect(git(clone, 'rev-parse', 'HEAD').trim()).toBe(before)
    expect(fs.existsSync(path.join(clone, '.install-ran'))).toBe(false)
  })
})
