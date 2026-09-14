/**
 * `prdt estimate` — T-545, black-box over the REAL CLI.
 *
 * This command is an OUTLIER SIGNAL only (acceptance: it gates nothing). The
 * fixtures below cover:
 *   - thin history (< MIN_SAMPLES) refuses a number instead of guessing
 *   - enough history returns a distribution (median/percentiles), not a point
 *   - the tool measures its OWN error: a walk-forward self-calibration at
 *     2x/3x/5x median, scored only against records strictly earlier than the
 *     one being judged (never a range fit to the same points it scores)
 *   - --playbook is accepted but visibly inert — turns.jsonl records no
 *     playbook field on this machine, and the tool says so rather than
 *     silently ignoring the flag
 *   - a positive control with hand-picked values: median, percentiles and the
 *     self-calibration counts are asserted by hand arithmetic, not just
 *     "some number came back"
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
let root: string

function mkProject(name: string): string {
  const dir = path.join(root, name)
  fs.mkdirSync(path.join(dir, '.prdt'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.prdt', 'po-state.json'),
    JSON.stringify({ schema_version: 1, stage: 'build', version: 'v1', current_task: null }))
  return dir
}

function writeTurns(dir: string, lines: object[]) {
  const body = lines.map((l) => JSON.stringify(l)).join('\n') + '\n'
  fs.writeFileSync(path.join(dir, '.prdt', 'turns.jsonl'), body)
}

function rec(ts: string, persona: string, model: string, input: number, output: number, cache: number) {
  return { ts, scope: 'subagent', cost_basis: 'subagent_total', persona, model,
           cost_usd: null, cost_source: null, usage: { input, output, cache } }
}

beforeEach(() => {
  sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-estimate-'))
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

describe.skipIf(!READY)('prdt estimate — dispatch-size outlier signal (T-545)', () => {
  test('thin history (below MIN_SAMPLES) refuses a number', () => {
    const p1 = mkProject('p1')
    writeTurns(p1, [
      rec('2026-09-01T00:00:00Z', 'developer', 'claude-sonnet-5', 100, 100, 100),
      rec('2026-09-02T00:00:00Z', 'developer', 'claude-sonnet-5', 100, 100, 100),
    ]) // only 2 records — below the 8-sample floor
    const r = prdt(p1, 'estimate', '--persona', 'developer', '--model', 'claude-sonnet-5',
      '--root', root, '--json')
    expect(r.status, r.err).toBe(0)
    const out = JSON.parse(r.out)
    expect(out.insufficient_history).toBe(true)
    expect(out.sample_count).toBe(2)
    expect(out.tokens).toBeUndefined()
    expect(out.message).toMatch(/이력 부족/)
  })

  test('never gates: exit 0 and gates_nothing:true even when insufficient', () => {
    const p1 = mkProject('p1')
    writeTurns(p1, [rec('2026-09-01T00:00:00Z', 'qa', 'claude-fable-5', 1, 1, 1)])
    const r = prdt(p1, 'estimate', '--persona', 'qa', '--model', 'claude-fable-5', '--root', root, '--json')
    expect(r.status).toBe(0)
    expect(JSON.parse(r.out).gates_nothing).toBe(true)
  })

  test('--playbook is accepted but visibly inert — no playbook field exists to group by', () => {
    const p1 = mkProject('p1')
    writeTurns(p1, Array.from({ length: 10 }, (_, i) =>
      rec(`2026-09-0${(i % 9) + 1}T00:00:00Z`, 'developer', 'claude-sonnet-5', 100, 1000 * (i + 1), 100)))
    const r = prdt(p1, 'estimate', '--persona', 'developer', '--model', 'claude-sonnet-5',
      '--playbook', 'implement', '--root', root, '--json')
    expect(r.status, r.err).toBe(0)
    const out = JSON.parse(r.out)
    expect(out.playbook_note).toMatch(/playbook 필드가 없음/)
    // the note fires regardless of shape (T-545 acceptance: state the drop, don't paper over it)
  })

  test('positive control: hand-picked values — median/percentiles and self-calibration match by hand', () => {
    // 12 dispatches, strictly increasing token totals via output (input/cache fixed),
    // so sorted-by-ts order == sorted-by-size order and hand arithmetic is exact.
    // totals (input=10, cache=0 fixed): 110,210,310,410,510,610,710,810,910,1010,1110,5000110
    const p1 = mkProject('p1')
    const outputs = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100, 5000000]
    const lines = outputs.map((o, i) =>
      rec(`2026-09-${String(i + 1).padStart(2, '0')}T00:00:00Z`, 'developer', 'claude-opus-5', 10, o, 0))
    writeTurns(p1, lines)

    const r = prdt(p1, 'estimate', '--persona', 'developer', '--model', 'claude-opus-5', '--root', root, '--json')
    expect(r.status, r.err).toBe(0)
    const out = JSON.parse(r.out)
    expect(out.insufficient_history).toBe(false)
    expect(out.sample_count).toBe(12)

    const totals = outputs.map((o) => o + 10).sort((a, b) => a - b)
    // median of 12 = average of 6th/7th (0-indexed 5,6) -> python statistics.median does exactly this
    const expectedMedian = (totals[5] + totals[6]) / 2
    expect(out.tokens.median).toBeCloseTo(expectedMedian, 6)
    expect(out.tokens.max).toBe(5000010)

    // walk-forward self-calibration, MIN_SAMPLES=8: judges indices 8..11 (4 records)
    // against the median of all-prior tokens at that point (chronological == sorted here).
    // prior sets (sorted): idx8 -> totals[0..7], idx9 -> totals[0..8], idx10 -> [0..9], idx11 -> [0..10]
    function median(a: number[]) {
      const s = [...a].sort((x, y) => x - y)
      const n = s.length
      return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2
    }
    const evalIdx = [8, 9, 10, 11]
    let flagged3 = 0
    for (const i of evalIdx) {
      const priorMed = median(totals.slice(0, i))
      if (totals[i] > 3 * priorMed) flagged3++
    }
    expect(out.outlier_flag_calibration['3'].evaluated).toBe(4)
    expect(out.outlier_flag_calibration['3'].flagged).toBe(flagged3)
    // the planted 5,000,010-token record (idx 11) is a huge multiple of any prior
    // median in this fixture and must itself be flagged at 3x.
    expect(flagged3).toBeGreaterThanOrEqual(1)
  })

  test('an unknown (persona, model) shape with zero records is just thin history, not a crash', () => {
    const p1 = mkProject('p1')
    writeTurns(p1, [rec('2026-09-01T00:00:00Z', 'developer', 'claude-sonnet-5', 1, 1, 1)])
    const r = prdt(p1, 'estimate', '--persona', 'po', '--model', 'claude-mythos-9', '--root', root, '--json')
    expect(r.status, r.err).toBe(0)
    const out = JSON.parse(r.out)
    expect(out.insufficient_history).toBe(true)
    expect(out.sample_count).toBe(0)
  })

  test('default --root (no flag) is the parent of the current project, not a hardcoded path', () => {
    const p1 = mkProject('p1')
    writeTurns(p1, Array.from({ length: 8 }, (_, i) =>
      rec(`2026-09-0${i + 1}T00:00:00Z`, 'developer', 'claude-sonnet-5', 10, 100 * (i + 1), 0)))
    const r = prdt(p1, 'estimate', '--persona', 'developer', '--model', 'claude-sonnet-5', '--json')
    expect(r.status, r.err).toBe(0)
    const out = JSON.parse(r.out)
    expect(fs.realpathSync(out.scan_root)).toBe(fs.realpathSync(root))
    expect(out.sample_count).toBe(8)
  })
})
