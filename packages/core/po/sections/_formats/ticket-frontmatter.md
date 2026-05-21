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
- `plan_path:` — **DEPRECATED**. Plan content now embedded as `## §Plan`
  in ticket body. Field removed from new tickets; stripped from existing tickets by
  migration script.

## `version:` field format rule

Value MUST match `^v\d+(\.\d+)?(-[\w-]+)?$` — full semantic slug from `poState.versions[].id` (e.g. `v1`, `v0.1`, `v0.4-meta-dogfood`). Exception: artificial archive ids (e.g. `legacy/phase3-fixes`) also allowed — mark with `legacy: true` in frontmatter. Lint: `packages/gui/scripts/check-ticket-version.mjs` — available for project-level use with `--project-dir <path>`.

## Ticket emit sequence — version stamp

When Designer emits new ticket md, if `version:` absent or empty, PO mechanical-writes `poState.current_version` into frontmatter immediately after delegation (post-delegate hook). Verification: `jq -r '.current_version' .productune/po-state.json` → stamp into ticket `ticket_id` line + 1.

**Folder rule**: ticket file path = `docs/tickets/<version>/T-NNN.md` where `<version>` = `po-state.current_version`. Designer creates folder `docs/tickets/<version>/` automatically if absent when writing the first ticket of that version. Consistent with artifact versioning — same `<version>` slug governs both `docs/artifacts/<version>/` and `docs/tickets/<version>/` buckets.

## Body sections

`# T-NNN: <title>` · mirrored header line · `## Request` (or `## §1 Request`) ·
`## §Plan` (optional inline plan — replaces external `plan_path:` doc) · `## Inputs` ·
`## Acceptance` · `## Out of scope` · `## Persona Activity` (PO-managed table).

Designer owns scope-defining sections; PO touches only lifecycle / mirrored header / Persona Activity rows. `type:deploy` body uses `## Steps` (see `pdt-po.md`).
