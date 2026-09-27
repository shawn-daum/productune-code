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
 * The four holes an adversarial QA pass measured in the first cut (2026-09-22),
 * each with its own describe block below:
 *   1. a dotless / one-component id (`v1`) was illegal to the CLI and ordinary
 *      to the GUI, and the CLI was wrong in BOTH directions with it;
 *   2. "a closed section is out of place" was judged by COUNTING headings, so
 *      the one section left behind and the section copied-but-not-deleted —
 *      the two shapes a migration actually fails in — were silent;
 *   3. one `# ` line ANYWHERE waived every other rule in the file, including a
 *      `# comment` inside a ```sh fence;
 *   4. the check was registered FAMILY_PROJECT, so a five-warning fixture
 *      printed five ⚠ lines beside a tail reading `violations=0` — the
 *      acceptance line says a check FAILS.
 *
 * It is a discipline↔execution check: its findings are violations, and a clean
 * repo emits nothing.
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

function rm(rel: string) {
  fs.rmSync(path.join(projectDir, rel), { force: true })
}

function ticketDir(version: string) {
  fs.mkdirSync(path.join(projectDir, 'docs', 'tickets', version), { recursive: true })
}

const HEAD = '# PRD: proj\n\n## Why\n\nbecause.\n\n'
const section = (v: string) => `## ${v} — round\n\n### Why\n\nscope of ${v}.\n`

const prdLines = (out: string) => out.split('\n').filter((l) => /^⚠ prd:/.test(l))

/** The machine tail's violation count — what "a check fails" has to move. */
function violations(out: string): number {
  const line = out.split('\n').find((l) => /\[verdict=/.test(l))
  expect(line, `no verdict line in:\n${out}`).toBeTruthy()
  return Number(line!.match(/\bviolations=(\d+)/)![1])
}

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
    expect(lines.some((l) => /docs\/prd\/history\.md/.test(l) && /v1\.1/.test(l))).toBe(true)
    expect(lines.some((l) => /docs\/prd\/history\.md/.test(l) && /v1\.2/.test(l))).toBe(true)
  })

  // The ntf-pm shape (measured 2026-09-18): two `## v` sections in PRD.md.
  test('fires when PRD.md holds more than ONE `## v` section', () => {
    cleanLayout()
    write('docs/prd/PRD.md', HEAD + section('v1.2') + '\n' + section('v1.3'))
    rm('docs/prd/versions/v1.2.md')
    const lines = prdLines(doctor())
    expect(lines.some((l) => /docs\/prd\/PRD\.md/.test(l) && /ONE open/.test(l) && /v1\.2/.test(l))).toBe(true)
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
    rm('docs/prd/versions/v1.1.md')
    const lines = prdLines(doctor())
    expect(lines.some((l) => /docs\/tickets\/v1\.1\//.test(l) && /docs\/prd\/versions\/v1\.1\.md/.test(l))).toBe(true)
    expect(lines.some((l) => /v1\.3/.test(l))).toBe(false)
    expect(lines.some((l) => /v2\.0/.test(l))).toBe(false)
  })

  test('a `## v` section in any other docs/prd file is reported with its per-version home', () => {
    cleanLayout()
    write('docs/prd/notes.md', '# notes\n\n' + section('v1.0'))
    const lines = prdLines(doctor())
    expect(lines.some((l) => /docs\/prd\/notes\.md/.test(l) && /v1\.0/.test(l))).toBe(true)
  })

  test('no PRD.md at all → the other scans still run, no crash, no false finding', () => {
    cleanLayout()
    rm('docs/prd/PRD.md')
    expect(prdLines(doctor())).toEqual([])
  })
})

