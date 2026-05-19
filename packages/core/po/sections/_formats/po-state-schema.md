# `po-state.json` — canonical schema (v2)

Repo-local JSON at `./.productune/po-state.json`. Sessions scoped per **task**. Each top-level user request = one task with own persona session ids.

`schema_version: 2` (v1 → v2 introduced 2026-05-08 — Phase 5단 + ticket type rename + slim. Migration in `migrations/v1-to-v2.sh`.)

## Key paths

- `schema_version: 2` (top-level int — informational; migration is structure-presence based)
- `current_version`, `current_phase` (1..5), `phase_history[].{phase: 1..5, started_at, completed_at, summary, user_approved_at}` — current-version only; on Version close PO appends summary to retrospective md and clears
- `pending_gate?` *(deprecated GUI surface — T-P4-139; field retained for legacy compat; PO still writes/clears)* — `{from_phase: 1..5, to_phase: 2..5 (or null = terminal), summary, prompt, emitted_at}`
- `current_task.{ticket_id, slug, title, status, type, qa_status, qa_loops, assignee_persona, started_at, ended_at, request_summary, prd_path, branch, worktree_path}`
- `current_task.input.{prd_path, design_doc, brief_path, deps[]}` · `current_task.output.{changed_files[], design_doc, test_results}`
- `current_task.linked_tickets[]`, `artifacts[]`, `persona_sessions{}` (live only — dropped on ticket close), `persona_session_meta.<persona>.{turns, model_history, effort_history, complexity_level, confidence_history}` (live only — dropped on ticket close; per-turn audit lives in ticket md `## Persona Activity`)
- `current_task.calibration_outcome.{estimated_complexity, actual_complexity, qa_pass, qa_loops, user_rework_requested, escalation_triggered, notes}`
- ~~`past_tickets[]`~~ — **removed in v2** (ticket md = single source of truth). PO + GUI derive ticket lists by fs scan of `docs/tickets/**/*.md`. Revival match: `node scripts/po/scan-tickets.mjs <projectDir>` then jq filter on `slug` similarity.
- `versions[]` (cap 5 — older versions: see `outcome.retrospective_path` reference). Schema: `{id, started_at, ended_at, prd_anchor, outcome.{north_star, input_metrics[], validation_method, observed_result, retrospective_path}}`
- `recent_turns[]` (rolling 10, project-wide, task-independent — failure-pattern detection)

## `pending_promotions[]`

Persona-returned `promotion_candidates` queued for user approval (deferred surface). Lifecycle: `pending` → (`approved` | `dropped` | `edited`) on next turn-start prompt.

- `id` (string) — `promo-<YYYYMMDD>-<NNN>` (date + per-day sequence). Dedupe within same turn.
- `persona` (string) — `pdt-designer` / `pdt-developer` / `pdt-qa` / `pdt-wiki-keeper`.
- `turn_id` (string) — persona session turn marker at surface time (snapshot of `persona_session_meta.<persona>.turns`).
- `tier` (string) — `project` / `wiki` / `work-note` (drives mechanical-writes branch).
- `target` (string) — `tier=project`: file path · `tier=wiki`: graphiti `group_id` or keeper persona · `tier=work-note`: file path under `docs/<persona>/`.
- `delta` (string) — line to append (project / work-note) or episode body (wiki).
- `rationale` (string) — one-line reason shown in surface prompt.
- `status` (string) — `pending` / `approved` / `dropped` / `edited`.
- `surfaced_at` (ISO timestamp, optional) — when PO presented prompt.
- `decided_at` (ISO timestamp, optional) — when user response landed.
- `final_target` (string, optional) — populated on `status:"edited"` with user-revised target / delta payload actually written.

## Legacy + access patterns

Legacy keys (`past_tasks`, `past_tickets`, `current_round`, `rounds[]`, `stage:PRD|issue`, `current_task.stage`) read-compat one cycle; new code reads new keys first and falls back. `past_tickets` no longer written in v2; reads ignore. `current_task.stage` migrated to `current_task.type` in v2.

Pre-delegate: glance `recent_turns`. Persona ≥3 fails / last 5 → flag in Step 1 risk (`evolution.md`).
Post-turn: append outcome + bump `current_task.persona_session_meta.<persona>.turns` via `jq`. Never burn a Claude call. (Both `persona_sessions{}` and `persona_session_meta{}` dropped on ticket close — per-ticket audit lives in ticket md `## Persona Activity` table.)
