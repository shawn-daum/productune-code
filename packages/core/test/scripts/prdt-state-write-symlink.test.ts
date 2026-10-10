/**
 * prdt-state-write-symlink.test.ts — T-905 (T-848 slice S2).
 *
 * The Python CLI writes project-local state through ONE helper family
 * (`state_open_dir` · `state_write` · `state_append`, plus `open_db`'s sqlite
 * guard). Every case plants a link — at the leaf, at an intermediate directory,
 * at `.prdt` itself, or dangling — pointing outside the project, runs the
 * writer, and asserts the victim is byte-identical and nothing appeared at the
 * link target. A clone carries symlinks, so each placement is attacker-reachable.
 */

import { execFileSync, spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { subprocessTimeout } from '../helpers/subprocess-timeout'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const PRDT = path.join(CORE_ROOT, 'scripts', 'prdt')
const VICTIM_BODY = 'VICTIM ORIGINAL\n'

const DRIVER = `
import importlib.util, importlib.machinery, os, sys
from pathlib import Path
loader = importlib.machinery.SourceFileLoader("prdt_mod", sys.argv[1])
spec = importlib.util.spec_from_loader("prdt_mod", loader)
m = importlib.util.module_from_spec(spec)
loader.exec_module(m)
P = Path(sys.argv[2])
exec(sys.argv[3])
`

let W: string
let P: string // project root
let victim: string
let outDir: string
let env: NodeJS.ProcessEnv

beforeEach(() => {
  W = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t905-')))
  P = path.join(W, 'proj')
  victim = path.join(W, 'victim.txt')
  outDir = path.join(W, 'outside')
  fs.mkdirSync(path.join(P, '.prdt'), { recursive: true })
  fs.mkdirSync(outDir)
  fs.writeFileSync(victim, VICTIM_BODY)
  fs.writeFileSync(path.join(P, '.prdt', 'po-state.json'),
    JSON.stringify({ schema_version: 1, stage: 'build', version: 'v1.13', current_task: null }))
  fs.mkdirSync(path.join(W, 'home'), { recursive: true })
  env = { ...process.env, HOME: path.join(W, 'home'), PRDT_HOME: path.join(W, 'prdt-home'),
    PRDT_DISCIPLINE: path.join(CORE_ROOT, 'discipline') }
  delete env.CLAUDE_CODE_SESSION_ID
})
afterEach(() => { fs.rmSync(W, { recursive: true, force: true }) })

function py(code: string, umask?: number): { status: number | null; out: string; err: string } {
  const pre = umask === undefined ? '' : `os.umask(${umask})\n`
  const r = spawnSync('python3', ['-c', DRIVER, PRDT, P, pre + code], {
    cwd: P, env, encoding: 'utf-8', timeout: subprocessTimeout('cli'),
  })
  return { status: r.status, out: r.stdout, err: r.stderr }
}
function prdt(args: string[], cwd = P) {
  const r = spawnSync('python3', [PRDT, ...args], { cwd, env, encoding: 'utf-8', timeout: subprocessTimeout('cli') })
  return { status: r.status, out: r.stdout, err: r.stderr }
}
const victimIntact = () => expect(fs.readFileSync(victim, 'utf-8')).toBe(VICTIM_BODY)
const mode = (p: string) => fs.statSync(p).mode & 0o7777

/** The refusal shape: nonzero-or-StateLinkError text, never a write. */
const refused = (r: { out: string; err: string; status: number | null }) =>
  r.status !== 0 || /REFUSED/.test(r.out)

describe('state_write — a link at any path component is refused', () => {
  const call = (rel: string) => `
try:
    m.state_write(P, P / ${JSON.stringify(rel)}, "ATTACK\\n")
    print("WROTE")
except m.StateLinkError as e:
    print("REFUSED", e)
`
  it('leaf link to an existing file', () => {
    fs.symlinkSync(victim, path.join(P, '.prdt', 'x.json'))
    expect(py(call('.prdt/x.json')).out).toMatch(/REFUSED/)
    victimIntact()
    expect(fs.lstatSync(path.join(P, '.prdt', 'x.json')).isSymbolicLink()).toBe(true)
  })
  it('dangling leaf link creates nothing at the target', () => {
    const target = path.join(outDir, 'created.txt')
    fs.symlinkSync(target, path.join(P, '.prdt', 'x.json'))
    expect(py(call('.prdt/x.json')).out).toMatch(/REFUSED/)
    expect(fs.existsSync(target)).toBe(false)
  })
  it('intermediate directory link', () => {
    fs.symlinkSync(outDir, path.join(P, '.prdt', 'sub'))
    expect(py(call('.prdt/sub/x.json')).out).toMatch(/REFUSED/)
    expect(fs.readdirSync(outDir)).toEqual([])
  })
  it('the .prdt directory itself is a link', () => {
    fs.rmSync(path.join(P, '.prdt'), { recursive: true })
    fs.symlinkSync(outDir, path.join(P, '.prdt'))
    expect(py(call('.prdt/x.json')).out).toMatch(/REFUSED/)
    expect(fs.readdirSync(outDir)).toEqual([])
  })
  it('a planted temp name does not redirect the write', () => {
    fs.symlinkSync(victim, path.join(P, '.prdt', `.x.json.${0}.tmp`))
    const r = py(`
import os
tmp = P / ".prdt" / f".x.json.{os.getpid()}.tmp"
os.symlink(${JSON.stringify(victim)}, tmp)
m.state_write(P, P / ".prdt/x.json", "OK\\n")
print("WROTE")`)
    expect(r.out).toMatch(/WROTE/)
    victimIntact()
    expect(fs.readFileSync(path.join(P, '.prdt', 'x.json'), 'utf-8')).toBe('OK\n')
  })
  it('creates missing directories as real directories', () => {
    expect(py(`m.state_write(P, P / ".prdt/a/b/x.json", "OK\\n")`).status).toBe(0)
    expect(fs.readFileSync(path.join(P, '.prdt/a/b/x.json'), 'utf-8')).toBe('OK\n')
  })
})

describe('state_write — modes', () => {
  it('keeps an existing file mode (0600, 0444, 0644) even under umask 077', () => {
    for (const m of [0o600, 0o444, 0o644]) {
      const f = path.join(P, '.prdt', `m${m.toString(8)}.txt`)
      fs.writeFileSync(f, 'old\n')
      fs.chmodSync(f, m)
      expect(py(`m.state_write(P, P / ".prdt/m${m.toString(8)}.txt", "new\\n")`, 0o077).status).toBe(0)
      expect(mode(f)).toBe(m)
      expect(fs.readFileSync(f, 'utf-8')).toBe('new\n')
    }
  })
  it('a new file is 0644 regardless of umask; an explicit mode is exact', () => {
    expect(py(`m.state_write(P, P / ".prdt/n.txt", "x\\n")`, 0o077).status).toBe(0)
    expect(mode(path.join(P, '.prdt', 'n.txt'))).toBe(0o644)
    expect(py(`m.state_write(P, P / ".prdt/s.txt", "x\\n", mode=0o600)`, 0o022).status).toBe(0)
    expect(mode(path.join(P, '.prdt', 's.txt'))).toBe(0o600)
  })
})

describe('state_append — a link at any path component is refused', () => {
  const call = (rel: string) => `
try:
    m.state_append(P, P / ${JSON.stringify(rel)}, "ATTACK\\n")
    print("WROTE")
except m.StateLinkError as e:
    print("REFUSED", e)
`
  it('leaf link', () => {
    fs.symlinkSync(victim, path.join(P, '.prdt', 'log.md'))
    expect(py(call('.prdt/log.md')).out).toMatch(/REFUSED/)
    victimIntact()
  })
  it('directory link', () => {
    fs.symlinkSync(outDir, path.join(P, '.prdt', 'sub'))
    expect(py(call('.prdt/sub/log.md')).out).toMatch(/REFUSED/)
    expect(fs.readdirSync(outDir)).toEqual([])
  })
  it('appends to a real file and keeps its mode', () => {
    const f = path.join(P, '.prdt', 'log.md')
    fs.writeFileSync(f, 'a\n')
    fs.chmodSync(f, 0o600)
    expect(py(`m.state_append(P, P / ".prdt/log.md", "b\\n")`, 0o022).status).toBe(0)
    expect(fs.readFileSync(f, 'utf-8')).toBe('a\nb\n')
    expect(mode(f)).toBe(0o600)
  })
})

describe('open_db — index.db never follows a link', () => {
  const open = `
try:
    m.open_db(P).close()
    print("OPENED")
except m.StateLinkError as e:
    print("REFUSED", e)
`
  it('dangling index.db link: the target is not created (prdt tickets)', () => {
    const target = path.join(outDir, 'db-created')
    fs.symlinkSync(target, path.join(P, '.prdt', 'index.db'))
    const r = prdt(['tickets'])
    expect(r.status).not.toBe(0)
    expect(r.err + r.out).toMatch(/index\.db/)
    expect(fs.existsSync(target)).toBe(false)
  })
  it('index.db link to an existing file leaves it byte-identical', () => {
    fs.symlinkSync(victim, path.join(P, '.prdt', 'index.db'))
    expect(py(open).out).toMatch(/REFUSED/)
    victimIntact()
  })
  it.each(['-journal', '-wal', '-shm'])('a planted index.db%s link is refused', (suffix) => {
    fs.symlinkSync(victim, path.join(P, '.prdt', `index.db${suffix}`))
    expect(py(open).out).toMatch(/REFUSED/)
    victimIntact()
  })
  it('.prdt is a link: nothing lands in the target directory', () => {
    fs.rmSync(path.join(P, '.prdt'), { recursive: true })
    fs.symlinkSync(outDir, path.join(P, '.prdt'))
    expect(py(open).out).toMatch(/REFUSED/)
    expect(fs.readdirSync(outDir)).toEqual([])
  })
  it('a plain project still opens and a stale CHECK still rebuilds', () => {
    expect(py(open).out).toMatch(/OPENED/)
    expect(fs.lstatSync(path.join(P, '.prdt', 'index.db')).isFile()).toBe(true)
    expect(py(open).out).toMatch(/OPENED/)
  })
})

describe('prdt init — meta.git/info/exclude (C5)', () => {
  function clone(): string {
    const c = path.join(W, 'clone')
    fs.mkdirSync(c)
    execFileSync('git', ['init', '-q'], { cwd: c })
    return c
  }
  it('leaf link at meta.git/info/exclude leaves the victim byte-identical', () => {
    const c = clone()
    fs.mkdirSync(path.join(c, '.prdt', 'meta.git', 'info'), { recursive: true })
    fs.symlinkSync(victim, path.join(c, '.prdt', 'meta.git', 'info', 'exclude'))
    prdt(['init', '--yes', '--slug', 'x'], c)
    victimIntact()
  })
  it('link at meta.git/info writes nothing into the target directory', () => {
    const c = clone()
    fs.mkdirSync(path.join(c, '.prdt', 'meta.git'), { recursive: true })
    fs.symlinkSync(outDir, path.join(c, '.prdt', 'meta.git', 'info'))
    prdt(['init', '--yes', '--slug', 'x'], c)
    expect(fs.readdirSync(outDir)).toEqual([])
  })
  it('a clean init still writes the exclude list', () => {
    const c = clone()
    expect(prdt(['init', '--yes', '--slug', 'x'], c).status).toBe(0)
    expect(fs.readFileSync(path.join(c, '.prdt', 'meta.git', 'info', 'exclude'), 'utf-8')).toMatch(/index\.db/)
  })
  it('dangling po-state.json link: init refuses and creates nothing at the target', () => {
    const c = clone()
    fs.mkdirSync(path.join(c, '.prdt'))
    const target = path.join(outDir, 'po-created')
    fs.symlinkSync(target, path.join(c, '.prdt', 'po-state.json'))
    const r = prdt(['init', '--yes', '--slug', 'x'], c)
    expect(r.status).not.toBe(0)
    expect(fs.existsSync(target)).toBe(false)
  })
  it('docs/wiki/log.md link is not written through', () => {
    const c = clone()
    fs.mkdirSync(path.join(c, 'docs', 'wiki'), { recursive: true })
    fs.symlinkSync(victim, path.join(c, 'docs', 'wiki', 'log.md'))
    prdt(['init', '--yes', '--slug', 'x'], c)
    victimIntact()
  })
})

describe('prdt migrate — legacy lite project', () => {
  function lite(): string {
    const c = path.join(W, 'legacy')
    fs.mkdirSync(path.join(c, '.productune-lite'), { recursive: true })
    fs.writeFileSync(path.join(c, '.productune-lite', 'po-state.json'),
      JSON.stringify({ stage: 'define', version: 'v1', current_task: null }))
    execFileSync('git', ['init', '-q'], { cwd: c })
    return c
  }
  it('a clean migrate still writes config, po-state and the log', () => {
    const c = lite()
    expect(prdt(['migrate'], c).status).toBe(0)
    expect(JSON.parse(fs.readFileSync(path.join(c, '.prdt', 'config.json'), 'utf-8')).migrated_from).toBe('lite')
    expect(fs.readFileSync(path.join(c, 'docs', 'wiki', 'log.md'), 'utf-8')).toMatch(/migrated from lite/)
  })
  it('a planted .prdt/config.json link is not written through', () => {
    const c = lite()
    fs.mkdirSync(path.join(c, '.prdt'))
    fs.symlinkSync(victim, path.join(c, '.prdt', 'config.json'))
    const r = prdt(['migrate', '--force'], c)
    expect(r.status).not.toBe(0)
    victimIntact()
  })
  it('a planted docs/wiki/log.md link is not appended through', () => {
    const c = lite()
    fs.mkdirSync(path.join(c, 'docs', 'wiki'), { recursive: true })
    fs.symlinkSync(victim, path.join(c, 'docs', 'wiki', 'log.md'))
    prdt(['migrate'], c)
    victimIntact()
  })
})

describe('_exclude_add — the track exclude line', () => {
  const call = `
gd = P / ".prdt" / "meta.git"
m._exclude_add(gd, P)
print("DONE")
`
  it('leaf link to a file is not appended through', () => {
    fs.mkdirSync(path.join(P, '.prdt', 'meta.git', 'info'), { recursive: true })
    fs.symlinkSync(victim, path.join(P, '.prdt', 'meta.git', 'info', 'exclude'))
    expect(py(call).out).toMatch(/DONE/)
    victimIntact()
  })
  it('info directory link writes nothing in the target', () => {
    fs.mkdirSync(path.join(P, '.prdt', 'meta.git'), { recursive: true })
    fs.symlinkSync(outDir, path.join(P, '.prdt', 'meta.git', 'info'))
    expect(py(call).out).toMatch(/DONE/)
    expect(fs.readdirSync(outDir)).toEqual([])
  })
  it('meta.git itself a link writes nothing in the target', () => {
    fs.mkdirSync(path.join(outDir, 'info'))
    fs.symlinkSync(outDir, path.join(P, '.prdt', 'meta.git'))
    expect(py(call).out).toMatch(/DONE/)
    expect(fs.readdirSync(path.join(outDir, 'info'))).toEqual([])
  })
  it('appends once to a real exclude and keeps its mode', () => {
    const ex = path.join(P, '.prdt', 'meta.git', 'info', 'exclude')
    fs.mkdirSync(path.dirname(ex), { recursive: true })
    fs.writeFileSync(ex, 'a')
    fs.chmodSync(ex, 0o600)
    py(call, 0o022); py(call, 0o022)
    expect(fs.readFileSync(ex, 'utf-8')).toBe('a\n/tracks/\n')
    expect(mode(ex)).toBe(0o600)
  })
})

describe('features migrate — ticket rewrite goes through state_write', () => {
  it('a ticket that is a link to an outside file is not rewritten', () => {
    fs.mkdirSync(path.join(P, 'docs', 'tickets', 'v1'), { recursive: true })
    fs.mkdirSync(path.join(P, 'docs', 'wiki'), { recursive: true })
    fs.writeFileSync(path.join(P, '.prdt', 'config.json'), JSON.stringify({
      slug: 'p', meta: { allowlist: ['.prdt', 'docs'] },
      features: { vocab: { gui: { kind: 'tag' }, 'gui-old': { kind: 'alias', of: 'gui' } } },
    }))
    const body = '---\nid: T-1\nslug: s\ntype: impl\nstatus: done\nassignee: developer\nfeature: gui-old\ncreated: 2026-01-01\n---\n\nbody\n'
    fs.writeFileSync(victim, body)
    fs.symlinkSync(victim, path.join(P, 'docs', 'tickets', 'v1', 'T-1.md'))
    prdt(['features', 'migrate', '--apply'])
    expect(fs.readFileSync(victim, 'utf-8')).toBe(body)
    expect(fs.lstatSync(path.join(P, 'docs', 'tickets', 'v1', 'T-1.md')).isSymbolicLink()).toBe(true)
  })
})

describe('_track_record_write', () => {
  it('a planted link at the record name is not written through', () => {
    const r = py(`
import os
code = P / "code"; code.mkdir()
os.environ["PRDT_HOME"] = str(P / "ph")
p = m._track_record_path(code, "T-9")
p.parent.mkdir(parents=True)
os.symlink(${JSON.stringify(victim)}, p)
try:
    m._track_record_write(code, "T-9", "track/T-9", "dev")
    print("WROTE")
except OSError as e:
    print("REFUSED", e)
`)
    expect(r.out).toMatch(/REFUSED/)
    victimIntact()
  })
  it('writes a plain record', () => {
    const r = py(`
import os
code = P / "code"; code.mkdir()
os.environ["PRDT_HOME"] = str(P / "ph")
m._track_record_write(code, "T-9", "track/T-9", "dev")
print(m._track_record_read(code, "T-9", "track/T-9"))
`)
    expect(r.out.trim()).toBe('dev')
  })
})

describe('viewer scratch folder keeps its refusal via the shared walk', () => {
  it('scratch viewer link is refused', () => {
    fs.mkdirSync(path.join(P, '.prdt', 'scratch'), { recursive: true })
    fs.symlinkSync(outDir, path.join(P, '.prdt', 'scratch', 'viewer'))
    const r = py(`print(m._open_scratch_dir(P, m.VIEWER_REL.parts))`)
    expect(r.out.trim()).toBe('None')
    expect(fs.readdirSync(outDir)).toEqual([])
    void refused
  })
})
