/**
 * prdt-artifacts-buckets.test.ts — T-512, black-box over the REAL `prdt` CLI
 * (mirrors prdt-doctor-meta-drift.test.ts).
 *
 * Applies [[decision--artifact-versioning]]: artifacts live in
 * docs/artifacts/<version>/ with superseded drafts under archive/, registered
 * in the ONE root docs/artifacts/manifest.json the CLI derives, each entry
 * carrying its `bucket` (T-661, user decision 2026-09-18 "루트에하나"). The
 * pre-T-661 shape — a manifest.json inside each bucket — is reported by
 * check + doctor (§13) and moved losslessly by `prdt artifacts migrate` (§14).
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
import { subprocessTimeout } from '../helpers/subprocess-timeout'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const PRDT_CLI = path.join(CORE_ROOT, 'scripts', 'prdt')

let projectDir: string

function runPrdt(args: string[]): { out: string; code: number } {
  try {
    const out = execFileSync('python3', [PRDT_CLI, ...args], {
      cwd: projectDir,
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

const check = () => runPrdt(['artifacts', 'check'])
const sync = () => runPrdt(['artifacts', 'sync'])
const doctor = () => runPrdt(['doctor']).out

function artifact(rel: string, body: string): void {
  const abs = path.join(projectDir, 'docs', 'artifacts', rel)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  fs.writeFileSync(abs, body)
}

const ROOT_MANIFEST = () => path.join(projectDir, 'docs', 'artifacts', 'manifest.json')

function manifest(): any {
  return JSON.parse(fs.readFileSync(ROOT_MANIFEST(), 'utf-8'))
}

function writeManifest(m: any): void {
  fs.writeFileSync(ROOT_MANIFEST(), JSON.stringify(m, null, 2) + '\n')
}

function entry(version: string, relPath: string): any {
  const hit = manifest().entries.find((e: any) => e.bucket === version && e.path === relPath)
  if (!hit) throw new Error(`no manifest entry for ${version}/${relPath}`)
  return hit
}

/** A pre-T-661 per-bucket manifest, written as the old CLI wrote it. */
function legacyManifest(version: string, entries: any[]): void {
  const abs = path.join(projectDir, 'docs', 'artifacts', version, 'manifest.json')
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  fs.writeFileSync(abs, JSON.stringify({ schema_v: 1, version, entries }, null, 2) + '\n')
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
    expect(r.out).toContain('v1.6/late-arrival.md is not registered in docs/artifacts/manifest.json')
    expect(r.code).toBe(1)
  })

  test('§3 a manifest entry with no file on disk is reported', () => {
    artifact('v1.6/probe.md', '# probe\n')
    sync()
    fs.rmSync(path.join(projectDir, 'docs', 'artifacts', 'v1.6', 'probe.md'))
    expect(check().out).toContain('manifest.json lists v1.6/probe.md, which is not on disk')
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
    expect(check().out).toContain('v1.6/ has 1 file(s) and there is no docs/artifacts/manifest.json')
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
    const m = manifest()
    m.entries[0].ticket = 'T-491'
    m.entries[0].status = 'approved'
    m.entries[0].kind = 'spec'
    m.entries[0].note = 'hand-written, a key the CLI never derives' // real: 2 entries on this machine carry `note`
    writeManifest(m)
    artifact('v1.7/second.md', '# second\n') // force a re-derive
    sync()
    const e = entry('v1.7', 'governor-wide-sample.md')
    expect(e.ticket).toBe('T-491')
    expect(e.status).toBe('approved')
    expect(e.kind).toBe('spec')
    expect(e.note).toBe('hand-written, a key the CLI never derives')
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

  // ── QA round 2 (T-512 follow-up) ────────────────────────────────────────────

  test('§10 a file nested under archive/<subdir>/ is reached by check + sync (F1)', () => {
    // Root cause: artifact_files() walked archive/ one level only, so this file
    // was invisible to every check class — sync never registered it, `check`
    // reported clean, doctor stayed silent, while the GUI's recursive walk
    // rendered it. That asymmetry is exactly what T-512 exists to remove.
    artifact('v1.6/probe.md', '# probe\n')
    sync()
    artifact('v1.6/archive/sub/hidden.md', '# hidden\n')
    const r = check()
    expect(r.out).toContain('v1.6/archive/sub/hidden.md is not registered in docs/artifacts/manifest.json')
    expect(r.code).toBe(1)
    sync()
    const e = entry('v1.6', 'archive/sub/hidden.md')
    expect(e.status).toBe('archived')
    expect(check().code).toBe(0)
  })

  test('§11 a bucket name is a version id — v1 · v1.2 · v1.2.3 all buckets, v1.2.3.4 and v1.x not (T-661 / T-657)', () => {
    // Flipped from T-512's F3 by T-661 acceptance line 8: T-657 fixed the ONE
    // version-id definition (1–3 components, a missing one reads as zero) and
    // the bucket reader now uses it instead of its own `^v\d+\.\d+(?:\.\d+)?$`,
    // which reported docs/artifacts/v1/ as "not a version bucket" (measured
    // 2026-09-22). The name on disk is never rewritten: the entry says `v1`.
    artifact('v1/note.md', '# n\n')
    artifact('v1.2/note.md', '# n\n')
    artifact('v1.2.3/note.md', '# n\n')
    artifact('v1.2.3.4/note.md', '# n\n')
    artifact('v1.x/note.md', '# n\n')
    const r = check()
    expect(r.out).not.toContain('docs/artifacts/v1/ is not a version bucket')
    expect(r.out).not.toContain('docs/artifacts/v1.2/ is not a version bucket')
    expect(r.out).not.toContain('docs/artifacts/v1.2.3/ is not a version bucket')
    expect(r.out).toContain('docs/artifacts/v1.2.3.4/ is not a version bucket')
    expect(r.out).toContain('docs/artifacts/v1.x/ is not a version bucket')
    sync()
    expect(manifest().entries.map((e: any) => e.bucket)).toEqual(['v1', 'v1.2', 'v1.2.3'])
    expect(entry('v1', 'note.md').bucket).toBe('v1')
    expect(fs.existsSync(path.join(projectDir, 'docs', 'artifacts', 'v1', 'manifest.json'))).toBe(false)
  })

  test('§12 a malformed manifest entry is reported, not silently dropped (F4)', () => {
    // read_artifact_manifest() discarded any entry that was not {path: str, ...}
    // with no report — a hand-edited entry of the wrong shape vanished at the
    // next sync. Well-formed hand edits are preserved (§7); this asserts the
    // malformed shape is surfaced instead of disappearing.
    artifact('v1.6/probe.md', '# probe\n')
    sync()
    const m = manifest()
    m.entries.push({ note: 'hand-added, wrong shape — no path key' })
    m.entries.push({ path: 'no-bucket.md' })
    writeManifest(m)
    const r = check()
    expect(r.out).toContain('docs/artifacts/manifest.json entry 1 is not {path: str, ...} — dropped')
    expect(r.out).toContain('docs/artifacts/manifest.json entry 2 (no-bucket.md) has no `bucket` — dropped')
    expect(r.code).toBe(1)
  })

  // ── T-661: ONE manifest at the root ─────────────────────────────────────────

  test('§13 the pre-T-661 shape (manifest.json inside a bucket) is a failure for check AND doctor, and sync refuses', () => {
    // ntf-pm lesson (T-657): a project that has not migrated learns it from
    // the tool, not from a person opening the file. Old shape, exactly as the
    // pre-T-661 CLI wrote it — no root manifest at all.
    artifact('v1.6/probe.md', '# probe\n')
    legacyManifest('v1.6', [{ path: 'probe.md', ticket: null, kind: 'doc', status: 'pending', lang: 'ko', added_at: '2026-08-01T00:00:00Z' }])
    const r = check()
    expect(r.out).toContain('v1.6/manifest.json is a per-bucket manifest')
    expect(r.out).toContain('run `prdt artifacts migrate`')
    expect(r.code).toBe(1)
    const d = doctor()
    expect(d).toContain('v1.6/manifest.json is a per-bucket manifest')
    // sync would re-derive from disk without reading the old file — refused,
    // the old file untouched, no root manifest written.
    const s = sync()
    expect(s.code).not.toBe(0)
    expect(s.out).toContain('sync refused')
    expect(fs.existsSync(path.join(projectDir, 'docs', 'artifacts', 'v1.6', 'manifest.json'))).toBe(true)
    expect(fs.existsSync(ROOT_MANIFEST())).toBe(false)
  })

  test('§14 migrate merges every per-bucket manifest into the root one losslessly, then check is clean', () => {
    // Three buckets in the old shape, with every field class the 29 real
    // manifests carry (measured 2026-09-22: path · ticket · kind · status ·
    // lang · added_at on all 227 entries, `backfilled` on 83, `note` on 2),
    // hand-set values a re-derive would NOT produce, and one archived entry.
    const v16 = [
      { path: 'probe.md', ticket: 'T-491', kind: 'spec', status: 'approved', lang: 'en', added_at: '2026-08-01T00:00:00Z', note: 'hand note' },
      { path: 'archive/old.md', ticket: null, kind: 'doc', status: 'archived', lang: 'ko', added_at: '2026-07-01T00:00:00Z', backfilled: true },
    ]
    const v17 = [{ path: 'two.html', ticket: 'T-9', kind: 'mockup', status: 'pending', lang: 'ko', added_at: '2026-08-02T00:00:00Z' }]
    const v1 = [{ path: 'short-id.md', ticket: null, kind: 'doc', status: 'pending', lang: 'ko', added_at: '2026-08-03T00:00:00Z' }]
    artifact('v1.6/probe.md', '# probe\n')
    artifact('v1.6/archive/old.md', '# old\n')
    artifact('v1.7/two.html', '<title>two</title>')
    artifact('v1/short-id.md', '# short\n')
    legacyManifest('v1.6', v16)
    legacyManifest('v1.7', v17)
    legacyManifest('v1', v1)
    const before = [...v1.map((e) => ({ bucket: 'v1', ...e })), ...v16.map((e) => ({ bucket: 'v1.6', ...e })), ...v17.map((e) => ({ bucket: 'v1.7', ...e }))]

    // dry-run: the plan, nothing written
    const dry = runPrdt(['artifacts', 'migrate', '--dry-run'])
    expect(dry.code).toBe(0)
    expect(dry.out).toContain('[dry-run] artifacts: 3 per-bucket manifest(s), 4 entrie(s)')
    expect(fs.existsSync(ROOT_MANIFEST())).toBe(false)

    const r = runPrdt(['artifacts', 'migrate'])
    expect(r.code).toBe(0)
    expect(r.out).toContain('3 per-bucket manifest(s), 4 entrie(s) → docs/artifacts/manifest.json (4 entrie(s))')
    const m = manifest()
    expect(m.schema_v).toBe(2)
    // entry count and every field value identical; `bucket` = the directory name
    expect(m.entries.length).toBe(before.length)
    const byKey = (a: any, b: any) => `${a.bucket}/${a.path}`.localeCompare(`${b.bucket}/${b.path}`)
    expect([...m.entries].sort(byKey)).toEqual([...before].sort(byKey)) // order-free: migrate sorts by bucket (version order) then path
    for (const v of ['v1', 'v1.6', 'v1.7']) {
      expect(fs.existsSync(path.join(projectDir, 'docs', 'artifacts', v, 'manifest.json'))).toBe(false)
    }
    expect(check().code).toBe(0)
    // T-674 slice 2a added E6 (artifact ticket edge): the fixture's placeholder
    // ticket ids (T-491, T-9 — chosen above only to exercise migrate's field
    // fidelity, never created as real tickets) now surface exactly those two
    // `artifact:` lines and nothing else — migrate itself introduces no finding.
    const d = doctor()
    expect(d).toContain('artifact: v1.6/probe.md ticket: T-491 does not exist in the ticket index')
    expect(d).toContain('artifact: v1.7/two.html ticket: T-9 does not exist in the ticket index')
    expect(d.split('\n').filter((l) => l.includes('artifact:')).length).toBe(2)
    // a second run has nothing to do; sync after migrate preserves every moved value
    expect(runPrdt(['artifacts', 'migrate']).out).toContain('nothing to migrate')
    sync()
    expect([...manifest().entries].sort(byKey)).toEqual([...before].sort(byKey))
  })

  test('§14b migrate is all-or-nothing: a manifest in a non-bucket directory stops the run before any write', () => {
    // real: paepyeong/docs/artifacts/paepyeong-v1/manifest.json (2026-09-22)
    artifact('v1.6/probe.md', '# probe\n')
    legacyManifest('v1.6', [{ path: 'probe.md', ticket: null, kind: 'doc', status: 'pending', lang: 'ko', added_at: '2026-08-01T00:00:00Z' }])
    artifact('paepyeong-v1/x.md', '# x\n')
    legacyManifest('paepyeong-v1', [{ path: 'x.md', ticket: null, kind: 'doc', status: 'pending', lang: 'ko', added_at: '2026-08-01T00:00:00Z' }])
    const r = runPrdt(['artifacts', 'migrate'])
    expect(r.code).toBe(1)
    expect(r.out).toContain('paepyeong-v1/manifest.json sits in a directory that is not a version bucket')
    expect(r.out).toContain('nothing written')
    expect(fs.existsSync(ROOT_MANIFEST())).toBe(false)
    expect(fs.existsSync(path.join(projectDir, 'docs', 'artifacts', 'v1.6', 'manifest.json'))).toBe(true)
  })

  test('§15 the root manifest is one JSON a static generator reads without the CLI: schema_v + entries[] with bucket first', () => {
    artifact('v1.6/probe.md', '# probe\n')
    artifact('v1.10/late.md', '# late\n')
    sync()
    const m = manifest()
    expect(Object.keys(m)).toEqual(['schema_v', 'entries'])
    expect(m.entries.map((e: any) => `${e.bucket}/${e.path}`)).toEqual(['v1.6/probe.md', 'v1.10/late.md']) // version order, not lexical
    expect(Object.keys(m.entries[0])).toEqual(['bucket', 'path', 'ticket', 'kind', 'status', 'lang', 'added_at'])
  })

  test('§16 an entry whose bucket is not on disk is reported', () => {
    artifact('v1.6/probe.md', '# probe\n')
    sync()
    const m = manifest()
    m.entries.push({ bucket: 'v1.9', path: 'gone.md', ticket: null, kind: 'doc', status: 'pending', lang: 'ko', added_at: '2026-08-01T00:00:00Z' })
    writeManifest(m)
    const r = check()
    expect(r.out).toContain('manifest.json lists v1.9/gone.md, and v1.9/ is not a version bucket on disk')
    expect(r.code).toBe(1)
  })

  // ── T-672: a hand-filled value survives the archive/ move ──────────────────

  test('§17 a superseded file moved to archive/ keeps its hand-filled values (T-672 ⓐ)', () => {
    // Root cause: the entry key is (bucket, path); the contract's own
    // prescribed move (superseded -> archive/<same name>) changes the path, so
    // an exact-key re-derive found nothing and dropped ticket/note/status.
    artifact('v1.2/a.html', '<title>a</title>')
    sync()
    const m = manifest()
    m.entries[0].ticket = 'T-999'
    m.entries[0].note = 'hand-filled note'
    m.entries[0].status = 'approved'
    writeManifest(m)
    const bucketDir = path.join(projectDir, 'docs', 'artifacts', 'v1.2')
    fs.mkdirSync(path.join(bucketDir, 'archive'), { recursive: true })
    fs.renameSync(path.join(bucketDir, 'a.html'), path.join(bucketDir, 'archive', 'a.html'))
    sync()
    const e = entry('v1.2', 'archive/a.html')
    expect(e.ticket).toBe('T-999')
    expect(e.note).toBe('hand-filled note')
    expect(e.status).toBe('archived') // archived always wins, same rule as §8 — only the OTHER values had to survive
    expect(manifest().entries.some((x: any) => x.bucket === 'v1.2' && x.path === 'a.html')).toBe(false)
    expect(manifest().entries.length).toBe(1) // carried forward, not duplicated
  })

  test('§18 sync refuses on a root entry with no `bucket` instead of silently dropping it (T-672 ⓑ)', () => {
    // check names `prdt artifacts sync` as the remedy for exactly this
    // malformed shape (§12); running it must not be the thing that erases the
    // entry's values with no report — it refuses, the same posture as an
    // unreadable manifest or a leftover per-bucket one (§13).
    artifact('v1.6/probe.md', '# probe\n')
    sync()
    const m = manifest()
    m.entries.push({ path: 'no-bucket.md', ticket: 'T-1', note: 'would be lost silently' })
    writeManifest(m)
    const before = fs.readFileSync(ROOT_MANIFEST(), 'utf-8')
    const r = sync()
    expect(r.code).not.toBe(0)
    expect(r.out).toContain('sync refused')
    expect(r.out).toContain('no-bucket.md) has no `bucket`')
    expect(fs.readFileSync(ROOT_MANIFEST(), 'utf-8')).toBe(before) // untouched — nothing dropped
    expect(check().out).toContain('run `prdt artifacts sync`') // and that remedy now actually describes what happens
  })

  test('§19 a manifest.json nested inside a bucket is reported, not registered as an artifact (T-672 ⓒ)', () => {
    // Real shape: v1.1/archive/manifest.json. Depth-1 (bucket/manifest.json) is
    // the pre-T-661 per-bucket shape (§13); this is deeper, unreported before,
    // and sync silently registered it as an ordinary artifact.
    artifact('v1.1/keep.md', '# keep\n')
    const archiveDir = path.join(projectDir, 'docs', 'artifacts', 'v1.1', 'archive')
    fs.mkdirSync(archiveDir, { recursive: true })
    fs.writeFileSync(path.join(archiveDir, 'manifest.json'), '{"schema_v":1,"entries":[]}\n')
    const r = check()
    expect(r.out).toContain('v1.1/archive/manifest.json is a manifest.json inside a bucket')
    expect(r.code).toBe(1)
    expect(doctor()).toContain('v1.1/archive/manifest.json is a manifest.json inside a bucket')
    sync()
    expect(manifest().entries.map((e: any) => e.path)).toEqual(['keep.md'])
  })

  test('§20 sync prints a line for every entry it drops, not only "written (…)" (T-672)', () => {
    artifact('v1.6/probe.md', '# probe\n')
    artifact('v1.6/gone.md', '# gone\n')
    sync()
    fs.rmSync(path.join(projectDir, 'docs', 'artifacts', 'v1.6', 'gone.md'))
    const r = sync()
    expect(r.out).toContain('dropped v1.6/gone.md')
    expect(manifest().entries.map((e: any) => e.path)).toEqual(['probe.md'])
  })
})
