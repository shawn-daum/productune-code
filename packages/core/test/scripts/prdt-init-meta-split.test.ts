/**
 * prdt-init-meta-split.test.ts — T-365 fresh-init meta split, black-box over
 * the REAL `prdt` CLI (`prdt init --json`, the one init SoT CLI+GUI share).
 *
 * Acceptance (docs/tickets/v1.2/T-365.md):
 *  - Fresh init produces the code `.git` + the meta `.prdt/meta.git`, the
 *    injected managed `.gitignore` block, and the allowlist config — with
 *    zero user git interaction.
 *  - Managed block rewrite is idempotent and never touches lines outside the
 *    markers.
 *  - Derived files and the meta git-dir are ignored by BOTH repos.
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync } from 'child_process'
import { test, expect, describe, beforeEach, afterEach } from 'vitest'
import {
  MANAGED_BLOCK_START,
  MANAGED_BLOCK_END,
  renderManagedBlock,
} from '../../src/git-workflow/gitignore-managed-block'
import { DEFAULT_META_ALLOWLIST } from '../../src/git-workflow/meta-git'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const PRDT_CLI = path.join(CORE_ROOT, 'scripts', 'prdt')

function which(bin: string): string | null {
  try { return execFileSync('which', [bin], { encoding: 'utf8' }).trim() || null } catch { return null }
}
const PYTHON3 = which('python3')

let projectDir: string

function runInit(args: string[] = []): any {
  const out = execFileSync('python3', [PRDT_CLI, 'init', '--json', '--slug', 'proj', ...args], {
    cwd: projectDir,
    encoding: 'utf-8',
    // zero user interaction — a prompt would hang and trip the timeout
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 15000,
  })
  return JSON.parse(out)
}

function git(args: string[], cwd = projectDir): string {
  return execFileSync('git', args, { cwd, encoding: 'utf-8' }).trim()
}

/** exit 0 from `git check-ignore -q` = the path IS ignored. */
function codeIgnores(p: string): boolean {
  try {
    execFileSync('git', ['check-ignore', '-q', p], { cwd: projectDir })
    return true
  } catch {
    return false
  }
}

function metaGitArgs(): string[] {
  return ['--git-dir', path.join(projectDir, '.prdt', 'meta.git'), '--work-tree', projectDir]
}

function metaIgnores(p: string): boolean {
  try {
    execFileSync('git', [...metaGitArgs(), 'check-ignore', '-q', p], { cwd: projectDir })
    return true
  } catch {
    return false
  }
}

beforeEach(() => {
  projectDir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-init-meta-')), 'proj')
  fs.mkdirSync(projectDir, { recursive: true })
})

afterEach(() => {
  fs.rmSync(path.dirname(projectDir), { recursive: true, force: true })
})

