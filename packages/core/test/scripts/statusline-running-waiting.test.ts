/**
 * statusline-running-waiting.test.ts — T-682 slice 2.
 *
 * Slice 1 (2026-09-26) added the "running" / "waiting" footer segments to
 * `statusline-prdt.sh` but landed with NO automated coverage of the
 * acceptance list (hand-verified only). This is that coverage, driving the
 * REAL script end-to-end (never re-implementing its logic as an oracle).
 *
 *   running — markers at `<PRDT_HOME>/run/dispatches/<sha256(agent_id)>.json`
 *             (the write side lives in prdt-post-dispatch.sh, covered by
 *             post-dispatch-dispatch-marker.test.ts), aged out past
 *             STALE_HOURS=4. STALE_HOURS itself is a stated judgment call,
 *             not a measured ceiling (slice 1's own note) — this suite only
 *             pins the AGEING MECHANISM at a threshold crossing, not the
 *             number 4 as a measured value.
 *   waiting — open `type: decision` / `assignee: user` tickets in the
 *             current version's ticket dir (no marker involved).
 *   successors/blocks — `.prdt/index.db`'s `edges` table (`rel='deps'`).
 *   links — OSC 8 wraps a ticket id only when `index.db` resolves it a path;
 *           absent that index, ids render as plain text (checked here at the
 *           byte level; a live click-test in a real terminal is out of
 *           scope, per this ticket).
 *
 * T-805: the link target moved from the raw ticket md to the viewer jump
 * page `prdt tickets --link` prints for the same id (`.prdt/scratch/viewer/
 * at/T-NNN.html`, T-746) — never the md, and never fabricated when no viewer
 * has been generated yet (an id then renders unlinked, same silent degrade
 * as every other missing piece here). Most tests below only assert on the
 * unwrapped, visible text (`segment()`/`unwrapLinks()`), so they hold
 * regardless of the link target; the tests that assert on the link target
 * itself pre-create a stub `.prdt/scratch/viewer/viewer.html` the way a real
 * project's `prdt viewer`/T-802 background regen would have.
 *
 * `PRDT_HOME` is always a scratch dir here (`run/` is tooling-owned — never
 * the real `~/.prdt`).
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import crypto from 'crypto'
import { execFileSync, spawn, spawnSync } from 'child_process'
import { test, expect, describe, beforeEach, afterEach } from 'vitest'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const STATUSLINE_SH = path.join(CORE_ROOT, 'scripts', 'statusline-prdt.sh')
const VERSION = 'v9.9' // scratch-only version id, matches VERSION_RE

let root: string
let prdtHome: string

function tmp(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix))
}

function makeProject(prefix = 'prdt-t682-sl-proj-', currentTask: Record<string, unknown> | null = null): string {
  const r = fs.realpathSync(tmp(prefix))
  fs.mkdirSync(path.join(r, '.prdt'), { recursive: true })
  fs.writeFileSync(
    path.join(r, '.prdt', 'po-state.json'),
    JSON.stringify({ schema_version: 1, stage: 'build', version: VERSION, current_task: currentTask }),
  )
  return r
}

function isoAgo(ms: number): string {
  return new Date(Date.now() - ms).toISOString().replace(/\.\d{3}Z$/, 'Z')
}

/** Writes one dispatch marker directly (the write side is covered elsewhere). */
function writeMarker(opts: { agentId: string; ticketId: string; persona?: string; ageMs?: number; stoppedAgoMs?: number }): string {
  const hex = crypto.createHash('sha256').update(opts.agentId, 'utf8').digest('hex')
  const dir = path.join(prdtHome, 'run', 'dispatches')
  fs.mkdirSync(dir, { recursive: true })
  const p = path.join(dir, `${hex}.json`)
  fs.writeFileSync(p, JSON.stringify({
    agent_id: opts.agentId, persona: opts.persona ?? 'developer', dispatch_id: `d-${opts.ticketId}-x`,
    ticket_id: opts.ticketId, tool_use_id: null, project_root: root, since: isoAgo(opts.ageMs ?? 60_000),
    ...(opts.stoppedAgoMs === undefined ? {} : { stopped_at: isoAgo(opts.stoppedAgoMs) }),
  }))
  return p
}

