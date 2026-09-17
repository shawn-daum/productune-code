/**
 * `prdt usage` — T-544, black-box over the REAL CLI.
 *
 * Positive control (acceptance): seed a fixture with KNOWN values across
 * several sibling "prdt projects" (each just a dir with `.prdt/po-state.json`
 * + a hand-written `.prdt/turns.jsonl`) and assert the reported sum — cost,
 * tokens, and the skipped-record accounting — matches by hand-computed
 * arithmetic. Also covers the acceptance lines a naive "just add cost_usd"
 * implementation would fail:
 *   - a project whose turns.jsonl is absent / empty / malformed is reported
 *     as such, never silently skipped
 *   - `estimated_partial` records are excluded from the cost sum (never
 *     folded in as zero) and their unpriced models are named
 *   - records with no cost_usd/cost_source at all (the pre-T-543 opus-5
 *     shape) are excluded and named per model, not silently summed as zero
 *     cost
 *   - a `model: null` record is counted and reported, not dropped
 *   - a dir with no `.prdt/po-state.json` is not a project and never appears
 *   - `--since`/`--until` bound the window; omitting both sums everything and
 *     says so
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { spawnSync } from 'child_process'
import { test, expect, describe, beforeEach, afterEach } from 'vitest'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const PRDT_CLI = path.join(CORE_ROOT, 'scripts', 'prdt')

function has(bin: string): boolean {
  return spawnSync('which', [bin], { encoding: 'utf8' }).status === 0
}
const READY = has('python3')

let sandbox: string
let root: string // sandbox/root — the scan root, holding sibling project dirs

function mkProject(name: string): string {
  const dir = path.join(root, name)
  fs.mkdirSync(path.join(dir, '.prdt'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.prdt', 'po-state.json'),
    JSON.stringify({ schema_version: 1, stage: 'build', version: 'v1', current_task: null }))
  return dir
}

function writeTurns(dir: string, lines: (object | string)[]) {
  const body = lines.map((l) => (typeof l === 'string' ? l : JSON.stringify(l))).join('\n') + '\n'
  fs.writeFileSync(path.join(dir, '.prdt', 'turns.jsonl'), body)
}

beforeEach(() => {
  sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-usage-'))
  root = path.join(sandbox, 'ntf-products')
  fs.mkdirSync(root, { recursive: true })
})
afterEach(() => { fs.rmSync(sandbox, { recursive: true, force: true }) })

function prdt(cwd: string, ...args: string[]) {
  const r = spawnSync('python3', [PRDT_CLI, ...args], {
    cwd, encoding: 'utf8', timeout: 30000,
    env: { ...process.env, PRDT_HOME: path.join(sandbox, 'prdt-home') },
  })
  return { status: r.status, out: r.stdout, err: r.stderr }
}

describe.skipIf(!READY)('prdt usage — machine-wide sum (T-544 positive control)', () => {
  test('sums cost/tokens across projects and accounts for every skip category', () => {
    // p1: a mix — reported+estimated in-window, one out-of-window record, one
    // pre-T-543-shaped opus-5 gap (no cost_usd, no cost_source), one
    // null-model record.
    const p1 = mkProject('p1')
    writeTurns(p1, [
      { ts: '2026-09-01T00:00:00Z', scope: 'subagent', model: 'claude-sonnet-5',
        cost_usd: 1.0, cost_source: 'estimated', usage: { input: 100, output: 50, cache: 10 } },
      { ts: '2026-09-10T00:00:00Z', scope: 'subagent', model: 'claude-opus-5',
        cost_usd: null, cost_source: null, usage: { input: 200, output: 100, cache: 20 } },
      { ts: '2026-09-10T01:00:00Z', scope: 'subagent', model: null,
        cost_usd: null, cost_source: null, usage: { input: 5, output: 5, cache: 0 } },
      { ts: '2026-09-14T00:00:00Z', scope: 'subagent', model: 'claude-opus-5',
        cost_usd: 7.38, cost_source: 'estimated', usage: { input: 300, output: 150, cache: 30 } },
      // out of window (before --since below) — must not enter any sum
      { ts: '2020-01-01T00:00:00Z', scope: 'subagent', model: 'claude-opus-5',
        cost_usd: 99.0, cost_source: 'estimated', usage: { input: 9999, output: 9999, cache: 9999 } },
    ])

    // p2: a "reported" (main-session, Claude's own total) record plus an
    // estimated_partial gap naming an unpriced model.
    const p2 = mkProject('p2')
    writeTurns(p2, [
      { ts: '2026-09-10T00:00:00Z', scope: 'main', model: 'claude-sonnet-4-6',
        cost_usd: 2.5, cost_source: 'reported', usage: { input: 50, output: 25, cache: 5 } },
      { ts: '2026-09-10T00:00:00Z', scope: 'subagent', model: 'claude-fable-5',
        cost_usd: null, cost_source: 'estimated_partial', cost_unpriced_models: ['claude-mythos-9'],
        usage: null },
    ])

    // p3: malformed — not one line parses as JSON.
    const p3 = mkProject('p3')
    fs.writeFileSync(path.join(p3, '.prdt', 'turns.jsonl'), 'not json\nstill not json\n')

    // p4: empty file.
    const p4 = mkProject('p4')
    fs.writeFileSync(path.join(p4, '.prdt', 'turns.jsonl'), '')

    // p5: a real prdt project that has never written a turns.jsonl at all.
    mkProject('p5')

    // p6: NOT a prdt project (no .prdt/po-state.json) — must be invisible.
    fs.mkdirSync(path.join(root, 'p6', 'not-prdt'), { recursive: true })

    const r = prdt(p1, 'usage', '--root', root,
      '--since', '2026-09-01T00:00:00Z', '--until', '2026-09-14T23:59:59Z', '--json')
    expect(r.status, r.err).toBe(0)
    const out = JSON.parse(r.out)

    // scope: exactly the 5 real prdt projects, p6 excluded entirely.
    expect(out.projects.map((p: any) => p.name).sort()).toEqual(['p1', 'p2', 'p3', 'p4', 'p5'])

    // cost — hand-computed: reported 2.5 (p2) + estimated (1.0 + 7.38 = 8.38, p1) = 10.88.
    // The out-of-window 99.0 record and every skipped record contribute nothing.
    expect(out.cost_usd_by_source).toEqual({ reported: 2.5, estimated: 8.38 })
    expect(out.cost_usd_total).toBeCloseTo(10.88, 6)

    // tokens — secondary, summed only over in-window records regardless of cost.
    expect(out.tokens_total).toEqual({
      input: 100 + 200 + 5 + 300 + 50,   // 655
      output: 50 + 100 + 5 + 150 + 25,   // 330
      cache: 10 + 20 + 0 + 30 + 5,       // 65
    })

    // skipped accounting — never silently folded into the sum as zero.
    expect(out.skipped.no_cost_recorded).toEqual({ 'claude-opus-5': 1, '(null)': 1 })
    expect(out.skipped.estimated_partial).toEqual({ count: 1, unpriced_models: { 'claude-mythos-9': 1 } })
    expect(out.null_model_records).toBe(1)

    // per-project status: absent/empty/malformed reported, not skipped into silence.
    const byName = Object.fromEntries(out.projects.map((p: any) => [p.name, p]))
    expect(byName.p1.status).toBe('ok')
    expect(byName.p1.records_in_window).toBe(4) // the 2020 record is excluded by --since
    expect(byName.p1.cost_usd).toBeCloseTo(8.38, 6)
    expect(byName.p1.skipped_in_window).toBe(2) // opus-5 gap + null-model record
    expect(byName.p2.status).toBe('ok')
    expect(byName.p2.cost_usd).toBeCloseTo(2.5, 6)
    expect(byName.p2.skipped_in_window).toBe(1)
    expect(byName.p3.status).toBe('malformed')
    expect(byName.p3.records_in_window).toBe(0)
    expect(byName.p4.status).toBe('empty')
    expect(byName.p5.status).toBe('absent')

    // window is stated explicitly, never left to guesswork.
    expect(out.window.since).toBe('2026-09-01T00:00:00Z')
    expect(out.window.until).toBe('2026-09-14T23:59:59Z')

    // the era caveat fires for a model actually present in the priced sum,
    // and stays silent for one that never appeared (fable-5-1 here).
    expect(out.era_caveats.some((c: string) => c.startsWith('claude-sonnet-5:'))).toBe(true)
    expect(out.era_caveats.some((c: string) => c.includes('fable-5-1'))).toBe(false)

    // the machine-vs-account boundary is stated in the output itself.
    expect(out.scope_boundary).toMatch(/다른 기기|다른 사람/)
  })

  test('omitting --since/--until sums the whole file and labels the window as such', () => {
    const p1 = mkProject('p1')
    writeTurns(p1, [
      { ts: '2020-01-01T00:00:00Z', scope: 'subagent', model: 'claude-opus-5',
        cost_usd: 99.0, cost_source: 'estimated', usage: { input: 1, output: 1, cache: 1 } },
      { ts: '2026-09-14T00:00:00Z', scope: 'subagent', model: 'claude-opus-5',
        cost_usd: 1.0, cost_source: 'estimated', usage: { input: 1, output: 1, cache: 1 } },
    ])
    const r = prdt(p1, 'usage', '--root', root, '--json')
    expect(r.status, r.err).toBe(0)
    const out = JSON.parse(r.out)
    expect(out.cost_usd_total).toBeCloseTo(100.0, 6)
    expect(out.window.since).toBeNull()
    expect(out.window.until).toBeNull()
    expect(out.window.label).toMatch(/전체 기록/)
  })

  test('default --root (no flag) is the parent of the current project, not a hardcoded path', () => {
    const p1 = mkProject('p1')
    writeTurns(p1, [
      { ts: '2026-09-14T00:00:00Z', scope: 'subagent', model: 'claude-opus-5',
        cost_usd: 3.0, cost_source: 'estimated', usage: { input: 1, output: 1, cache: 1 } },
    ])
    mkProject('p2') // sibling with no turns.jsonl — must show up as "absent", not crash the scan
    const r = prdt(p1, 'usage', '--json') // no --root: defaults to root.parent of p1's project root
    expect(r.status, r.err).toBe(0)
    const out = JSON.parse(r.out)
    expect(fs.realpathSync(out.scan_root)).toBe(fs.realpathSync(root))
    expect(out.projects.map((p: any) => p.name).sort()).toEqual(['p1', 'p2'])
    expect(out.cost_usd_total).toBeCloseTo(3.0, 6)
  })

  test('an unparseable --since is refused with a clear message, nothing computed', () => {
    const p1 = mkProject('p1')
    writeTurns(p1, [{ ts: '2026-09-14T00:00:00Z', model: 'x', cost_usd: 1, cost_source: 'estimated', usage: null }])
    const r = prdt(p1, 'usage', '--root', root, '--since', 'not-a-time')
    expect(r.status).toBe(1)
    expect(r.err).toMatch(/--since/)
  })

  // ── Round 2 (T-544 reopened) ────────────────────────────────────────────────

  test('F1 (critical): a session-cumulative main record is a running total, not an increment — ' +
       'per-session MAX, never a naive sum, matching costArchive.ts\'s aggregateLines', () => {
    const p1 = mkProject('p1')
    writeTurns(p1, [
      // Same session_id, 3 Stop-triggered snapshots of the SAME running total.
      // A naive sum would give 1+4+10=15; the correct total is the final
      // snapshot's value, 10 (this IS the fixture shape none of round 1's
      // fixtures planted — two main records under one session_id).
      { ts: '2026-09-01T00:00:00Z', scope: 'main', persona: 'po', session_id: 'S1', model: 'claude-fable-5',
        cost_usd: 1.0, cost_source: 'estimated', cost_basis: 'main_session_cumulative', usage: { input: 10, output: 5, cache: 0 } },
      { ts: '2026-09-01T01:00:00Z', scope: 'main', persona: 'po', session_id: 'S1', model: 'claude-fable-5',
        cost_usd: 4.0, cost_source: 'estimated', cost_basis: 'main_session_cumulative', usage: { input: 10, output: 5, cache: 0 } },
      { ts: '2026-09-01T02:00:00Z', scope: 'main', persona: 'po', session_id: 'S1', model: 'claude-fable-5',
        cost_usd: 10.0, cost_source: 'estimated', cost_basis: 'main_session_cumulative', usage: { input: 10, output: 5, cache: 0 } },
      // A second, independent session — its own max folds in separately.
      { ts: '2026-09-02T00:00:00Z', scope: 'main', persona: 'po', session_id: 'S2', model: 'claude-fable-5',
        cost_usd: 3.0, cost_source: 'estimated', cost_basis: 'main_session_cumulative', usage: { input: 5, output: 2, cache: 0 } },
      // A genuine per-dispatch subagent total — summed directly, unaffected.
      { ts: '2026-09-02T00:00:00Z', scope: 'subagent', persona: 'developer', model: 'claude-sonnet-5',
        cost_usd: 2.0, cost_source: 'estimated', cost_basis: 'subagent_total', usage: { input: 1, output: 1, cache: 0 } },
    ])
    const r = prdt(p1, 'usage', '--root', root, '--json')
    expect(r.status, r.err).toBe(0)
    const out = JSON.parse(r.out)
    // Correct: session-max(S1)=10 + session-max(S2)=3 + subagent 2 = 15.
    // The pre-fix defect would give 1+4+10+3+2 = 20.
    expect(out.cost_usd_total).toBeCloseTo(15.0, 6)
    expect(out.projects[0].cost_usd).toBeCloseTo(15.0, 6)
    // records_in_window still counts every raw snapshot line (5), independent
    // of the dedup applied to their cost.
    expect(out.projects[0].records_in_window).toBe(5)
  })

  test('F1: a basis-less legacy main record falls back to scope==main for the same session-max rule', () => {
    const p1 = mkProject('p1')
    writeTurns(p1, [
      { ts: '2026-09-01T00:00:00Z', scope: 'main', session_id: 'S1', model: 'x', cost_usd: 5.0, cost_source: 'reported', usage: null },
      { ts: '2026-09-01T01:00:00Z', scope: 'main', session_id: 'S1', model: 'x', cost_usd: 9.0, cost_source: 'reported', usage: null },
    ])
    const r = prdt(p1, 'usage', '--root', root, '--json')
    expect(r.status, r.err).toBe(0)
    const out = JSON.parse(r.out)
    expect(out.cost_usd_total).toBeCloseTo(9.0, 6) // max, not 14
  })

  test('F1 consequence: a --since/--until window states that the main portion can predate it', () => {
    const p1 = mkProject('p1')
    writeTurns(p1, [
      { ts: '2026-09-10T00:00:00Z', scope: 'main', session_id: 'S1', model: 'x', cost_usd: 1.0, cost_source: 'estimated',
        cost_basis: 'main_session_cumulative', usage: null },
    ])
    const r = prdt(p1, 'usage', '--root', root, '--since', '2026-09-09T00:00:00Z', '--json')
    expect(r.status, r.err).toBe(0)
    const out = JSON.parse(r.out)
    expect(out.main_window_caveat).toMatch(/세션/)
  })

  test('F2: the total states it is a LOWER BOUND when priced-but-excluded records exist (no size computed)', () => {
    const p1 = mkProject('p1')
    writeTurns(p1, [
      { ts: '2026-09-14T00:00:00Z', scope: 'subagent', model: 'claude-opus-5', cost_usd: 1.0, cost_source: 'estimated', usage: null },
      { ts: '2026-09-14T00:00:01Z', scope: 'subagent', model: 'claude-opus-5', cost_usd: null, cost_source: null, usage: null },
    ])
    const out = JSON.parse(prdt(p1, 'usage', '--root', root, '--json').out)
    expect(out.cost_usd_total_is_lower_bound).toBe(true)
    expect(prdt(p1, 'usage', '--root', root).out).toMatch(/하한/)
  })

  test('F2 contrast: nothing excluded → not a lower bound, no "하한" wording', () => {
    const p1 = mkProject('p1')
    writeTurns(p1, [{ ts: '2026-09-14T00:00:00Z', scope: 'subagent', model: 'x', cost_usd: 1.0, cost_source: 'estimated', usage: null }])
    const out = JSON.parse(prdt(p1, 'usage', '--root', root, '--json').out)
    expect(out.cost_usd_total_is_lower_bound).toBe(false)
    expect(prdt(p1, 'usage', '--root', root).out).not.toMatch(/하한/)
  })

  test('F3/verdict②: output states the observed first/last ts and that the scan is scoped (depth 1, this root)', () => {
    const p1 = mkProject('p1')
    writeTurns(p1, [
      { ts: '2026-07-03T06:48:48Z', scope: 'subagent', model: 'x', cost_usd: 1.0, cost_source: 'estimated', usage: null },
      { ts: '2026-09-14T00:00:00Z', scope: 'subagent', model: 'x', cost_usd: 1.0, cost_source: 'estimated', usage: null },
    ])
    const r = prdt(p1, 'usage', '--root', root, '--json')
    const out = JSON.parse(r.out)
    expect(out.observed_ts.first).toMatch(/^2026-07-03/)
    expect(out.observed_ts.last).toMatch(/^2026-09-14/)
    expect(out.scope_boundary).toMatch(/깊이|더 깊은/)
  })

  test('F4: a billing note fires when reported has never once occurred (this machine\'s actual shape)', () => {
    const p1 = mkProject('p1')
    writeTurns(p1, [{ ts: '2026-09-14T00:00:00Z', scope: 'subagent', model: 'x', cost_usd: 1.0, cost_source: 'estimated', usage: null }])
    const r = prdt(p1, 'usage', '--root', root, '--json')
    const out = JSON.parse(r.out)
    expect(out.billing_note).toMatch(/reported|청구/)
  })

  test('F5: a non-string ts does not crash the whole command — the record is excluded, others still print', () => {
    const p1 = mkProject('p1')
    writeTurns(p1, [
      { ts: 1700000000, scope: 'subagent', model: 'x', cost_usd: 1.0, cost_source: 'estimated', usage: null },
      { ts: '2026-09-14T00:00:00Z', scope: 'subagent', model: 'x', cost_usd: 2.0, cost_source: 'estimated', usage: null },
    ])
    const r = prdt(p1, 'usage', '--root', root, '--json')
    expect(r.status, r.err).toBe(0)
    const out = JSON.parse(r.out)
    expect(out.cost_usd_total).toBeCloseTo(2.0, 6)
    expect(out.projects[0].bad_ts).toBe(1)
  })

  test('F7: "last observed" for null-model records is computed from the data, not a hardcoded date', () => {
    const p1 = mkProject('p1')
    writeTurns(p1, [
      { ts: '2026-09-13T00:00:00Z', scope: 'subagent', model: null, cost_usd: 1.0, cost_source: 'estimated', usage: null },
    ])
    const r = prdt(p1, 'usage', '--root', root)
    expect(r.out).toMatch(/2026-09-13/)
    expect(r.out).not.toMatch(/2026-08-20/)
  })

  test('F6 quiet acceptances: bool cost_usd is not summed as $1, a negative cost is summed but flagged, ' +
       'since==until is labeled an instant, and a symlinked project dir is not followed', () => {
    const p1 = mkProject('p1')
    writeTurns(p1, [
      { ts: '2026-09-14T00:00:00Z', scope: 'subagent', model: 'x', cost_usd: true, cost_source: 'estimated', usage: null },
      { ts: '2026-09-14T00:00:01Z', scope: 'subagent', model: 'x', cost_usd: -5.0, cost_source: 'estimated', usage: null },
    ])
    const rInstant = prdt(p1, 'usage', '--root', root, '--since', '2026-09-14T00:00:00Z', '--until', '2026-09-14T00:00:00Z', '--json')
    const outInstant = JSON.parse(rInstant.out)
    expect(outInstant.window.is_instant).toBe(true)
    expect(outInstant.window.label).toMatch(/단일 시점/)

    const rFull = prdt(p1, 'usage', '--root', root, '--json')
    const outFull = JSON.parse(rFull.out)
    // bool cost_usd excluded entirely from the money total (not summed as 1.0)
    // and reported in its own bucket, not folded into no_cost_recorded.
    expect(outFull.skipped.bad_cost_type).toEqual({ x: 1 })
    // the negative record IS summed (a plausible refund/adjustment) but named.
    expect(outFull.cost_usd_total).toBeCloseTo(-5.0, 6)
    expect(outFull.negative_cost_records).toBe(1)

    // Symlinked project dir: real project + a symlink pointing at it must not
    // be scanned twice (would double the total).
    const real = mkProject('preal')
    writeTurns(real, [{ ts: '2026-09-14T00:00:00Z', scope: 'subagent', model: 'x', cost_usd: 10.0, cost_source: 'estimated', usage: null }])
    fs.symlinkSync(real, path.join(root, 'plink'), 'dir')
    const rSym = prdt(p1, 'usage', '--root', root, '--json')
    const outSym = JSON.parse(rSym.out)
    expect(outSym.projects.map((p: any) => p.name)).not.toContain('plink')
    expect(outSym.symlinks_skipped).toContain('plink')
  })

  test('F6 mislabels: an unreadable file, a directory named turns.jsonl, and a wrong-typed cost_usd ' +
       'each get their OWN status/bucket instead of borrowing a neighboring one', () => {
    // a) directory sitting where turns.jsonl belongs → "is_directory", not "absent".
    const pDir = mkProject('pdir')
    fs.mkdirSync(path.join(pDir, '.prdt', 'turns.jsonl'))
    // b) cost_usd as a string → its own bad-type bucket, not "no_cost_recorded".
    const pStr = mkProject('pstr')
    writeTurns(pStr, [{ ts: '2026-09-14T00:00:00Z', scope: 'subagent', model: 'x', cost_usd: '3.0', cost_source: 'estimated', usage: null }])

    const r = prdt(pDir, 'usage', '--root', root, '--json')
    expect(r.status, r.err).toBe(0)
    const out = JSON.parse(r.out)
    const byName = Object.fromEntries(out.projects.map((p: any) => [p.name, p]))
    expect(byName.pdir.status).toBe('is_directory')
    expect(out.skipped.no_cost_recorded).not.toHaveProperty('x')
    expect(out.skipped.bad_cost_type).toEqual({ x: 1 })

    // c) unreadable file (permission denied) → "unreadable", not "malformed".
    if (process.getuid && process.getuid() !== 0) {
      const pPerm = mkProject('pperm')
      writeTurns(pPerm, [{ ts: '2026-09-14T00:00:00Z', model: 'x', cost_usd: 1, cost_source: 'estimated', usage: null }])
      fs.chmodSync(path.join(pPerm, '.prdt', 'turns.jsonl'), 0o000)
      try {
        const rPerm = prdt(pPerm, 'usage', '--root', root, '--json')
        const outPerm = JSON.parse(rPerm.out)
        const byName2 = Object.fromEntries(outPerm.projects.map((p: any) => [p.name, p]))
        expect(byName2.pperm.status).toBe('unreadable')
      } finally {
        fs.chmodSync(path.join(pPerm, '.prdt', 'turns.jsonl'), 0o644)
      }
    }
  })
})
