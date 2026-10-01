/**
 * meta-git-untrusted-config.test.ts — T-848 slice 1.
 *
 * `.prdt/meta.git` lives in the project tree, so a cloned repository can carry
 * one with its own config and hooks. First the vector is CONFIRMED by running
 * plain git (no prdt) against a carried repo; then both meta git runners — TS
 * `metaGit` (meta-git.ts) and the CLI's `_meta_git` (scripts/prdt) — must run
 * nothing the carried repo names, while a repo prdt itself made keeps working.
 * Every repo here is a temp dir; the "victim" is a marker log inside it.
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync, spawnSync } from 'child_process'
import { test, expect, describe, beforeEach, afterEach } from 'vitest'
import {
  metaGit,
  metaGitTrustProblem,
  initMetaRepo,
  MetaGitUntrustedError,
} from '../../src/git-workflow/meta-git'

const PRDT_CLI = path.resolve(__dirname, '..', '..', 'scripts', 'prdt')

let W: string // project root
let LOG: string // marker log every planted program appends to

function git(args: string[], cwd = W): string {
  const env = { ...process.env }
  for (const k of Object.keys(env)) if (k.startsWith('GIT_')) delete env[k]
  return execFileSync('git', args, { cwd, encoding: 'utf-8', env }).trim()
}

function marks(): string[] {
  return fs.existsSync(LOG) ? fs.readFileSync(LOG, 'utf-8').split('\n').filter(Boolean) : []
}

/** A program that appends its name to LOG (then `tail`s: exit code / cat). */
function prog(name: string, tail = ''): string {
  const p = path.join(W, '..', `bin-${path.basename(W)}`, name)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, `#!/bin/sh\necho ${name} >> '${LOG}'\n${tail}\n`, { mode: 0o755 })
  return p
}

/** A clone-carried meta repo: bare-initialised, then config/hooks planted. */
function carriedMetaRepo(): string {
  const gd = path.join(W, '.prdt', 'meta.git')
  fs.mkdirSync(path.dirname(gd), { recursive: true })
  git(['init', '-q', '--bare', gd])
  git(['--git-dir', gd, 'config', 'core.bare', 'false'])
  git(['--git-dir', gd, 'config', 'user.name', 'x'])
  git(['--git-dir', gd, 'config', 'user.email', 'x@x'])
  fs.mkdirSync(path.join(W, 'docs'), { recursive: true })
  fs.writeFileSync(path.join(W, 'docs', 'a.md'), 'a\n')
  return gd
}

function plantHook(gd: string): void {
  fs.mkdirSync(path.join(gd, 'hooks'), { recursive: true })
  fs.copyFileSync(prog('hook'), path.join(gd, 'hooks', 'pre-commit'))
  fs.chmodSync(path.join(gd, 'hooks', 'pre-commit'), 0o755)
}

/** Each config-driven vector observed to run a command on status/add/commit. */
const VECTORS: Array<{ name: string; plant: (gd: string) => void }> = [
  { name: 'core.fsmonitor', plant: (gd) => git(['--git-dir', gd, 'config', 'core.fsmonitor', prog('fsmonitor', 'exit 1')]) },
  {
    name: 'core.hooksPath',
    plant: (gd) => {
      const hp = path.join(W, 'evil-hooks')
      fs.mkdirSync(hp, { recursive: true })
      fs.copyFileSync(prog('hook'), path.join(hp, 'pre-commit'))
      fs.chmodSync(path.join(hp, 'pre-commit'), 0o755)
      git(['--git-dir', gd, 'config', 'core.hooksPath', hp])
    },
  },
  { name: '$GIT_DIR/hooks', plant: plantHook },
  {
    name: 'filter via info/attributes',
    plant: (gd) => {
      git(['--git-dir', gd, 'config', 'filter.evil.clean', prog('filter', 'cat')])
      fs.mkdirSync(path.join(gd, 'info'), { recursive: true })
      fs.writeFileSync(path.join(gd, 'info', 'attributes'), '*.md filter=evil\n')
    },
  },
  {
    name: 'include.path',
    plant: (gd) => {
      const inc = path.join(W, 'inc.cfg')
      fs.writeFileSync(inc, `[core]\n\tfsmonitor = ${prog('include', 'exit 1')}\n`)
      git(['--git-dir', gd, 'config', 'include.path', inc])
    },
  },
]

