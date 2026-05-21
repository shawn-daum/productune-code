# Lifecycle mechanics

PO-mechanical operations on tickets through their lifecycle. Cross-cutting policy spanning all ticket types. Read by PO before delegating, before close, and at Phase 5 retrospective.

## Phase transition mechanical write

GUI [Approve →] click → `phase:approve` IPC → direct `po-state.json` mechanical write (`current_phase` ++, `phase_history` append, `pending_gate = null`). PO script `jq` write path = equivalent; either suffices. Manual `jq` bypass:

```bash
jq '.current_phase = <N> | .phase_history += [{"phase":<N>,"started_at":"<ISO>","user_approved_at":"<ISO>"}] | .pending_gate = null' .productune/po-state.json > /tmp/ps.json && mv /tmp/ps.json .productune/po-state.json
```

## PO mechanical wiki write

PO = sole executor via `claude --print` (no `--agent`) subprocess. Subagent path retired — claude code 2.1.142 MCP non-inheritance + agent whitelist tool-name resolution structurally non-functional. See `po-instructions.md` `## CAN (mechanical only)` for top-level rationale.

Preconditions + bash invocation template + `source_description` auto-gen + job tracking + "what PO does NOT do" → **`sections/_formats/wiki-write-template.md`**.

## Auto QA smoke gate (impl / refactor close condition)

User-facing breakage (broken routing, blank pages, console errors, broken navigation) must never reach the user.

- Tool: Playwright / Chromium MCP / headless browser per allowlist. Non-UI changes: build / typecheck / related unit tests.
- Coverage: route load, basic navigation, no console errors, sanity check on testable Acceptance items.
- Budget: ≤ 1 min. Not a full test plan.
- Fail loop: dev resume + fail excerpt; max 3 retries; beyond → `blocked` + user surface.
- Pass: ticket `done` allowed; 1 row appended to `## Persona Activity`.

`type:test` / `type:qa` are themselves QA work — no extra gate. `type:design` self-verifies. `type:deploy` verifies per-step (no smoke gate).

## Mechanical close rules

- `todo → in-progress`: set `started_at` if empty.
- `in-progress | review → done | blocked | abandoned`: set `completed_at`; compute `duration_min` if `started_at` present.
- Status transition: update frontmatter + mirrored header.
- `assignee` / routing / session refs: metadata only.
- `branch` / `worktree_path`: set on open; never cleared (history).
- `## Outcome` = content; delegate to Designer if product meaning needed.
- **QA gate close check** (impl / refactor): dev reports `ready_for_qa` → PO calls smoke gate → updates `qa_status`. `pass` allows `done`; `fail` resumes dev + `qa_loops += 1`; `qa_loops ≥ 3` → `blocked`. Other stages skip the check.

Version close → mechanical status / backfill sweep. Outcome text needed → single Designer call: `"Version <id> closed. Append ## Outcome summaries from version's tickets without changing scope/AC."`

## Outcome measurement (B.1 — PDS See layer)

Two append-only layers; neither blocks lifecycle.

**Per-ticket** (optional frontmatter): `success_metric`, `validation_method` — Designer-set at creation when ticket has measurable user outcome. `observed_result` — PO fills at Phase 5. Most tickets stay null (UI tweaks, dev infra have no metric).

**Per-Version** (required, in `versions[].outcome`): `north_star`, `input_metrics[]`, `validation_method` — Designer derives from PRD `## Success metrics` slot at PRD-ready time, emits via `version_outcome` in ready-turn JSON; PO mirrors into state. `observed_result`, `retrospective_path` — PO fills at Phase 5.

PRD body stays free-form prose; structured emit = JSON field, not edits to PRD.

## Lazy measurement protocol

When `validation_method` requires external data (PostHog / Sentry / GA / etc), Phase 5 leaves `observed_result: null`. Designer asks user during the next Version's Phase 1 PRD authoring — measurement happens just-in-time for hypothesis re-evaluation. PO never reminds. User who never starts a next Version → measurement never runs (correct — no signal needed).

## retrospective.md template

`docs/retrospectives/<version>.md`, written by Designer in Phase 5 step 5c (sonnet + medium). Full template → **`sections/_formats/retrospective-md.md`**.

## Retrospective sources + Phase 5 sequence

5a/5b/5c/5d sub-steps **read stored memory** (5 source classes: project notes, recent_turns, graphiti/wiki, po-memory, approved-promotion archive), never spawn fresh persona analysis. PO orchestrates 4-step sequence; per-step persona file owns detail.

Full detail (5 read sources + 4-step orchestration table) → **`sections/_details/phase5-retrospective.md`**.
