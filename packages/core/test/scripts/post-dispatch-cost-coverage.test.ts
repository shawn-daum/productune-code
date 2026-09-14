/**
 * post-dispatch-cost-coverage.test.ts — T-543 regression.
 *
 * Round 1 root cause: `PRICES` in prdt-post-dispatch.sh never carried a row
 * for `opus-5` (`claude-opus-5`) — it shipped 2026-07-02 with only the
 * opus-4-x family, before opus-5 existed, and nobody added a row when opus-5
 * became the default tier. `price_for()`'s substring match misses every
 * opus-5 model id, so `estimate_cost()` returned None and `cost_usd` stayed
 * null on every dispatch through the SubagentStop transcript-sum path (the
 * common case — background dispatches). Missing-price-table row, not a
 * collection-path defect: every other current-tier model priced fine
 * through the exact same code.
 *
 * The "every tier prices non-null" block below pins that fix, so a future
 * model swap that again forgets a PRICES row fails loudly instead of
 * silently losing 99% of one tier's cost data for weeks. F5 (round 2, QA
 * grill): that block used to assert only `> 0`, which is blind to an absurd
 * rate (5000/25000) or transposed input/output — it also goes green. Each
 * tier's exact expected `cost_usd` is now pinned by hand from the fixture
 * usage × the current PRICES row, so a wrong rate fails this test directly
 * instead of waiting for someone to notice the invoice.
 *
 * Round 2 (QA grill, 2026-09-14) added three more regressions:
 *   - F2: a transcript mixing a priced and an unpriced model used to drop
 *     the unpriced model's tokens and silently return a partial sum labeled
 *     exactly like a complete one (`cost_source: "estimated"`). Fixed by
 *     refusing to price a transcript unless every model in it prices;
 *     `cost_usd` stays null, `cost_source` becomes `"estimated_partial"`,
 *     and the dropped model ids land in `cost_unpriced_models`.
 *   - F3: the PostToolUse sync-response path (b1) wrote `model: null` when
 *     the response carried usage but no model field — the actual source of
 *     the 101 null-model turns.jsonl records (not the SubagentStop path,
 *     which has defaulted `mdl or "_unknown"` since the first cost version).
 *     Fixed by defaulting to `"_unknown"` there too, for consistency with
 *     its sibling.
 *   - F7: two PRICES rows were themselves wrong, QA-verified against the
 *     live official pricing page — sonnet-5 was priced at the never-applied
 *     $3/$15 increase instead of the standing $2/$10 rate, and fable-5-1
 *     (which has no row of its own and inherits fable-5's input/output rate
 *     by substring) was overstated 4× on cache reads because the hook
 *     applied every model's cache-read multiplier as a uniform 0.1× instead
 *     of fable-5-1's actual 0.025×.
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { spawnSync } from 'child_process'
import { test, expect, describe } from 'vitest'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const HOOK = path.join(CORE_ROOT, 'scripts', 'hooks', 'prdt-post-dispatch.sh')

function tmp(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix))
}

/** A project dir carrying the `.prdt/po-state.json` marker the hook up-walks for. */
function makeProject(): string {
  const root = tmp('prdt-t543-proj-')
  fs.mkdirSync(path.join(root, '.prdt'), { recursive: true })
  fs.writeFileSync(
    path.join(root, '.prdt', 'po-state.json'),
    JSON.stringify({ schema_version: 1, stage: 'build', version: 'v1.9', current_task: null }),
  )
  return root
}

/** One assistant transcript line carrying real per-model usage (the shape
 *  `sum_transcript()` reads: `message.model` + `message.usage`). */
function transcriptLine(model: string): string {
  return JSON.stringify({
    message: {
      model,
      usage: {
        input_tokens: 1000,
        output_tokens: 500,
        cache_read_input_tokens: 200,
        cache_creation_input_tokens: 100,
      },
    },
  })
}

function runSubagentStop(opts: {
  cwd: string
  agentType: string
  agentId: string
  transcriptPath: string
}): void {
  const ev = {
    hook_event_name: 'SubagentStop',
    agent_type: opts.agentType,
    agent_id: opts.agentId,
    cwd: opts.cwd,
    agent_transcript_path: opts.transcriptPath,
  }
  const res = spawnSync('bash', [HOOK], {
    input: JSON.stringify(ev),
    encoding: 'utf8',
    timeout: 10000,
  })
  expect(res.status).toBe(0)
}

/** F3: drives the OTHER recording path — PostToolUse's synchronous Agent-tool
 *  response (b1 in the hook), the path that actually produces a null-model
 *  record when `tool_response` carries usage but no `model` field. */
function runPostToolUse(opts: {
  cwd: string
  agentType: string
  agentId: string
  toolResponse: unknown
}): void {
  const ev = {
    hook_event_name: 'PostToolUse',
    tool_name: 'Agent',
    tool_input: { subagent_type: opts.agentType },
    agent_id: opts.agentId,
    cwd: opts.cwd,
    tool_response: opts.toolResponse,
  }
  const res = spawnSync('bash', [HOOK], {
    input: JSON.stringify(ev),
    encoding: 'utf8',
    timeout: 10000,
  })
  expect(res.status).toBe(0)
}

interface TurnLine {
  model: string | null
  cost_usd: number | null
  cost_source: string | null
  cost_unpriced_models?: string[]
  usage?: { input: number; output: number; cache: number } | null
}

function lastTurn(root: string): TurnLine {
  const p = path.join(root, '.prdt', 'turns.jsonl')
  const lines = fs.readFileSync(p, 'utf8').trim().split('\n')
  return JSON.parse(lines[lines.length - 1])
}