/** What the meta runners do: status, add, commit. */
const OPS = [['status', '--porcelain'], ['add', '-A', '--', 'docs'], ['commit', '-qm', 'x']]

const PY_RUN = `
import importlib.util, importlib.machinery, sys, json
loader = importlib.machinery.SourceFileLoader("prdt_mod", sys.argv[1])
spec = importlib.util.spec_from_loader("prdt_mod", loader)
m = importlib.util.module_from_spec(spec)
loader.exec_module(m)
root = sys.argv[2]
out = {"problem": m.meta_git_trust_problem(root), "rc": []}
for op in json.loads(sys.argv[3]):
    r = m._meta_git(root, op)
    out["rc"].append([r.returncode, r.stderr[:300]])
out["lag"] = m.meta_backup_lag_warnings(root)
print(json.dumps(out))
`

function py(root = W): { problem: string | null; rc: Array<[number, string]>; lag: string[] } {
  return JSON.parse(execFileSync('python3', ['-c', PY_RUN, PRDT_CLI, root, JSON.stringify(OPS)], { encoding: 'utf-8' }))
}

async function tsRun(): Promise<unknown[]> {
  const errs: unknown[] = []
  for (const op of OPS) {
    try {
      await metaGit(W, op)
    } catch (e) {
      errs.push(e)
    }
  }
  return errs
}

beforeEach(() => {
  W = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t848-')))
  LOG = path.join(W, '..', `log-${path.basename(W)}`)
})
afterEach(() => {
  for (const p of [W, LOG, path.join(W, '..', `bin-${path.basename(W)}`)]) fs.rmSync(p, { recursive: true, force: true })
})

describe.each(VECTORS)('clone-carried meta.git — $name', ({ plant }) => {
  test('confirmed: plain git runs the planted command', () => {
    const gd = carriedMetaRepo()
    plant(gd)
    for (const op of OPS) {
      try {
        git(['--git-dir', gd, '--work-tree', W, ...op])
      } catch {
        /* the outcome under test is the marker, not git's exit */
      }
    }
    expect(marks().length).toBeGreaterThan(0)
  })

  test('TS metaGit refuses and runs nothing', async () => {
    const gd = carriedMetaRepo()
    plant(gd)
    const errs = await tsRun()
    expect(marks()).toEqual([])
    // $GIT_DIR/hooks leaves config allowlisted: the command-line pin covers it.
    if (errs.length) expect(errs[0]).toBeInstanceOf(MetaGitUntrustedError)
  })

  test('CLI _meta_git refuses and runs nothing; doctor line names it', () => {
    const gd = carriedMetaRepo()
    plant(gd)
    const r = py()
    expect(marks()).toEqual([])
    if (r.problem) {
      expect(r.rc.every(([rc]) => rc === 128)).toBe(true)
      expect(r.lag.join('\n')).toContain('prdt does not run git on')
    }
  })
})

