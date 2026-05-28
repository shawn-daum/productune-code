# Delegation — persona dispatch + plan mode

Never author persona output — dispatch it.

## Invocation channel

- `claude --agent pdt-<persona>` (first call) / `--resume "$SID"` (intra-ticket).
- UUIDs are strict **8-4-4-4-12 lowercase hex**: never prefix, never self-generate. The first call omits `--session-id` (Claude returns it); a resume passes `--resume "$SID"`. Mixing is rejected.
- The `post-delegate-state-write` hook (`PostToolUse(Bash)`) captures the session id, sets `persona_session_meta.<persona>.last_seen`, merges `recent_turns`, unions `artifacts` — don't duplicate that.

## Dispatch runtime envelope

Agent frontmatter carries only `name` + `description` (required for Claude Code to load the agent); the body just points to its habit. Supply runtime config per dispatch:
- **model + effort** → from routing (`--model`; see `routing.md`).
- **write grant** → `--permission-mode acceptEdits` for authoring personas (designer / developer); QA needs none.
- **QA UI smoke** → add `--mcp-config ~/.productune/mcp/playwright.json` (Playwright MCP).

Per-persona tool sandboxing is NOT CLI-enforced — role limits live in each persona habit (write-scope + refusal).

## Write these (the hook can't infer)

You own only two writes: the pre-dispatch `current_task` open, and the ticket lifecycle frontmatter.

- Open `current_task` with a semantic `slug` + `request_summary` + `artifacts` *before* dispatch (else the hook auto-creates an `auto-<ts>` slug and `pre-delegate-task-check` blocks). Use `jq`.
- Update `docs/tickets/<version>/T-NNN.md` lifecycle metadata only — status · timestamps · duration · assignee · routing · model · effort · progress refs. No body / scope edits.
- Read the SID from `current_task.persona_sessions.<persona>` to resume.

`session_id`, `persona_session_meta.<persona>.last_seen`, `recent_turns`, and the `artifacts` merge are hook-written — never hand-write or duplicate them.

## Task body

- Pass a `[ctx]` inline JSON line: slug · request_summary · artifacts · version · prd_path · persona_sessions · next_ticket_id · user_knowledge_state. The persona then skips its state re-read.
- Inspect the returned `confidence` + `unresolved`; low / non-empty → escalate (`escalation.md`).

## Designer Plan-row sync

Ticket `## Plan` is Designer-authored — never edit Plan rows. If a delegation ships plan changes, mirror only the lifecycle frontmatter (status, model, effort, ts); body diffs surface via the Designer `summary` → append a 1-line entry to `## Persona Activity`.

## Plan mode — L5+ plan-only

Run L5+ as plan-first → review → impl:

1. **Plan call** — Developer/Designer PLAN ONLY, opus / xhigh. Body opens `PLAN MODE — DO NOT WRITE CODE` + Goal · Constraints · Acceptance; `changed_files` must be empty.
2. **Review** — check testability + acceptance + architecture + risk (opus / xhigh; opus / max if risk-flagged). Verdict `OK` or `revise:[...]`.
3. **Plan revise** — resume the same session, plan only. 3+ iterations → surface (proceed / re-PRD / strong-implement).
4. **Impl** — dev sonnet / high, plan as the task's first line. Self-verify mandatory.
5. **Failure regress** — a self-verify / QA fail after a model-up recovery retry (`escalation.md`) → back to plan (opus / xhigh) + re-review; set `escalation_triggered=true`; bump `actual_complexity`.

Trigger on L≥5, multi-file / cross-cutting, a risk flag, or user request. L1–L3 trivials skip straight to sonnet / medium impl. Optional high-stakes cross-review: pdt-qa testability, pdt-designer UX/DS/copy. `claude --print` never auto-engages plan mode, so the `PLAN MODE — DO NOT WRITE CODE` line is the only non-interactive enforcement — always include it.

## Dev-QA auto-loop

After an impl dispatch, auto-dispatch QA (no user confirm); cap 3 attempts; fail at cap → `blocked` + user TODO (`AUTH_REQUIRED` → pause + auth todo). Full mechanics: `bookshelf/lifecycle-mechanics.md` (Auto QA smoke gate).

## Session lifecycle

Per-ticket fresh, per-turn resume. On ticket close (`done | blocked | abandoned`), run `jq '.current_task.persona_sessions = {}'` before nulling `current_task`. The next ticket's first dispatch is fresh (no `--session-id`); within-ticket multi-turn (plan→impl, QA retry) uses `--resume "$SID"`.

## Chunking — per-call size

Split multi-area / multi-decision / multi-output directives per sub-area; max 1–2 artifacts per Designer call.

## PRD delegation

Fresh idea → delegate the Version 1 PRD directly (the clarity loop subsumes discovery): `PERSONA=pdt-designer · MODEL=opus · EFFORT=max · COMPLEXITY=L7`. Designer returns `state:"needs-info"` (relay `next_question`) or `state:"ready"` (PRD path + tickets + ambiguity_score + version_outcome). Hard cap 5 needs-info loops; the 6th turn ships a "finalize" resume body. Full: `designer/bookshelf/prd-clarity-loop.md`.
