# Delegation — persona dispatch + plan mode

Never author persona output — dispatch it.

## Invocation channel

- Dispatch FOREGROUND / synchronous — wait, never background (nested `claude --agent` deadlocks). Read the result envelope from stdout.
- Portable form (first call): `claude --add-dir ~/.productune -p --agent pdt-<persona> --permission-mode acceptEdits --model <tier> "<[ctx] + task>"`. `--add-dir` FIRST.
- `--resume "$SID"` for an intra-ticket follow-up (same session: plan→impl / QA retry).
- UUIDs strict **8-4-4-4-12 lowercase hex**: never prefix, never self-generate. First call omits `--session-id`; resume passes `--resume "$SID"`. Mixing rejected.
- `post-delegate-state-write` hook (`PostToolUse(Bash)`) writes `session_id`, `persona_session_meta.<persona>.last_seen`, `recent_turns` merge, `artifacts` union — never hand-write or duplicate.
- Shell safety: a double-quoted task string lets the shell interpret backticks / `$()` / `<...>` → parse error, claude never runs (a few eval-error lines, zero src changes). Single-quote the prompt or strip those characters. After dispatch, an empty `git status` diff = failed-dispatch signal — check first.

## Dispatch runtime envelope

The worker's habit tiers (0 common+persona / 1 project / 2 personal) are HOOK-INJECTED at its session start — the task body carries ONLY per-dispatch context (`[ctx]` + the task itself). Never paste doctrine, habits, or standing rules into a dispatch: they are already in the worker's context, and duplication wastes tokens + risks drift. Supply per dispatch:
- **model + effort** → `routing.md` (always pass `--model`).
- **write grant** → `--permission-mode acceptEdits` for authoring personas (designer / developer); QA needs none.
- **QA UI smoke** → add `--mcp-config ~/.productune/mcp/playwright.json` (Playwright MCP).

Per-persona tool sandboxing is NOT CLI-enforced — role limits live in each persona habit (write-scope + refusal).

## Write these (the hook can't infer)

You own two writes: the pre-dispatch `current_task` open + the ticket lifecycle frontmatter.

- Open `current_task` with a semantic `slug` + `request_summary` + `artifacts` *before* dispatch (else `pre-delegate-task-check` blocks on an `auto-<ts>` slug). Use `jq`.
- Update `docs/tickets/<version>/T-NNN.md` lifecycle metadata only — status · timestamps · duration · assignee · routing · model · effort · progress refs. No body / scope edits.
- Read the SID from `current_task.persona_sessions.<persona>` to resume.

## Task body

- Pass a `[ctx]` inline JSON line: slug · request_summary · artifacts · version · prd_path · persona_sessions · next_ticket_id · user_knowledge_state · **user_lang** (BCP-47) · **audience** (`user` | `internal`). Persona then skips its state re-read + keys language/format off audience.
- `user_lang` source = `$HOME/.productune/settings.json` `.ui.language`; PO reads it by resolving `$HOME` + `cat`/`jq` via Bash (never Read the literal `~`/guess home) + passes it.
- Never hand-author a persona-owned write path — pass inputs only; the persona applies its own write-map (`docs/artifacts/<version>/<id|slug>.<ext>`). Holds for ad-hoc delegation too.
- External resources: verify every external URL BEFORE injecting it into `[ctx]` — HEAD status + magic-byte / file-size sanity. Never pass a guessed URL; a 404 stub fetched downstream poisons the artifact silently.
- Inspect returned `confidence` + `unresolved`; low / non-empty → escalate (`escalation.md`).

## User-question channel

`AskUserQuestion` is PO-only. Subagents return `state:"needs-info"` + `next_question` (single string, ≤200 chars); PO renders it in `user_lang`, appends the answer to `briefs/<slug>.md`, resumes via `--resume "$SID"`. A subagent invoking `AskUserQuestion` directly = doctrine violation → log a `promotion_candidates[]`.

## Designer Plan-row sync

Ticket `## Plan` is Designer-authored — never edit Plan rows. A delegation shipping plan changes mirrors only lifecycle frontmatter (status, model, effort, ts); body diffs surface via the Designer `summary` → append a 1-line `## Persona Activity` entry.

## Design-sequence dispatch — never ad-hoc (2026-06-12) [T-PATCH-128]

Any dispatch that touches the design sequence — including a mid-build DS redo after the user
rejects an adopted design system — NAMES the entry step (S1 for a DS rework) and instructs the
Designer to run `designer/bookshelf/phase2-3-ticket-sequence.md`. Never frame it ad-hoc ("redo
the design system") — that path skips the anchor selection pipeline. On the Designer's S1 return,
check anchor provenance is present per proposal (`anchor: <slug>.md` · 1-line identity · what was
adapted). Missing → bounce back to the Designer before surfacing anything to the user.

## Plan mode — L5+ plan-only

Run L5+ plan-first → review → impl:

1. **Plan call** — Developer/Designer PLAN ONLY, opus / xhigh. Body opens `PLAN MODE — DO NOT WRITE CODE` + Goal · Constraints · Acceptance; `changed_files` empty.
2. **Review** — testability + acceptance + architecture + risk (opus / xhigh; opus / max if risk-flagged). Verdict `OK` or `revise:[...]`.
3. **Plan revise** — resume same session, plan only. 3+ iters → surface (proceed / re-PRD / strong-implement).
4. **Impl** — dev sonnet / high, plan as the task's first line. Self-verify mandatory.
5. **Failure regress** — self-verify / QA fail after a model-up recovery retry (`escalation.md`) → back to plan (opus / xhigh) + re-review; set `escalation_triggered=true`; bump `actual_complexity`.

Trigger on L≥5, multi-file / cross-cutting, a risk flag, or user request. L1–L3 trivials skip to sonnet / medium impl. Optional cross-review: pdt-qa testability, pdt-designer UX/DS/copy. `claude --print` never auto-engages plan mode, so the `PLAN MODE — DO NOT WRITE CODE` line is the only non-interactive enforcement — always include it.

## Dev-QA auto-loop

After an impl dispatch, auto-dispatch QA (no user confirm). Full mechanics + cap / blocked: `bookshelf/lifecycle/ticket-ops.md` (Auto QA smoke gate). `AUTH_REQUIRED` is a distinct blocked sub-type: a fail at cap whose excerpt signals an auth wall → `pause` + emit a user `auth todo` (not the generic surface).

## Session lifecycle

Per-ticket fresh, per-turn resume. On ticket close (`done | blocked | abandoned`), run `jq '.current_task.persona_sessions = {}'` before nulling `current_task`. Next ticket's first dispatch is fresh; within-ticket multi-turn uses `--resume "$SID"`.

## Chunking — per-call size

Split multi-area / multi-decision / multi-output directives per sub-area; max 1–2 artifacts per Designer call.

## PRD delegation

Fresh idea → delegate the Version 1 PRD directly: `PERSONA=pdt-designer · MODEL=opus · EFFORT=max · COMPLEXITY=L7`. Designer returns `state:"needs-info"` (relay `next_question`) or `state:"ready"` (PRD path + tickets + ambiguity_score + version_outcome). Full mechanics incl 5-iter cap + finalize: `designer/bookshelf/prd-clarity-loop.md`.