describe('trust check edges', () => {
  test('$GIT_DIR/hooks alone: allowlisted config, commit succeeds without the hook (both sides)', async () => {
    const gd = carriedMetaRepo()
    plantHook(gd)
    expect(metaGitTrustProblem(W)).toBeNull()
    expect(await tsRun()).toEqual([])
    fs.appendFileSync(path.join(W, 'docs', 'a.md'), 'b\n')
    const r = py()
    expect(r.problem).toBeNull()
    expect(r.rc.map(([rc]) => rc)).toEqual([0, 0, 0])
    expect(marks()).toEqual([])
    expect(git(['--git-dir', gd, 'rev-list', '--count', 'HEAD'])).toBe('2')
  })

  test('a repo initMetaRepo made is trusted and commits', async () => {
    git(['init', '-q'])
    const res = await initMetaRepo(W)
    expect(res.error).toBeUndefined()
    expect(metaGitTrustProblem(W)).toBeNull()
    expect(py().problem).toBeNull()
  })

  test('prdt init on a clean dir leaves a trusted meta repo', () => {
    execFileSync('git', ['init', '-q'], { cwd: W })
    execFileSync('python3', [PRDT_CLI, 'init', '--yes', '--slug', 't848'], {
      cwd: W,
      encoding: 'utf-8',
      env: { ...process.env, HOME: W + '-home', PRDT_HOME: W + '-home/.prdt' },
    })
    fs.rmSync(W + '-home', { recursive: true, force: true })
    expect(fs.existsSync(path.join(W, '.prdt', 'meta.git', 'HEAD'))).toBe(true)
    expect(metaGitTrustProblem(W)).toBeNull()
    expect(py().problem).toBeNull()
  })

  test('initMetaRepo refuses a carried repo before writing config into it', async () => {
    const gd = carriedMetaRepo()
    git(['--git-dir', gd, 'config', 'core.fsmonitor', prog('fsmonitor', 'exit 1')])
    const before = fs.readFileSync(path.join(gd, 'config'), 'utf-8')
    const res = await initMetaRepo(W)
    expect(res.initialized).toBe(false)
    expect(res.error).toContain('core.fsmonitor')
    expect(fs.readFileSync(path.join(gd, 'config'), 'utf-8')).toBe(before)
    expect(marks()).toEqual([])
  })

  test.each([
    ['local remote inside the project', './evil.git', true],
    ['file:// remote inside the project', 'file://__W__/evil.git', true],
    ['remote-helper URL', 'ext::sh -c touch% /tmp/x', true],
    ['https remote', 'https://example.invalid/x.git', false],
    ['scp-like remote', 'git@example.invalid:x.git', false],
    ['local remote outside the project', '__OUT__', false],
  ])('%s', (_label, url, refused) => {
    const gd = carriedMetaRepo()
    const u = url.replace('__W__', W).replace('__OUT__', path.join(os.tmpdir(), 'elsewhere.git'))
    git(['--git-dir', gd, 'remote', 'add', 'backup', u])
    expect(metaGitTrustProblem(W) !== null).toBe(refused)
    expect(py().problem !== null).toBe(refused)
  })

  test('symlinked meta.git and commondir are refused', () => {
    const elsewhere = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t848-out-')))
    try {
      git(['init', '-q', '--bare', path.join(elsewhere, 'm.git')])
      fs.mkdirSync(path.join(W, '.prdt'))
      fs.symlinkSync(path.join(elsewhere, 'm.git'), path.join(W, '.prdt', 'meta.git'))
      expect(metaGitTrustProblem(W)).toMatch(/symbolic link/)
      expect(py().problem).toMatch(/symbolic link/)
      fs.unlinkSync(path.join(W, '.prdt', 'meta.git'))
      const gd = carriedMetaRepo()
      fs.writeFileSync(path.join(gd, 'commondir'), path.join(elsewhere, 'm.git') + '\n')
      expect(metaGitTrustProblem(W)).toMatch(/commondir/)
      expect(py().problem).toMatch(/commondir/)
    } finally {
      fs.rmSync(elsewhere, { recursive: true, force: true })
    }
  })
})

// ── T-848 fix1: config-less carried repos, gitfile meta.git, refusal on every surface ──

const CORE = path.resolve(__dirname, '..', '..')
const BRIDGE = path.join(CORE, 'dist', 'bin', 'meta-cli.cjs')

/** QA's repro: a meta.git with NO config whose commondir names a sibling repo that plants a filter + diff.external. */
function plantCommondirNoConfig(gd: string): void {
  const ev = path.join(W, '.prdt', 'evil.git')
  git(['init', '-q', '--bare', ev])
  git(['--git-dir', ev, 'config', 'filter.cd.clean', prog('commondir-filter', 'cat')])
  git(['--git-dir', ev, 'config', 'diff.external', prog('commondir-diffext')])
  git(['--git-dir', ev, 'config', 'core.bare', 'false'])
  git(['--git-dir', ev, 'config', 'user.name', 'x'])
  git(['--git-dir', ev, 'config', 'user.email', 'x@x'])
  fs.mkdirSync(path.join(ev, 'info'), { recursive: true })
  fs.writeFileSync(path.join(ev, 'info', 'attributes'), '*.md filter=cd\n')
  for (const n of ['objects', 'refs']) {
    fs.rmSync(path.join(ev, n), { recursive: true, force: true })
    fs.renameSync(path.join(gd, n), path.join(ev, n))
    fs.mkdirSync(path.join(gd, n))
  }
  fs.rmSync(path.join(gd, 'config'))
  fs.writeFileSync(path.join(gd, 'commondir'), '../evil.git\n')
}