describe.skipIf(!PYTHON3)('prdt init — meta split (T-365)', () => {
  test('fresh init produces both repos + managed block + allowlist config, no interaction', () => {
    const res = runInit()
    expect(res.status).toBe('created')
    expect(res.meta_git).toBe('ok')

    // both repos
    expect(fs.existsSync(path.join(projectDir, '.git', 'HEAD'))).toBe(true)
    expect(fs.existsSync(path.join(projectDir, '.prdt', 'meta.git', 'HEAD'))).toBe(true)

    // allowlist config
    const cfg = JSON.parse(fs.readFileSync(path.join(projectDir, '.prdt', 'config.json'), 'utf-8'))
    expect(cfg.meta.allowlist).toEqual(DEFAULT_META_ALLOWLIST)
    expect(cfg.slug).toBe('proj')

    // managed block — byte-identical to the TS renderer (resync produces no diff)
    const gitignore = fs.readFileSync(path.join(projectDir, '.gitignore'), 'utf-8')
    expect(gitignore).toBe(renderManagedBlock(DEFAULT_META_ALLOWLIST) + '\n')

    // meta repo config mirrors initMetaRepo (identity + global-config neutralizers)
    expect(git([...metaGitArgs(), 'config', 'user.email'])).toBe('prdt@localhost')
    expect(git([...metaGitArgs(), 'config', 'commit.gpgsign'])).toBe('false')
  })

  test('input metric 1: code repo tracks zero meta; meta repo holds the scaffold', () => {
    runInit()

    // code repo: nothing staged/tracked, and status shows no meta noise
    expect(git(['ls-files'])).toBe('')
    const status = git(['status', '--porcelain']).split('\n').filter(Boolean)
    expect(status).toEqual(['?? .gitignore']) // the only visible code-repo file

    // meta repo: initial snapshot commit holds the scaffold
    const tracked = git([...metaGitArgs(), 'ls-files']).split('\n')
    expect(tracked).toContain('.prdt/config.json')
    expect(tracked).toContain('.prdt/po-state.json')
    expect(tracked).toContain('docs/wiki/inbox.md')
    expect(tracked).not.toContain('.prdt/index.db') // derived stays out
    expect(git([...metaGitArgs(), 'log', '--format=%s'])).toBe('initial meta snapshot (prdt init)')
  })

  test('derived files and the meta git-dir are ignored by BOTH repos', () => {
    runInit()
    fs.writeFileSync(path.join(projectDir, '.prdt', 'turns.jsonl'), '{}\n')

    for (const p of ['.prdt/meta.git/HEAD', '.prdt/index.db', '.prdt/turns.jsonl']) {
      expect(codeIgnores(p), `code repo must ignore ${p}`).toBe(true)
      expect(metaIgnores(p), `meta repo must ignore ${p}`).toBe(true)
    }
    // sanity: real files are NOT blanket-ignored
    expect(codeIgnores('src/app.ts')).toBe(false)
    expect(metaIgnores('.prdt/config.json')).toBe(false)
  })

  test('pre-existing user .gitignore and code .git are preserved; re-init is idempotent', () => {
    // user project: own git history + own .gitignore
    git(['init', '-q'])
    git(['config', 'user.email', 'u@test'])
    git(['config', 'user.name', 'u'])
    fs.writeFileSync(path.join(projectDir, 'app.js'), 'x\n')
    fs.writeFileSync(path.join(projectDir, '.gitignore'), 'node_modules/\ndist/\n')
    git(['add', 'app.js', '.gitignore'])
    git(['commit', '-qm', 'user history'])
    const headBefore = git(['rev-parse', 'HEAD'])

    const res = runInit()
    expect(res.status).toBe('created')
    expect(res.meta_git).toBe('ok')

    // code repo untouched (no re-init, no commit made by prdt)
    expect(git(['rev-parse', 'HEAD'])).toBe(headBefore)

    // user lines intact, block appended after them
    const gitignore = fs.readFileSync(path.join(projectDir, '.gitignore'), 'utf-8')
    expect(gitignore.startsWith('node_modules/\ndist/\n')).toBe(true)
    expect(gitignore).toContain(MANAGED_BLOCK_START)
    expect(gitignore.trimEnd().endsWith(MANAGED_BLOCK_END)).toBe(true)

    // re-init: exists + byte-identical .gitignore (idempotent, single block)
    const again = runInit()
    expect(again.status).toBe('exists')
    const after = fs.readFileSync(path.join(projectDir, '.gitignore'), 'utf-8')
    expect(after).toBe(gitignore)
    expect(after.split(MANAGED_BLOCK_START).length).toBe(2)
  })

  test('allowlist edit in config.json propagates to the block on the next init touch', () => {
    runInit()
    const cfgPath = path.join(projectDir, '.prdt', 'config.json')
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'))
    cfg.meta.allowlist = [...cfg.meta.allowlist, 'docs/backlog.md']
    fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + '\n')

    const res = runInit() // already-initialized touch → idempotent resync
    expect(res.status).toBe('exists')
    const gitignore = fs.readFileSync(path.join(projectDir, '.gitignore'), 'utf-8')
    expect(gitignore.split('\n')).toContain('/docs/backlog.md')
  })

  test('field-preserving config merge: partial config.json survives init (regression)', () => {
    // partial project: config exists (custom allowlist + unknown field) but no po-state
    fs.mkdirSync(path.join(projectDir, '.prdt'), { recursive: true })
    fs.writeFileSync(
      path.join(projectDir, '.prdt', 'config.json'),
      JSON.stringify({
        slug: 'kept-slug',
        custom_field: 'kept',
        meta: { allowlist: ['.prdt', 'docs/prd'] },
      }),
    )

    const res = runInit()
    expect(res.status).toBe('created')

    const cfg = JSON.parse(fs.readFileSync(path.join(projectDir, '.prdt', 'config.json'), 'utf-8'))
    expect(cfg.slug).toBe('kept-slug')
    expect(cfg.custom_field).toBe('kept')
    expect(cfg.meta.allowlist).toEqual(['.prdt', 'docs/prd']) // custom allowlist NOT reset
    expect(typeof cfg.created_at).toBe('string')
  })
})
