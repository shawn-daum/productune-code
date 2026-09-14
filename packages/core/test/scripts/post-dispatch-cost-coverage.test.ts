/**
 * post-dispatch-cost-coverage.test.ts — T-543 regression.
 *
 * Root cause found: `PRICES` in prdt-post-dispatch.sh never carried a row for
 * `opus-5` (`claude-opus-5`) — it shipped 2026-07-02 with only the opus-4-x
 * family, before opus-5 existed, and nobody added a row when opus-5 became
 * the default tier. `price_for()`'s substring match misses every opus-5
 * model id, so `estimate_cost()` returns None and `cost_usd` stays null on
 * every dispatch that goes through the SubagentStop transcript-sum path
 * (the common case — background dispatches). This is a missing-price-table
 * row, not a collection-path defect: every other current-tier model prices
 * fine through the exact same code.
 *
 * This test pins the fix by asserting a recorded dispatch carries both
 * `model` and a non-null `cost_usd` for EVERY model tier the router can
 * select (fable / opus / sonnet / haiku), so a future model swap that again
 * forgets to add a PRICES row fails loudly instead of silently losing 99% of
 * one tier's cost data for weeks.
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

interface TurnLine {
  model: string | null
  cost_usd: number | null
  cost_source: string | null
}

function lastTurn(root: string): TurnLine {
  const p = path.join(root, '.prdt', 'turns.jsonl')
  const lines = fs.readFileSync(p, 'utf8').trim().split('\n')
  return JSON.parse(lines[lines.length - 1])
}

// Every model tier the router can select (PO habit's model-fallback ladder:
// fable → opus → sonnet → haiku), by current-generation model id.
const TIER_MODELS: Record<string, string> = {
  fable: 'claude-fable-5',
  opus: 'claude-opus-5',
  sonnet: 'claude-sonnet-5',
  haiku: 'claude-haiku-4-5',
}

describe('every router tier records model + cost_usd (T-543)', () => {
  for (const [tier, modelId] of Object.entries(TIER_MODELS)) {
    test(`${tier} (${modelId}) — SubagentStop dispatch prices non-null`, () => {
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
      // The regression: cost_usd used to be null for opus-5 alone because
      // PRICES had no row that substring-matched it. Every tier must price.
      expect(line.cost_usd).not.toBeNull()
      expect(typeof line.cost_usd).toBe('number')
      expect(line.cost_usd as number).toBeGreaterThan(0)
      expect(line.cost_source).toBe('estimated')
    })
  }
})
