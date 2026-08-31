/**
 * prdt-artifacts-buckets.test.ts — T-512, black-box over the REAL `prdt` CLI
 * (mirrors prdt-doctor-meta-drift.test.ts).
 *
 * Applies [[decision--artifact-versioning]]: artifacts live in
 * docs/artifacts/<version>/ beside a manifest.json the CLI derives, with
 * superseded drafts under archive/.
 *
 * Root cause this guards (T-512): the layout existed in GUI code but nothing
 * WROTE it, so v0.7~v1.7 registered zero artifacts while 15 files piled up flat
 * at the root. Two failures made that silent and both are asserted here:
 *  - the old doctor check asked "does some ticket body name this file?" — it
 *    cleared a file because a LATER round's ticket happened to cite it, and it
 *    warned about a file that named its own ticket in its <title>. Placement +
 *    manifest registration is the checkable condition; §1-5 are the positive
 *    controls that must fire BEFORE any clean run is trusted (§6).
 *  - nothing preserved hand-set attribution across a re-derive (§7), which is
 *    what makes "run sync on every artifact" survivable rather than lossy.
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync } from 'child_process'
import { test, expect, describe, beforeEach, afterEach } from 'vitest'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const PRDT_CLI = path.join(CORE_ROOT, 'scripts', 'prdt')

let projectDir: string

function runPrdt(args: string[]): { out: string; code: number } {
  try {
    const out = execFileSync('python3', [PRDT_CLI, ...args], {
      cwd: projectDir,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 20000,
    })
    return { out, code: 0 }
  } catch (e: any) {
    if (typeof e.status !== 'number') throw new Error(`prdt ${args.join(' ')}: ${e.stderr || e.message}`)
    return { out: `${e.stdout || ''}${e.stderr || ''}`, code: e.status }
  }
}

const check = () => runPrdt(['artifacts', 'check'])
const sync = () => runPrdt(['artifacts', 'sync'])
const doctor = () => runPrdt(['doctor']).out

function artifact(rel: string, body: string): void {
  const abs = path.join(projectDir, 'docs', 'artifacts', rel)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  fs.writeFileSync(abs, body)
}

function manifest(version: string): any {
  return JSON.parse(fs.readFileSync(
    path.join(projectDir, 'docs', 'artifacts', version, 'manifest.json'), 'utf-8'))
}

function entry(version: string, relPath: string): any {
  const hit = manifest(version).entries.find((e: any) => e.path === relPath)
  if (!hit) throw new Error(`no manifest entry for ${version}/${relPath}`)
  return hit
}

function ticketFile(id: string, version: string): void {
  const dir = path.join(projectDir, 'docs', 'tickets', version)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, `${id}.md`),
    `---\nid: ${id}\nslug: s\ntype: impl\nstatus: open\nassignee: developer\ncreated: 2026-08-01\n---\n\n## Request\nbody\n`)
}

describe('T-512 artifacts live in version buckets', () => {
  beforeEach(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-artifacts-'))
    runPrdt(['init', '--json', '--slug', 'proj', '--yes'])
  })
  afterEach(() => fs.rmSync(projectDir, { recursive: true, force: true }))

  // ── §1-5 positive controls — each class must FIRE on a violating tree ───────

  test('§1 a file flat at docs/artifacts/ root is reported, and doctor surfaces it', () => {
    artifact('anchor-accent-ab.html', '<title>A/B</title>')
    const r = check()
    expect(r.out).toContain('anchor-accent-ab.html sits outside a version bucket')
    expect(r.code).toBe(1)
    expect(doctor()).toContain('sits outside a version bucket')
  })

  test('§1b the flat file is reported even though NO ticket references it — the orphan the layout must place', () => {
    artifact('anchor-accent-ab.html', '<title>A/B</title>')
    // no ticket names this file anywhere; the old check keyed on exactly that
    expect(check().out).toContain('anchor-accent-ab.html sits outside a version bucket')
  })

  test('§2 a bucket file missing from the manifest is reported', () => {
    artifact('v1.6/probe.md', '# probe\n')
    sync()
    artifact('v1.6/late-arrival.md', '# late\n')
    const r = check()
    expect(r.out).toContain('v1.6/late-arrival.md is not registered in manifest.json')
    expect(r.code).toBe(1)
  })

  test('§3 a manifest entry with no file on disk is reported', () => {
    artifact('v1.6/probe.md', '# probe\n')
    sync()
    fs.rmSync(path.join(projectDir, 'docs', 'artifacts', 'v1.6', 'probe.md'))
    expect(check().out).toContain('manifest.json lists probe.md, which is not on disk')
  })

  test('§4 a directory that is not a version bucket is reported', () => {
    artifact('scratch/notes.md', '# n\n')
    expect(check().out).toContain('docs/artifacts/scratch/ is not a version bucket')
  })

  test('§5 a bucket subdirectory other than archive/ is reported', () => {
    artifact('v1.6/drafts/one.md', '# one\n')
    expect(check().out).toContain('v1.6/drafts/ — a bucket holds files plus archive/')
  })

  test('§5b a bucket holding files with no manifest at all is reported', () => {
    artifact('v1.6/probe.md', '# probe\n')
    expect(check().out).toContain('v1.6/ has 1 file(s) and no manifest.json')
  })

  // ── §6 only now is a clean run meaningful ──────────────────────────────────

  test('§6 sync makes a bucketed tree clean, and is idempotent', () => {
    artifact('v1.6/probe.md', '# probe\n')
    artifact('v1.6/archive/old-draft.md', '# old\n')
    expect(check().code).toBe(1) // violating first
    sync()
    const r = check()
    expect(r.out).toContain('0 finding(s)')
    expect(r.code).toBe(0)
    expect(sync().out).toContain('already current') // second run writes nothing
  })

  // ── §7 the property that keeps the layout alive across re-derives ──────────

  test('§7 sync preserves hand-set attribution disk cannot derive', () => {
    artifact('v1.7/governor-wide-sample.md', '# sample\n')
    sync()
    const m = manifest('v1.7')
    m.entries[0].ticket = 'T-491'
    m.entries[0].status = 'approved'
    m.entries[0].kind = 'spec'
    fs.writeFileSync(path.join(projectDir, 'docs', 'artifacts', 'v1.7', 'manifest.json'),
      JSON.stringify(m, null, 2) + '\n')
    artifact('v1.7/second.md', '# second\n') // force a re-derive
    sync()
    const e = entry('v1.7', 'governor-wide-sample.md')
    expect(e.ticket).toBe('T-491')
    expect(e.status).toBe('approved')
    expect(e.kind).toBe('spec')
  })

  test('§8 archive/ entries register as archived under an archive/ path', () => {
    artifact('v1.6/archive/old-draft.md', '# old\n')
    sync()
    const e = entry('v1.6', 'archive/old-draft.md')
    expect(e.status).toBe('archived')
  })

  // ── §9 attribution must not invent a ticket ────────────────────────────────

  test('§9a ticket derived from the filename prefix', () => {
    ticketFile('T-472', 'v1.7')
    artifact('v1.7/T-472-discipline-line-classification.md', '# classification\n')
    sync()
    expect(entry('v1.7', 'T-472-discipline-line-classification.md').ticket).toBe('T-472')
  })

  test('§9b ticket derived from the title the document gives itself', () => {
    ticketFile('T-359', 'v1.5')
    artifact('v1.5/anchor-accent-ab.html', '<title>Anchor Accent A/B (T-359)</title>')
    sync()
    expect(entry('v1.5', 'anchor-accent-ab.html').ticket).toBe('T-359')
  })

  test('§9c a ticket named only in body prose is NOT adopted — it is discussed, not owning', () => {
    ticketFile('T-491', 'v1.7')
    ticketFile('T-497', 'v1.7')
    // real shape of docs/artifacts/v1.8/direction-fork.md: title names no ticket,
    // prose cites T-491 first. Deriving from prose attributed it to T-491.
    artifact('v1.8/direction-fork.md', '# v1.8 방향 fork\n\n> T-491 의 되돌림 조건을 논의한다.\n')
    sync()
    expect(entry('v1.8', 'direction-fork.md').ticket).toBeNull()
  })

  test('§9d a title ticket that does not exist is not adopted', () => {
    artifact('v1.6/probe.md', '# probe (T-9999)\n')
    sync()
    expect(entry('v1.6', 'probe.md').ticket).toBeNull()
  })
})
