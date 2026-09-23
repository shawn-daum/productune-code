/**
 * prdt-doctor-linkage-2c.test.ts — T-674 slice 2c, black-box over the real
 * `prdt` CLI (mirrors prdt-doctor-linkage-edges.test.ts / prdt-doctor-prd-item-linkage.test.ts).
 *
 * Design SoT: docs/artifacts/v1.10/linkage-design.md §4 (`edges` table,
 * `prdt index rebuild`) · §2 C1/C2 (wiki lint widened to docs/prd/** +
 * docs/tickets/**, `[[machine:<page>]]` resolution, discipline machine-page
 * citation ban).
 *
 * Slices 2a/2b checked the VALUE of each edge's doctor warning. This slice
 * checks:
 *   - `edges` in `.prdt/index.db` is derived, not hand-kept: `prdt index
 *     rebuild` from an empty/removed db reproduces the same rows a cold
 *     open already produced, for all six adopted rels (E1 feature · E2
 *     ticket · E3 version · E4 prd_item · E5 deps · E6 artifact_ticket).
 *   - C1 — `wiki_lint`'s `[[…]]` scan widened to docs/prd/** and
 *     docs/tickets/**: dead links + a live citation of a superseded page,
 *     except inside the `### 이 버전이 뒤집은 것 (reversed)` section, where a
 *     superseded target is the expected case.
 *   - C2 — `[[machine:<page>]]` resolves against the machine wiki store
 *     everywhere wiki_lint runs, and shared discipline text (never
 *     `overrides/`) may never cite a machine-store page by name.
 *   - the machine-citation regex admits a dotted slug (T-663's revision,
 *     `[.-]` separator) the same way every other slug match in this
 *     project's design does.
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync } from 'child_process'
import { test, expect, describe, beforeEach, afterEach } from 'vitest'
import { subprocessTimeout } from '../helpers/subprocess-timeout'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const PRDT_CLI = path.join(CORE_ROOT, 'scripts', 'prdt')
const REPO_DISCIPLINE = path.join(CORE_ROOT, 'discipline')

let sandbox: string
let projectRoot: string
let disciplineDir: string
let env: NodeJS.ProcessEnv

/** T-668/T-676: doctor's "resident machine resources" check shells out to the
 *  REAL `uptime`; stubbing it keeps every doctor run in this file deterministic
 *  (same technique prdt-doctor-verdict.test.ts / prdt-doctor-meta-drift.test.ts
 *  / prdt-doctor-duplicate-ticket-id.test.ts / prdt-prepush-hook.test.ts use). */
function fakeUptimeBinDir(dir: string): string {
  const bin = path.join(dir, 'bin')
  fs.mkdirSync(bin, { recursive: true })
  fs.writeFileSync(path.join(bin, 'uptime'),
    '#!/bin/sh\necho "12:00  up 1 day, 2 users, load averages: 1.00 1.00 1.00"\n')
  fs.chmodSync(path.join(bin, 'uptime'), 0o755)
  return bin
}

function runPrdt(args: string[]): { out: string; code: number } {
  try {
    const out = execFileSync('python3', [PRDT_CLI, ...args], {
      cwd: projectRoot,
      env,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: subprocessTimeout('cli'),
    })
    return { out, code: 0 }
  } catch (e: any) {
    if (typeof e.status !== 'number') throw new Error(`prdt ${args.join(' ')}: ${e.stderr || e.message}`)
    return { out: `${e.stdout || ''}${e.stderr || ''}`, code: e.status }
  }
}

const doctor = () => runPrdt(['doctor']).out

function poState(version: string): void {
  fs.writeFileSync(path.join(projectRoot, '.prdt', 'po-state.json'),
    JSON.stringify({ schema_version: 1, stage: 'build', version, current_task: null }))
}

function writeConfig(extra: Record<string, unknown> = {}): void {
  fs.writeFileSync(path.join(projectRoot, '.prdt', 'config.json'),
    JSON.stringify({ slug: 'proj', ...extra }, null, 2))
}

