/**
 * subagent-cost.ts — write `scope="subagent"` cost records to turns.jsonl from
 * the PO stream (T-PATCH-170).
 *
 * WHY THIS EXISTS
 * ----------------
 * `turns.jsonl` (the cost archive source, read by ipc/costArchive.ts) carries two
 * scopes:
 *   - scope="main"     — PO session-cumulative USD, written by the statusline hook
 *                        (packages/core/scripts/statusline-productune.sh).
 *   - scope="subagent" — per-dispatch token+cost, written by the post-delegate hook
 *                        (packages/core/scripts/hooks/post-delegate-state-write.sh),
 *                        whose matcher is PostToolUse(Bash).
 *
 * The GUI's PO dispatches sub-agents via the **Agent tool** (not a Bash
 * `claude --agent …` command), so the Bash-matched post-delegate hook never
 * fires → zero scope="subagent" lines → the cost archive shows PO only.
 *
 * This module mirrors the hook's record shape EXACTLY (same field set, same
 * `usage` keys `input_tokens`/`output_tokens`/`cache_creation_input_tokens`/
 * `cache_read_input_tokens`, same `cost_basis="subagent_total"`) so that
 * ipc/costArchive.ts aggregates GUI-written rows identically to CLI-written ones.
 *
 * GRACEFUL GATING (T-PATCH-170 ★)
 * --------------------------------
 * The exact stream location of per-subagent usage is a Claude-Code stream-spec
 * detail confirmed only at runtime (same class as T-165/166). So the caller
 * extracts a best-effort `{ cost_usd?, model?, usage? }` from whatever the stream
 * carries (the Agent tool_result part and/or the sidechain final message), and
 * `appendSubagentTurn` is a NO-OP when none of cost/model/usage is present —
 * never writes an empty/garbage line. This keeps the path harmless until the
 * usage shape is confirmed live, then it lights up with no further code change.
 */

import fs from 'fs'
import { poStatePath, stateDir, turnsJsonlPath } from './project-paths'

/** Normalized usage block — same key names ipc/costArchive.ts's readUsage reads. */
export interface SubagentUsage {
  input_tokens?: number | null
  output_tokens?: number | null
  cache_creation_input_tokens?: number | null
  cache_read_input_tokens?: number | null
}

export interface SubagentCostCapture {
  /** Per-dispatch total USD (CLI-provided — NOT computed here; no price table). */
  cost_usd?: number | null
  /** Authoritative model id (first modelUsage key, or message.model). */
  model?: string | null
  usage?: SubagentUsage
  /** The sub-agent's own session_id, when the stream carries one. */
  sessionId?: string | null
}

/** Coerce to a finite number or null (tolerates strings / missing). */
function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    if (Number.isFinite(n)) return n
  }
  return null
}

/**
 * Best-effort extractor for a sub-agent's usage/cost from a raw stream envelope
 * object. Probes the locations the CLI is known to use across versions:
 *   - top-level `total_cost_usd` / `usage` / `modelUsage` (mirrors the hook's
 *     `claude -p --output-format json` envelope, which a nested `result` event
 *     replicates),
 *   - `message.usage` / `message.model` (sidechain final assistant message).
 * Returns a capture object that may be entirely empty — the caller gates on
 * `hasUsableCapture()` before writing.
 */
export function extractSubagentCapture(obj: any): SubagentCostCapture {
  const cap: SubagentCostCapture = {}

  // cost: prefer top-level total_cost_usd (result-envelope shape).
  cap.cost_usd = num(obj?.total_cost_usd ?? obj?.cost?.total_cost_usd)

  // usage: top-level `usage`, else `message.usage` (assistant sidechain).
  const usageRaw =
    (obj?.usage && typeof obj.usage === 'object' && obj.usage) ||
    (obj?.message?.usage && typeof obj.message.usage === 'object' && obj.message.usage) ||
    null
  if (usageRaw) {
    cap.usage = {
      input_tokens: num(usageRaw.input_tokens),
      output_tokens: num(usageRaw.output_tokens),
      cache_creation_input_tokens: num(usageRaw.cache_creation_input_tokens),
      cache_read_input_tokens: num(usageRaw.cache_read_input_tokens),
    }
  }

  // model: authoritative = first modelUsage key (matches the hook); else
  // message.model (assistant sidechain), else top-level model.
  const modelUsage =
    obj?.modelUsage && typeof obj.modelUsage === 'object' ? obj.modelUsage : null
  if (modelUsage) {
    const first = Object.keys(modelUsage)[0]
    if (first) cap.model = first
  }
  if (!cap.model) {
    if (typeof obj?.message?.model === 'string') cap.model = obj.message.model
    else if (typeof obj?.model === 'string') cap.model = obj.model
  }

  if (typeof obj?.session_id === 'string') cap.sessionId = obj.session_id

  return cap
}

