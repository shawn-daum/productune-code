/**
 * prdt-doctor-dead-discipline-path.test.ts — T-535 recurrence check, black-box
 * over the REAL `prdt` CLI (mirrors prdt-doctor-release-notes.test.ts).
 *
 * Motivating fact: `prdt wiki lint` only resolves `[[wikilink]]` targets inside
 * docs/wiki/ — a plain backtick-quoted path citation in docs/design.md or a
 * persona Tier1 doc (docs/<persona>/habit.md, docs/<persona>/bookshelf/*.md)
 * was invisible to every existing check. T-535 found exactly this: docs/design.md
 * cited `designer/bookshelf/ux-principles.md`, which had been superseded by
 * `designer/style-library/ux-principles.md` — nothing said so.
 *
 * Positive control matters here specifically because a cap/path check like this
 * only proves itself by firing on a planted violation — clean is not evidence
 * clean was actually checked (docs/wiki/fact--discipline-editing.md `## 검증
 * 함정`).
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
/** Extra env for the CLI subprocess — the mirror-scope tests below point
 *  `discipline_root()` at a tree they control. */
let extraEnv: Record<string, string> = {}

function runPrdt(args: string[]): string {
  return execFileSync('python3', [PRDT_CLI, ...args], {
    cwd: projectDir,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 20000,
    env: { ...process.env, ...extraEnv },
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

function writeDoc(root: string, rel: string, body: string) {
  const p = path.join(root, rel)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, body)
}

const DEAD = /discipline-path:/

beforeEach(() => {
  projectDir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-doctor-dead-path-')), 'proj')
  fs.mkdirSync(projectDir, { recursive: true })
  extraEnv = {}
})

afterEach(() => {
  fs.rmSync(path.dirname(projectDir), { recursive: true, force: true })
})

describe.skipIf(!PYTHON3)('prdt doctor — dead discipline-path citation (T-535)', () => {
  test('fires: docs/design.md cites a discipline path that does not exist', () => {
    runInit()
    writeDoc(projectDir, 'docs/design.md',
      '# Design\n\nApplies Tier0 `designer/bookshelf/ux-principles.md`.\n')
    const out = doctor()
    expect(out).toMatch(DEAD)
    expect(out).toMatch(/docs\/design\.md/)
    expect(out).toMatch(/designer\/bookshelf\/ux-principles\.md/)
  })

  test('silent: docs/design.md cites the real code-repo discipline path', () => {
    runInit()
    const codeRoot = path.join(projectDir, 'code')
    writeDoc(codeRoot, 'packages/core/discipline/designer/style-library/ux-principles.md', '# UX\n')
    writeDoc(projectDir, 'docs/design.md',
      '# Design\n\nApplies Tier0 `packages/core/discipline/designer/style-library/ux-principles.md`.\n')
    expect(doctor()).not.toMatch(DEAD)
  })

  test('fires: a persona habit.md cites a dead bookshelf/habit path', () => {
    runInit()
    writeDoc(projectDir, 'docs/po/habit.md', '# PO habit\n\n- see `po/bookshelf/nope.md`\n')
    const out = doctor()
    expect(out).toMatch(DEAD)
    expect(out).toMatch(/docs\/po\/habit\.md/)
  })

  test('silent: a bare sibling-relative filename in a bookshelf page never matches (no false fire on generic examples)', () => {
    runInit()
    writeDoc(projectDir, 'docs/po/bookshelf/example.md',
      '# Example\n\nsplit `routing.md` into `calibration.md` and `escalation.md`.\n')
    expect(doctor()).not.toMatch(DEAD)
  })

  test('silent: a dated log page (decisions.md) is out of scope even with a dead-shaped path', () => {
    runInit()
    writeDoc(projectDir, 'docs/designer/bookshelf/decisions.md',
      '# Decisions\n\n- (2026-05-07) see `~/.productune/po/habit.md`\n')
    expect(doctor()).not.toMatch(DEAD)
  })
})

/**
 * T-565 C3 — the base list left out the tree that actually binds.
 *
 * `dead_discipline_path_warnings` resolves a citation against the meta root, the
 * code root, `<codeRoot>/packages/core/discipline` and the doc's own directory.
 * That third base is the discipline tree AS THIS REPOSITORY LAYS IT OUT — it
 * exists only when the project under inspection is prdt itself. Everywhere else
 * the tree binding the personas is the INSTALLED MIRROR that `discipline_root()`
 * returns, and it was not a base at all.
 *
 * So the "false-positive rate zero" the code comment claims was true of exactly
 * one repository: the one it was measured in. Another prdt project whose
 * `docs/developer/habit.md` cites `developer/playbooks/code-review.md` — a real,
 * live, resolvable path in the mirror every persona reads from — got told it
 * cites nothing. The existing silent case plants the citation under the CODE repo
 * path, so it could not see this: it exercises the one base that happens to exist
 * here.
 *
 * `PRDT_DISCIPLINE` is `discipline_root()`'s own documented first branch and the
 * lever a test uses to drive machine scope without touching the real one.
 */
describe.skipIf(!PYTHON3)('T-565 C3 — the installed mirror is a base too', () => {
  /** A discipline mirror outside the project, holding one real playbook. */
  function seedMirror(rel: string): string {
    const mirror = path.join(path.dirname(projectDir), 'mirror')
    const p = path.join(mirror, rel)
    fs.mkdirSync(path.dirname(p), { recursive: true })
    fs.writeFileSync(p, '# code review\n')
    extraEnv = { PRDT_DISCIPLINE: mirror }
    return mirror
  }

  test('silent: a citation that resolves ONLY in the installed mirror', () => {
    runInit()
    seedMirror('developer/playbooks/code-review.md')
    writeDoc(projectDir, 'docs/developer/habit.md',
      '# Developer habit\n\n- before a review, read `developer/playbooks/code-review.md`\n')
    expect(doctor()).not.toMatch(DEAD)
  })

  test('positive control: same fixture, mirror does NOT hold the path — still fires', () => {
    // Same doc, same citation, same mirror-scoped run: the only difference is
    // that the file is absent from the mirror. Without this the test above would
    // also pass on a check that had simply stopped firing.
    runInit()
    seedMirror('developer/playbooks/something-else.md')
    writeDoc(projectDir, 'docs/developer/habit.md',
      '# Developer habit\n\n- before a review, read `developer/playbooks/code-review.md`\n')
    const out = doctor()
    expect(out).toMatch(DEAD)
    expect(out).toMatch(/developer\/playbooks\/code-review\.md/)
  })

  test('the warning names the mirror among what it checked', () => {
    // The line tells the reader where to look. Listing three bases while
    // consulting four (or four while consulting three) sends them to the wrong
    // tree — which is how C3 survived a code review in the first place.
    runInit()
    seedMirror('developer/playbooks/something-else.md')
    writeDoc(projectDir, 'docs/developer/habit.md',
      '# Developer habit\n\n- read `developer/playbooks/code-review.md`\n')
    const line = doctor().split('\n').find(l => l.includes('discipline-path:')) as string
    expect(line).toBeTruthy()
    expect(line).toMatch(/installed .*mirror|mirror/i)
  })
})
