/**
 * costArchive aggregation — unit cases for the cumulative-snapshot dedup
 * (T-PATCH-201).
 *
 * NOTE: the GUI package has no configured unit-test framework (only the
 * Playwright `smoke` spec, and no `test` script). Following the T-PATCH-137
 * precedent (src/lib/useTicketScan.test.ts), these cases are a self-contained,
 * framework-free assertion list that `tsc --noEmit` type-checks as part of the
 * build and that any `tsx` / `node` runner can execute directly. The live gate
 * is `tsc --noEmit` + `vite build`.
 *
 * Verifies the ticket's QA note: 3 cumulative rows / 1 session → counted once
 * (session max), 2 subagent rows → summed, mixed → exact total =
 *   Σ(subagent_total) + Σ_session(cumulative session max).
 */

import { aggregateLines, aggregatePivotLines, deriveCostUsd } from './costArchive'

// Minimal line shapes (the aggregators only read the fields they need).
type Line = Parameters<typeof aggregateLines>[0][number]

const cum = (session: string, cost: number, extra: Partial<Line> = {}): Line => ({
  scope: 'main',
  persona: 'pdt-po',
  version: 'v0.5',
  model: 'claude-opus-4-8[1m]',
  session_id: session,
  cost_usd: cost,
  cost_basis: 'main_session_cumulative',
  usage: {},
  ...extra,
})

const sub = (cost: number, extra: Partial<Line> = {}): Line => ({
  scope: 'subagent',
  persona: 'pdt-developer',
  version: 'v0.5',
  model: 'claude-sonnet',
  cost_usd: cost,
  cost_basis: 'subagent_total',
  usage: { input: 100, output: 50, cache: 10 }, // bare `cache` → display total 10
  ...extra,
})

interface Case {
  readonly label: string
  readonly run: () => { ok: boolean; detail?: string }
}

const approx = (a: number, b: number): boolean => Math.abs(a - b) < 1e-9