/** Writes one open ticket file in the current version dir. `extra` OVERRIDES
 *  the defaults (a single `type`/`assignee` key each — never a duplicate
 *  frontmatter line, which the statusline's `re.search` would resolve to
 *  whichever occurrence comes first, not the one this fixture meant to set). */
function writeTicket(id: string, extra: Record<string, string> = {}, status = 'open'): void {
  const dir = path.join(root, 'docs', 'tickets', VERSION)
  fs.mkdirSync(dir, { recursive: true })
  const fm: Record<string, string> = {
    id, slug: `s-${id.toLowerCase()}`, type: 'impl', status,
    assignee: 'developer', created: '2026-01-01', ...extra,
  }
  const lines = Object.entries(fm).map(([k, v]) => `${k}: ${v}`).join('\n')
  fs.writeFileSync(path.join(dir, `${id}.md`), `---\n${lines}\n---\n\nbody\n`)
}

/** Hand-built `.prdt/index.db` (T-674 shape): `tickets.path` for OSC 8 link
 *  resolution, `edges` (rel='deps') for successors/blocks. */
function buildIndexDb(
  tickets: Array<{ id: string; relPath: string }>,
  edges: Array<{ src: string; dst: string }>,
): void {
  fs.mkdirSync(path.join(root, '.prdt'), { recursive: true })
  const dbPath = path.join(root, '.prdt', 'index.db')
  const script = `
import sqlite3, sys, json
tickets = json.loads(sys.argv[2])
edges = json.loads(sys.argv[3])
con = sqlite3.connect(sys.argv[1])
con.executescript("""
CREATE TABLE IF NOT EXISTS tickets (id TEXT PRIMARY KEY, path TEXT);
CREATE TABLE IF NOT EXISTS edges (src TEXT, rel TEXT, dst TEXT, resolved INTEGER);
""")
for t in tickets:
    con.execute("INSERT INTO tickets (id, path) VALUES (?, ?)", (t["id"], t["path"]))
for e in edges:
    con.execute("INSERT INTO edges (src, rel, dst, resolved) VALUES (?, 'deps', ?, 1)", (e["src"], e["dst"]))
con.commit()
con.close()
`
  execFileSync('python3', ['-c', script, dbPath,
    JSON.stringify(tickets.map((t) => ({ id: t.id, path: t.relPath }))),
    JSON.stringify(edges)])
}

/** Stubs `.prdt/scratch/viewer/viewer.html` — the one fact `viewer_jump_path()`
 *  checks before writing a jump page (T-805); content is irrelevant, only
 *  its existence is. */
function stubViewerHtml(): void {
  const dir = path.join(root, '.prdt', 'scratch', 'viewer')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'viewer.html'), '<html></html>')
}

/** The jump-page path `viewer_jump_path()` writes for `id` (T-746 form). */
function jumpPagePath(id: string): string {
  return path.join(root, '.prdt', 'scratch', 'viewer', 'at', `${id}.html`)
}

function runStatusline(): string {
  return execFileSync('bash', [STATUSLINE_SH], {
    cwd: root, input: '', encoding: 'utf-8',
    env: { ...process.env, PRDT_HOME: prdtHome },
  })
}

const OSC8_OPEN = '\x1b]8;;'
const OSC8_CLOSE = '\x1b]8;;\x1b\\'
/** `\x1b]8;;file://<path>\x1b\<id>\x1b]8;;\x1b\` → `<id>` — OSC 8 is its own
 *  acceptance line (its own test below); the format/collapse tests below care
 *  about ids, personas, successors and the `+N` tail, not the link bytes. */
const OSC8_RE = /\x1b\]8;;file:\/\/[^\x1b]*\x1b\\(.*?)\x1b\]8;;\x1b\\/g
function unwrapLinks(text: string): string {
  return text.replace(OSC8_RE, '$1')
}

/** Pulls out the ` | `-delimited segment starting with `name ` (or undefined),
 *  with any OSC 8 wrapping unwrapped back to the plain ticket id. */
function segment(out: string, name: 'running' | 'waiting'): string | undefined {
  const found = out.trim().split(' | ').find((p) => p.startsWith(`${name} `))
  return found === undefined ? undefined : unwrapLinks(found).slice(name.length + 1)
}

