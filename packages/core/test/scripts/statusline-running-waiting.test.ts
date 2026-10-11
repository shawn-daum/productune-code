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
 *   dec/req 0 T-849: open `type: decision` tickets / open `assignee: user`
 *             non-decision tickets across EVERY version dir (backlog excluded),
 *             no marker involved; replaced T-682's single `waiting` segment.
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
function writeTicket(id: string, extra: Record<string, string> = {}, status = 'open', version = VERSION): void {
  const dir = path.join(root, 'docs', 'tickets', version)
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

function runStatusline(columns?: number): string {
  const env: NodeJS.ProcessEnv = { ...process.env, PRDT_HOME: prdtHome, PRDT_LANG: 'en' }
  if (columns === undefined) delete env.COLUMNS
  else env.COLUMNS = String(columns)
  return execFileSync('bash', [STATUSLINE_SH], {
    cwd: root, input: '', encoding: 'utf-8',
    env,
  })
}

const OSC8_OPEN = '\x1b]8;;'
const OSC8_CLOSE = '\x1b]8;;\x1b\\'
/** `\x1b]8;;file://<path>\x1b\<id>\x1b]8;;\x1b\` → `<id>` — OSC 8 is its own
 *  acceptance line (its own test below); the format/collapse tests below care
 *  about ids, personas, successors and the `+N` tail, not the link bytes. */
/** An OSC 8 link whose visible text is a ticket id (T-849: with a viewer stub
 *  present the project slug is linked too, so "no OSC 8 at all" no longer
 *  means "no ticket link"). */
const TICKET_LINK_RE = /\x1b\]8;;[^\x1b]*\x1b\\T-\d+\x1b\]8;;/
const OSC8_RE = /\x1b\]8;;file:\/\/[^\x1b]*\x1b\\(.*?)\x1b\]8;;\x1b\\/g
function unwrapLinks(text: string): string {
  return text.replace(OSC8_RE, '$1')
}

/** Pulls out the ` | `-delimited segment starting with `name ` (or undefined),
 *  with any OSC 8 wrapping unwrapped back to the plain ticket id. */