function ticket(id: string, version: string, extra: Record<string, string> = {}, status = 'open'): void {
  const dir = path.join(projectRoot, 'docs', 'tickets', version)
  fs.mkdirSync(dir, { recursive: true })
  const extraLines = Object.entries(extra).map(([k, v]) => `${k}: ${v}`).join('\n')
  fs.writeFileSync(path.join(dir, `${id}.md`),
    `---\nid: ${id}\nslug: s-${id.toLowerCase()}\ntype: impl\nstatus: ${status}\n` +
    `assignee: developer\ncreated: 2026-01-01\n${extraLines}${extraLines ? '\n' : ''}---\n\nbody\n`)
}

function wikiPage(name: string, fm: Record<string, string>, body = ''): void {
  const dir = path.join(projectRoot, 'docs', 'wiki')
  fs.mkdirSync(dir, { recursive: true })
  const lines = Object.entries(fm).map(([k, v]) => `${k}: ${v}`).join('\n')
  fs.writeFileSync(path.join(dir, `${name}.md`), `---\n${lines}\n---\n\n# ${name}\n\n${body}\n`)
}

function machineWikiPage(name: string, fm: Record<string, string>, body = ''): void {
  const dir = path.join(path.dirname(env.PRDT_HOME!), '.prdt', 'wiki')
  fs.mkdirSync(dir, { recursive: true })
  const lines = Object.entries(fm).map(([k, v]) => `${k}: ${v}`).join('\n')
  fs.writeFileSync(path.join(dir, `${name}.md`), `---\n${lines}\n---\n\n# ${name}\n\n${body}\n`)
}

function artifact(rel: string, body: string): void {
  const abs = path.join(projectRoot, 'docs', 'artifacts', rel)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  fs.writeFileSync(abs, body)
}

function writePrd(body: string): void {
  fs.mkdirSync(path.join(projectRoot, 'docs', 'prd'), { recursive: true })
  fs.writeFileSync(path.join(projectRoot, 'docs', 'prd', 'PRD.md'), body)
}

function edgeRows(dir: string): Array<{ src: string; rel: string; dst: string; resolved: number }> {
  const out = execFileSync('python3', ['-c',
    'import sqlite3, json, sys\n' +
    'con = sqlite3.connect(sys.argv[1])\n' +
    'rows = con.execute("SELECT src, rel, dst, resolved FROM edges ORDER BY src, rel, dst, resolved").fetchall()\n' +
    'print(json.dumps(rows))',
    path.join(dir, '.prdt', 'index.db')], { encoding: 'utf-8' })
  return JSON.parse(out).map(([src, rel, dst, resolved]: [string, string, string, number]) =>
    ({ src, rel, dst, resolved }))
}

beforeEach(() => {
  sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-linkage-2c-'))
  const home = path.join(sandbox, 'home')
  fs.mkdirSync(home, { recursive: true })
  disciplineDir = path.join(sandbox, 'discipline')
  fs.cpSync(REPO_DISCIPLINE, disciplineDir, { recursive: true })
  const binDir = fakeUptimeBinDir(sandbox)
  env = {
    ...process.env,
    HOME: home,
    PRDT_HOME: path.join(home, '.prdt'),
    PRDT_DISCIPLINE: disciplineDir,
    PATH: `${binDir}:${process.env.PATH}`,
  }
  projectRoot = path.join(sandbox, 'proj')
  fs.mkdirSync(path.join(projectRoot, '.prdt'), { recursive: true })
  writeConfig()
  for (const d of ['docs/prd', 'docs/tickets', 'docs/wiki', 'docs/artifacts']) {
    fs.mkdirSync(path.join(projectRoot, d), { recursive: true })
  }
  poState('v1.10')
})
afterEach(() => fs.rmSync(sandbox, { recursive: true, force: true }))

