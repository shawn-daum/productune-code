/**
 * prdt-doctor-readme-staleness.test.ts — T-589, the README's release-time duty
 * landed at 37e98bf (po/playbooks/retro.md + patch-cycle.md §Rules): the same
 * change that cuts a `v*` tag must leave `<codeRoot>/README.md` true of that
 * tag's own tree. Black-box over the REAL `prdt` CLI, mirroring
 * prdt-doctor-release-notes.test.ts's harness.
 *
 * Ground truth (repo paths, the CLI's registered subcommands, its PERSONAS /
 * STAGES vocabulary) is read from the TAGGED tree, never the working tree —
 * so every fixture here plants its own toy CLI stub at
 * `packages/core/scripts/prdt` inside the sandboxed project and commits it
 * before tagging, rather than depending on this repo's own real CLI shape.
 *
 * The measured false-positive (T-589 §spec): a project-structure illustration
 * block (no shell info string) reads as a command block to a naive scanner.
 * `readme-illustration-block-is-not-scanned` is the fixture that fails without
 * the block-selection rule — plant a dead-looking path ONLY inside a
 * non-runnable fenced block and assert doctor stays silent.
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

function runInit(): any {
  return JSON.parse(runPrdt(['init', '--json', '--slug', 'proj', '--yes']))
}

function doctor(): string {
  try {
    return runPrdt(['doctor'])
  } catch (e: any) {
    throw new Error(`prdt doctor failed: ${e.stderr || e.message}`)
  }
}

function git(dir: string, ...a: string[]) {
  return execFileSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a], {
    encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'],
  })
}

function writeFile(root: string, rel: string, body: string) {
  const p = path.join(root, rel)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, body)
}

// A toy CLI stub: never imported/executed by the check (T-589's own predicate
// is a TEXT parse of the tagged source), so it only needs to look enough like
// the real thing for `add_parser(...)` / `PERSONAS = (...)` / `STAGES = (...)`
// to be there literally.
function cliStub(opts: { subcommands: string[]; personas: string[]; stages: string[] }) {
  const parsers = opts.subcommands.map((c) => `    p = sub.add_parser("${c}", help="toy")`).join('\n')
  const personas = opts.personas.map((p) => `"${p}"`).join(', ')
  const stages = opts.stages.map((s) => `"${s}"`).join(', ')
  return `"""toy prdt CLI stub for T-589 fixtures — never executed, only text-parsed."""\nPERSONAS = (${personas})\nSTAGES = (${stages})\n\n\ndef main():\n    import argparse\n    ap = argparse.ArgumentParser(prog="prdt")\n    sub = ap.add_subparsers(dest="cmd")\n${parsers}\n`
}

const DEFAULT_CMDS = ['doctor', 'wiki', 'tickets', 'hidden']
const DEFAULT_PERSONAS = ['po', 'designer', 'developer', 'qa']
const DEFAULT_STAGES = ['define', 'build', 'ship', 'retro', 'idle']

/** Plants README.md + the toy CLI stub + `scripts/install.sh` (a path the
 * default README's runnable block names, so it must resolve), commits, tags. */
function plantAndTag(codeRoot: string, tag: string, readme: string, opts?: Partial<{
  subcommands: string[]; personas: string[]; stages: string[]
}>) {
  fs.mkdirSync(codeRoot, { recursive: true })
  git(codeRoot, 'init', '-q')
  writeFile(codeRoot, 'scripts/install.sh', '#!/bin/sh\necho toy\n')
  writeFile(codeRoot, 'packages/core/scripts/prdt', cliStub({
    subcommands: opts?.subcommands ?? DEFAULT_CMDS,
    personas: opts?.personas ?? DEFAULT_PERSONAS,
    stages: opts?.stages ?? DEFAULT_STAGES,
  }))
  writeFile(codeRoot, 'README.md', readme)
  git(codeRoot, 'add', '-A')
  git(codeRoot, 'commit', '-q', '-m', 'seed')
  git(codeRoot, 'tag', tag)
}

