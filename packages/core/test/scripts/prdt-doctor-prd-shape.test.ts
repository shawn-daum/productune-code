/**
 * prdt-doctor-prd-shape.test.ts — T-657 PRD layout check, black-box over the
 * REAL `prdt` CLI (mirrors prdt-doctor-release-notes.test.ts).
 *
 * Observed violation (ntf-pm, measured 2026-09-18): their `docs/prd/PRD.md`
 * held TWO `## v` sections for 8 days after the v1.9 contract required exactly
 * one, and no tool ever said so. contracts §Fixed paths now puts every closed
 * version section in its own `docs/prd/versions/v<N>.<m>.md`, a registered
 * absence in a one-line stub at the same path, and names `prdt doctor` as the
 * instrument — so the check ships in the same change as the text, and it fires
 * on the PRE-migration shapes too (history.md lump · several sections in
 * PRD.md), so an unmigrated project learns it from the tool.
 *
 * Warning-only, never a gate — FAMILY_PROJECT, like `artifact placement`.
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

let projectDir: string

function runPrdt(args: string[]): string {
  return execFileSync('python3', [PRDT_CLI, ...args], {
    cwd: projectDir,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: subprocessTimeout('cli'),
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

function setVersion(version: string) {
  const p = path.join(projectDir, '.prdt', 'po-state.json')
  const st = JSON.parse(fs.readFileSync(p, 'utf-8'))
  st.stage = 'build'
  st.version = version
  fs.writeFileSync(p, JSON.stringify(st))
}

function write(rel: string, body: string) {
  const p = path.join(projectDir, rel)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, body)
}

function ticketDir(version: string) {
  fs.mkdirSync(path.join(projectDir, 'docs', 'tickets', version), { recursive: true })
}

const HEAD = '# PRD: proj\n\n## Why\n\nbecause.\n\n'
const section = (v: string) => `## ${v} — round\n\n### Why\n\nscope of ${v}.\n`

const prdLines = (out: string) => out.split('\n').filter((l) => /^⚠ prd:/.test(l))

/** The clean post-migration layout: head + ONE open section in PRD.md, every
 * earlier round in its own file (one a section, one a stub), one roadmap dir. */
function cleanLayout() {
  setVersion('v1.3')
  write('docs/prd/PRD.md', HEAD + section('v1.3'))
  write('docs/prd/versions/v1.2.md', section('v1.2'))
  write('docs/prd/versions/v1.1.md', 'no PRD section — docs/wiki/decision--tickets-only.md\n')
  for (const v of ['v1.1', 'v1.2', 'v1.3', 'v2.0']) ticketDir(v)
}

beforeEach(() => {
  projectDir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-doctor-prd-shape-')), 'proj')
  fs.mkdirSync(projectDir, { recursive: true })
  runInit()
})

afterEach(() => {
  fs.rmSync(path.dirname(projectDir), { recursive: true, force: true })
})

