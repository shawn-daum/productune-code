# Lifecycle mechanics — version + phase orchestration

A version is one 5-phase cycle: P1 PRD → P2 Design → P3 Build → P4 Deploy → P5 Close.
Every ticket carries a `phase:` and lives in exactly one phase — keep it there, never skip
ahead. Advance only on explicit user confirm at each boundary.

## The 5 phases

- **P1 PRD** — raw ask + history read → ready `PRD.md` + `PRD.html`. pdt-designer clarity loop. Detail: `lifecycle/p1-prd.md`.
- **P2 Design** — ready PRD → accepted design (S5 hi-fi conditional; T-PATCH-225). pdt-designer. On entry, pick the branch THEN emit the branch's `phase: 2` design tickets BEFORE running the chain — P2 ticketless = violation (statusline/GUI count phase-2 tickets; T-PATCH-118). Drive the per-step gated chain in `designer/bookshelf/phase2-3-ticket-sequence.md`; surface a user gate at EACH step (not one end-gate); accept advances, refuse loops back via interview. Branch entry = PRD case × version delta: full chain A only on net-new / major bump (or PRD-explicit DS overhaul + user-confirmed escalation) · minor bump on existing DS → B default (2–3 key screens, skip system steps) · patch/small UI → C (S5 only — required in C, not skippable; S5 skip is an A/B-only option) (T-PATCH-119/225). Per-step archive at every gate accept. Skip P2 unless L4+ / user-facing / `risk_flags` ≠ none.
- **P3 Build** — approved design → working code + QA pass + close gate resolved. pdt-developer / pdt-qa / pdt-designer. Detail: `lifecycle/p3-build.md`.
- **P4 Deploy** — green build → deployed + verified env. pdt-po / pdt-developer / pdt-qa. Project-type gate. Detail: `lifecycle/p4-deploy.md`.
- **P5 Close** — shipped version → archived; next P1 opens. pdt-designer / pdt-qa / pdt-po. Detail: `lifecycle/p5-close.md`.

## Session is ephemeral — po-state is the SoT

The claude session backing a PO is throwaway. po-state (`version` / `phase` / `current_task` / `persona_sessions` / `recent_turns`) carries all continuity. Every turn, re-orient from po-state — never trust in-session memory to still hold the latest doctrine or work-state.

Run a fresh cycle (drop the resume id → next turn starts via `claude --agent pdt-po`, then re-read doctrine + re-orient from po-state) on these triggers:

- **Phase boundary** — cycle at every base phase transition.
- **Session over threshold** — when a Build session crosses its turn/context threshold (set below the compaction limit so compaction is only the last-resort net), cycle at the **next safe boundary** (ticket done / dev-QA loop end). Never cut mid-work.
- **Manual "new session"** — honor the user's explicit reset.
- **Doctrine changed** — on a doctrine edit, cycle (or notify) so the fresh session loads it.

The chat stream stays continuous across a cycle — only the session id rotates; the visible conversation does not break.

## Phase transition write

On user approval (chat reply):
```bash
jq --argjson N <N> --arg now "<ISO>" '
  .current_phase = $N
  | .phase_history += [{"phase":$N,"started_at":$now,"user_approved_at":$now}]
  | .pending_gate = null
  | ._phase_schema_v = 3
  | .close_gate = []' .productune/po-state.json > /tmp/ps.json && mv /tmp/ps.json .productune/po-state.json
```

`close_gate` = ordered checklist; each item `{step, status: pending|done|waived|na, waivable, type?, ticket_id?}` — `type` (design|qa) present only when the step opens a typed close ticket. Definition SoT = `p3-build.md`; never enumerate gate steps here.
Entry sets `.close_gate = []` and does NOT carry the executable literal — the 4-step array lives in the shared file `$HOME/.productune/config/close-gate.p3.json` and is materialized by the gate hooks (`prompt-gate-inject.sh` at turn-open, `pre-phase-gate-guard.sh` before any phase write) with the turn-open sweep (`lifecycle/state-hygiene.md`) as the doctrine-level backstop. All sites read the same literal and heal both `[]` and absent — so jq write + GUI `phase:approve` entry paths converge.

## Phase / gate boundary answer

Answering "which phase / what's the close gate": state `current_phase` FIRST, then report `close_gate` items verbatim from po-state — read the gate for the current/entering phase only, never an adjacent phase. po-state is the answer source; never recall the gate from session memory.

## Sub-files

- `lifecycle/p1-prd.md` — P1 detail: clarity loop, score, git branch open.
- `lifecycle/p3-build.md` — P3 detail: build loop, test trigger, close gate (incl backlog triage).
- `lifecycle/p4-deploy.md` — P4 detail.
- `lifecycle/p5-close.md` — P5 detail (5a–5d) + retrospective read sources + master archive + outcome measurement.
- `lifecycle/ticket-ops.md` — git ticket open/close ops + mechanical close rules + Auto QA smoke gate.
- `lifecycle/state-hygiene.md` — state lazy-prompts + versions cap.

## po-state shape — schema_version 2 (2026-06-15, reconciled 2026-06-16) [T-PATCH-139/154]

Stamp `schema_version: 2` on every po-state you author, and keep the file slim — hold only `schema_version`, `version`, `phase`, `current_task`, `persona_sessions`, `recent_turns`. EXCEPTION: an ACTIVE `current_task` MAY carry ephemeral work-state scratch (named keys `progress`/`decisions`/`next`/`carry`/`plan`, per `delegation.md`) — same-session cache, NOT authoritative; brief (`briefs/<slug>.md`) = durable SoT, scratch vanishes at close (`current_task → null`). NEVER write a `past_tickets` array: closed-ticket history reads only from `docs/tickets/<version>/T-NNN.md`, the single source of truth. Keep this `schema_version` (po-state shape) distinct from `config.json` `schema_v` (migration framework) — never advance one to match the other.
