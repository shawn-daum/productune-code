/**
 * prdt-doctor-linkage-edges.test.ts — T-674 slice 2a, black-box over the real
 * `prdt` CLI (mirrors prdt-artifacts-buckets.test.ts / prdt-doctor-feature-seam.test.ts).
 *
 * Design SoT: docs/artifacts/v1.10/linkage-design.md §1.3 · §1.5 · §1.6 · §2 · §4.
 * Slice 1 closed the `feature:` vocabulary (W4-W6, edge E1) and checked its
 * value. This slice checks the VALUE of four more of the six adopted edges:
 *   E2 — wiki decision page `ticket:` names a real, non-dropped ticket
 *        (+ a T-NNN cited in wikilink position, `[[T-508]]`, warns)
 *   E3 — wiki page `version:` is in the version set derived from disk
 *   E5 — a NEW ticket using some relation key other than `deps` warns,
 *        with NO retroactive sweep of tickets from an older round
 *   E6 — an artifact manifest row's `ticket:` names a real ticket
 * plus the `prdt artifacts set <path> --ticket T-NNN` command E6 needs to be
 * fillable at all (sync alone can never derive it — design §2 E6 note).
 *
 * `edges` in `.prdt/index.db`, widening `wiki lint` to docs/prd/** and docs/tickets/**,
 * and `[[machine:…]]` resolution are the NEXT slice — out of scope here, and
 * this file asserts nothing about them.
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync } from 'child_process'
import { test, expect, describe, beforeEach, afterEach } from 'vitest'
import { subprocessTimeout } from '../helpers/subprocess-timeout'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const PRDT_CLI = path.join(CORE_ROOT, 'scripts', 'prdt')

let sandbox: string
let projectRoot: string
let env: NodeJS.ProcessEnv

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

function artifact(rel: string, body: string): void {
  const abs = path.join(projectRoot, 'docs', 'artifacts', rel)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  fs.writeFileSync(abs, body)
}

const MANIFEST = () => path.join(projectRoot, 'docs', 'artifacts', 'manifest.json')
function manifest(): any { return JSON.parse(fs.readFileSync(MANIFEST(), 'utf-8')) }
function writeManifest(m: any): void { fs.writeFileSync(MANIFEST(), JSON.stringify(m, null, 2) + '\n') }
function entry(bucket: string, p: string): any {
  const hit = manifest().entries.find((e: any) => e.bucket === bucket && e.path === p)
  if (!hit) throw new Error(`no manifest entry for ${bucket}/${p}`)
  return hit
}

describe('T-674 slice 2a — doctor edge value checks + artifacts set', () => {
  beforeEach(() => {
    sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-edges-'))
    const home = path.join(sandbox, 'home')
    fs.mkdirSync(home, { recursive: true })
    env = { ...process.env, HOME: home, PRDT_HOME: path.join(home, '.prdt'),
             PRDT_DISCIPLINE: path.join(CORE_ROOT, 'discipline') }
    projectRoot = path.join(sandbox, 'proj')
    fs.mkdirSync(path.join(projectRoot, '.prdt'), { recursive: true })
    fs.writeFileSync(path.join(projectRoot, '.prdt', 'config.json'), JSON.stringify({ slug: 'proj' }, null, 2))
    for (const d of ['docs/prd', 'docs/tickets', 'docs/wiki', 'docs/artifacts']) {
      fs.mkdirSync(path.join(projectRoot, d), { recursive: true })
    }
    poState('v1.10')
  })
  afterEach(() => fs.rmSync(sandbox, { recursive: true, force: true }))

  // ── E2 — wiki decision page ticket: ────────────────────────────────────────

  test('E2 fires on a ticket: value that does not exist, and on a dropped one', () => {
    ticket('T-1', 'v1.10', {}, 'dropped')
    wikiPage('decision--a', { type: 'decision', status: 'live', ticket: 'T-999' })
    wikiPage('decision--b', { type: 'decision', status: 'live', ticket: 'T-1' })
    const d = doctor()
    expect(d).toContain('decision--a ticket: T-999 does not exist in the ticket index')
    expect(d).toContain('decision--b ticket: T-1 is dropped')
  })

  test('E2 stays silent when ticket: names a real, non-dropped ticket', () => {
    ticket('T-1', 'v1.10')
    wikiPage('decision--a', { type: 'decision', status: 'live', ticket: 'T-1' })
    expect(doctor()).not.toContain('ticket: T-1 does not exist')
    expect(doctor()).not.toContain('ticket: T-1 is dropped')
  })

  test('E2 — a ticket id in wikilink position warns (design real example: [[T-508]])', () => {
    ticket('T-508', 'v1.10')
    wikiPage('fact--x', { type: 'fact', status: 'live' }, 'see [[T-508]] for context')
    expect(doctor()).toContain('fact--x cites T-508 in wikilink position ([[T-508]])')
  })

  // ── E3 — wiki page version: ─────────────────────────────────────────────────

  test('E3 fires on a version: not derivable from disk', () => {
    wikiPage('fact--y', { type: 'fact', status: 'live', version: 'v1.0' })
    expect(doctor()).toContain(
      'fact--y version: v1.0 is not in the version set derived from disk')
  })

  test('E3 stays silent for a version the open PRD section names, and for a ticket-dir version', () => {
    ticket('T-1', 'v1.10')
    wikiPage('fact--open', { type: 'fact', status: 'live', version: 'v1.10' })
    ticket('T-2', 'v0.9')
    wikiPage('fact--dir', { type: 'fact', status: 'live', version: 'v0.9' })
    const d = doctor()
    expect(d).not.toContain('fact--open version:')
    expect(d).not.toContain('fact--dir version:')
  })

  test('E3 stays silent for a version docs/prd/versions/<id>.md registers', () => {
    fs.mkdirSync(path.join(projectRoot, 'docs', 'prd', 'versions'), { recursive: true })
    fs.writeFileSync(path.join(projectRoot, 'docs', 'prd', 'versions', 'v1.2.md'), '## v1.2\n\nstub\n')
    wikiPage('fact--z', { type: 'fact', status: 'live', version: 'v1.2' })
    expect(doctor()).not.toContain('fact--z version:')
  })

  // ── E5 — unknown relation key, new tickets only ────────────────────────────

  test('E5 fires on a NEW ticket (this round) using a relation key other than deps', () => {
    ticket('T-10', 'v1.10', { depends_on: '[T-1]' })
    expect(doctor()).toContain('ticket: T-10 uses relation key `depends_on:`')
  })

  test('E5 stays silent on an OLDER round\'s ticket using the same key (no retroactive sweep)', () => {
    ticket('T-5', 'v1.9', { related: '[T-1]' })
    expect(doctor()).not.toContain('ticket: T-5 uses relation key')
  })

  test('E5 stays silent on backlog and on ordinary deps', () => {
    ticket('T-6', 'backlog', { related: '[T-1]' })
    ticket('T-7', 'v1.10', { deps: '[T-6]' })
    const d = doctor()
    expect(d).not.toContain('ticket: T-6 uses relation key')
    expect(d).not.toContain('ticket: T-7 uses relation key')
  })

  // ── E6 — artifact manifest ticket: ──────────────────────────────────────────

  test('E6 fires when a manifest ticket: names no real ticket', () => {
    artifact('v1.10/x.md', '# x\n')
    runPrdt(['artifacts', 'sync'])
    const m = manifest()
    m.entries[0].ticket = 'T-9999'
    writeManifest(m)
    expect(doctor()).toContain('artifact: v1.10/x.md ticket: T-9999 does not exist in the ticket index')
  })

  test('E6 stays silent when manifest ticket: names a real ticket', () => {
    ticket('T-1', 'v1.10')
    artifact('v1.10/x.md', '# x\n')
    runPrdt(['artifacts', 'sync'])
    const m = manifest()
    m.entries[0].ticket = 'T-1'
    writeManifest(m)
    expect(doctor()).not.toContain('ticket: T-1 does not exist')
  })

  // ── `prdt artifacts set` ────────────────────────────────────────────────────

  test('artifacts set fills a registered row, and sync preserves it', () => {
    ticket('T-1', 'v1.10')
    artifact('v1.10/linkage-design.md', '# design\n')
    runPrdt(['artifacts', 'sync'])
    const r = runPrdt(['artifacts', 'set', 'v1.10/linkage-design.md', '--ticket', 'T-1'])
    expect(r.code).toBe(0)
    expect(entry('v1.10', 'linkage-design.md').ticket).toBe('T-1')
    artifact('v1.10/second.md', '# second\n') // force a re-derive
    runPrdt(['artifacts', 'sync'])
    expect(entry('v1.10', 'linkage-design.md').ticket).toBe('T-1')
  })

  test('artifacts set accepts the docs/artifacts/-prefixed spelling too', () => {
    ticket('T-1', 'v1.10')
    artifact('v1.10/a.md', '# a\n')
    runPrdt(['artifacts', 'sync'])
    const r = runPrdt(['artifacts', 'set', 'docs/artifacts/v1.10/a.md', '--ticket', 'T-1'])
    expect(r.code).toBe(0)
    expect(entry('v1.10', 'a.md').ticket).toBe('T-1')
  })

  test('artifacts set refuses a path sync has not registered', () => {
    ticket('T-1', 'v1.10')
    artifact('v1.10/real.md', '# real\n')
    runPrdt(['artifacts', 'sync']) // manifest exists, but never heard of ghost.md
    const r = runPrdt(['artifacts', 'set', 'v1.10/ghost.md', '--ticket', 'T-1'])
    expect(r.code).not.toBe(0)
    expect(r.out).toContain('is not a registered entry')
  })

  test('artifacts set refuses when no manifest exists yet at all', () => {
    const r = runPrdt(['artifacts', 'set', 'v1.10/ghost.md', '--ticket', 'T-1'])
    expect(r.code).not.toBe(0)
    expect(r.out).toContain('does not exist yet')
  })

  test('artifacts set refuses a ticket id that does not exist', () => {
    artifact('v1.10/a.md', '# a\n')
    runPrdt(['artifacts', 'sync'])
    const r = runPrdt(['artifacts', 'set', 'v1.10/a.md', '--ticket', 'T-9999'])
    expect(r.code).not.toBe(0)
    expect(r.out).toContain('does not exist in docs/tickets/')
    expect(entry('v1.10', 'a.md').ticket).toBeNull()
  })

  test('artifacts set refuses a malformed ticket id', () => {
    artifact('v1.10/a.md', '# a\n')
    runPrdt(['artifacts', 'sync'])
    const r = runPrdt(['artifacts', 'set', 'v1.10/a.md', '--ticket', 'not-a-ticket'])
    expect(r.code).not.toBe(0)
    expect(r.out).toContain('is not a ticket id')
  })
})
