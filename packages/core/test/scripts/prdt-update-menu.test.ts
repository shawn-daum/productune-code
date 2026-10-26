/**
 * prdt-update-menu.test.ts — T-1231, `prdt update` confirm as an arrow / Enter /
 * Esc menu. Drives a REAL pty (python pty.fork gives the child a tty), so the
 * termios cbreak path runs for real; piped / shimmed runs keep the number
 * prompt (covered by prdt-update-cmd.test.ts).
 *
 * Fixtures: throwaway clone + bare origin in a temp dir, no-op install.sh.
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

/** Advance `origin`'s `branch` (which must already exist on origin) with a new
 * commit carrying `releases` — used to shape the mismatched-upstream repro. */
function advanceOriginBranch(origin: string, branch: string, releases: string[]): void {
  const scratch = fs.mkdtempSync(path.join(tmpRoot, 'push-'))
  const wc = path.join(scratch, 'wc')
  git(scratch, 'clone', '-q', '-b', branch, origin, wc)
  writeReleases(wc, releases)
  commit(wc, `${branch} moves`)
  git(wc, 'push', '-q', 'origin', branch)
}

/**
 * T-749c (QA sandbox repro, round 3): a local `dev` whose upstream is
 * misconfigured to `origin/main` — `remote_ahead`/`releases_pending_between`
 * read `origin/<branch-name>` (i.e. `origin/dev`), NOT `@{upstream}`, so this
 * mismatch is exactly what let a plain `git pull --ff-only` (which DOES
 * follow `@{upstream}`) install something the version/notes check never saw.
 */
function makeMismatchedUpstreamCase(): { origin: string; clone: string } {
  const { origin, clone } = makeRemoteAndClone() // origin: branch `dev` @ v1.5 only
  // birth `main` at `dev`'s current tip — same commit, no new commit needed
  const scratch = fs.mkdtempSync(path.join(tmpRoot, 'mkmain-'))
  const wc = path.join(scratch, 'wc')
  git(scratch, 'clone', '-q', origin, wc)
  git(wc, 'push', '-q', 'origin', 'dev:refs/heads/main')
  git(clone, 'fetch', '-q', 'origin', 'main')
  git(clone, 'branch', '--set-upstream-to=origin/main', 'dev')
  return { origin, clone }
}


const DRIVER = `
import os, pty, sys, json, select, time
clone, home, keys_json, cli = sys.argv[1:5]
keys = json.loads(keys_json)
child_code = (
  "import importlib.util, importlib.machinery\\n"
  "l = importlib.machinery.SourceFileLoader('p', %r)\\n"
  "s = importlib.util.spec_from_loader('p', l)\\n"
  "m = importlib.util.module_from_spec(s); l.exec_module(m)\\n"
  "m.cmd_update(None)\\n" % cli)
pid, fd = pty.fork()
if pid == 0:
    os.environ["HOME"] = home
    os.environ.pop("NO_COLOR", None)
    os.execvp("python3", ["python3", "-c", child_code])
buf = b""
def pump(until, timeout=15):
    global buf
    end = time.time() + timeout
    while time.time() < end and until not in buf:
        r, _, _ = select.select([fd], [], [], 0.1)
        if r:
            try:
                d = os.read(fd, 4096)
            except OSError:
                return
            if not d:
                return
            buf += d
for k in keys:
    pump(b"Esc")                       # menu drawn (hint line)
    time.sleep(0.15)
    os.write(fd, k.encode())
    time.sleep(0.15)
end = time.time() + 15
while time.time() < end:
    r, _, _ = select.select([fd], [], [], 0.1)
    if r:
        try:
            d = os.read(fd, 4096)
        except OSError:
            break
        if not d:
            break
        buf += d
    else:
        done, st = os.waitpid(pid, os.WNOHANG)
        if done:
            break
_, st = os.waitpid(pid, 0)
print(json.dumps({"out": buf.decode("utf-8", "replace"), "status": os.waitstatus_to_exitcode(st)}))
`

