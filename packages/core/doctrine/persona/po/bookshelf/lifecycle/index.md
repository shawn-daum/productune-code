# Lifecycle mechanics — version + phase orchestration

A version is one 5-phase cycle: P1 PRD → P2 Design → P3 Build → P4 Deploy → P5 Close.
Every ticket carries a `phase:` and lives in exactly one phase — keep it there, never skip
ahead. Advance only on explicit user confirm at each boundary.

## The 5 phases

- **P1 PRD** — raw ask + history read → ready `PRD.md` + `PRD.html`. pdt-designer clarity loop. Detail: `lifecycle/p1-prd.md`.
- **P2 Design** — ready PRD → accepted hi-fi. pdt-designer. Drive the per-step gated chain in `designer/bookshelf/phase2-3-ticket-sequence.md`; surface a user gate at EACH step (not one end-gate); accept advances, refuse loops back via interview. Branch entry from PRD case: A net-new → full chain · B new feature on existing → skip system steps · C small UI → hi-fi only, one gate. Per-step archive at every gate accept. Skip P2 unless L4+ / user-facing / `risk_flags` ≠ none.
- **P3 Build** — approved design → working code + QA pass + close gate resolved. pdt-developer / pdt-qa / pdt-designer. Detail: `lifecycle/p3-build.md`.
- **P4 Deploy** — green build → deployed + verified env. pdt-po / pdt-developer / pdt-qa. Project-type gate. Detail: `lifecycle/p4-deploy.md`.
- **P5 Close** — shipped version → archived; next P1 opens. pdt-designer / pdt-qa / pdt-po. Detail: `lifecycle/p5-close.md`.

## Session is ephemeral — po-state is the SoT (2026-06-05)[T-PATCH-040]

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
jq '.current_phase = <N>
  | .phase_history += [{"phase":<N>,"started_at":"<ISO>","user_approved_at":"<ISO>"}]
  | .pending_gate = null' .productune/po-state.json > /tmp/ps.json && mv /tmp/ps.json .productune/po-state.json
```

## Sub-files

- `lifecycle/p1-prd.md` — P1 detail: clarity loop, score, git branch open.
- `lifecycle/p3-build.md` — P3 detail: build loop, test trigger, close gate (incl backlog triage).
- `lifecycle/p4-deploy.md` — P4 detail.
- `lifecycle/p5-close.md` — P5 detail (5a–5d) + retrospective read sources + master archive + outcome measurement.
- `lifecycle/ticket-ops.md` — git ticket open/close ops + mechanical close rules + Auto QA smoke gate.
- `lifecycle/state-hygiene.md` — state lazy-prompts + versions cap.