const HEALTHY_README = `# toy

## Usage

\`\`\`bash
prdt doctor    # lint
prdt wiki      # wiki ops
prdt tickets   # ticket ops
scripts/install.sh   # setup
\`\`\`

## Structure (generated project, illustrative)

\`\`\`
docs/tickets/<version>/T-NNN.md
\`\`\`

## Personas & stages

prdt-po → prdt-designer → prdt-developer → prdt-qa

lifecycle: Define → Build → Ship → Retro → idle
`

const README_RE = /readme:.*/
const readmeLines = (out: string) => out.split('\n').filter((l) => README_RE.test(l))

beforeEach(() => {
  projectDir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-doctor-readme-')), 'proj')
  fs.mkdirSync(projectDir, { recursive: true })
})

afterEach(() => {
  fs.rmSync(path.dirname(projectDir), { recursive: true, force: true })
})

describe.skipIf(!PYTHON3)('prdt doctor — README staleness at a cut tag (T-589)', () => {
  test('clean: healthy README at the tag produces no readme violation, only the advisory', () => {
    runInit()
    plantAndTag(path.join(projectDir, 'code'), 'v1.0', HEALTHY_README)
    const out = doctor()
    const lines = readmeLines(out)
    expect(lines.length).toBe(1)
    expect(lines[0]).toMatch(/advisory|never shows or names/i)
    expect(lines[0]).toMatch(/hidden/)
    expect(lines[0]).not.toMatch(/stale against the shipped tag/)
    expect(lines[0]).not.toMatch(/vocabulary disagrees/)
  })

  test('silent: no tag at all (degrade-never-raise)', () => {
    runInit()
    const codeRoot = path.join(projectDir, 'code')
    fs.mkdirSync(codeRoot, { recursive: true })
    git(codeRoot, 'init', '-q')
    writeFile(codeRoot, 'README.md', HEALTHY_README)
    git(codeRoot, 'add', '-A')
    git(codeRoot, 'commit', '-q', '-m', 'seed')
    expect(readmeLines(doctor())).toHaveLength(0)
  })

  test('silent: code repo absent / not a git repo', () => {
    runInit()
    expect(readmeLines(doctor())).toHaveLength(0)
  })

  test('violation: a repo path named in a runnable block does not resolve at the tag', () => {
    runInit()
    const readme = HEALTHY_README.replace('scripts/install.sh   # setup', 'scripts/does-not-exist.sh   # setup')
    plantAndTag(path.join(projectDir, 'code'), 'v1.0', readme)
    const out = doctor()
    const lines = readmeLines(out)
    expect(lines.some((l) => /stale against the shipped tag/.test(l) && /scripts\/does-not-exist\.sh/.test(l))).toBe(true)
  })

  test('violation: a `prdt <subcommand>` shown in a runnable block is not one the tagged CLI accepts', () => {
    runInit()
    const readme = HEALTHY_README.replace('prdt tickets   # ticket ops', 'prdt tickets   # ticket ops\nprdt bogus     # not registered')
    plantAndTag(path.join(projectDir, 'code'), 'v1.0', readme)
    const out = doctor()
    const lines = readmeLines(out)
    expect(lines.some((l) => /stale against the shipped tag/.test(l) && /prdt bogus/.test(l))).toBe(true)
  })

  test('readme-illustration-block-is-not-scanned: a dead-looking path ONLY inside a non-runnable illustration block raises nothing — fails without the block-selection rule', () => {
    runInit()
    // The illustration block below names a path that plainly does not resolve
    // at the tag (`docs/tickets/<version>/T-NNN.md`, a placeholder) — if the
    // scan did not restrict itself to shell-family fenced blocks, this alone
    // would fire finding A. It must not.
    plantAndTag(path.join(projectDir, 'code'), 'v1.0', HEALTHY_README)
    const out = doctor()
    const lines = readmeLines(out)
    expect(lines.some((l) => /T-NNN/.test(l))).toBe(false)
    expect(lines.some((l) => /stale against the shipped tag/.test(l))).toBe(false)
  })

  test('violation: README names a persona `prdt-<x>` the tagged CLI does not ship', () => {
    runInit()
    const readme = HEALTHY_README.replace('prdt-po → prdt-designer → prdt-developer → prdt-qa',
      'prdt-po → prdt-designer → prdt-developer → prdt-qa → prdt-nobody')
    plantAndTag(path.join(projectDir, 'code'), 'v1.0', readme)
    const out = doctor()
    const lines = readmeLines(out)
    expect(lines.some((l) => /persona vocabulary disagrees/.test(l) && /nobody/.test(l))).toBe(true)
  })

  test('violation: README never presents a persona the tagged CLI ships', () => {
    runInit()
    const readme = HEALTHY_README.replace('prdt-po → prdt-designer → prdt-developer → prdt-qa', 'prdt-po → prdt-designer → prdt-developer')
    plantAndTag(path.join(projectDir, 'code'), 'v1.0', readme)
    const out = doctor()
    const lines = readmeLines(out)
    expect(lines.some((l) => /persona vocabulary disagrees/.test(l) && /never presents shipped persona.*qa/.test(l))).toBe(true)
  })

  test('violation: README names a stage the tagged CLI does not ship', () => {
    runInit()
    const readme = HEALTHY_README.replace('lifecycle: Define → Build → Ship → Retro → idle',
      'lifecycle: Define → Build → Ship → Retro → idle → limbo')
    plantAndTag(path.join(projectDir, 'code'), 'v1.0', readme)
    const out = doctor()
    const lines = readmeLines(out)
    expect(lines.some((l) => /stage vocabulary disagrees/.test(l) && /limbo/.test(l))).toBe(true)
  })

  test('violation: README never presents a stage the tagged CLI ships', () => {
    runInit()
    const readme = HEALTHY_README.replace('lifecycle: Define → Build → Ship → Retro → idle',
      'lifecycle: Define → Build → Ship → Retro')
    plantAndTag(path.join(projectDir, 'code'), 'v1.0', readme)
    const out = doctor()
    const lines = readmeLines(out)
    expect(lines.some((l) => /stage vocabulary disagrees/.test(l) && /never presents shipped stage.*idle/.test(l))).toBe(true)
  })

  test('evaluates the NEWEST version-shaped tag, not an older one', () => {
    const codeRoot = path.join(projectDir, 'code')
    runInit()
    plantAndTag(codeRoot, 'v1.0', HEALTHY_README.replace('scripts/install.sh   # setup', 'scripts/does-not-exist.sh   # setup'))
    // v1.1: fix landed AFTER the bad v1.0 cut — the newest tag is clean.
    writeFile(codeRoot, 'README.md', HEALTHY_README)
    git(codeRoot, 'add', '-A')
    git(codeRoot, 'commit', '-q', '-m', 'fix readme')
    git(codeRoot, 'tag', 'v1.1')
    const out = doctor()
    const lines = readmeLines(out)
    expect(lines.some((l) => /stale against the shipped tag/.test(l))).toBe(false)
    expect(lines.some((l) => /v1\.1 ships/.test(l))).toBe(true)
  })

  test('a v-prefixed non-release tag is not evaluated', () => {
    const codeRoot = path.join(projectDir, 'code')
    runInit()
    fs.mkdirSync(codeRoot, { recursive: true })
    git(codeRoot, 'init', '-q')
    writeFile(codeRoot, 'README.md', 'stale nonsense, never a v* tag cut against it\n')
    git(codeRoot, 'add', '-A')
    git(codeRoot, 'commit', '-q', '-m', 'seed')
    git(codeRoot, 'tag', 'vendor-sync')
    expect(readmeLines(doctor())).toHaveLength(0)
  })
})
