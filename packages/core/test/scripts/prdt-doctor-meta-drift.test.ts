/**
 * prdt-doctor-meta-drift.test.ts — T-428 meta silent-drift surfacing,
 * black-box over the REAL `prdt` CLI (mirrors prdt-init-meta-split.test.ts /
 * prdt-trust-accept.test.ts).
 *
 * Root cause (T-427): meta state going wrong (backup remote 100-commit lag,
 * docs/design.md silently uncaptured for 56 lines) had ZERO surface anywhere
 * — `prdt doctor` is the one signal point in prdt's design, so these three
 * classes must show up there, warning-only, never a gate.
 *
 * Acceptance (docs/tickets/v1.6/T-428.md):
 *  1. backup-remote lag (unpushed count + last-push age) — no remote is
 *     surfaced too, one line, not silence.
 *  2. a meta-shaped file outside the effective allowlist with an uncommitted
 *     change — the docs/design.md failure class, generalized.
 *  3. the CLI's default allowlist lints against core's DEFAULT_META_ALLOWLIST
 *     (meta-git.ts) — the same T-427-audited fixed-path set, parity-checked.
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

function runPrdt(cli: string, args: string[]): string {
  return execFileSync('python3', [cli, ...args], {
    cwd: projectDir,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 20000,
  })
}

function runInit(): any {
  return JSON.parse(runPrdt(PRDT_CLI, ['init', '--json', '--slug', 'proj', '--yes']))
}

function doctor(cli = PRDT_CLI): string {
  // doctor never fails the process (non-blocking) — but reindex/db work could
  // theoretically throw, so surface stderr on unexpected non-zero exit.
  try {
    return runPrdt(cli, ['doctor'])
  } catch (e: any) {
    throw new Error(`prdt doctor failed: ${e.stderr || e.message}`)
  }
}

function metaGitArgs(): string[] {
  return ['--git-dir', path.join(projectDir, '.prdt', 'meta.git'), '--work-tree', projectDir]
}

function metaGit(args: string[], env: Record<string, string> = {}): string {
  return execFileSync('git', [...metaGitArgs(), ...args], {
    cwd: projectDir,
    encoding: 'utf-8',
    env: { ...process.env, ...env },
  }).trim()
}

beforeEach(() => {
  projectDir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-doctor-meta-')), 'proj')
  fs.mkdirSync(projectDir, { recursive: true })
})

afterEach(() => {
  fs.rmSync(path.dirname(projectDir), { recursive: true, force: true })
})

describe.skipIf(!PYTHON3)('prdt doctor — meta backup lag (T-428 item 1)', () => {
  test('no backup remote configured → one-line notice, not silence', () => {
    runInit()
    const out = doctor()
    expect(out).toContain('no backup remote configured')
    expect(out).toMatch(/prdt meta remote add/)
  })

  test('remote configured but never pushed', () => {
    runInit()
    const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-doctor-bare-'))
    execFileSync('git', ['init', '--bare', '-q', bare])
    metaGit(['remote', 'add', 'backup', bare])
    const out = doctor()
    expect(out).toContain("backup remote 'backup' never pushed")
    fs.rmSync(bare, { recursive: true, force: true })
  })

  test('healthy: pushed, low unpushed count, fresh → silent', () => {
    runInit()
    const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-doctor-bare-'))
    execFileSync('git', ['init', '--bare', '-q', bare])
    metaGit(['remote', 'add', 'backup', bare])
    metaGit(['push', 'backup', 'main'])
    const out = doctor()
    expect(out).not.toContain('meta:')
    expect(out).toContain('doctor: clean')
    fs.rmSync(bare, { recursive: true, force: true })
  })

  test('unpushed COMMIT COUNT past threshold warns (even same-day)', () => {
    runInit()
    const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-doctor-bare-'))
    execFileSync('git', ['init', '--bare', '-q', bare])
    metaGit(['remote', 'add', 'backup', bare])
    metaGit(['push', 'backup', 'main'])
    // empty commits — no file churn needed to exceed the count threshold, keeps
    // this test fast under full-suite parallel load (avoids the timeout).
    for (let i = 0; i < 55; i++) {
      metaGit(['commit', '-q', '--allow-empty', '-m', `note ${i}`])
    }
    const out = doctor()
    expect(out).toMatch(/backup remote 'backup' lag — \d+ unpushed commit/)
    expect(out).toMatch(/55 unpushed commit/)
    fs.rmSync(bare, { recursive: true, force: true })
  }, 20000)

  test('stale last-push AGE past threshold warns even with zero new commits', () => {
    runInit()
    const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-doctor-bare-'))
    execFileSync('git', ['init', '--bare', '-q', bare])
    metaGit(['remote', 'add', 'backup', bare])
    const old = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()
    metaGit(['commit', '--amend', '--no-edit', '--date', old], { GIT_COMMITTER_DATE: old })
    metaGit(['push', 'backup', 'main'])
    // zero unpushed commits (just pushed) — only the backdated push age should trigger.
    expect(metaGit(['rev-list', '--count', 'refs/remotes/backup/main..HEAD'])).toBe('0')
    const out = doctor()
    expect(out).toMatch(/backup remote 'backup' lag — 0 unpushed commit\(s\), last push ~(2[89]|3[01])d ago/)
    fs.rmSync(bare, { recursive: true, force: true })
  })
})

describe.skipIf(!PYTHON3)('prdt doctor — meta allowlist drift (T-428 item 2)', () => {
  test('a new docs/*.md file outside the allowlist, uncommitted, is flagged', () => {
    runInit()
    fs.writeFileSync(path.join(projectDir, 'docs', 'scratch-note.md'), 'hello\n')
    const out = doctor()
    expect(out).toContain('docs/scratch-note.md')
    expect(out).toMatch(/outside the effective meta allowlist/)
  })

  test('a modified file INSIDE the allowlist is normal pending work, not drift', () => {
    runInit()
    fs.appendFileSync(path.join(projectDir, 'docs', 'wiki', 'log.md'), '- normal edit\n')
    const out = doctor()
    expect(out).not.toMatch(/outside the effective meta allowlist/)
  })

  test('adding the file to config.json meta.allowlist silences the warning (the actual fix path)', () => {
    runInit()
    fs.writeFileSync(path.join(projectDir, 'docs', 'scratch-note.md'), 'hello\n')
    expect(doctor()).toContain('docs/scratch-note.md')

    const cfgPath = path.join(projectDir, '.prdt', 'config.json')
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'))
    cfg.meta.allowlist.push('docs/scratch-note.md')
    fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2))

    const out = doctor()
    expect(out).not.toContain('docs/scratch-note.md')
  })

  // T-428 QA fail: `git status --porcelain` C-quotes non-ASCII/space paths
  // (leading `"` + octal escapes for non-ASCII, or just `"..."` for a bare
  // space) — covered() was prefix-matching that quoted string against the
  // allowlist's plain unquoted entries, so an allowlisted file with such a
  // name still warned (silent-noise discipline violated), AND a genuinely
  // outside file could never be silenced via the advertised config.json fix
  // (quoted path added there would never equal the quoted git status path
  // either, since quoting isn't stable input a human would type).
  test('non-ASCII filename INSIDE the allowlist (docs/wiki) stays silent', () => {
    runInit()
    fs.writeFileSync(path.join(projectDir, 'docs', 'wiki', '회고노트.md'), 'hello\n')
    const out = doctor()
    expect(out).not.toMatch(/outside the effective meta allowlist/)
  })

  test('space-containing filename INSIDE the allowlist (docs/wiki) stays silent', () => {
    runInit()
    fs.writeFileSync(path.join(projectDir, 'docs', 'wiki', 'my note.md'), 'hello\n')
    const out = doctor()
    expect(out).not.toMatch(/outside the effective meta allowlist/)
  })

  test('non-ASCII filename OUTSIDE the allowlist warns with the UNQUOTED path, and adding it to config.json silences it', () => {
    runInit()
    fs.writeFileSync(path.join(projectDir, 'docs', '회고노트.md'), 'hello\n')
    const out = doctor()
    expect(out).toContain('docs/회고노트.md')
    expect(out).not.toMatch(/\\355\\232\\214/) // no octal-escaped C-quoting leaked into the message
    expect(out).toMatch(/outside the effective meta allowlist/)

    const cfgPath = path.join(projectDir, '.prdt', 'config.json')
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'))
    cfg.meta.allowlist.push('docs/회고노트.md')
    fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2))

    const silenced = doctor()
    expect(silenced).not.toContain('docs/회고노트.md')
  })

  test('space-containing filename OUTSIDE the allowlist warns with the UNQUOTED path, and adding it to config.json silences it', () => {
    runInit()
    fs.writeFileSync(path.join(projectDir, 'docs', 'my note.md'), 'hello\n')
    const out = doctor()
    expect(out).toContain('docs/my note.md')
    expect(out).not.toContain('"docs/my note.md"') // no quote-wrapping leaked into the message
    expect(out).toMatch(/outside the effective meta allowlist/)

    const cfgPath = path.join(projectDir, '.prdt', 'config.json')
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'))
    cfg.meta.allowlist.push('docs/my note.md')
    fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2))

    const silenced = doctor()
    expect(silenced).not.toContain('docs/my note.md')
  })
})

describe.skipIf(!PYTHON3)('prdt doctor — allowlist fixed-path parity vs core (T-428 item 3)', () => {
  const PY_DEFAULT = [
    '.prdt', '.productune', 'briefs', 'docs/design.md', 'docs/prd', 'docs/tickets',
    'docs/wiki', 'docs/designer', 'docs/developer', 'docs/po', 'docs/qa',
    'docs/artifacts', 'docs/retrospectives', 'docs/archive',
  ]

  /** A throwaway copy of the CLI script + a fixture TS sibling at the SAME
   * relative path (`../src/git-workflow/meta-git.ts`) the real repo has — lets
   * us flip the TS-side default without ever touching the real repo file. */
  function cliWithTsAllowlist(entries: string[]): string {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-cli-copy-'))
    fs.mkdirSync(path.join(tmp, 'scripts'), { recursive: true })
    const cli = path.join(tmp, 'scripts', 'prdt')
    fs.copyFileSync(PRDT_CLI, cli)
    fs.chmodSync(cli, 0o755)
    fs.mkdirSync(path.join(tmp, 'src', 'git-workflow'), { recursive: true })
    const body = entries.map((e) => `  '${e}',`).join('\n')
    fs.writeFileSync(
      path.join(tmp, 'src', 'git-workflow', 'meta-git.ts'),
      `export const DEFAULT_META_ALLOWLIST: string[] = [\n${body}\n]\n`,
    )
    return cli
  }

  test('real repo: python default and core meta-git.ts default are in parity (no warning)', () => {
    runInit()
    const out = doctor()
    expect(out).not.toMatch(/allowlist default drift/)
  })

  test('matching TS fixture → no parity warning', () => {
    runInit()
    const cli = cliWithTsAllowlist(PY_DEFAULT)
    const out = doctor(cli)
    expect(out).not.toMatch(/allowlist default drift/)
  })

  test('TS fixture missing an entry the python default carries → parity warning names it', () => {
    runInit()
    const cli = cliWithTsAllowlist(PY_DEFAULT.filter((e) => e !== 'docs/design.md'))
    const out = doctor(cli)
    expect(out).toMatch(/allowlist default drift vs core meta-git\.ts/)
    expect(out).toContain('docs/design.md')
  })

  test('installed mirror (no TS sibling at all) skips the check silently — never raises', () => {
    runInit()
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-cli-noTS-'))
    fs.mkdirSync(path.join(tmp, 'scripts'), { recursive: true })
    const cli = path.join(tmp, 'scripts', 'prdt')
    fs.copyFileSync(PRDT_CLI, cli)
    fs.chmodSync(cli, 0o755)
    const out = doctor(cli)
    expect(out).not.toMatch(/allowlist default drift/)
  })
})