function runPty(clone: string, keys: string[]): { out: string; status: number } {
  const home = fs.mkdtempSync(path.join(tmpRoot, 'home-'))
  fs.mkdirSync(path.join(home, '.prdt'), { recursive: true })
  fs.writeFileSync(path.join(home, '.prdt', 'prdt.env'), `PRDT_REPO=${clone}\n`)
  const raw = execFileSync('python3', ['-c', DRIVER, clone, home, JSON.stringify(keys), PRDT_CLI], {
    encoding: 'utf-8', cwd: tmpRoot, timeout: subprocessTimeout('cli'),
  })
  return JSON.parse(raw.trim().split('\n').pop() as string)
}

const strip = (s: string) => s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')
const DOWN = '\x1b[B'
const UP = '\x1b[A'

beforeEach(() => { tmpRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-update-menu-'))) })
afterEach(() => { fs.rmSync(tmpRoot, { recursive: true, force: true }) })

describe.skipIf(!PYTHON3)('T-1231 · prdt update arrow menu on a real tty', () => {
  function pending() {
    const { origin, clone } = makeRemoteAndClone()
    advanceOrigin(origin, ['v1.6', 'v1.5'])
    return { origin, clone, before: git(clone, 'rev-parse', 'HEAD').trim() }
  }

  test('menu is drawn: two items with descriptions, a guide line, no number prompt; first cursor on 업데이트', () => {
    const { clone } = pending()
    const { out } = runPty(clone, ['\x1b'])
    const plain = strip(out)
    expect(plain).toContain('❯ 업데이트   새 버전을 받아 설치해요')
    expect(plain).toContain('건너뛰기   오늘은 다시 묻지 않아요')
    expect(plain).toContain('↑↓ 이동 · Enter 실행 · Esc 취소')
    expect(plain).not.toContain('번호를 고르세요')
    expect(plain).not.toContain('1. update')
  })

  test('Enter on the first item installs', () => {
    const { origin, clone } = pending()
    const { out, status } = runPty(clone, ['\r'])
    expect(status).toBe(0)
    expect(strip(out)).toContain('업데이트 완료: v1.5 → v1.6')
    expect(git(clone, 'rev-parse', 'HEAD').trim()).toBe(git(origin, 'rev-parse', 'HEAD').trim())
    expect(fs.existsSync(path.join(clone, '.install-ran'))).toBe(true)
  })

  test('Down then Enter = skip: nothing installed; Up wraps back to 업데이트', () => {
    const { clone, before } = pending()
    const r = runPty(clone, [DOWN, '\r'])
    expect(strip(r.out)).not.toContain('업데이트 완료')
    expect(git(clone, 'rev-parse', 'HEAD').trim()).toBe(before)
    expect(fs.existsSync(path.join(clone, '.install-ran'))).toBe(false)
    expect(r.out).toMatch(/❯ 건너뛰기/)

    const { clone: c2 } = pending()
    const r2 = runPty(c2, [UP, UP, '\r']) // wraps 0 → 1 → 0, Enter on 업데이트
    expect(strip(r2.out)).toContain('업데이트 완료')
  })

  test('Esc installs nothing and prints update.cancelled', () => {
    const { clone, before } = pending()
    const { out } = runPty(clone, ['\x1b'])
    expect(strip(out)).toContain('취소했어요 — 아무것도 설치하지 않았어요.')
    expect(git(clone, 'rev-parse', 'HEAD').trim()).toBe(before)
    expect(fs.existsSync(path.join(clone, '.install-ran'))).toBe(false)
  })

  test('unrelated keys do not move the cursor or confirm', () => {
    const { clone, before } = pending()
    const { out } = runPty(clone, ['x', '2', '\x1b'])
    const plain = strip(out)
    expect(plain).not.toContain('업데이트 완료')
    expect(plain).toContain('취소했어요')
    expect(git(clone, 'rev-parse', 'HEAD').trim()).toBe(before)
  })
})
