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

function writeDoc(root: string, rel: string, body: string) {
  const p = path.join(root, rel)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, body)
}

const DEAD = /discipline-path:/

beforeEach(() => {
  projectDir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-doctor-dead-path-')), 'proj')
  fs.mkdirSync(projectDir, { recursive: true })
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