// ── 1. a dotless / one-component version id is legal ─────────────────────────
//
// User decision 2026-09-22, verbatim: "a. 인정하고 v1.0.0으로 간주하면되는거아닌가?
// 1.1은 1.1.0으로 간주하고." Measured by QA on the first cut: the CLI's
// `^v\d+(?:\.\d+)+\.md$` called a CORRECT `versions/v1.md` stub an illegal
// file, AND the ticket-dir scan gated on the same pattern, so a missing file
// for `docs/tickets/v1/` was reported by nobody — wrong in both directions for
// the exact round shape ntf-pm has. Names on disk are never rewritten.
describe.skipIf(!PYTHON3)('PRD layout — a version id may be dotless or short (T-657 QA ①)', () => {
  test('a `versions/v1.md` stub is legal, and so is a `v1` ticket dir that has it', () => {
    setVersion('v1.3')
    write('docs/prd/PRD.md', HEAD + section('v1.3'))
    write('docs/prd/versions/v1.md', 'no PRD section — docs/wiki/decision--tickets-only.md\n')
    write('docs/prd/versions/v1.2.md', section('v1.2'))
    for (const v of ['v1', 'v1.2', 'v1.3']) ticketDir(v)
    expect(prdLines(doctor())).toEqual([])
  })

  test('a `versions/v1.md` holding its own `## v1` section is legal', () => {
    setVersion('v1.3')
    write('docs/prd/PRD.md', HEAD + section('v1.3'))
    write('docs/prd/versions/v1.md', section('v1'))
    write('docs/prd/versions/v1.2.md', section('v1.2'))
    for (const v of ['v1', 'v1.2', 'v1.3']) ticketDir(v)
    expect(prdLines(doctor())).toEqual([])
  })

  test('a `v1` ticket dir with NO version file is reported — the direction that was silent', () => {
    setVersion('v1.3')
    write('docs/prd/PRD.md', HEAD + section('v1.3'))
    write('docs/prd/versions/v1.2.md', section('v1.2'))
    for (const v of ['v1', 'v1.2', 'v1.3']) ticketDir(v)
    const lines = prdLines(doctor())
    expect(lines.some((l) => /docs\/tickets\/v1\//.test(l) && /docs\/prd\/versions\/v1\.md/.test(l))).toBe(true)
  })

  test('missing components are filled with zero: `v1` ≡ `v1.0` ≡ `v1.0.0` for identity', () => {
    setVersion('v1.3')
    // The open section is spelled `v1.3.0` while po-state says `v1.3`; the
    // round v1 has its file spelled `v1.md` while the section inside and the
    // ticket dir spell it `v1.0.0` and `v1.0`. Every pair names ONE round.
    write('docs/prd/PRD.md', HEAD + section('v1.3.0'))
    write('docs/prd/versions/v1.md', section('v1.0.0'))
    write('docs/prd/versions/v1.2.md', section('v1.2'))
    for (const v of ['v1.0', 'v1.2', 'v1.3']) ticketDir(v)
    expect(prdLines(doctor())).toEqual([])
  })

  test('zero-filled identity does not flatten distinct rounds: v1.0.1 is not v1', () => {
    setVersion('v1.3')
    write('docs/prd/PRD.md', HEAD + section('v1.3'))
    write('docs/prd/versions/v1.md', section('v1'))
    write('docs/prd/versions/v1.2.md', section('v1.2'))
    for (const v of ['v1', 'v1.0.1', 'v1.2', 'v1.3']) ticketDir(v)
    const lines = prdLines(doctor())
    expect(lines.some((l) => /docs\/tickets\/v1\.0\.1\//.test(l))).toBe(true)
  })

  // major · minor · patch is the whole ladder (contracts §Fixed paths §Version
  // id), so a fourth component names no round. The bound is what makes code and
  // contract text say exactly the same thing: `*` would accept `v1.2.3.4` and
  // the text does not.
  test('a four-component id is not a version id — the file is reported, the ticket dir is not a round', () => {
    cleanLayout()
    write('docs/prd/versions/v1.2.3.4.md', section('v1.2.3.4'))
    ticketDir('v1.2.3.4')
    const lines = prdLines(doctor())
    expect(lines.some((l) => l.includes('docs/prd/versions/v1.2.3.4.md') && /not a version file/.test(l))).toBe(true)
    expect(lines.some((l) => l.includes('docs/tickets/v1.2.3.4/'))).toBe(false)
  })

  // Comparison and sort are per component, not lexical: v1.9 is BELOW an open
  // v1.10, so its ticket dir with no version file is a gap — while a string
  // compare ('v1.9' > 'v1.10') files it as a roadmap dir above the open round
  // and says nothing. This project itself is on v1.10.
  test('ordering is numeric per component: v1.9 sits below the open v1.10, v2 above it', () => {
    setVersion('v1.10')
    write('docs/prd/PRD.md', HEAD + section('v1.10'))
    write('docs/prd/versions/v1.2.md', section('v1.2'))
    for (const v of ['v1.2', 'v1.9', 'v1.10', 'v2']) ticketDir(v)
    const lines = prdLines(doctor())
    expect(lines.some((l) => l.includes('docs/tickets/v1.9/'))).toBe(true)
    expect(lines.some((l) => l.includes('docs/tickets/v2/'))).toBe(false)
    expect(lines.some((l) => l.includes('docs/tickets/v1.10/'))).toBe(false)
  })

  // ntf-pm's actual shape: po-state names the open round `v1` while the
  // section spells it out. Reporting the OPEN section as a stray closed one
  // would be the same defect facing the other way.
  test('a dotless po-state version names the open section, whatever the heading spells', () => {
    setVersion('v1')
    write('docs/prd/PRD.md', HEAD + section('v1.0.0'))
    write('docs/prd/versions/v0.9.md', section('v0.9'))
    for (const v of ['v0.9', 'v1']) ticketDir(v)
    expect(prdLines(doctor())).toEqual([])
    // and a genuinely closed section left beside it is still caught
    write('docs/prd/PRD.md', HEAD + section('v0.9') + '\n' + section('v1.0.0'))
    const lines = prdLines(doctor())
    expect(lines.some((l) => /closed section `## v0\.9`/.test(l) && /docs\/prd\/PRD\.md/.test(l))).toBe(true)
  })
})


// ── 1b. ONE definition of a version id, two readers ──────────────────────────
//
// The acceptance line says the CLI and the GUI use the SAME definition. They
// cannot share a literal across python and TypeScript, so this is the seam
// that makes a re-split fail: the GUI's `VERSION_RE` is read out of its own
// source and answered against a fixed corpus, and the CLI's real behavior on
// that same corpus is measured through `prdt doctor`. Narrowing either side —
// or both together — turns one of the two tests red.
describe.skipIf(!PYTHON3)('PRD layout — CLI and GUI share one version-id definition (T-657 QA ①)', () => {
  const GUI_HISTORY_DATA = path.resolve(CORE_ROOT, '..', 'gui', 'src', 'lib', 'historyData.ts')

  function guiVersionRe(): RegExp {
    const src = fs.readFileSync(GUI_HISTORY_DATA, 'utf-8')
    const m = src.match(/export const VERSION_RE = \/(.+?)\/([a-z]*)\s*$/m)
    expect(m, `no VERSION_RE literal in ${GUI_HISTORY_DATA}`).toBeTruthy()
    return new RegExp(m![1], m![2])
  }

  // The corpus packages/gui/src/lib/historyData.test.ts pins, minus `backlog`
  // (a real ticket dir of that name is legal and is not a round). `v1.2.3.4`
  // is in ILLEGAL on both sides: three components is the whole ladder.
  const LEGAL = ['v1', 'v1.0', 'v1.1', 'v0.5', 'v1.2.3']
  const ILLEGAL = ['v', 'version1', '1.0', 'v1.0-rc', 'vNext', 'v1.2.3.4']

  test('the GUI regex answers the pinned corpus — `v1` included', () => {
    const re = guiVersionRe()
    for (const v of LEGAL) expect(re.test(v), v).toBe(true)
    for (const v of ILLEGAL) expect(re.test(v), v).toBe(false)
  })

  test('the CLI reads exactly that corpus as version ids — every legal one with no version file is reported, no illegal one is a round', () => {
    setVersion('v9.9')
    write('docs/prd/PRD.md', HEAD + section('v9.9'))
    for (const v of [...LEGAL, ...ILLEGAL]) ticketDir(v)
    const lines = prdLines(doctor())
    for (const v of LEGAL) {
      expect(lines.some((l) => l.includes(`docs/tickets/${v}/`)), `${v} is a round with no version file — expected a finding in:\n${lines.join('\n')}`).toBe(true)
    }
    for (const v of ILLEGAL) {
      expect(lines.some((l) => l.includes(`docs/tickets/${v}/`)), `${v} is not a version id — expected silence in:\n${lines.join('\n')}`).toBe(false)
    }
  })
})

// ── 2. a closed section out of place, alone or copied ────────────────────────
//
// Both reproduced with the real CLI on 2026-09-22 and both silent before this
// change: the check counted `## v` headings and never identified WHICH one was
// closed, although `po-state.version` was already read a few lines down.
describe.skipIf(!PYTHON3)('PRD layout — the closed section is identified, not counted (T-657 QA ②)', () => {
  test('a closed section ALONE in PRD.md is reported (the open round has no section yet)', () => {
    setVersion('v1.3')
    write('docs/prd/PRD.md', HEAD + section('v1.2'))
    write('docs/prd/versions/v1.1.md', 'no PRD section — decision\n')
    for (const v of ['v1.1', 'v1.2']) ticketDir(v)
    const lines = prdLines(doctor())
    expect(lines.some((l) => /closed section `## v1\.2`/.test(l) && /docs\/prd\/PRD\.md/.test(l))).toBe(true)
  })

  test('a section COPIED to its own file but not deleted from PRD.md is reported as a leftover copy', () => {
    setVersion('v1.3')
    write('docs/prd/PRD.md', HEAD + section('v1.2'))
    write('docs/prd/versions/v1.2.md', section('v1.2'))
    write('docs/prd/versions/v1.1.md', 'no PRD section — decision\n')
    for (const v of ['v1.1', 'v1.2']) ticketDir(v)
    const lines = prdLines(doctor())
    const hit = lines.find((l) => /closed section `## v1\.2`/.test(l) && /docs\/prd\/PRD\.md/.test(l))
    expect(hit, `no copy-not-move line in:\n${lines.join('\n')}`).toBeTruthy()
    expect(hit!).toMatch(/copy/)
    expect(hit!).toMatch(/docs\/prd\/versions\/v1\.2\.md/)
  })

  test('the open section itself is never reported, and PRD.md repeating it is', () => {
    setVersion('v1.3')
    write('docs/prd/PRD.md', HEAD + section('v1.3'))
    expect(prdLines(doctor())).toEqual([])
    write('docs/prd/PRD.md', HEAD + section('v1.3') + '\n' + section('v1.3'))
    expect(prdLines(doctor()).some((l) => /repeats the open section/.test(l))).toBe(true)
  })

  test('with no readable open version in po-state the count rule still catches two sections', () => {
    setVersion('')
    write('docs/prd/PRD.md', HEAD + section('v1.2') + '\n' + section('v1.3'))
    const lines = prdLines(doctor())
    expect(lines.some((l) => /docs\/prd\/PRD\.md/.test(l) && /2 `## v` sections/.test(l))).toBe(true)
  })

  test('a `## v` heading QUOTED inside a fenced block is not a section — PRD.md may cite one', () => {
    cleanLayout()
    write('docs/prd/PRD.md', HEAD + section('v1.3')
      + '\n### 인용\n\n```md\n## v1.2 — round\n```\n')
    expect(prdLines(doctor())).toEqual([])
  })
})

// ── 3. a stray `# ` cannot switch the check off ──────────────────────────────
//
// The exemption was `any(l.startswith("# ") for l in lines)` over the WHOLE
// file. Each pair below is the fixture that was caught, plus the same fixture
// with one H1 added — which made it silent. The exemption is now: an H1 at the
// head of the document (after frontmatter, past blanks and a leading banner,
// outside fences) AND zero `## v` headings.
describe.skipIf(!PYTHON3)('PRD layout — the snapshot exemption is narrow (T-657 QA ③)', () => {
  test('junk above a version heading is caught, and an added H1 does not silence it', () => {
    cleanLayout()
    write('docs/prd/versions/v1.2.md', 'stray preamble\n\n' + section('v1.2'))
    expect(prdLines(doctor()).some((l) => /docs\/prd\/versions\/v1\.2\.md/.test(l) && /above its/.test(l))).toBe(true)
    write('docs/prd/versions/v1.2.md', '# a title\n\nstray preamble\n\n' + section('v1.2'))
    expect(prdLines(doctor()).some((l) => /docs\/prd\/versions\/v1\.2\.md/.test(l))).toBe(true)
  })

  test('two sections in one version file are caught, and an added H1 does not silence it', () => {
    cleanLayout()
    write('docs/prd/versions/v1.2.md', '# a title\n\n' + section('v1.2') + '\n' + section('v1.2'))
    expect(prdLines(doctor()).some((l) => /docs\/prd\/versions\/v1\.2\.md/.test(l))).toBe(true)
  })

  test('a malformed stub is caught, and an H1 appended below its body does not silence it', () => {
    cleanLayout()
    const bad = 'no PRD section — decision\n\nand then some prose that is not a section.\n'
    write('docs/prd/versions/v1.1.md', bad)
    expect(prdLines(doctor()).some((l) => /docs\/prd\/versions\/v1\.1\.md/.test(l))).toBe(true)
    write('docs/prd/versions/v1.1.md', bad + '\n# stray heading\n')
    expect(prdLines(doctor()).some((l) => /docs\/prd\/versions\/v1\.1\.md/.test(l))).toBe(true)
  })

  test('a `# comment` inside a ```sh fence does not exempt a file — this repo quotes shell', () => {
    cleanLayout()
    write('docs/prd/versions/v1.2.md',
      'stray preamble\n\n' + section('v1.2') + '\n```sh\n# install it\nmake\n```\n')
    expect(prdLines(doctor()).some((l) => /docs\/prd\/versions\/v1\.2\.md/.test(l) && /above its/.test(l))).toBe(true)
  })

  // The shape docs/prd/versions/v0.4.md actually has: a `> **[버전 스냅샷 …]**`
  // banner on line 1, the H1 on line 3, many `## ` headings, no `## v` heading.
  // It is the genuine pre-sections snapshot and must stay silent.
  test('the genuine snapshot — banner, then H1, no `## v` heading — is silent', () => {
    cleanLayout()
    write('docs/prd/versions/v0.4.md',
      '> **[version snapshot — v0.4]** the record as v0.4 close left it.\n\n'
      + '# PRD: proj\n\n## Why\n\nold.\n\n## What\n\nold scope.\n\n```sh\n# a quoted comment\n```\n')
    ticketDir('v0.4')
    expect(prdLines(doctor())).toEqual([])
  })

  test('a snapshot with frontmatter above its H1 is silent; content above the H1 is not a snapshot', () => {
    cleanLayout()
    write('docs/prd/versions/v0.4.md', '---\ntitle: old\n---\n\n# PRD: proj\n\n## Why\n\nold.\n')
    ticketDir('v0.4')
    expect(prdLines(doctor())).toEqual([])
    write('docs/prd/versions/v0.4.md', 'loose prose first.\n\n# PRD: proj\n\n## Why\n\nold.\n')
    expect(prdLines(doctor()).some((l) => /docs\/prd\/versions\/v0\.4\.md/.test(l))).toBe(true)
  })
})

// ── 4. "a check fails" means fails ───────────────────────────────────────────
describe.skipIf(!PYTHON3)('PRD layout — findings are violations, not decoration (T-657 QA ④)', () => {
  test('a clean layout adds no violation; a closed section out of place does', () => {
    cleanLayout()
    const clean = doctor()
    expect(prdLines(clean)).toEqual([])
    const before = violations(clean)

    write('docs/prd/PRD.md', HEAD + section('v1.2'))
    const dirty = doctor()
    expect(prdLines(dirty).length).toBeGreaterThan(0)
    expect(violations(dirty)).toBeGreaterThan(before)
    expect(dirty).toMatch(/\[verdict=violations/)
  })

  test('every ⚠ prd: line this check emits is counted — five findings move the tail by five', () => {
    cleanLayout()
    const before = violations(doctor())
    write('docs/prd/history.md', '# history\n\n' + section('v1.0') + '\n' + section('v1.1'))
    write('docs/prd/versions/PRD.md', HEAD)
    write('docs/prd/versions/v1.2.md', 'stray preamble\n\n' + section('v1.2'))
    write('docs/prd/PRD.md', HEAD + section('v1.2'))
    const out = doctor()
    expect(violations(out) - before).toBe(prdLines(out).length)
    expect(prdLines(out).length).toBeGreaterThanOrEqual(5)
  })
})

// ── 5. a stub is not a copy, and a remedy has to be reachable ────────────────
//
// Measured by a re-grill on 2026-09-22: `PRD.md` holding `## v1.1` while
// `versions/v1.1.md` is the one-line registered-absence stub was diagnosed
// "already holds that round … a leftover copy: delete it from docs/prd/PRD.md
// once the two agree byte for byte". Both halves were wrong. A stub and a
// section can never agree byte for byte, so the condition never comes true and
// a literal reader deletes the only copy of the section; and the shape is not
// a copy at all — a round registered as having written NO section, with a
// section, is a contradiction between two records.
describe.skipIf(!PYTHON3)('PRD layout — the finding says WHICH shape it found (T-657 re-grill ⑤)', () => {
  test('a section whose round is registered ABSENT by a stub is a contradiction, not a leftover copy', () => {
    setVersion('v1.3')
    write('docs/prd/PRD.md', HEAD + section('v1.1'))
    write('docs/prd/versions/v1.1.md', 'no PRD section — docs/wiki/decision--tickets-only.md\n')
    for (const v of ['v1.1', 'v1.3']) ticketDir(v)
    const lines = prdLines(doctor())
    const hit = lines.find((l) => /closed section `## v1\.1`/.test(l) && /docs\/prd\/PRD\.md/.test(l))
    expect(hit, `no finding for the section in:\n${lines.join('\n')}`).toBeTruthy()
    expect(hit!).toMatch(/docs\/prd\/versions\/v1\.1\.md/)
    expect(hit!).toMatch(/stub/)
    expect(hit!).not.toMatch(/leftover copy/)
    // the unreachable condition, and the delete-the-only-copy instruction
    expect(hit!).not.toMatch(/agree byte for byte/)
  })

  test('the same shape in any other docs/prd file reads the same way', () => {
    cleanLayout()
    write('docs/prd/history.md', '# history\n\n' + section('v1.1'))
    const lines = prdLines(doctor())
    const hit = lines.find((l) => /docs\/prd\/history\.md/.test(l) && /v1\.1/.test(l))
    expect(hit, `no finding in:\n${lines.join('\n')}`).toBeTruthy()
    expect(hit!).toMatch(/stub/)
    expect(hit!).not.toMatch(/agree byte for byte/)
  })

  test('a real section on disk is still diagnosed as a leftover copy — the copy half is not lost', () => {
    cleanLayout()
    write('docs/prd/PRD.md', HEAD + section('v1.2') + '\n' + section('v1.3'))
    const hit = prdLines(doctor()).find((l) => /closed section `## v1\.2`/.test(l))
    expect(hit).toBeTruthy()
    expect(hit!).toMatch(/leftover copy/)
    expect(hit!).toMatch(/docs\/prd\/versions\/v1\.2\.md/)
  })
})

// ── 6. an open round duplicated into versions/ ───────────────────────────────
//
// Measured by the same re-grill: a clean layout plus `versions/v1.3.md`
// holding the OPEN `## v1.3` section was silent. versions/ is the CLOSED
// record, written at close by MOVING the section out of the working file — a
// file there for a round whose section is still open in PRD.md is one round
// recorded twice, the mirror of the copy-not-move shape.
describe.skipIf(!PYTHON3)('PRD layout — the open round is not in versions/ yet (T-657 re-grill ⑥)', () => {
  test('the open section sitting in BOTH PRD.md and versions/ is reported, naming both paths', () => {
    cleanLayout()
    write('docs/prd/versions/v1.3.md', section('v1.3'))
    const lines = prdLines(doctor())
    const hit = lines.find((l) => /docs\/prd\/versions\/v1\.3\.md/.test(l) && /docs\/prd\/PRD\.md/.test(l))
    expect(hit, `no open-round duplicate line in:\n${lines.join('\n')}`).toBeTruthy()
    expect(hit!).toMatch(/v1\.3/)
  })

  test('a stub for the open round is reported too — it registers as absent a section that is open', () => {
    cleanLayout()
    write('docs/prd/versions/v1.3.md', 'no PRD section — decision\n')
    const lines = prdLines(doctor())
    const hit = lines.find((l) => /docs\/prd\/versions\/v1\.3\.md/.test(l))
    expect(hit, `no finding in:\n${lines.join('\n')}`).toBeTruthy()
    expect(hit!).toMatch(/docs\/prd\/PRD\.md/)
  })

  // The legal window: po-state still names the round just closed, and PRD.md
  // no longer carries its section. Keyed on BOTH places holding the round, so
  // this state stays silent.
  test('between close and Define — the file exists, PRD.md no longer holds the section — is silent', () => {
    cleanLayout()
    write('docs/prd/versions/v1.3.md', section('v1.3'))
    write('docs/prd/PRD.md', HEAD)
    expect(prdLines(doctor())).toEqual([])
  })
})

// ── 7. one round, exactly one file ───────────────────────────────────────────
//
// Measured by the same re-grill: `versions/v1.md` and `versions/v1.0.md` both
// holding `## v1` was silent, and silent still when the two bodies DIFFERED —
// the immutable record of a closed round left ambiguous with nothing saying
// so. Cause: the canonical key was filled with `setdefault`, so the second
// file was never compared against the first.
describe.skipIf(!PYTHON3)('PRD layout — a round has exactly one file (T-657 re-grill ⑦)', () => {
  test('two files naming the same round are reported, naming both paths', () => {
    cleanLayout()
    write('docs/prd/versions/v1.md', section('v1'))
    write('docs/prd/versions/v1.0.md', section('v1'))
    ticketDir('v1')
    const lines = prdLines(doctor())
    const hit = lines.find((l) => /docs\/prd\/versions\/v1\.md/.test(l) && /docs\/prd\/versions\/v1\.0\.md/.test(l))
    expect(hit, `no duplicate-file line in:\n${lines.join('\n')}`).toBeTruthy()
  })

  test('when the two bodies differ the finding says the record is ambiguous', () => {
    cleanLayout()
    write('docs/prd/versions/v1.md', section('v1'))
    write('docs/prd/versions/v1.0.md', section('v1') + '\nand another paragraph.\n')
    ticketDir('v1')
    const lines = prdLines(doctor())
    const hit = lines.find((l) => /docs\/prd\/versions\/v1\.md/.test(l) && /docs\/prd\/versions\/v1\.0\.md/.test(l))
    expect(hit, `no duplicate-file line in:\n${lines.join('\n')}`).toBeTruthy()
    expect(hit!).toMatch(/DIFFER/)
  })

  test('one file per round stays silent — v1.md and v1.1.md are different rounds', () => {
    cleanLayout()
    write('docs/prd/versions/v1.md', section('v1'))
    ticketDir('v1')
    expect(prdLines(doctor())).toEqual([])
  })
})