describe.skipIf(!PYTHON3)('prdt doctor — PRD layout: one file per closed version (T-657)', () => {
  test('clean: head + one open section, closed rounds one file each, a stub for a tickets-only round, a roadmap dir', () => {
    cleanLayout()
    expect(prdLines(doctor())).toEqual([])
  })

  // The pre-migration shape this ticket migrates away from: one history lump.
  test('fires on the history.md lump — every closed section it holds is named with its per-version home', () => {
    cleanLayout()
    write('docs/prd/history.md', '# history\n\n' + section('v1.1') + '\n' + section('v1.2'))
    const lines = prdLines(doctor())
    expect(lines.some((l) => /docs\/prd\/history\.md/.test(l) && /v1\.1/.test(l) && /docs\/prd\/versions\/v1\.1\.md/.test(l))).toBe(true)
    expect(lines.some((l) => /docs\/prd\/history\.md/.test(l) && /v1\.2/.test(l))).toBe(true)
  })

  // The ntf-pm shape (measured 2026-09-18): two `## v` sections in PRD.md.
  test('fires when PRD.md holds more than ONE `## v` section', () => {
    cleanLayout()
    write('docs/prd/PRD.md', HEAD + section('v1.2') + '\n' + section('v1.3'))
    fs.rmSync(path.join(projectDir, 'docs/prd/versions/v1.2.md'))
    const lines = prdLines(doctor())
    expect(lines.some((l) => /docs\/prd\/PRD\.md/.test(l) && /2 /.test(l) && /ONE open/.test(l))).toBe(true)
  })

  test('fires when a version file opens with another version\'s section', () => {
    cleanLayout()
    write('docs/prd/versions/v1.2.md', section('v1.1'))
    const lines = prdLines(doctor())
    expect(lines.some((l) => /docs\/prd\/versions\/v1\.2\.md/.test(l) && /v1\.1/.test(l))).toBe(true)
  })

  test('fires when a version file carries a second `## v` section below its own', () => {
    cleanLayout()
    write('docs/prd/versions/v1.2.md', section('v1.2') + '\n' + section('v1.1'))
    const lines = prdLines(doctor())
    expect(lines.some((l) => /docs\/prd\/versions\/v1\.2\.md/.test(l) && /v1\.1/.test(l))).toBe(true)
  })

  // A registered absence is one line and no heading — a stub that grew a body
  // is neither a stub nor a section.
  test('fires when a stub is more than one line', () => {
    cleanLayout()
    write('docs/prd/versions/v1.1.md', 'no PRD section — decision\n\nand then some prose that is not a section.\n')
    const lines = prdLines(doctor())
    expect(lines.some((l) => /docs\/prd\/versions\/v1\.1\.md/.test(l) && /ONE line/.test(l))).toBe(true)
  })

  test('fires on a file under versions/ that is not v<N>.<m>.md — PRD.md there would be served as the current PRD', () => {
    cleanLayout()
    write('docs/prd/versions/PRD.md', HEAD)
    write('docs/prd/versions/notes.md', 'x\n')
    const lines = prdLines(doctor())
    expect(lines.some((l) => /docs\/prd\/versions\/PRD\.md/.test(l))).toBe(true)
    expect(lines.some((l) => /docs\/prd\/versions\/notes\.md/.test(l))).toBe(true)
  })

  // The gap the user could not see in the lump: a round with tickets and no
  // PRD record. Visible from the tool, not by accident.
  test('fires when a closed round has a ticket dir and no version file; the open round and a roadmap dir stay silent', () => {
    cleanLayout()
    fs.rmSync(path.join(projectDir, 'docs/prd/versions/v1.1.md'))
    const lines = prdLines(doctor())
    expect(lines.some((l) => /docs\/tickets\/v1\.1\//.test(l) && /docs\/prd\/versions\/v1\.1\.md/.test(l))).toBe(true)
    expect(lines.some((l) => /v1\.3/.test(l))).toBe(false)
    expect(lines.some((l) => /v2\.0/.test(l))).toBe(false)
  })

  // A whole-document snapshot from the regime that predates sections stays as
  // that regime left it (contracts/fixed-paths.md §PRD) — an H1 file with no
  // `## v` heading is legal under versions/.
  test('a whole-document snapshot (H1, no `## v` heading) under versions/ is silent', () => {
    cleanLayout()
    write('docs/prd/versions/v0.4.md', '> snapshot banner\n\n# PRD: proj\n\n## Why\n\nold.\n\n## What\n\nold scope.\n')
    ticketDir('v0.4')
    expect(prdLines(doctor())).toEqual([])
  })

  test('a `## v` section in any other docs/prd file is reported with its per-version home', () => {
    cleanLayout()
    write('docs/prd/notes.md', '# notes\n\n' + section('v1.0'))
    const lines = prdLines(doctor())
    expect(lines.some((l) => /docs\/prd\/notes\.md/.test(l) && /docs\/prd\/versions\/v1\.0\.md/.test(l))).toBe(true)
  })

  test('no PRD.md at all → the other scans still run, no crash, no false finding', () => {
    cleanLayout()
    fs.rmSync(path.join(projectDir, 'docs/prd/PRD.md'), { force: true })
    expect(prdLines(doctor())).toEqual([])
  })
})
