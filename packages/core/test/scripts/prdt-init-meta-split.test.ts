/**
 * prdt-init-meta-split.test.ts — T-365 fresh-init meta split, black-box over
 * the REAL `prdt` CLI (`prdt init --json`, the one init SoT CLI+GUI share).
 *
 * Acceptance (docs/tickets/v1.2/T-365.md, revised for PRD §v1.3 설계 결정 2 / T-377):
 *  - Fresh init produces the code `.git` + the meta `.prdt/meta.git` + the
 *    initial meta snapshot + the allowlist config — with zero user git interaction.
 *  - prdt no longer manages the code `.gitignore` at ALL (the managed block was
 *    retired, PRD §v1.3 설계 결정 2): fresh init injects no block, and a
 *    pre-existing user `.gitignore` is left byte-for-byte untouched.
 *  - The meta repo holds the scaffold; derived artifacts are ignored by the META
 *    repo (its `info/exclude`); the code repo tracks zero meta.
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync } from 'child_process'
import { test, expect, describe, beforeEach, afterEach } from 'vitest'
import { DEFAULT_META_ALLOWLIST } from '../../src/git-workflow/meta-git'

// The `.gitignore` managed block was retired in PRD §v1.3 설계 결정 2 (TS side:
// T-376, python side: T-377). These markers are kept ONLY for negative assertions
// — proving no managed block is ever injected anymore.
const MANAGED_BLOCK_START = '# >>> prdt meta (managed) >>>'
const MANAGED_BLOCK_END = '# <<< prdt meta (managed) <<<'

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

describe.skipIf(!PYTHON3)('prdt init — meta split (T-365 / T-377)', () => {
  test('fresh init produces the PHYSICAL layout + allowlist config, no interaction, no managed block', () => {
    const res = runInit()
    expect(res.status).toBe('created')
    expect(res.meta_git).toBe('ok')

    // PHYSICAL layout (PRD §v1.3 §신규 init 레이아웃, T-378): code `.git` lives under
    // `<root>/code/`, NOT at projectRoot; meta `.prdt/meta.git` stays at projectRoot.
    expect(fs.existsSync(path.join(projectDir, 'code', '.git', 'HEAD'))).toBe(true)
    expect(fs.existsSync(path.join(projectDir, '.git'))).toBe(false)
    expect(fs.existsSync(path.join(projectDir, '.prdt', 'meta.git', 'HEAD'))).toBe(true)

    // allowlist config + recorded code.dir
    const cfg = JSON.parse(fs.readFileSync(path.join(projectDir, '.prdt', 'config.json'), 'utf-8'))
    expect(cfg.meta.allowlist).toEqual(DEFAULT_META_ALLOWLIST)
    expect(cfg.slug).toBe('proj')
    expect(cfg.code.dir).toBe('code')

    // §v1.3 설계 결정 2: prdt injects NO code `.gitignore` (fresh code/ had none →
    // none is created; the managed block is gone entirely).
    expect(fs.existsSync(path.join(projectDir, 'code', '.gitignore'))).toBe(false)
    expect(fs.existsSync(path.join(projectDir, '.gitignore'))).toBe(false)

    // meta info/exclude keeps the code tree out of meta `git status` (설계 결정 3)
    const exclude = fs.readFileSync(path.join(projectDir, '.prdt', 'meta.git', 'info', 'exclude'), 'utf-8')
    expect(exclude).toContain('code/')

    // meta repo config mirrors initMetaRepo (identity + global-config neutralizers)
    expect(git([...metaGitArgs(), 'config', 'user.email'])).toBe('prdt@localhost')
    expect(git([...metaGitArgs(), 'config', 'commit.gpgsign'])).toBe('false')
  })

  test('input metric 1: code work-tree = codeRoot, tracks zero meta; meta repo holds the scaffold', () => {
    runInit()
    const codeDir = path.join(projectDir, 'code')

    // code repo lives at codeRoot and tracks nothing (meta lives in the meta repo).
    expect(git(['rev-parse', '--show-toplevel'], codeDir)).toBe(fs.realpathSync(codeDir))
    expect(git(['ls-files'], codeDir)).toBe('')

    // meta `git status` is clean of the code tree (info/exclude code/).
    const metaStatus = git([...metaGitArgs(), 'status', '--porcelain'])
    expect(metaStatus).not.toMatch(/(^|\n)..\s*code\//)

    // meta repo: initial snapshot commit holds the scaffold
    const tracked = git([...metaGitArgs(), 'ls-files']).split('\n')
    expect(tracked).toContain('.prdt/config.json')
    expect(tracked).toContain('.prdt/po-state.json')
    expect(tracked).toContain('docs/wiki/inbox.md')
    expect(tracked).not.toContain('.prdt/index.db') // derived stays out
    expect(git([...metaGitArgs(), 'log', '--format=%s'])).toBe('initial meta snapshot (prdt init)')
  })

  test('derived files and the meta git-dir are ignored by the META repo', () => {
    runInit()
    fs.writeFileSync(path.join(projectDir, '.prdt', 'turns.jsonl'), '{}\n')

    // The code repo no longer ignores meta paths (no managed block, §v1.3 설계 결정 2);
    // the META repo's info/exclude keeps its derived artifacts + own git-dir out.
    for (const p of ['.prdt/meta.git/HEAD', '.prdt/index.db', '.prdt/turns.jsonl']) {
      expect(metaIgnores(p), `meta repo must ignore ${p}`).toBe(true)
    }
    // sanity: real meta files are NOT blanket-ignored by the meta repo
    expect(metaIgnores('.prdt/config.json')).toBe(false)
  })

  test('pre-existing user .gitignore and code .git are preserved untouched (no block appended)', () => {
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

    // user `.gitignore` byte-for-byte untouched — prdt injects no managed block.
    const gitignore = fs.readFileSync(path.join(projectDir, '.gitignore'), 'utf-8')
    expect(gitignore).toBe('node_modules/\ndist/\n')
    expect(gitignore).not.toContain(MANAGED_BLOCK_START)
    expect(gitignore).not.toContain(MANAGED_BLOCK_END)

    // re-init: exists + `.gitignore` still byte-identical (idempotent no-op).
    const again = runInit()
    expect(again.status).toBe('exists')
    expect(fs.readFileSync(path.join(projectDir, '.gitignore'), 'utf-8')).toBe(gitignore)
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
