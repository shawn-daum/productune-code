# Delegation — persona dispatch + plan mode

Orchestrate persona invocations. Never author persona output.

## Invocation channel

`claude --agent pdt-<persona>` (first call) / `--resume <SID>` (intra-ticket).
`post-delegate-state-write` hook (`PostToolUse(Bash)`) auto-captures session id +
bumps `persona_session_meta.<persona>.turns`, appends `model_history`, merges
`recent_turns`, unions `artifacts`. Don't duplicate.

UUIDs strict **8-4-4-4-12 lowercase hex**. Never prefix. Never self-generate.
First call: omit `--session-id` (Claude returns). Resume: `--resume "$SID"`. Mixing rejected.

## Write these (hook can't infer)

- Open `current_task` with semantic `slug` + `request_summary` + `artifacts` *before* dispatch
  (else hook auto-creates `auto-<ts>` slug + `pre-delegate-task-check` blocks). Use `jq`.
- Update `docs/tickets/<version>/T-NNN.md` lifecycle metadata only: status · timestamps ·
  duration · assignee · routing · model · effort · progress refs. **No body / scope edits.**
- Read SID from `current_task.persona_sessions.<persona>`.
- Append `effort_history`, `complexity_level`, `confidence_history` after call.

## Task body

`[ctx]` inline JSON line — slug · request_summary · artifacts · version · prd_path ·
persona_sessions · next_ticket_id · user_knowledge_state. Persona skips state re-read.

Inspect returned `confidence` + `unresolved`. Low / non-empty → escalation
(see `escalation.md`).

## Designer Plan row sync

Ticket `## Plan` is **Designer-authored**. Never edit Plan rows. After delegation, if
Designer ships plan changes, mirror **only** lifecycle frontmatter (status, model, effort,
ts). Body diffs surface via Designer's `summary` field — append a 1-line entry to
`## Persona Activity`.

## Plan mode — L5+ plan-only doctrine

L5+ goes **plan-first → review → impl dispatch**:

1. **Plan call** — Developer/Designer **PLAN ONLY**, opus / xhigh. Body starts
   `PLAN MODE — DO NOT WRITE CODE` + Goal · Constraints · Acceptance.
   `changed_files` must be empty.
2. **Review** — check testability + acceptance + architecture + risk. opus / xhigh default.
   Verdict: `OK` or `revise:[...]`. Opus / max if risk-flagged.
3. **Plan revise** — resume same dev session, plan only. **3+ iterations** → surface
   (proceed / re-PRD / strong-implement).
4. **Impl** — dev sonnet / high, plan as task first line. Self-verify mandatory.
5. **Failure regress** — self-verify / QA fail after a model-up retry (Strike 2) → back to plan
   (opus / xhigh) + re-review. `escalation_triggered=true`. Bump `actual_complexity`.

Trigger: L≥5, multi-file / cross-cutting, risk flag, or user asks. L1–L3 trivials skip
→ straight sonnet / medium impl.

Optional cross-review (high-stakes): pdt-qa testability, pdt-designer UX/DS/copy.

`claude --print` never auto-engages plan mode — the body `PLAN MODE — DO NOT WRITE CODE`
string is your only non-interactive enforcement, so always include it.

## Dev-QA auto-loop

After impl dispatch (status → `in-progress`), auto-dispatch QA without user confirm.
Max 3 attempts. Fail (cap) → `blocked` + user TODO. AUTH_REQUIRED → pause + auth todo.

State machine + chat trace + GUI integration → linked detail bookshelf.

## Session lifecycle

**Per-ticket fresh / per-turn resume.** On ticket close (`done|blocked|abandoned`), run
`jq '.current_task.persona_sessions = {}'` immediately (before `current_task = null`).
Next ticket's first dispatch = no `--session-id` (fresh). Within-ticket multi-turn
(plan→impl, QA retry) = `--resume "$SID"` OK.

## Chunking — per-call size

Split multi-area / multi-decision / multi-output directives per sub-area. Per-persona
ceilings + good/bad examples → linked detail. Rule: 1–2 artifacts per Designer call max.

## PRD delegation

Fresh idea → delegate Version 1 PRD direct (clarity loop subsumes discovery):
`PERSONA=pdt-designer · MODEL=opus · EFFORT=max · COMPLEXITY=L7`.
Designer returns `state:"needs-info"` (relay `next_question`) or `state:"ready"`
(PRD path + tickets + ambiguity_score + version_outcome). Hard cap 5 needs-info loops;
6th turn = ship "finalize" resume body. Full: `prd-clarity-loop.md` (designer bookshelf).