function segment(out: string, name: 'working' | 'dec' | 'req'): string | undefined {
  // T-984/T-961: rows are newline-separated, and `dec … · req …` share one segment.
  const label = { working: 'working', dec: 'decision', req: 'request' }[name]
  const found = out.trim().split(/\n| \| /).find((p) => p.startsWith(`${label} `))
  return found === undefined ? undefined : unwrapLinks(found).slice(label.length + 1)
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
  test('T-922: none running, none waiting: running/dec/req still render, as an em dash', () => {
    const out = runStatusline()
    expect(segment(out, 'working')).toBe('0')
    expect(segment(out, 'dec')).toBe('0')
    expect(segment(out, 'req')).toBe('0')
    expect(out).not.toMatch(/\b(waiting|CP)\b/)
    expect(out).toContain('| stage: build 0/0 |') // rest of the line still renders
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
    const running = segment(out, 'working')
    expect(running).toBe('T-700(developer)>T-720 T-701(qa)')
    expect(segment(out, 'dec')).toBe('T-710>T-730')
    expect(segment(out, 'req')).toBe('T-711')
    expect(out).not.toMatch(/\bwaiting\b/)
  })

  test('T-965: user-confirmed sample — personas abbreviated, successors only from the current version folder', () => {
    writeMarker({ agentId: 'd', ticketId: 'T-959', persona: 'designer', ageMs: 4 * 60_000 })
    writeMarker({ agentId: 'q', ticketId: 'T-477', persona: 'qa', ageMs: 3 * 60_000 })
    buildIndexDb(
      [
        { id: 'T-959', relPath: 'docs/tickets/v9.9/T-959.md' },
        { id: 'T-960', relPath: 'docs/tickets/v9.9/T-960.md' },
        { id: 'T-477', relPath: 'docs/tickets/v9.9/T-477.md' },
        { id: 'T-478', relPath: 'docs/tickets/v9.9/T-478.md' },
        { id: 'T-963', relPath: 'docs/tickets/v9.9/T-963.md' },
        { id: 'T-496', relPath: 'docs/tickets/backlog/T-496.md' }, // backlog: neither shown nor counted
        { id: 'T-497', relPath: 'docs/tickets/v9.8/T-497.md' }, // other version: same
      ],
      [
        { src: 'T-960', dst: 'T-959' },
        { src: 'T-478', dst: 'T-477' },
        { src: 'T-963', dst: 'T-477' },
        { src: 'T-496', dst: 'T-477' },
        { src: 'T-497', dst: 'T-477' },
      ],
    )
    expect(segment(runStatusline(), 'working')).toBe('T-959(designer)>T-960 T-477(qa)>T-478,T-963')
  })

  test('a stale in-flight marker ages out (never shown, never crashes, never deleted); a fresh one still shows; a stopped one is hidden', () => {
    const stale = writeMarker({ agentId: 'stale', ticketId: 'T-999', ageMs: 5 * 3600_000 }) // > STALE_HOURS=4
    writeMarker({ agentId: 'fresh', ticketId: 'T-682', ageMs: 60_000 })
    const stopped = writeMarker({ agentId: 'done', ticketId: 'T-998', ageMs: 120_000, stoppedAgoMs: 30_000 }) // slice 3: stamped, not unlinked

    const out = runStatusline()
    const running = segment(out, 'working')
    expect(running).toBe('T-682(developer)') // default persona from writeMarker()
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
    const running = segment(out, 'working')
    const dec = segment(out, 'dec')
    expect(running).toBe('T-750(developer)>T-760,T-761+1 T-751(qa) T-752(developer) +1')
    // T-1044: the action row has its own width budget — 4 open decisions all fit, no `+1`
    expect(dec).toBe('T-770>T-780 T-771 T-772 T-773')
  })

  describe('T-1044 action row width budget', () => {
    const decRow = (out: string): string => unwrapLinks(out.trim().split('\n').at(-1)!)
    const ids = (n: number): string[] => Array.from({ length: n }, (_, i) => `T-${900 + i}`)

    for (const n of [4, 10, 30]) {
      for (const cols of [80, 120, 200]) {
        test(`${n} open decisions at ${cols} columns: fits the width, whole ids, +N only on overflow`, () => {
          ids(n).forEach((tid) => writeTicket(tid, { type: 'decision' }))
          const row = decRow(runStatusline(cols))
          expect(row.length).toBeLessThanOrEqual(cols)
          expect(row.startsWith('decision ')).toBe(true)
          const text = row.split(' | ')[0].slice('decision '.length)
          const shown = text.match(/T-\d+/g) ?? []
          const plus = text.match(/\+(\d+)$/)
          // every shown id is a whole, real id; shown + overflow = all open ones
          expect(shown.every((t) => ids(n).includes(t))).toBe(true)
          expect(shown.length + (plus ? Number(plus[1]) : 0)).toBe(n)
          // all fit → no `+N`; otherwise the row really would overflow with one more id
          const full = `decision ${ids(n).join(' ')} | request 0`
          if (full.length <= cols) expect(plus).toBeNull()
          else expect(plus).not.toBeNull()
        })
      }
    }

    test('working row keeps its (3,3,2) limits while the action row lists all', () => {
      ;['T-750', 'T-751', 'T-752', 'T-753'].forEach((tid, i) =>
        writeMarker({ agentId: `run-${tid}`, ticketId: tid, persona: 'developer', ageMs: (4 - i) * 60_000 }))
      ids(6).forEach((tid) => writeTicket(tid, { type: 'decision' }))
      const out = runStatusline(200)
      expect(segment(out, 'working')).toBe('T-750(developer) T-751(developer) T-752(developer) +1')
      expect(segment(out, 'dec')).toBe(ids(6).join(' '))
    })
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
    expect(segment(out, 'working')).toBe('0')
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

  test('T-1014: a dec ticket with no index row (stale index / hand-edited status) still links; a ticket not open drops out', () => {
    writeTicket('T-901', { type: 'decision' })
    writeTicket('T-902', { type: 'decision' }, 'done')
    buildIndexDb([{ id: 'T-682', relPath: 'docs/tickets/v9.9/T-682.md' }], []) // index knows neither
    stubViewerHtml()
    const out = runStatusline()
    expect(segment(out, 'dec')).toBe('T-901')
    expect(out).toMatch(/\x1b\]8;;file:\/\/[^\x1b]+\x1b\\T-901\x1b\]8;;\x1b\\/)
    expect(fs.readFileSync(jumpPagePath('T-901'), 'utf-8')).toContain('url=../viewer.html#T-901')
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
    expect(out).not.toMatch(TICKET_LINK_RE)
    expect(fs.readFileSync(victim, 'utf-8')).toBe('victim\n')
    expect(fs.statSync(victim).mtimeMs).toBe(before)
    expect(fs.readdirSync(victimDir)).toEqual(['T-682.html'])
  })

  /** T-906: a link at EVERY component of .prdt/scratch/viewer/at/<id>.html (the
   *  directory chain through the shared prdt_safe_fs walk; the leaf by the
   *  rename-over) never moves a byte of the victim, and the id renders unlinked
   *  whenever the walk itself is refused. */
  for (const where of ['scratch', 'viewer', 'at', 'leaf'] as const) {
    test(`T-906: a symlink at ${where} is refused — victim byte-identical`, () => {
      writeMarker({ agentId: 'linked', ticketId: 'T-682', ageMs: 60_000 })
      buildIndexDb([{ id: 'T-682', relPath: 'docs/tickets/v9.9/T-682.md' }], [])
      stubViewerHtml()
      const victimRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t906-victim-'))
      const mk = (rel: string, body = 'victim\n') => {
        const f = path.join(victimRoot, rel)
        fs.mkdirSync(path.dirname(f), { recursive: true })
        fs.writeFileSync(f, body)
        const old = Date.now() / 1000 - 3600
        fs.utimesSync(f, old, old)
        return f
      }
      const scratch = path.join(root, '.prdt', 'scratch')
      const vdir = path.join(scratch, 'viewer')
      const files: string[] = []
      if (where === 'scratch') {
        files.push(mk('viewer/viewer.html'), mk('viewer/at/T-682.html'))
        fs.rmSync(scratch, { recursive: true, force: true })
        fs.symlinkSync(victimRoot, scratch)
      } else if (where === 'viewer') {
        files.push(mk('viewer.html'), mk('at/T-682.html'))
        fs.rmSync(vdir, { recursive: true, force: true })
        fs.symlinkSync(victimRoot, vdir)
      } else if (where === 'at') {
        files.push(mk('T-682.html'))
        fs.symlinkSync(victimRoot, path.join(vdir, 'at'))
      } else {
        fs.mkdirSync(path.join(vdir, 'at'), { recursive: true })
        files.push(mk('T-682.html'))
        fs.symlinkSync(files[0], jumpPagePath('T-682'))
      }
      const snap = () => files.map((f) => [fs.readFileSync(f, 'utf-8'), fs.statSync(f).mtimeMs])
      const before = snap()
      const out = runStatusline()
      expect(out).toContain('T-682')
      expect(snap()).toEqual(before)
      if (where !== 'leaf') expect(out).not.toMatch(TICKET_LINK_RE)
      // the leaf case: the link ENTRY is replaced by a real stub, the target is untouched
      if (where === 'leaf') expect(fs.lstatSync(jumpPagePath('T-682')).isSymbolicLink()).toBe(false)
    })
  }

  test('T-906 (N3): the jump stub is 0644 under umask 077, and an existing stub keeps its mode', () => {
    writeMarker({ agentId: 'linked', ticketId: 'T-682', ageMs: 60_000 })
    buildIndexDb([{ id: 'T-682', relPath: 'docs/tickets/v9.9/T-682.md' }], [])
    stubViewerHtml()
    const run = () => execFileSync('bash', ['-c', 'umask 077; exec bash "$0"', STATUSLINE_SH], {
      cwd: root, input: '', encoding: 'utf-8',
      env: { ...process.env, PRDT_HOME: prdtHome, PRDT_LANG: 'en' },
    })
    run()
    expect(fs.statSync(jumpPagePath('T-682')).mode & 0o777).toBe(0o644)
    fs.chmodSync(jumpPagePath('T-682'), 0o600)
    run()
    expect(fs.statSync(jumpPagePath('T-682')).mode & 0o777).toBe(0o600)
    fs.chmodSync(jumpPagePath('T-682'), 0o444)
    run()
    expect(fs.statSync(jumpPagePath('T-682')).mode & 0o777).toBe(0o444)
    expect(fs.readFileSync(jumpPagePath('T-682'), 'utf-8')).toContain('url=../viewer.html#T-682')
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
    expect(unlinked).not.toMatch(TICKET_LINK_RE)
    expect(fs.existsSync(jumpPagePath('T-682'))).toBe(false)
  })
  test('T-849: dec/req span every version dir — a ticket left open in a previous version still shows; backlog, done and a decision-with-user assignee are classified right', () => {
    writeTicket('T-821', { type: 'decision' }, 'open', 'v9.8') // previous version, still open
    writeTicket('T-678', { assignee: 'user' }, 'open', 'v9.8')
    writeTicket('T-830', { type: 'decision', assignee: 'user' }) // a decision is dec only, never also req
    writeTicket('T-831', { assignee: 'user' }, 'done', 'v9.8') // done → never shown
    writeTicket('T-832', { type: 'decision' }, 'open', 'backlog') // backlog is not a version dir
    const out = runStatusline()
    expect(segment(out, 'dec')).toBe('T-821 T-830')
    expect(segment(out, 'req')).toBe('T-678')
    expect(out).not.toContain('T-832')
    expect(out).not.toMatch(/\b(waiting|CP)\b/)
  })

  test('T-922: `<slug> <version>` is ONE OSC 8 link to viewer.html when it exists, plain text when it does not; full layout with empty lists', () => {
    const plain = runStatusline().trim()
    const slug = path.basename(root)
    expect(plain).not.toContain(OSC8_OPEN)
    // no tickets, no branch (tmp dir is no git repo): ticket segment and branch segment degrade away
    expect(plain).toBe(`${slug} ${VERSION} | stage: build 0/0 | working 0\ndecision 0 | request 0`)

    stubViewerHtml()
    const linked = runStatusline().trim()
    const viewer = path.join(root, '.prdt', 'scratch', 'viewer', 'viewer.html')
    expect(linked.startsWith(`${OSC8_OPEN}file://${viewer}\x1b\\${slug} ${VERSION}${OSC8_CLOSE} | stage: build 0/0`)).toBe(true)
    expect(unwrapLinks(linked)).toBe(`${slug} ${VERSION} | stage: build 0/0 | working 0\ndecision 0 | request 0`)
  })

  test('T-984: full layout order — stage, ticket count, working, branch last, then dec · req; no current-task segment; never \u00bb', () => {
    root = makeProject('prdt-t922-full-', { ticket_id: 'T-890', slug: 'restore', assignee: 'developer' })
    fs.mkdirSync(path.join(root, 'docs', 'tickets', VERSION), { recursive: true })
    writeTicket('T-890', {}, 'open')
    writeTicket('T-891', {}, 'done')
    writeMarker({ agentId: 'a', ticketId: 'T-890', persona: 'qa', ageMs: 60_000 })
    execFileSync('git', ['init', '-q', '-b', 'dev', root])
    execFileSync('git', ['-C', root, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'init'])
    const plain = unwrapLinks(runStatusline()).trim()
    expect(plain).toBe(`${path.basename(root)} ${VERSION} | stage: build 1/2 | total tickets 1/2 | working T-890(qa) | branch: dev\ndecision 0 | request 0`)
    expect(plain).not.toContain('\u00bb')
  })

  test('F3: two workers on the same ticket are ONE running row, personas joined', () => {
    writeMarker({ agentId: 'dev', ticketId: 'T-700', persona: 'developer', ageMs: 3 * 60_000 })
    writeMarker({ agentId: 'qa', ticketId: 'T-700', persona: 'qa', ageMs: 60_000 })
    writeMarker({ agentId: 'other', ticketId: 'T-701', persona: 'developer', ageMs: 2 * 60_000 })
    const out = runStatusline()
    expect(segment(out, 'working')).toBe('T-700(developer+qa) T-701(developer)')
    expect((out.match(/T-700/g) ?? []).length).toBe(1)
  })

  test('F4: every occurrence of a linked id is wrapped — a working item and a waiting (dec) item on the same ticket', () => {
    writeTicket('T-682', { type: 'decision' })
    writeMarker({ agentId: 'a', ticketId: 'T-682', ageMs: 60_000 })
    buildIndexDb([{ id: 'T-682', relPath: 'docs/tickets/v9.9/T-682.md' }], [])
    stubViewerHtml()
    const out = runStatusline()
    const wrapped = out.match(/\x1b\]8;;file:\/\/[^\x1b]+\x1b\\T-682\x1b\]8;;\x1b\\/g) ?? []
    expect(wrapped.length).toBe(2) // once in working, once in dec
    expect((unwrapLinks(out).match(/T-682/g) ?? []).length).toBe(2) // visible text only (the file URI names the id too)
    expect(segment(out, 'dec')).toBe('T-682')
    expect(segment(out, 'working')).toBe('T-682(developer)')
  })

  test('F5: an index path carrying a control byte is refused (plain id, no link); a root with a space yields a percent-encoded file URI', () => {
    writeMarker({ agentId: 'a', ticketId: 'T-682', ageMs: 60_000 })
    buildIndexDb([{ id: 'T-682', relPath: 'docs/tickets/v9.9/T-682\x1b]8;;http://evil/\x1b\\.md' }], [])
    stubViewerHtml()
    const out = runStatusline()
    expect(out).toContain('T-682')
    expect(out).not.toMatch(TICKET_LINK_RE)
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
    const rows = unwrapLinks(out).trim().split('\n')
    expect(rows).toHaveLength(2) // dec has entries → T-984 second row
    for (const row of rows) {
      expect(row.length).toBeLessThanOrEqual(200)
      expect(row).not.toContain('\u2026') // never the belt's truncation mark
    }
    const waiting = segment(out, 'dec')
    expect(waiting).toBeDefined()
    // T-1044: the action row has its own budget — all 5 ids fit, so no `+N` (overflow is pinned by the width tests)
    expect(waiting).toMatch(/^T-770(>[^ ]+)? T-771(>[^ ]+)? T-772(>[^ ]+)? T-773 T-774$/)
    expect(segment(out, 'working')).toMatch(/\+\d+$/)
  })

  /** T-1081: 60 open decision tickets, every one indexed — enough that the
   *  action row overflows at COLUMNS=80 and action_row() walks its candidates. */
  function sixtyDecisions(): string[] {
    const ids = Array.from({ length: 60 }, (_, i) => `T-${100 + i}`)
    ids.forEach((id) => writeTicket(id, { type: 'decision', assignee: 'user' }))
    buildIndexDb(ids.map((id) => ({ id, relPath: `docs/tickets/v9.9/${id}.md` })), [])
    return ids
  }

  test('T-1081: one render writes each jump stub at most once, and only when missing or stale', () => {
    sixtyDecisions()
    stubViewerHtml()
    // the same script beside a prdt_safe_fs that logs every write_atomic call
    const dir = fs.realpathSync(tmp('prdt-t1081-sfs-'))
    const log = path.join(dir, 'writes.log')
    try {
      fs.copyFileSync(STATUSLINE_SH, path.join(dir, 'statusline-prdt.sh'))
      fs.copyFileSync(path.join(CORE_ROOT, 'scripts', 'prdt-messages.json'), path.join(dir, 'prdt-messages.json')) // the labels
      fs.writeFileSync(path.join(dir, 'prdt_safe_fs.py'), [
        'import importlib.util, os',
        '_s = importlib.util.spec_from_file_location("_real_sfs", os.environ["REAL_SFS"])',
        '_real = importlib.util.module_from_spec(_s); _s.loader.exec_module(_real)',
        'globals().update({k: v for k, v in vars(_real).items() if not k.startswith("__")})',
        'def write_atomic(dfd, name, data, default_mode=0o644):',
        '    with open(os.environ["SFS_LOG"], "a") as f: f.write(name + "\\n")',
        '    return _real.write_atomic(dfd, name, data, default_mode)',
        '',
      ].join('\n'))
      const render = () => {
        fs.rmSync(log, { force: true })
        const out = execFileSync('bash', [path.join(dir, 'statusline-prdt.sh')], {
          cwd: root, input: '', encoding: 'utf-8',
          env: { ...process.env, PRDT_HOME: prdtHome, PRDT_LANG: 'en', COLUMNS: '80',
            REAL_SFS: path.join(CORE_ROOT, 'scripts', 'prdt_safe_fs.py'), SFS_LOG: log },
        })
        return { out, writes: fs.existsSync(log) ? fs.readFileSync(log, 'utf-8').trim().split('\n') : [] }
      }
      const first = render()
      expect(segment(first.out, 'dec')).toMatch(/\+\d+$/) // overflowed: the candidate walk ran
      expect(first.writes.length).toBeGreaterThan(0)
      expect(new Set(first.writes).size).toBe(first.writes.length) // never the same stub twice
      for (const w of first.writes) expect(fs.existsSync(jumpPagePath(w.replace(/\.html$/, '')))).toBe(true)
      const second = render()
      expect(second.writes).toEqual([]) // every stub already current
      expect(second.out).toBe(first.out) // byte-identical for the same state
      fs.writeFileSync(jumpPagePath('T-100'), 'stale\n')
      expect(render().writes).toEqual(['T-100.html'])
      expect(fs.readFileSync(jumpPagePath('T-100'), 'utf-8')).toContain('url=../viewer.html#T-100')
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  test('T-1081: with 60 open decisions, a render with viewer.html is within 2x of one without', () => {
    sixtyDecisions()
    const median = () => {
      const ms: number[] = []
      for (let k = 0; k < 3; k++) {
        const t0 = Date.now()
        runStatusline(80)
        ms.push(Date.now() - t0)
      }
      return ms.sort((a, b) => a - b)[1]
    }
    const without = median()
    stubViewerHtml()
    runStatusline(80) // first render with a viewer writes the stubs
    const withViewer = median()
    // before T-1081: ~2200 ms vs ~220 ms (10x). 200 ms slack absorbs process-start noise.
    expect(withViewer).toBeLessThanOrEqual(2 * without + 200)
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