function plantGitfile(gd: string): void {
  const real = path.join(W, '.prdt', 'real.git')
  fs.renameSync(gd, real)
  git(['--git-dir', real, 'config', 'core.fsmonitor', prog('gitfile-fsmon')])
  git(['--git-dir', real, 'config', 'filter.gf.clean', prog('gitfile-filter', 'cat')])
  fs.mkdirSync(path.join(real, 'info'), { recursive: true })
  fs.writeFileSync(path.join(real, 'info', 'attributes'), '*.md filter=gf\n')
  fs.writeFileSync(gd, `gitdir: ${real}\n`)
}

function plantNoConfigHook(gd: string): void {
  fs.rmSync(path.join(gd, 'config'))
  plantHook(gd)
}

const SHAPES: Array<{ name: string; plant: (gd: string) => void; says: RegExp }> = [
  { name: 'config-less meta.git with commondir (QA repro)', plant: plantCommondirNoConfig, says: /commondir exists/ },
  { name: 'config-less meta.git with HEAD + hook', plant: plantNoConfigHook, says: /has HEAD but no config/ },
  { name: 'gitfile meta.git', plant: plantGitfile, says: /is a file pointing elsewhere \(gitdir: / },
]

describe.each(SHAPES)('T-848 fix1 — $name', ({ plant, says }) => {
  let HOME: string
  let env: NodeJS.ProcessEnv
  const cli = (args: string[]) => {
    const r = spawnSync('python3', [PRDT_CLI, ...args], { cwd: W, env, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] })
    return { rc: r.status, out: `${r.stdout}${r.stderr}` }
  }
  const bridge = (cmd: string): any => {
    let o: string
    try {
      o = execFileSync('node', [BRIDGE, cmd, W], { cwd: W, env, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] })
    } catch (e: any) {
      o = e.stdout
    }
    return JSON.parse(o)
  }

  beforeEach(() => {
    HOME = W + '-home'
    fs.mkdirSync(path.join(HOME, '.prdt'), { recursive: true })
    fs.writeFileSync(path.join(HOME, '.prdt', 'prdt.env'), `PRDT_REPO=${CORE}\n`)
    env = { ...process.env, HOME, PRDT_HOME: path.join(HOME, '.prdt'), PRDT_META_BACKUP: '0', GIT_CONFIG_NOSYSTEM: '1' }
    for (const k of Object.keys(env)) if (k.startsWith('GIT_') && k !== 'GIT_CONFIG_NOSYSTEM') delete env[k]
    execFileSync('git', ['init', '-q'], { cwd: W, env })
    cli(['init', '--yes', '--slug', 't848'])
    const gd = path.join(W, '.prdt', 'meta.git')
    // a backup remote + a commit so push would otherwise proceed
    const remote = W + '-remote.git'
    git(['init', '-q', '--bare', remote])
    git(['--git-dir', gd, 'remote', 'add', 'backup', remote])
    fs.mkdirSync(path.join(W, 'docs'), { recursive: true })
    fs.writeFileSync(path.join(W, 'docs', 'a.md'), 'a\n')
    plant(gd)
    fs.appendFileSync(path.join(W, 'docs', 'a.md'), 'b\n')
  })
  afterEach(() => {
    for (const p of [HOME, W + '-remote.git']) fs.rmSync(p, { recursive: true, force: true })
  })

  test('both trust checks refuse; TS metaGit and CLI _meta_git run nothing', async () => {
    expect(metaGitTrustProblem(W)).toMatch(says)
    const errs = await tsRun()
    expect(errs).toHaveLength(OPS.length)
    for (const e of errs) expect(e).toBeInstanceOf(MetaGitUntrustedError)
    const r = py()
    expect(r.problem).toMatch(says)
    expect(r.rc.every(([rc, err]) => rc === 128 && err.includes('does not run git'))).toBe(true)
    expect(marks()).toEqual([])
  })

  test('every surface says the refusal and runs nothing', () => {
    const tick = bridge('tick')
    expect(tick.skipReason).toBe('meta-untrusted')
    expect(tick.detail).toMatch(says)
    const backup = bridge('backup')
    expect(backup.reason).toBe('meta-untrusted')
    expect(backup.error).toMatch(says)
    for (const args of [['meta', 'log'], ['meta', 'remote'], ['meta', 'push']]) {
      const r = cli(args)
      expect(r.rc).not.toBe(0)
      expect(r.out).toMatch(says)
      expect(r.out).not.toMatch(/no meta history|no meta remotes|not configured|add it first/)
    }
    expect(cli(['doctor']).out).toMatch(says)
    fs.rmSync(path.join(W, '.prdt', 'po-state.json'))
    const init = cli(['init', '--yes', '--slug', 't848'])
    expect(init.rc).toBe(0)
    expect(init.out).toMatch(says)
    expect(marks()).toEqual([])
  })
})

