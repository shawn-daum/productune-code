/**
 * meta-scratch-exclude.test.ts — T-648: verification scratch leaving the
 * machine via the meta autosave / backup push.
 *
 * Root cause: `.prdt` is allowlisted wholesale for the meta repo
 * (META_ALLOWLIST_DEFAULT / DEFAULT_META_ALLOWLIST), and neither exclude list
 * (META_EXCLUDE_DEFAULT in scripts/prdt, DEFAULT_META_EXCLUDE in
 * meta-git.ts) named `scratch/` — exactly where qa/habit.md puts verification
 * screenshots and ad-hoc harness files. Those files became permanent meta
 * commits, pushed off the machine by the one push that needs no per-push
 * consent (the meta backup carve-out).
 *
 * QA's reproduction (ticket body, fixture-only, `/tmp`): a meta git-dir with
 * the CURRENT exclude lists in `info/exclude`, then `git add .prdt docs/prd`
 * — `turns.jsonl` was correctly excluded, but `.prdt/scratch/verify-shot.png`,
 * `.prdt/scratch/adhoc-harness.mjs` and `.prdt/po.lock` were all staged. This
 * file reuses that shape over the REAL `prdt` CLI (mirrors
 * prdt-doctor-meta-drift.test.ts), black-box: run `prdt init` for a real meta
 * repo + real `info/exclude`, drop the QA fixture files under `.prdt`, stage
 * with the same raw `git add .prdt docs/prd`, and assert what got staged.
 *
 * Must fail on today's (pre-T-648) code — the scratch files were staged —
 * and pass after `scratch/` (+ the judged siblings `po.lock`,
 * `gui-bootstrap.json`, `update-state.json`) land in both exclude lists.
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

let projectDir: string

function runPrdt(args: string[]): string {
  return execFileSync('python3', [PRDT_CLI, ...args], {
    cwd: projectDir,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 20000,
  })
}

function runInit(): void {
  runPrdt(['init', '--json', '--slug', 'proj', '--yes'])
}

function metaGitArgs(): string[] {
  return ['--git-dir', path.join(projectDir, '.prdt', 'meta.git'), '--work-tree', projectDir]
}

function metaGit(args: string[]): string {
  return execFileSync('git', [...metaGitArgs(), ...args], {
    cwd: projectDir,
    encoding: 'utf-8',
  }).trim()
}

function stagedFiles(): string[] {
  const out = metaGit(['diff', '--cached', '--name-only'])
  return out ? out.split('\n') : []
}

beforeEach(() => {
  projectDir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t648-')), 'proj')
  fs.mkdirSync(projectDir, { recursive: true })
})

afterEach(() => {
  fs.rmSync(path.dirname(projectDir), { recursive: true, force: true })
})

describe.skipIf(!PYTHON3)('meta info/exclude — verification scratch never lands in meta history (T-648)', () => {
  test('QA repro: .prdt/scratch/* + po.lock stay unstaged after `git add .prdt docs/prd`', () => {
    runInit()

    fs.mkdirSync(path.join(projectDir, '.prdt', 'scratch'), { recursive: true })
    fs.writeFileSync(path.join(projectDir, '.prdt', 'scratch', 'verify-shot.png'), 'fake-png-bytes')
    fs.writeFileSync(path.join(projectDir, '.prdt', 'scratch', 'adhoc-harness.mjs'), 'console.log(1)')
    fs.writeFileSync(path.join(projectDir, '.prdt', 'po.lock'), '')

    metaGit(['add', '.prdt', 'docs/prd'])
    const staged = stagedFiles()

    expect(staged).not.toContain('.prdt/scratch/verify-shot.png')
    expect(staged).not.toContain('.prdt/scratch/adhoc-harness.mjs')
    expect(staged).not.toContain('.prdt/po.lock')

    // Positive control: the add must still do real work, so a genuine drift
    // (uncommitted PRD.md edit) DOES stage — a totally broken/no-op `add`
    // would make the assertions above pass for the wrong reason.
    fs.appendFileSync(path.join(projectDir, 'docs', 'prd', 'PRD.md'), '\nmore\n')
    metaGit(['add', '.prdt', 'docs/prd'])
    expect(stagedFiles()).toContain('docs/prd/PRD.md')
  })

  test('the judged siblings (gui-bootstrap.json, update-state.json) also stay unstaged under .prdt', () => {
    runInit()

    fs.writeFileSync(path.join(projectDir, '.prdt', 'gui-bootstrap.json'), '{}')
    fs.writeFileSync(path.join(projectDir, '.prdt', 'update-state.json'), '{}')

    metaGit(['add', '.prdt', 'docs/prd'])
    const staged = stagedFiles()

    expect(staged).not.toContain('.prdt/gui-bootstrap.json')
    expect(staged).not.toContain('.prdt/update-state.json')
  })

  test('scratch/ and the three siblings are byte-parity across scripts/prdt and meta-git.ts', () => {
    const pyText = fs.readFileSync(PRDT_CLI, 'utf-8')
    const tsText = fs.readFileSync(
      path.join(CORE_ROOT, 'src', 'git-workflow', 'meta-git.ts'),
      'utf-8',
    )
    for (const entry of ['scratch/', 'po.lock', 'gui-bootstrap.json', 'update-state.json']) {
      expect(pyText).toContain(`"${entry}"`)
      expect(tsText).toContain(`'${entry}'`)
    }
  })
})