/**
 * T-335: extract the PO's OWN running model id from a top-level (non-nested)
 * assistant envelope — e.g. `claude-opus-4-8`, `claude-sonnet-5`. Mirrors
 * extractSubagentCapture's model probe (`message.model` first, then top-level
 * `model`) but gated to the PO's own turn: sidechain/subagent envelopes carry
 * their OWN model on the same fields, so a caller MUST pass `isNested` (the
 * same `obj.parent_tool_use_id != null` check po-runner already computes per
 * line) to keep worker models out of the PO's label. Returns null when nested,
 * or when the field isn't present on this line (best-effort — most lines carry
 * no model at all; the caller only needs to act on the ones that do).
 */
export function extractPoModel(obj: any, isNested: boolean): string | null {
  if (isNested) return null
  if (typeof obj?.message?.model === 'string' && obj.message.model) return obj.message.model
  if (typeof obj?.model === 'string' && obj.model) return obj.model
  return null
}

/** Merge two captures, preferring non-null fields from `next` (later events). */
export function mergeCapture(
  base: SubagentCostCapture | undefined,
  next: SubagentCostCapture,
): SubagentCostCapture {
  const out: SubagentCostCapture = { ...(base ?? {}) }
  if (next.cost_usd != null) out.cost_usd = next.cost_usd
  if (next.model != null) out.model = next.model
  if (next.sessionId != null) out.sessionId = next.sessionId
  if (next.usage) {
    out.usage = { ...(out.usage ?? {}) }
    for (const k of [
      'input_tokens',
      'output_tokens',
      'cache_creation_input_tokens',
      'cache_read_input_tokens',
    ] as const) {
      if (next.usage[k] != null) out.usage[k] = next.usage[k]
    }
  }
  return out
}

/** True when the capture has at least one usable cost/model/usage value. */
export function hasUsableCapture(cap: SubagentCostCapture | undefined): boolean {
  if (!cap) return false
  if (cap.cost_usd != null) return true
  if (cap.model != null) return true
  if (cap.usage) {
    for (const v of Object.values(cap.usage)) if (v != null) return true
  }
  return false
}

/** Minimal po-state slice for version/task_slug/ticket_id (mirrors the hook). */
function readStateContext(projectDir: string): {
  version: string | null
  task_slug: string | null
  ticket_id: string | null
} {
  const out = { version: null as string | null, task_slug: null as string | null, ticket_id: null as string | null }
  try {
    const statePath = poStatePath(projectDir)
    const st = JSON.parse(fs.readFileSync(statePath, 'utf-8')) as Record<string, unknown>
    const cv = st.current_version
    out.version =
      cv && typeof cv === 'object'
        ? (typeof (cv as any).id === 'string' ? (cv as any).id : null)
        : typeof cv === 'string' && cv
          ? cv
          : null
    // T-306: prdt po-state carries the flat `version` string instead of
    // current_version (discriminated by the flat `stage` field, which a legacy
    // po-state never has) — so prdt cost rows get version-grouped too.
    if (out.version === null && typeof st.stage === 'string' && typeof st.version === 'string' && st.version) {
      out.version = st.version
    }
    const ct = st.current_task
    if (ct && typeof ct === 'object') {
      const ctObj = ct as Record<string, unknown>
      out.task_slug = typeof ctObj.slug === 'string' ? ctObj.slug : null
      out.ticket_id =
        typeof ctObj.ticket_id === 'string'
          ? ctObj.ticket_id
          : typeof ctObj.ticket === 'string'
            ? ctObj.ticket
            : null
    } else if (typeof ct === 'string') {
      out.task_slug = ct
    }
  } catch {
    /* absent / unparseable po-state → nulls (echo-mode / fresh project) */
  }
  return out
}

/**
 * Append one `scope="subagent"` record to `<projectDir>/.productune/turns.jsonl`.
 * NO-OP when the capture has no usable data (graceful gate). Best-effort: any
 * failure (missing dir, write error) is swallowed so a cost-write never breaks a
 * PO turn.
 *
 * @param persona  the sub-agent type as dispatched (e.g. "pdt-developer"),
 *                 reverse-mapped from the Agent tool_use id by the caller.
 */
export function appendSubagentTurn(
  projectDir: string,
  persona: string,
  cap: SubagentCostCapture,
): boolean {
  if (!projectDir || !persona) return false
  if (!hasUsableCapture(cap)) return false // gate — never write an empty line

  const ctx = readStateContext(projectDir)
  const usage: SubagentUsage = {
    input_tokens: cap.usage?.input_tokens ?? null,
    output_tokens: cap.usage?.output_tokens ?? null,
    cache_creation_input_tokens: cap.usage?.cache_creation_input_tokens ?? null,
    cache_read_input_tokens: cap.usage?.cache_read_input_tokens ?? null,
  }

  const line = {
    ts: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    scope: 'subagent',
    persona,
    task_slug: ctx.task_slug,
    ticket_id: ctx.ticket_id,
    version: ctx.version,
    turn_index: null,
    model: cap.model ?? null,
    usage,
    cost_usd: cap.cost_usd ?? null,
    cost_basis: 'subagent_total',
    session_id: cap.sessionId ?? null,
    promotion_outcome: null,
    input_meta: {},
    output_full: null,
  }

  try {
    fs.mkdirSync(stateDir(projectDir), { recursive: true })
    fs.appendFileSync(turnsJsonlPath(projectDir), JSON.stringify(line) + '\n')
    return true
  } catch {
    return false
  }
}
