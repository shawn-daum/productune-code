# Ticket md frontmatter schema

`docs/tickets/<version>/T-NNN.md` frontmatter (Designer-authored unless marked PO).

## Required

`ticket_id`, `version`, `slug`, `type`, `status` (PO mechanical), `assignee`, `created_at`, `estimated_complexity`, `risk_flags`.

## Optional/derived

- `started_at` / `completed_at` / `duration_min` — PO mechanical.
- `branch` / `worktree_path` — git-workflow R2 at ticket open.
- `qa_status` / `qa_loops` — PO mechanical, impl/refactor only. `qa_status ∈ pending|pass|fail`.
- `success_metric` / `validation_method` — Designer, optional when measurable.
- `observed_result` — PO mechanical at Phase 5.

## `version:` field format rule (T-P4-086)

Value MUST match `^v\d+(\.\d+)?(-[\w-]+)?$` — full semantic slug from `poState.versions[].id` (e.g. `v1`, `v0.1`, `v0.4-meta-dogfood`). Exception: artificial archive ids (e.g. `legacy/phase3-fixes`) also allowed — mark with `legacy: true` in frontmatter. Lint: `packages/gui/scripts/check-ticket-version.mjs` — available for project-level use with `--project-dir <path>`.

## Ticket emit sequence — version stamp (T-P4-086 sub-c)

When Designer emits new ticket md, if `version:` absent or empty, PO mechanical-writes `poState.current_version` into frontmatter immediately after delegation (post-delegate hook). Verification: `jq -r '.current_version' .productune/po-state.json` → stamp into ticket `ticket_id` line + 1.

## Body sections

`# T-NNN: <title>` · mirrored header line · `## Request` · `## Inputs` · `## Acceptance` · `## Out of scope` · `## Persona Activity` (PO-managed table).

Designer owns scope-defining sections; PO touches only lifecycle / mirrored header / Persona Activity rows. `type:deploy` body uses `## Steps` (see `pdt-po.md`).