function which(bin: string): string | null {
  try { return execFileSync('which', [bin], { encoding: 'utf8' }).trim() || null } catch { return null }
}
const PYTHON3 = which('python3')

beforeEach(() => {
  root = makeProject()
  prdtHome = tmp('prdt-t682-sl-home-')
})

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true })
  fs.rmSync(prdtHome, { recursive: true, force: true })
})

describe.skipIf(!PYTHON3)('T-682 slice 2 — statusline running/waiting footer segments', () => {
  test('none running, none waiting: both segments omitted, not shown empty', () => {
    const out = runStatusline()
    expect(out).not.toMatch(/\brunning\b/)
    expect(out).not.toMatch(/\bwaiting\b/)
    expect(out).toContain('build') // rest of the line still renders
  })

  test('several of each, with successors/blocks from the edges table', () => {
    writeMarker({ agentId: 'a1', ticketId: 'T-700', persona: 'developer', ageMs: 2 * 60_000 })
    writeMarker({ agentId: 'a2', ticketId: 'T-701', persona: 'qa', ageMs: 60_000 })
    writeTicket('T-710', { type: 'decision' })
    writeTicket('T-711', { assignee: 'user' })
    buildIndexDb(
      [
        { id: 'T-700', relPath: 'docs/tickets/v9.9/T-700.md' },
        { id: 'T-701', relPath: 'docs/tickets/v9.9/T-701.md' },
        { id: 'T-710', relPath: 'docs/tickets/v9.9/T-710.md' },
        { id: 'T-711', relPath: 'docs/tickets/v9.9/T-711.md' },
        { id: 'T-720', relPath: 'docs/tickets/v9.9/T-720.md' },
        { id: 'T-730', relPath: 'docs/tickets/v9.9/T-730.md' },
      ],
      [
        { src: 'T-720', dst: 'T-700' }, // T-720 depends on running T-700 → its successor
        { src: 'T-730', dst: 'T-710' }, // T-730 depends on waiting T-710 → what T-710 blocks
      ],
    )

    const out = runStatusline()
    const running = segment(out, 'running')
    const waiting = segment(out, 'waiting')
    expect(running).toBe('T-700→developer»T-720 T-701→qa')
    expect(waiting).toBe('T-710»T-730 T-711')
  })

  test('a stale in-flight marker ages out (never shown, never crashes, never deleted); a fresh one still shows; a stopped one is hidden', () => {
    const stale = writeMarker({ agentId: 'stale', ticketId: 'T-999', ageMs: 5 * 3600_000 }) // > STALE_HOURS=4
    writeMarker({ agentId: 'fresh', ticketId: 'T-682', ageMs: 60_000 })
    const stopped = writeMarker({ agentId: 'done', ticketId: 'T-998', ageMs: 120_000, stoppedAgoMs: 30_000 }) // slice 3: stamped, not unlinked

    const out = runStatusline()
    const running = segment(out, 'running')
    expect(running).toBe('T-682→developer') // default persona from writeMarker()
    expect(out).not.toContain('T-999')
    expect(out).not.toContain('T-998')
    // F10: pure display — the stale file is still on disk; only prdt-post-dispatch.sh prunes run/dispatches
    expect(fs.existsSync(stale)).toBe(true)
    expect(fs.existsSync(stopped)).toBe(true)
  })

  test('collapse at the width budget: >3 running/waiting → first N + "+N" tail; >2 successors → ",".join + "+N"', () => {
    // 4 running markers, oldest-first ordering by `since` — RUNNING_LIMIT=3.
    ;['T-750', 'T-751', 'T-752', 'T-753'].forEach((tid, i) =>
      writeMarker({ agentId: `run-${tid}`, ticketId: tid, persona: i % 2 ? 'qa' : 'developer', ageMs: (4 - i) * 60_000 }))
    // 4 waiting tickets — WAITING_LIMIT=3; sorted alphabetically by the script.
    ;['T-770', 'T-771', 'T-772', 'T-773'].forEach((tid) => writeTicket(tid, { type: 'decision' }))
    buildIndexDb(
      [
        { id: 'T-750', relPath: 'docs/tickets/v9.9/T-750.md' },
        { id: 'T-760', relPath: 'docs/tickets/v9.9/T-760.md' },
        { id: 'T-761', relPath: 'docs/tickets/v9.9/T-761.md' },
        { id: 'T-762', relPath: 'docs/tickets/v9.9/T-762.md' },
        { id: 'T-770', relPath: 'docs/tickets/v9.9/T-770.md' },
        { id: 'T-780', relPath: 'docs/tickets/v9.9/T-780.md' },
      ],
      [
        // 3 successors of the oldest running ticket T-750 — SUCCESSOR_LIMIT=2.
        { src: 'T-760', dst: 'T-750' },
        { src: 'T-761', dst: 'T-750' },
        { src: 'T-762', dst: 'T-750' },
        { src: 'T-780', dst: 'T-770' },
      ],
    )

    const out = runStatusline()
    const running = segment(out, 'running')
    const waiting = segment(out, 'waiting')
    expect(running).toBe('T-750→developer»T-760,T-761+1 T-751→qa T-752→developer +1')
    expect(waiting).toBe('T-770»T-780 T-771 T-772 +1')
  })

  test('a dispatch marker with no resolvable ticket_id never surfaces (belt: statusline itself still requires TICKET_RE)', () => {
    // Simulates a marker written for a ctx that had no T-NNN anywhere: the WRITE
    // side (prdt-post-dispatch.sh, covered separately) simply never creates one —
    // pinned here as "if one somehow existed with a malformed id, the READ side
    // still refuses it", the read side's own belt on the same acceptance line.
    const dir = path.join(prdtHome, 'run', 'dispatches')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'malformed.json'), JSON.stringify({
      agent_id: 'bad', persona: 'developer', dispatch_id: 'd-generic', ticket_id: 'not-a-ticket',
      project_root: root, since: isoAgo(60_000),
    }))
    const out = runStatusline()
    expect(out).not.toMatch(/\brunning\b/)
  })

  test('T-805: OSC 8 link targets the viewer jump page (never the raw ticket md) when a viewer exists', () => {
    writeMarker({ agentId: 'linked', ticketId: 'T-682', ageMs: 60_000 })
    buildIndexDb([{ id: 'T-682', relPath: 'docs/tickets/v9.9/T-682.md' }], [])
    stubViewerHtml()
    const linked = runStatusline()
    expect(linked).toContain(OSC8_OPEN)
    expect(linked).toContain(OSC8_CLOSE)
    const jump = jumpPagePath('T-682')
    expect(linked).toContain(`file://${jump}`)
    expect(linked).not.toContain(`file://${path.join(root, 'docs/tickets/v9.9/T-682.md')}`)
    // the plain id is still the visible text between the open/close escapes
    expect(linked).toMatch(/\x1b\]8;;file:\/\/[^\x1b]+\x1b\\T-682\x1b\]8;;\x1b\\/)
    // the stub the script writes on demand, matching viewer_jump()'s own form
    expect(fs.existsSync(jump)).toBe(true)
    expect(fs.readFileSync(jump, 'utf-8')).toContain('url=../viewer.html#T-682')
  })

  test('T-842: a committed symlink at viewer/at/ is never written through — the victim keeps its bytes and the id renders unlinked', () => {
    writeMarker({ agentId: 'linked', ticketId: 'T-682', ageMs: 60_000 })
    buildIndexDb([{ id: 'T-682', relPath: 'docs/tickets/v9.9/T-682.md' }], [])
    stubViewerHtml()
    const victimDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t842-victim-'))
    const victim = path.join(victimDir, 'T-682.html')
    fs.writeFileSync(victim, 'victim\n')
    const old = Date.now() / 1000 - 3600
    fs.utimesSync(victim, old, old)
    const before = fs.statSync(victim).mtimeMs
    fs.symlinkSync(victimDir, path.join(root, '.prdt', 'scratch', 'viewer', 'at'))
    const out = runStatusline()
    expect(out).toContain('T-682')
    expect(out).not.toContain(OSC8_OPEN)
    expect(fs.readFileSync(victim, 'utf-8')).toBe('victim\n')
    expect(fs.statSync(victim).mtimeMs).toBe(before)
    expect(fs.readdirSync(victimDir)).toEqual(['T-682.html'])
  })

  test('T-805: no viewer generated yet → the id renders unlinked, never falls back to the raw ticket md', () => {
    writeMarker({ agentId: 'linked', ticketId: 'T-682', ageMs: 60_000 })
    buildIndexDb([{ id: 'T-682', relPath: 'docs/tickets/v9.9/T-682.md' }], [])
    // no stubViewerHtml() here — no viewer.html anywhere under .prdt/scratch/viewer
    const out = runStatusline()
    expect(out).toContain('T-682')
    expect(out).not.toContain(OSC8_OPEN)
    expect(out).not.toContain('file://')
    expect(fs.existsSync(path.join(root, '.prdt', 'scratch'))).toBe(false)
  })

  test('OSC 8 bytes absent when the id resolves no path at all (no index.db)', () => {
    writeMarker({ agentId: 'linked', ticketId: 'T-682', ageMs: 60_000 })
    buildIndexDb([{ id: 'T-682', relPath: 'docs/tickets/v9.9/T-682.md' }], [])
    stubViewerHtml()
    // Same marker, no index.db at all → no path resolves → plain text, no OSC 8,
    // and no jump page gets written (ticket_link_target gates on ticket_path first).
    fs.rmSync(path.join(root, '.prdt', 'index.db'))
    const unlinked = runStatusline()
    expect(unlinked).toContain('T-682')
    expect(unlinked).not.toContain(OSC8_OPEN)
    expect(fs.existsSync(jumpPagePath('T-682'))).toBe(false)
  })
  test('F3: two workers on the same ticket are ONE running row, personas joined', () => {
    writeMarker({ agentId: 'dev', ticketId: 'T-700', persona: 'developer', ageMs: 3 * 60_000 })
    writeMarker({ agentId: 'qa', ticketId: 'T-700', persona: 'qa', ageMs: 60_000 })
    writeMarker({ agentId: 'other', ticketId: 'T-701', persona: 'developer', ageMs: 2 * 60_000 })
    const out = runStatusline()
    expect(segment(out, 'running')).toBe('T-700→developer+qa T-701→developer')
    expect((out.match(/T-700/g) ?? []).length).toBe(1)
  })

  test('F4: every occurrence of a linked id is wrapped — current_task and a running item on the same ticket', () => {
    fs.rmSync(root, { recursive: true, force: true })
    root = makeProject('prdt-t682-sl-proj-', { ticket_id: 'T-682', slug: 'footer', assignee: 'developer' })
    writeMarker({ agentId: 'a', ticketId: 'T-682', ageMs: 60_000 })
    buildIndexDb([{ id: 'T-682', relPath: 'docs/tickets/v9.9/T-682.md' }], [])
    stubViewerHtml()
    const out = runStatusline()
    const wrapped = out.match(/\x1b\]8;;file:\/\/[^\x1b]+\x1b\\T-682\x1b\]8;;\x1b\\/g) ?? []
    expect(wrapped.length).toBe(2) // once in the current_task segment, once in running
    expect((unwrapLinks(out).match(/T-682/g) ?? []).length).toBe(2) // visible text only (the file URI names the id too)
    expect(unwrapLinks(out)).toContain('T-682 footer→developer')
    expect(segment(out, 'running')).toBe('T-682→developer')
  })

  test('F5: an index path carrying a control byte is refused (plain id, no link); a root with a space yields a percent-encoded file URI', () => {
    writeMarker({ agentId: 'a', ticketId: 'T-682', ageMs: 60_000 })
    buildIndexDb([{ id: 'T-682', relPath: 'docs/tickets/v9.9/T-682\x1b]8;;http://evil/\x1b\\.md' }], [])
    stubViewerHtml()
    const out = runStatusline()
    expect(out).toContain('T-682')
    expect(out).not.toContain(OSC8_OPEN)
    expect(out).not.toContain('evil')

    // a root with a space — the jump page path (under this same root) is what
    // must survive percent-encoding now, not the raw ticket md path (T-805).
    fs.rmSync(root, { recursive: true, force: true })
    root = makeProject('prdt t682 sl ')
    writeMarker({ agentId: 'b', ticketId: 'T-683', ageMs: 60_000 })
    buildIndexDb([{ id: 'T-683', relPath: 'docs/tickets/v9.9/T-683.md' }], [])
    stubViewerHtml()
    const out2 = runStatusline()
    const m = out2.match(/\x1b\]8;;(file:\/\/[^\x1b]*)\x1b\\T-683/)
    expect(m).not.toBeNull()
    const uri = m![1]
    expect(uri).toContain('%20')
    expect(uri).not.toContain(' ')
    expect(decodeURIComponent(uri.slice('file://'.length))).toBe(jumpPagePath('T-683'))
    expect(/^file:\/\/[A-Za-z0-9\-._~\/%]*$/.test(uri)).toBe(true)
  })

  test('F6: at full fan-out the line collapses to counts instead of cutting the waiting segment', () => {
    ;['T-750', 'T-751', 'T-752', 'T-753', 'T-754'].forEach((tid, i) =>
      writeMarker({ agentId: `run-${tid}`, ticketId: tid, persona: i % 2 ? 'qa' : 'developer', ageMs: (6 - i) * 60_000 }))
    ;['T-770', 'T-771', 'T-772', 'T-773', 'T-774'].forEach((tid) => writeTicket(tid, { type: 'decision' }))
    const tickets: Array<{ id: string; relPath: string }> = []
    const edges: Array<{ src: string; dst: string }> = []
    for (const t of ['T-750', 'T-751', 'T-752', 'T-770', 'T-771', 'T-772']) {
      tickets.push({ id: t, relPath: `docs/tickets/v9.9/${t}.md` })
      for (let k = 0; k < 3; k++) {
        const succ = `T-${8000 + Number(t.slice(2)) * 3 + k}`.slice(0, 7)
        tickets.push({ id: succ, relPath: `docs/tickets/v9.9/${succ}.md` })
        edges.push({ src: succ, dst: t })
      }
    }
    buildIndexDb(tickets, edges)
    const out = runStatusline()
    const plain = unwrapLinks(out).trim()
    expect(plain.length).toBeLessThanOrEqual(200)
    expect(plain).not.toContain('\u2026') // never the belt's truncation mark
    const waiting = segment(out, 'waiting')
    expect(waiting).toBeDefined()
    expect(waiting).toMatch(/^T-770(»T-\d+(,T-\d+)?(\+\d+)?)? .*\+\d+$/) // first id(s) + a count tail, intact
    expect(segment(out, 'running')).toMatch(/\+\d+$/)
  })

  test('F7/F8: an EXCLUSIVE lock on index.db never stalls the render, and the render leaves no sidecar file', () => {
    writeMarker({ agentId: 'a', ticketId: 'T-682', ageMs: 60_000 })
    buildIndexDb([{ id: 'T-682', relPath: 'docs/tickets/v9.9/T-682.md' }], [])
    const dbPath = path.join(root, '.prdt', 'index.db')
    // a rebuild-shaped writer holding an EXCLUSIVE transaction for longer than any acceptable render
    const holder = spawn('python3', ['-c', 'import sqlite3,sys,time; c=sqlite3.connect(sys.argv[1]); c.execute("BEGIN EXCLUSIVE"); time.sleep(20)', dbPath], { stdio: 'ignore' })
    try {
      const deadline = Date.now() + 5000
      // wait until the lock is actually held (a plain reader gets SQLITE_BUSY)
      for (;;) {
        const r = spawnSync('python3', ['-c', 'import sqlite3,sys; c=sqlite3.connect(sys.argv[1], timeout=0); c.execute("select count(*) from tickets").fetchone()', dbPath], { encoding: 'utf8' })
        if (r.status !== 0 || Date.now() > deadline) break
      }
      const t0 = Date.now()
      const out = runStatusline()
      const elapsed = Date.now() - t0
      expect(elapsed).toBeLessThan(5000) // immutable=1 takes no lock: nothing to wait on (the holder sleeps 20 s)
      expect(out).toContain('T-682')
    } finally {
      holder.kill('SIGKILL')
    }
    for (const suffix of ['-journal', '-wal', '-shm']) expect(fs.existsSync(dbPath + suffix)).toBe(false)
  })
})
