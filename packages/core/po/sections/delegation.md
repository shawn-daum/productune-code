# Persona delegation + Plan mode

## Invoke (non-interactive)

`post-delegate-state-write` hook (`scripts/hooks/post-delegate-state-write.sh`, `PostToolUse(Bash)`) handles every `claude --agent pdt-*` / `--resume`: captures `.session_id`, bumps `persona_session_meta.<persona>.turns`, appends `model_history`, merges `recent_turns`, unions `artifacts`. **Don't duplicate.**

## Artifact self-verify gate

Artifact task: maker self-checks parse/render/build/lint/test. Report result. QA only for meaning/risk.

PO's remaining writes (hook can't infer):
- Open `current_task` with semantic `slug` + `request_summary` + `artifacts` *before* delegating (else hook auto-creates `auto-<ts>` slug + `pre-delegate-task-check` blocks). `jq`, not `python3`.
- Update `docs/tickets/<version>/T-NNN.md` lifecycle metadata when routing/closing: status, timestamps, duration, assignee/routing/model/effort/progress refs only. No body/request/acceptance/scope edits.
  `status:` enum enforced by `pre-frontmatter-lint.sh` PreToolUse hook (T-P4-136).
- Read SID from `current_task.persona_sessions.<persona>` (hook blocks unknown UUIDs via R4).
- Append `effort_history`, `complexity_level`, `confidence_history` after call.

UUIDs strict **8-4-4-4-12 lowercase hex**. Never prefix. Never self-generate. First call: omit `--session-id` (Claude returns). Resume: `--resume "$SID"`. Mixing rejected.

## Minimal template

TASK ships inline `[ctx]` JSON line. Personas skip state re-read. Full bash heredoc + hook integration → **`sections/_formats/delegation-template.md`**.

Core variables:
- `$PERSONA` (pdt-developer / -designer / -qa)
- `$MODEL` / `$EFFORT` (auto-promote opus on xhigh|max)
- `$CTX` — jq-built JSON with slug/request_summary/artifacts/version/prd_path/persona_sessions/next_ticket_id/user_knowledge_state.
- `$TASK` — verbatim user text + scope + thinking budget + `[ctx]`.

After parse: inspect `CONFIDENCE` + `UNRESOLVED`. Low/non-empty → quality escalation (`escalation.md`).

**Persona output**: JSON-only per T-P4-150. `summary` (≤200 char) + optional `user_surface` (≤500 char) carry human content — PO paraphrases for user. Shared doctrine: `sections/_formats/persona-output-format.md`.

## `user_knowledge_state` field (T-P4-120)

PO writes 3-field snapshot of relevant axes from `po-memory.md ## User knowledge state (engineering)` into `[ctx].user_knowledge_state`. Drives mandatory anchor citations on alternative blocks per `sections/alternative-reporting.md`.

Detail (schema + persona obligations) → **`sections/_details/uks-field.md`**.

## Dev-QA auto-loop protocol (T-P4-112)

After impl ticket dispatched (status → `in-progress`), PO auto-dispatches QA without user confirm. Max 3 attempts. fail (cap) → `blocked` + user TODO. AUTH_REQUIRED → pause + auth todo.

Detail (state machine + chat trace + GUI integration) → **`sections/_details/dev-qa-auto-loop.md`**.

## PRD delegation (Designer, clarity loop)

Fresh idea → delegate Version 1 PRD direct (clarity loop subsumes discovery):

```bash
PERSONA=pdt-designer; SCOPE='draft Version 1 PRD with clarity loop A ≤ 0.05; emit tickets when ready'
MODEL=opus; EFFORT=max; COMPLEXITY=L7
BRIEF_PATH=$(jq -r '.current_task.input.brief_path // empty' "$STATE")
TASK="$USER_TEXT
(scope: $SCOPE)
(extended thinking budget: $EFFORT)
[ctx] $CTX
[brief] $BRIEF_PATH"
```

Designer returns `state:"needs-info"` (PO relays `next_question`) or `state:"ready"` (PRD path + tickets + ambiguity_score + slot_clarity + version_outcome). Hard cap: 5 `needs-info` iterations. 6th turn → resume body: `"finalize PRD with current state. Move unresolved into ## Open Questions."` Designer ships `ready` with `confidence < 0.7`.

Full clarity loop spec → `sections/prd-and-output.md`.

## Plan mode (L4+ default)

L4+ goes **plan-first (dev opus/xhigh) → PO reviews → auto-accept impl (sonnet/high)**. PO = default reviewer. L1–L3 trivials skip → straight sonnet/medium impl.

Trigger: L≥4, multi-file/cross-cutting, risk flag (auth/payments/PII/migration/DS/public-API), or user asks.

Flow:
1. Plan call — dev PLAN ONLY, opus/xhigh. Body starts `PLAN MODE — DO NOT WRITE CODE` + Goal/Constraints/Acceptance. `changed_files` must be empty.
2. PO review — testability + acceptance + architecture + risk. sonnet/medium routine, opus/high risk. Verdict: `OK` or `revise:[...]`.
3. Plan revise — resume same dev session, plan only, re-review. **3+ iterations** → surface (proceed / re-PRD / strong-implement).
4. Impl — dev sonnet/high, plan as task first line, `acceptEdits`. Self-verify mandatory.
5. Failure regress — self-verify / QA fail after Path 1 retry → back to plan (opus/xhigh) + PO re-review. `escalation_triggered=true`, bump `actual_complexity`.

Optional cross-review (high-stakes): pdt-qa testability, pdt-designer UX/DS/copy.

Trace (L4): `→ planning 'X' (L4 → plan)` · `→ delegating pdt-developer (PLAN ONLY, opus/xhigh)` · `✓ plan returned` · `→ PO reviewing` · `✓ OK` · `→ delegating pdt-developer (impl, sonnet/high)`.

**Why explicit**: `claude --print` doesn't auto-engage plan mode; task-body `PLAN MODE — DO NOT WRITE CODE` = only non-interactive enforcement.

## Promotion lifecycle (T-P4-121)

Persona returns `promotion_candidates`; PO surfaces; on user approval writes per tier (project / work-note / wiki). Subagent dispatch path retired — claude code 2.1.142 MCP non-inheritance + agent whitelist tool-name resolution.

Detail (3-tier mechanical write paths + retired-path rationale + persona contract) → **`sections/_details/promotion-lifecycle.md`**.

## Session lifecycle (T-P4-149)

**Per-ticket fresh / per-turn resume.**
Ticket close (status → `done` | `blocked` | `abandoned`) → immediately
`jq '.current_task.persona_sessions = {}'` (before `current_task = null`).
Next ticket's first dispatch = **no `--session-id`** (fresh call, clean context).
Within-ticket multi-turn (e.g. plan turn → impl turn, QA retry on same ticket) = `--resume "$SID"` OK.

> Rationale: 5-ticket session accumulation ~$8.6 → per-ticket fresh ~$2.5 (↓70%).
> Crossover at ~3 tickets: fresh cost < resume cost from that point.

## Chunking — per-call size limits

PO splits multi-area / multi-decision / multi-output directives per sub-area. Per-persona ceilings + good/bad case examples → **`sections/_details/chunking-rules.md`**.