export const COST_ARCHIVE_CASES: readonly Case[] = [
  {
    // AC-2: three cumulative rows for ONE session → only the session max counts.
    label: '3 cumulative rows / 1 session → counted once (max)',
    run: () => {
      const r = aggregateLines([cum('s1', 10), cum('s1', 25), cum('s1', 22)], 'version')
      return { ok: approx(r.totalCostUsd, 25), detail: `total=${r.totalCostUsd}` }
    },
  },
  {
    // AC-1/AC-2: cumulative across two sessions → sum of per-session maxima.
    label: '2 sessions → sum of per-session maxima',
    run: () => {
      const r = aggregateLines(
        [cum('s1', 10), cum('s1', 25), cum('s2', 5), cum('s2', 40)],
        'version',
      )
      return { ok: approx(r.totalCostUsd, 65), detail: `total=${r.totalCostUsd}` }
    },
  },
  {
    label: '2 subagent_total rows → summed',
    run: () => {
      const r = aggregateLines([sub(3), sub(7)], 'version')
      return { ok: approx(r.totalCostUsd, 10), detail: `total=${r.totalCostUsd}` }
    },
  },
  {
    // AC-1: mixed → Σ(subagent) + Σ_session(cumulative max). Raw sum would be
    // 10+25+22 + 3+7 = 67; correct dedup = 25 + 10 = 35.
    label: 'mixed cumulative+subagent → exact (dedup, not raw sum)',
    run: () => {
      const r = aggregateLines([cum('s1', 10), cum('s1', 25), cum('s1', 22), sub(3), sub(7)], 'version')
      return { ok: approx(r.totalCostUsd, 35), detail: `total=${r.totalCostUsd}` }
    },
  },
  {
    // Legacy fallback: a main line WITHOUT cost_basis must still dedup by scope.
    label: 'basis-less main lines fall back to scope (dedup)',
    run: () => {
      const legacy = (s: string, c: number): Line => ({ scope: 'main', session_id: s, cost_usd: c })
      const r = aggregateLines([legacy('s1', 10), legacy('s1', 30)], 'version')
      return { ok: approx(r.totalCostUsd, 30), detail: `total=${r.totalCostUsd}` }
    },
  },
  {
    // AC-3: pivot main scope row reflects per-session dedup (not raw sum).
    label: 'pivot: main row deduped per session',
    run: () => {
      const r = aggregatePivotLines([cum('s1', 10), cum('s1', 25), sub(7)])
      const mainRow = r.rows.find((x) => x.scope === 'main')
      const okMain = !!mainRow && approx(mainRow.cost_usd, 25) && mainRow.usage === null
      const okTotal = approx(r.totalCostUsd, 32) // 25 (main max) + 7 (subagent)
      return { ok: okMain && okTotal, detail: `main=${mainRow?.cost_usd} total=${r.totalCostUsd}` }
    },
  },
  {
    // Pivot subagent token breakdown sums; main excluded from token subtotal.
    label: 'pivot: subagentUsage sums subagent tokens only',
    run: () => {
      const r = aggregatePivotLines([sub(3), sub(7), cum('s1', 100)])
      const okUsage =
        r.subagentUsage.in === 200 && r.subagentUsage.out === 100 && r.subagentUsage.cache === 20
      return { ok: okUsage, detail: JSON.stringify(r.subagentUsage) }
    },
  },

  // ── T-PATCH-202: transcript-based subagent rows (usage+model, cost DERIVED) ──
  {
    // deriveCostUsd: known model → (in + 0.1*cache_read + 1.25*cache_creation)*in_rate
    //   + out*out_rate, per MTok (T-PATCH-202 caching multipliers).
    // opus-4-8 = $5 in / $25 out. cache_read 1M → 0.1*1M, cache_creation 1M → 1.25*1M.
    // in-tier = 1M + 0.1M + 1.25M = 2.35M. 2.35M*5 + 1M*25 = 11.75 + 25 = 36.75.
    label: 'deriveCostUsd: cache_read at 0.1x, cache_creation at 1.25x, out at output rate',
    run: () => {
      const c = deriveCostUsd(
        { in: 1_000_000, out: 1_000_000, cache: 2_000_000, cacheRead: 1_000_000, cacheCreation: 1_000_000 },
        'claude-opus-4-8',
      )
      return { ok: c !== null && approx(c, 36.75), detail: `cost=${c}` }
    },
  },
  {
    // [1m] / bracketed deployment suffix normalizes to the base public id.
    label: 'deriveCostUsd: bracketed deployment suffix normalizes to base id',
    run: () => {
      const c = deriveCostUsd({ in: 1_000_000, out: 0, cache: 0, cacheRead: 0, cacheCreation: 0 }, 'claude-opus-4-8[1m]')
      return { ok: c !== null && approx(c, 5), detail: `cost=${c}` }
    },
  },
  {
    // AC-4: unknown model → null (usage still recorded; no crash).
    label: 'deriveCostUsd: unknown model → null (graceful)',
    run: () => {
      const c = deriveCostUsd({ in: 1_000_000, out: 1_000_000, cache: 0, cacheRead: 0, cacheCreation: 0 }, 'claude-made-up-9')
      return { ok: c === null, detail: `cost=${String(c)}` }
    },
  },
  {
    // AC-2/AC-6: a subagent row with usage+model but NO cost_usd derives its cost
    // at aggregation time, and the derived total feeds the project total.
    label: 'aggregate: subagent row w/ usage+model, no cost_usd → derived & summed',
    run: () => {
      const tx: Line = {
        scope: 'subagent',
        persona: 'pdt-designer',
        version: 'v0.5',
        model: 'claude-sonnet-4-6', // $3 in / $15 out
        session_id: 'sa1',
        cost_basis: 'subagent_total',
        usage: { input_tokens: 1_000_000, output_tokens: 1_000_000, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
        // cost_usd intentionally absent
      }
      const r = aggregateLines([tx], 'persona')
      // (1M)*3 + (1M)*15 = 3 + 15 = 18
      const g = r.groups.find((x) => x.key === 'pdt-designer')
      return { ok: !!g && approx(g.cost_usd, 18) && approx(r.totalCostUsd, 18), detail: `total=${r.totalCostUsd}` }
    },
  },
  {
    // AC-4 end-to-end: unknown-model subagent row → usage tracked, cost 0, no throw.
    label: 'aggregate: subagent row w/ unknown model → cost 0, turn still counted',
    run: () => {
      const tx: Line = {
        scope: 'subagent',
        persona: 'pdt-qa',
        model: 'claude-made-up-9',
        session_id: 'sa2',
        cost_basis: 'subagent_total',
        usage: { input_tokens: 500_000, output_tokens: 500_000 },
      }
      const r = aggregatePivotLines([tx])
      const row = r.rows.find((x) => x.persona === 'pdt-qa')
      const okRow = !!row && approx(row.cost_usd, 0) && row.usage?.in === 500_000 && row.usage?.out === 500_000
      return { ok: okRow && approx(r.totalCostUsd, 0), detail: JSON.stringify(row) }
    },
  },
  {
    // AC-6 mixed: cumulative (dedup) + derived subagent both fold into the total.
    // cumulative s1 max = 25; subagent opus-4-8 (1M out only) = 25. total = 50.
    label: 'aggregate: cumulative dedup + derived subagent → exact mixed total',
    run: () => {
      const tx: Line = {
        scope: 'subagent',
        persona: 'pdt-developer',
        model: 'claude-opus-4-8',
        session_id: 'sa3',
        cost_basis: 'subagent_total',
        usage: { output_tokens: 1_000_000 },
      }
      const r = aggregateLines([cum('s1', 10), cum('s1', 25), tx], 'version')
      return { ok: approx(r.totalCostUsd, 50), detail: `total=${r.totalCostUsd}` }
    },
  },

  // ── T-290 (adapter A7): cost_source "estimated" badge signal ────────────────
  {
    // A group containing ANY cost_source:'estimated' line is flagged, even
    // when mixed with reported/absent-source lines (conservative — the total
    // is no longer 100% real-invoice once any component is an estimate).
    label: 'aggregate: group hasEstimated true when any line is cost_source estimated',
    run: () => {
      const r = aggregateLines(
        [sub(3, { cost_source: 'estimated' }), sub(7, { cost_source: 'reported' })],
        'version',
      )
      const g = r.groups.find((x) => x.key === 'v0.5')
      return { ok: !!g && g.hasEstimated === true && r.hasEstimated === true, detail: JSON.stringify(g) }
    },
  },
  {
    // reported / absent cost_source → no badge (matches the ticket's
    // "'reported' or absent → no badge" acceptance line).
    label: 'aggregate: group hasEstimated false when all lines reported/absent',
    run: () => {
      const r = aggregateLines(
        [sub(3, { cost_source: 'reported' }), sub(7, {})],
        'version',
      )
      const g = r.groups.find((x) => x.key === 'v0.5')
      return { ok: !!g && g.hasEstimated === false && r.hasEstimated === false, detail: JSON.stringify(g) }
    },
  },
  {
    label: 'pivot: row hasEstimated mirrors the group rule (subagent + main scope)',
    run: () => {
      const r = aggregatePivotLines([
        sub(3, { cost_source: 'estimated' }),
        cum('s1', 10, { cost_source: 'reported' }),
        cum('s1', 25, {}),
      ])
      const subRow = r.rows.find((x) => x.scope === 'subagent')
      const mainRow = r.rows.find((x) => x.scope === 'main')
      const ok =
        !!subRow && subRow.hasEstimated === true &&
        !!mainRow && mainRow.hasEstimated === false &&
        r.hasEstimated === true
      return { ok, detail: JSON.stringify({ subRow, mainRow, total: r.hasEstimated }) }
    },
  },
  {
    // Real v1 turns.jsonl line shape (field check vs the schema confirmed for
    // this ticket): usage carries bare input/output/cache (no _tokens suffix,
    // no cache_read/cache_creation split) and a top-level cost_source. Confirms
    // the existing readUsage()/costForLine() paths already handle it as-is —
    // no field-name mapping needed for the v1 schema.
    label: 'v1 schema: real turns.jsonl shape aggregates cost_usd + usage.cache correctly',
    run: () => {
      const v1Line: Line = {
        scope: 'subagent',
        persona: 'qa',
        session_id: 'a4d02d67846f55395',
        model: 'claude-sonnet-5',
        cost_usd: 1.884124,
        cost_source: 'estimated',
        cost_basis: 'subagent_total',
        usage: { input: 35750, output: 18665, cache: 2491553 },
        version: 'v1.1',
      } as Line
      const r = aggregatePivotLines([v1Line])
      const row = r.rows[0]
      const ok =
        !!row && approx(row.cost_usd, 1.884124) && row.hasEstimated === true &&
        row.usage?.in === 35750 && row.usage?.out === 18665 && row.usage?.cache === 2491553
      return { ok, detail: JSON.stringify(row) }
    },
  },
]

export function runCostArchiveCases(): { passed: number; failures: string[] } {
  const failures: string[] = []
  for (const c of COST_ARCHIVE_CASES) {
    let res: { ok: boolean; detail?: string }
    try {
      res = c.run()
    } catch (e) {
      res = { ok: false, detail: String(e) }
    }
    if (!res.ok) failures.push(`${c.label}${res.detail ? `: ${res.detail}` : ''}`)
  }
  return { passed: COST_ARCHIVE_CASES.length - failures.length, failures }
}

// ── vitest driver ─────────────────────────────────────────────────────────────
// Runs the exported cases under vitest so they appear in `turbo run test` output.

import { test, expect } from 'vitest'

test('costArchive: all aggregation + derivation cases pass', () => {
  const { passed, failures } = runCostArchiveCases()
  if (failures.length > 0) {
    throw new Error(`${failures.length} failure(s):\n  ${failures.join('\n  ')}`)
  }
  expect(passed).toBe(COST_ARCHIVE_CASES.length)
})
