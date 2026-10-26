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
import os, pty, sys, json, select, time, signal, termios
clone, home, keys_json, cli, cols = sys.argv[1:6]
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
    os.environ["COLUMNS"] = cols
    os.environ.pop("NO_COLOR", None)
    os.execvp("python3", ["python3", "-c", child_code])
buf = b""
extra = {}
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
    pump("❯".encode())
    time.sleep(0.15)
    if isinstance(k, dict):
        os.kill(pid, getattr(signal, "SIG" + k["sig"]))
        time.sleep(0.4)
        try:
            lf = termios.tcgetattr(fd)[3]
            extra["canon_echo"] = bool(lf & (termios.ICANON | termios.ECHO) == (termios.ICANON | termios.ECHO))
        except Exception:
            extra["canon_echo"] = None
    else:
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
print(json.dumps({"out": buf.decode("utf-8", "replace"), "status": os.waitstatus_to_exitcode(st), **extra}))
`

type Key = string | { sig: 'TERM' | 'HUP' }

function runPty(clone: string, keys: Key[], cols = 120): { out: string; status: number; home: string; canon_echo?: boolean | null } {
  const home = fs.mkdtempSync(path.join(tmpRoot, 'home-'))
  fs.mkdirSync(path.join(home, '.prdt'), { recursive: true })
  fs.writeFileSync(path.join(home, '.prdt', 'prdt.env'), `PRDT_REPO=${clone}\n`)
  const raw = execFileSync('python3', ['-c', DRIVER, clone, home, JSON.stringify(keys), PRDT_CLI, String(cols)], {
    encoding: 'utf-8', cwd: tmpRoot, timeout: subprocessTimeout('cli'),
  })
  return { ...JSON.parse(raw.trim().split('\n').pop() as string), home }
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
    expect(strip(out)).toContain('취소했어요. 아무것도 설치하지 않았어요.')
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

  test('Esc erases the guide line, then prints the approved cancel text', () => {
    const { clone } = pending()
    const { out } = runPty(clone, ['\x1b'])
    expect(out).toContain('\x1b[1A\r\x1b[2K\x1b[?25h')
    expect(out.indexOf('\x1b[1A\r\x1b[2K')).toBeLessThan(out.indexOf('취소했어요. 아무것도 설치하지 않았어요.'))
  })

  test.each(['TERM', 'HUP'] as const)('SIG%s while the menu is up restores the cursor and tty modes', (sig) => {
    const { clone, before } = pending()
    const r = runPty(clone, [{ sig }])
    expect(r.out).toContain('\x1b[?25h')
    expect(r.status).toBeLessThan(0) // died by the signal, not swallowed
    if (r.canon_echo !== null && r.canon_echo !== undefined) expect(r.canon_echo).toBe(true)
    expect(git(clone, 'rev-parse', 'HEAD').trim()).toBe(before)
  })

  test('skip from `prdt update` stamps today so the nudge will not ask again', () => {
    const { clone } = pending()
    const { home } = runPty(clone, [DOWN, '\r'])
    const st = JSON.parse(fs.readFileSync(path.join(home, '.prdt', 'update-state.json'), 'utf8'))
    expect(st.last_check).toMatch(/^\d{4}-\d\d-\d\d$/)
    expect(st.last_check_basis).toBe('local')
    expect(st.known_update).toEqual({ new: 'v1.6' })
  })

  test('narrow terminal (30 cols): every redrawn row fits one physical row', () => {
    const { clone } = pending()
    const { out } = runPty(clone, [DOWN, UP, DOWN, '\x1b'], 30)
    const width = (t: string) => [...t].reduce((n, c) => n + (c.codePointAt(0)! >= 0x1100 && !'❯↑↓·'.includes(c) ? 2 : 1), 0)
    const rows = out.split('\n').filter((l) => l.includes('\x1b[2K') && !l.includes('취소했어요')).map((l) => strip(l).replace(/\r/g, ''))
    expect(rows.length).toBeGreaterThan(0)
    for (const r of rows) expect(width(r)).toBeLessThanOrEqual(29)
    expect(out).toContain('\x1b[3A') // redraw backs up exactly items + hint
    expect(out).not.toMatch(/\x1b\[[4-9]A/)
  })

  test('truncated / over-long CSI never hangs', () => {
    const a = pending()
    expect(strip(runPty(a.clone, ['\x1b[']).out)).toContain('취소했어요') // timeout → Esc
    const b = pending()
    const r = runPty(b.clone, ['\x1b[\r', '\x1b'])                       // control byte aborts; Enter ignored
    expect(strip(r.out)).toContain('취소했어요')
    expect(git(b.clone, 'rev-parse', 'HEAD').trim()).toBe(b.before)
    const c = pending()
    expect(strip(runPty(c.clone, ['\x1b[' + '1'.repeat(40), '\x1b']).out)).toContain('취소했어요')
    expect(fs.existsSync(path.join(c.clone, '.install-ran'))).toBe(false)
  })
})