// Every model tier the router can select (PO habit's model-fallback ladder:
// fable → opus → sonnet → haiku), by current-generation model id, with the
// EXACT cost_usd the fixture usage (1000 in / 500 out / 200 cache-read /
// 100 cache-creation) must produce at that tier's current PRICES row —
// hand-computed as (in*pi + out*po + cache_read*mult*pi + cache_creation*
// 1.25*pi) / 1e6, QA-cross-checked for opus-5 (0.018225) on 2026-09-14.
// F5 (round 2): the old assertion was only `> 0`, which stays green for an
// absurd rate (5000/25000) or a transposed input/output pair — pinning the
// exact number is the cheapest "this rate was confirmed" marker there is.
const TIER_EXPECT: Record<string, { modelId: string; costUsd: number }> = {
  fable: { modelId: 'claude-fable-5', costUsd: 0.03645 },
  opus: { modelId: 'claude-opus-5', costUsd: 0.018225 },
  // F7 (round 2): sonnet-5 corrected from the never-applied $3/$15 increase
  // to the standing $2/$10 rate — this expectation moves with that fix.
  sonnet: { modelId: 'claude-sonnet-5', costUsd: 0.00729 },
  haiku: { modelId: 'claude-haiku-4-5', costUsd: 0.003645 },
}

describe('every router tier records model + exact cost_usd (T-543)', () => {
  for (const [tier, { modelId, costUsd }] of Object.entries(TIER_EXPECT)) {
    test(`${tier} (${modelId}) — SubagentStop dispatch prices exactly`, () => {
      const root = makeProject()
      const transcriptPath = path.join(root, 'transcript.jsonl')
      fs.writeFileSync(transcriptPath, transcriptLine(modelId) + '\n')
      runSubagentStop({
        cwd: root,
        agentType: 'prdt-developer',
        agentId: `a-t543-${tier}`,
        transcriptPath,
      })
      const line = lastTurn(root)
      expect(line.model).toBe(modelId)
      expect(typeof line.cost_usd).toBe('number')
      // Precision 6 = the hook's own round(total, 6); an absurd or
      // transposed rate would miss this by orders of magnitude.
      expect(line.cost_usd as number).toBeCloseTo(costUsd, 6)
      expect(line.cost_source).toBe('estimated')
    })
  }
})

describe('mixed-model transcript never reports a partial sum as complete (T-543 F2)', () => {
  test('one priced + one unpriced model: cost_usd null, marked partial, gap named', () => {
    const root = makeProject()
    const transcriptPath = path.join(root, 'transcript.jsonl')
    const unpricedModel = 'claude-not-a-real-tier-9'
    // Reproduces the ticket's repro shape (opus-5 100k/20k + sonnet-5 1k/100):
    // a real priced model plus a model with no PRICES row in the same
    // transcript. Before the fix this silently returned only the priced
    // model's share, tagged cost_source:"estimated" — indistinguishable
    // from a complete total. That is exactly how the round-1 "32 opus-5
    // priced" history records turned out to be confident underestimates.
    fs.writeFileSync(
      transcriptPath,
      transcriptLine('claude-opus-5') + '\n' + transcriptLine(unpricedModel) + '\n',
    )
    runSubagentStop({
      cwd: root,
      agentType: 'prdt-developer',
      agentId: 'a-t543-f2-mixed',
      transcriptPath,
    })
    const line = lastTurn(root)
    // No confident number for a transcript this hook cannot fully price.
    expect(line.cost_usd).toBeNull()
    expect(line.cost_source).toBe('estimated_partial')
    expect(line.cost_unpriced_models).toContain(unpricedModel)
    // The gap is visible in the DATA (this field), not only inferable from
    // code — the ticket's explicit requirement, not just a null cost_usd.
    // Usage itself still sums both models — only the cost total is withheld.
    expect(line.usage?.input).toBe(2000)
    expect(line.usage?.output).toBe(1000)
  })

  test('fully priced single-model transcript is unaffected — stays "estimated"', () => {
    const root = makeProject()
    const transcriptPath = path.join(root, 'transcript.jsonl')
    fs.writeFileSync(transcriptPath, transcriptLine('claude-opus-5') + '\n')
    runSubagentStop({
      cwd: root,
      agentType: 'prdt-developer',
      agentId: 'a-t543-f2-single',
      transcriptPath,
    })
    const line = lastTurn(root)
    expect(line.cost_usd).toBeCloseTo(0.018225, 6)
    expect(line.cost_source).toBe('estimated')
    expect(line.cost_unpriced_models).toBeUndefined()
  })
})

describe('PostToolUse sync response with usage but no model (T-543 F3)', () => {
  test('marks model "_unknown" instead of null — matches the SubagentStop sibling', () => {
    const root = makeProject()
    runPostToolUse({
      cwd: root,
      agentType: 'prdt-developer',
      agentId: 'a-t543-f3-nomodel',
      // The actual shape QA traced: usage present, no `model` key anywhere
      // in the tool_response, no total_cost_usd either.
      toolResponse: {
        session_id: 'sess-t543-f3',
        usage: {
          input_tokens: 1000,
          output_tokens: 500,
          cache_read_input_tokens: 200,
          cache_creation_input_tokens: 100,
        },
      },
    })
    const line = lastTurn(root)
    // The regression: this used to write model: null (the 101-record gap).
    expect(line.model).toBe('_unknown')
    // "_unknown" has no PRICES row — no confident cost, and this is a
    // fully-unpriced record (not a "partial" one), so no partial marker.
    expect(line.cost_usd).toBeNull()
    expect(line.cost_source).toBeNull()
  })
})