describe('T-848 fix1 — trust edges', () => {
  test('an empty meta.git dir (no HEAD/objects/refs) is not a repo — nothing to refuse', () => {
    fs.mkdirSync(path.join(W, '.prdt', 'meta.git'), { recursive: true })
    expect(metaGitTrustProblem(W)).toBeNull()
    expect(py().problem).toBeNull()
  })

  test.each([
    ['branch.<b>.remote naming a local path inside the project', './evil.git', true],
    ['branch.<b>.remote "."', '.', true],
    ['branch.<b>.remote naming a configured remote', 'backup', false],
  ])('%s', (_label, value, refused) => {
    const gd = carriedMetaRepo()
    git(['--git-dir', gd, 'remote', 'add', 'backup', 'https://example.invalid/x.git'])
    git(['--git-dir', gd, 'config', 'branch.main.remote', value])
    expect(metaGitTrustProblem(W) !== null).toBe(refused)
    expect(py().problem !== null).toBe(refused)
  })

  test('ext:// (any non-builtin scheme) remote is refused; ssh:// is not', () => {
    const gd = carriedMetaRepo()
    git(['--git-dir', gd, 'remote', 'add', 'backup', 'ext://sh -c touch% /tmp/x'])
    expect(metaGitTrustProblem(W)).toMatch(/remote-helper/)
    expect(py().problem).toMatch(/remote-helper/)
    git(['--git-dir', gd, 'remote', 'set-url', 'backup', 'ssh://git@example.invalid/x.git'])
    expect(metaGitTrustProblem(W)).toBeNull()
    expect(py().problem).toBeNull()
  })

  test('prdt-made repo: status/add/commit/log and push to a local bare remote still work', async () => {
    git(['init', '-q'])
    expect((await initMetaRepo(W)).error).toBeUndefined()
    fs.mkdirSync(path.join(W, 'docs', 'prd'), { recursive: true })
    fs.writeFileSync(path.join(W, 'docs', 'prd', 'a.md'), 'a\n')
    const { commitMeta, scanMetaHistory, addMetaRemote, pushMetaRemote, listMetaRemotes } = await import('../../src/git-workflow/meta-git')
    const c = await commitMeta(W, 'snap')
    expect(c.committed).toBe(true)
    expect((await scanMetaHistory(W)).length).toBe(1)
    const remote = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t848-bk-')))
    try {
      git(['init', '-q', '--bare', remote])
      expect((await addMetaRemote(W, 'backup', remote)).ok).toBe(true)
      expect(await listMetaRemotes(W)).toEqual([{ name: 'backup', url: remote }])
      const p = await pushMetaRemote(W, 'backup')
      expect(p.error).toBeUndefined()
      expect(p.ok).toBe(true)
      expect(metaGitTrustProblem(W)).toBeNull() // branch.<b>.remote=backup after --set-upstream
      expect(py().problem).toBeNull()
    } finally {
      fs.rmSync(remote, { recursive: true, force: true })
    }
  })
})