describe('T-674 slice 2c — edges table, `prdt index rebuild`', () => {
  /** One fixture instance carrying all six rels at once: E1 feature (T-10) ·
   *  E5 deps (T-10 → T-1) · E4 prd_item (T-10 → v1.10#north-star) · E2 wiki
   *  ticket: (decision--a → T-1) · E3 wiki version: (decision--a → v1.10) ·
   *  E6 artifact ticket: (v1.10/x.md → T-1). */
  function seedAllSixEdges(): void {
    writeConfig({ features: { vocab: { gui: { kind: 'feature', aliases: [], parent: null, since: null } } } })
    writePrd([
      '# PRD',
      '',
      '## v1.10',
      '',
      '#### north-star — 북극성과 그 관측',
      '',
      'body',
      '',
    ].join('\n'))
    ticket('T-1', 'v1.10')
    ticket('T-10', 'v1.10', { feature: 'gui', deps: '[T-1]', prd_item: 'v1.10#north-star' })
    wikiPage('decision--a', { type: 'decision', status: 'live', ticket: 'T-1', version: 'v1.10' })
    artifact('v1.10/x.md', '# x\n')
    runPrdt(['artifacts', 'sync'])
    runPrdt(['artifacts', 'set', 'v1.10/x.md', '--ticket', 'T-1'])
  }

  test('a cold derive and `prdt index rebuild` produce identical edges, all six rels present and resolved', () => {
    seedAllSixEdges()
    const before = doctor() // cold open — derives index.db from nothing
    expect(before).toBeDefined()
    const rowsBefore = edgeRows(projectRoot)
    expect(rowsBefore.length).toBeGreaterThan(0)

    fs.rmSync(path.join(projectRoot, '.prdt', 'index.db'))
    const r = runPrdt(['index', 'rebuild'])
    expect(r.code).toBe(0)
    const rowsAfter = edgeRows(projectRoot)

    expect(rowsAfter).toEqual(rowsBefore)
    expect(r.out).toMatch(new RegExp(`${rowsAfter.length} edges`))

    const byRel = Object.fromEntries(rowsAfter.map((e) => [e.rel, e]))
    expect(byRel.feature).toMatchObject({ src: 'T-10', dst: 'gui', resolved: 1 })
    expect(byRel.deps).toMatchObject({ src: 'T-10', dst: 'T-1', resolved: 1 })
    expect(byRel.prd_item).toMatchObject({ src: 'T-10', dst: 'v1.10#north-star', resolved: 1 })
    expect(byRel.ticket).toMatchObject({ src: 'decision--a', dst: 'T-1', resolved: 1 })
    expect(byRel.version).toMatchObject({ src: 'decision--a', dst: 'v1.10', resolved: 1 })
    expect(byRel.artifact_ticket).toMatchObject({ src: 'v1.10/x.md', dst: 'T-1', resolved: 1 })
  })

  test('an unresolved target on each rel writes resolved=0, and rebuild reproduces that too', () => {
    writeConfig({ features: { vocab: { gui: { kind: 'feature', aliases: [], parent: null, since: null } } } })
    writePrd(['# PRD', '', '## v1.10', '', '#### north-star — x', '', 'body', ''].join('\n'))
    ticket('T-1', 'v1.10', {}, 'dropped')
    ticket('T-10', 'v1.10', { feature: 'not-a-vocab-key', deps: '[T-999]', prd_item: 'v1.10#no-such-item' })
    wikiPage('decision--a', { type: 'decision', status: 'live', ticket: 'T-1', version: 'v9.9' })
    doctor()
    const rowsBefore = edgeRows(projectRoot)
    const byRel = Object.fromEntries(rowsBefore.map((e) => [e.rel, e]))
    expect(byRel.feature.resolved).toBe(0)
    expect(byRel.deps.resolved).toBe(0)
    expect(byRel.prd_item.resolved).toBe(0)
    expect(byRel.ticket.resolved).toBe(0) // T-1 exists but is dropped
    expect(byRel.version.resolved).toBe(0)

    fs.rmSync(path.join(projectRoot, '.prdt', 'index.db'))
    runPrdt(['index', 'rebuild'])
    expect(edgeRows(projectRoot)).toEqual(rowsBefore)
  })

  test('shape guard — `edges` has exactly one writer (`rebuild_edges`)', () => {
    // Same idiom as prdt-index-slice-wipe.test.ts's open_db guard: read the
    // source directly rather than the derived behaviour, so a future second
    // writer is caught even if no fixture happens to disagree with it yet.
    const src = fs.readFileSync(PRDT_CLI, 'utf-8')
    const fnStart = src.indexOf('def rebuild_edges')
    expect(fnStart).toBeGreaterThan(-1)
    const fnBody = src.slice(fnStart, src.indexOf('\n\n\n', fnStart))
    expect(fnBody).toMatch(/DELETE FROM edges/)
    expect(fnBody).toMatch(/INSERT INTO edges/)
    const outsideFn = src.slice(0, fnStart) + src.slice(src.indexOf('\n\n\n', fnStart))
    expect(outsideFn).not.toMatch(/(DELETE|INSERT) (FROM|INTO) edges/)
    // and both derive paths call it (cold `derive_all_slices` + explicit `rebuild_index`)
    expect(src).toMatch(/def derive_all_slices[\s\S]*?rebuild_edges\(/)
    expect(src).toMatch(/def rebuild_index[\s\S]*?rebuild_edges\(/)
  })
})

describe('T-674 slice 2c — C1: wiki lint widened to docs/prd/** + docs/tickets/**', () => {
  test('a dead [[…]] link in PRD.md and in a ticket file fires, and stays silent once fixed', () => {
    writePrd(['# PRD', '', '## v1.10', '', 'see [[decision--ghost]] for context', ''].join('\n'))
    ticket('T-1', 'v1.10')
    fs.appendFileSync(path.join(projectRoot, 'docs', 'tickets', 'v1.10', 'T-1.md'),
      '\nsee [[decision--ghost]] too\n')
    let d = doctor()
    expect(d).toContain('docs/prd/PRD.md:5: [[decision--ghost]] does not exist (wiki)')
    expect(d).toMatch(/docs\/tickets\/v1\.10\/T-1\.md:\d+: \[\[decision--ghost\]\] does not exist \(wiki\)/)

    wikiPage('decision--ghost', { type: 'decision', status: 'live' })
    d = doctor()
    expect(d).not.toContain('[[decision--ghost]] does not exist')
  })

  test('a live citation of a superseded page warns; a clean citation of a live page stays silent', () => {
    wikiPage('decision--old', { type: 'decision', status: 'superseded' })
    writePrd(['# PRD', '', '## v1.10', '', 'per [[decision--old]] we decided', ''].join('\n'))
    const d = doctor()
    expect(d).toContain('docs/prd/PRD.md:5: cites superseded [[decision--old]]')

    wikiPage('decision--live', { type: 'decision', status: 'live' })
    writePrd(['# PRD', '', '## v1.10', '', 'per [[decision--live]] we decided', ''].join('\n'))
    const d2 = doctor()
    expect(d2).not.toContain('cites superseded')
  })

  test('a superseded citation under the reversed heading stays silent; a dead one there still warns', () => {
    wikiPage('decision--old', { type: 'decision', status: 'superseded' })
    writePrd([
      '# PRD', '',
      '## v1.10', '',
      '### 이 버전이 뒤집은 것 (reversed)', '',
      '- [[decision--old]] — 뒤집었다', '',
      '- [[decision--ghost]] — 아직 없다', '',
    ].join('\n'))
    const d = doctor()
    expect(d).not.toContain('cites superseded [[decision--old]]')
    expect(d).toContain('[[decision--ghost]] does not exist (wiki)')
  })

  test('a bash `[[ … ]]` idiom inside a fenced code block is not read as a wikilink', () => {
    ticket('T-1', 'v1.10')
    fs.appendFileSync(path.join(projectRoot, 'docs', 'tickets', 'v1.10', 'T-1.md'), [
      '',
      '```',
      '[[ "$FILE_PATH" == docs/tickets/*/T-*.md ]] || exit 0',
      '```',
      '',
    ].join('\n'))
    const d = doctor()
    expect(d).not.toMatch(/T-1\.md:\d+: \[\[/)
  })

  test('a bash `[[ ]]`/`[[:space:]]` idiom inside an inline code span is not read as a wikilink', () => {
    ticket('T-1', 'v1.10')
    fs.appendFileSync(path.join(projectRoot, 'docs', 'tickets', 'v1.10', 'T-1.md'), [
      '',
      'standalone guard: `[[ "${BASH_SOURCE[0]}" == "$0" ]]` — 선택 추가 가능.',
      'anchor: `^[[:space:]]*status:` 로 선행 공백 허용.',
      '',
    ].join('\n'))
    const d = doctor()
    expect(d).not.toMatch(/T-1\.md:\d+: \[\[/)
  })

  test('a real (non-code) dead link on the same file still fires alongside a silenced code span', () => {
    ticket('T-1', 'v1.10')
    fs.appendFileSync(path.join(projectRoot, 'docs', 'tickets', 'v1.10', 'T-1.md'), [
      '',
      'anchor: `^[[:space:]]*status:` 로 선행 공백 허용.',
      'see [[decision--ghost]] for context',
      '',
    ].join('\n'))
    const d = doctor()
    expect(d).toMatch(/T-1\.md:\d+: \[\[decision--ghost\]\] does not exist \(wiki\)/)
    expect(d).not.toMatch(/T-1\.md:\d+: \[\[:space:\]\]/)
  })
})

describe('T-674 slice 2c — C2: [[machine:<page>]] resolution + discipline citation ban', () => {
  test('[[machine:<page>]] resolves against the machine store: missing warns, present stays silent', () => {
    writePrd(['# PRD', '', '## v1.10', '', 'see [[machine:fact--ghost]] for context', ''].join('\n'))
    let d = doctor()
    expect(d).toContain('docs/prd/PRD.md:5: [[machine:fact--ghost]] does not exist (machine wiki)')

    machineWikiPage('fact--ghost', { type: 'fact', status: 'live' })
    d = doctor()
    expect(d).not.toContain('[[machine:fact--ghost]] does not exist')
  })

  test('a real machine-page citation in shared discipline text warns via doctor', () => {
    const habitPath = path.join(disciplineDir, 'developer', 'habit.md')
    fs.appendFileSync(habitPath, '\nSee machine:fact--qa-cua-vm for the VM stop command.\n')
    const d = doctor()
    expect(d).toContain(`discipline: ${habitPath} cites machine:fact--qa-cua-vm`)
  })

  test('C2 is Advisory (design linkage §2: "doctor warns") — a hit prints a ⚠ line but never moves the FAMILY_DE violation count', () => {
    const before = doctor()
    const beforeLine = before.split('\n').find((l) => l.includes('[verdict='))!
    const beforeViolations = Number(beforeLine.match(/violations=(\d+)/)![1])

    const habitPath = path.join(disciplineDir, 'developer', 'habit.md')
    fs.appendFileSync(habitPath, '\nSee machine:fact--qa-cua-vm for the VM stop command.\n')
    const after = doctor()
    expect(after).toContain(`discipline: ${habitPath} cites machine:fact--qa-cua-vm`)
    const afterLine = after.split('\n').find((l) => l.includes('[verdict='))!
    const afterViolations = Number(afterLine.match(/violations=(\d+)/)![1])
    expect(afterViolations).toBe(beforeViolations)
  })

  test('the template placeholder and wildcard teaching forms stay silent (curate-wiki.md / inject-edit.md, as shipped)', () => {
    const d = doctor()
    expect(d).not.toMatch(/discipline: .*curate-wiki\.md cites/)
    expect(d).not.toMatch(/discipline: .*inject-edit\.md cites/)
  })

  test('a machine-page citation inside an override file is exempt (machine-scoped by design)', () => {
    const overridesDir = path.join(disciplineDir, 'overrides')
    fs.mkdirSync(overridesDir, { recursive: true })
    fs.writeFileSync(path.join(overridesDir, 'developer.md'),
      '- Detail: machine:fact--qa-cua-vm\n')
    const d = doctor()
    expect(d).not.toMatch(/discipline: .*overrides\/developer\.md cites/)
  })

  test('the machine-citation regex admits a dotted slug (T-663 separator `[.-]`)', () => {
    const habitPath = path.join(disciplineDir, 'developer', 'habit.md')
    fs.appendFileSync(habitPath, '\nSee machine:decision--v1.10-structure-round for the call.\n')
    const d = doctor()
    expect(d).toContain('cites machine:decision--v1.10-structure-round')
  })
})
