# Lifecycle mechanics

PO-mechanical operations on tickets through their lifecycle. Cross-cutting policy that spans all ticket types. Read by PO before delegating, before close, and at Phase 5 retrospective.

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
- `## Outcome` is content; delegate to Designer if product meaning is needed.
- **QA gate close check** (impl / refactor): dev reports `ready_for_qa` → PO calls smoke gate → updates `qa_status`. `pass` allows `done`; `fail` resumes dev + `qa_loops += 1`; `qa_loops ≥ 3` → `blocked`. Other stages skip the check.

Version close → mechanical status / backfill sweep. Outcome text needed → single Designer call: `"Version <id> closed. Append ## Outcome summaries from version's tickets without changing scope/AC."`

## Outcome measurement (B.1 — PDS See layer)

Two append-only layers; neither blocks lifecycle.

**Per-ticket** (optional frontmatter): `success_metric`, `validation_method` — Designer-set at creation when ticket has measurable user outcome. `observed_result` — PO fills at Phase 5. Most tickets stay null (UI tweaks, dev infra have no metric).

**Per-Version** (required, in `versions[].outcome`): `north_star`, `input_metrics[]`, `validation_method` — Designer derives from PRD `## Success metrics` slot at PRD-ready time, emits via `version_outcome` in ready-turn JSON; PO mirrors into state. `observed_result`, `retrospective_path` — PO fills at Phase 5.

PRD body stays free-form prose; structured emit is the JSON field, not edits to the PRD.

## Lazy measurement protocol

When `validation_method` requires external data (PostHog / Sentry / GA / etc), Phase 5 leaves `observed_result: null`. Designer asks user during the next Version's Phase 1 PRD authoring — measurement happens just-in-time for hypothesis re-evaluation. PO never reminds. User who never starts a next Version → measurement never runs (correct — no signal needed).

## retrospective.md template

`docs/retrospectives/<version>.md`, written by Designer in Phase 5 step 5c (sonnet + medium):

```markdown
# Retrospective — <version>

**Period**: YYYY-MM-DD ~ YYYY-MM-DD  **PRD**: docs/prd/<slug>.md  **Tickets**: <N> done / <M> blocked

## Outcome
- north_star: <target> → <observed | "pending next Version"> [hit / miss / ?]
- input metrics:
  - <metric>: <observed | pending>

## What worked
- ...

## What didn't
- area X: <fail pattern>, N cumulative loops (cross-Version)

## Carry to next Version
- deferred from this Version: ...
- new test ticket candidate: area Y (≥3 cumulative fails)
- new hypothesis: ...

## Approved doctrine promotions (this Version)
- pdt-<persona> · project · `docs/<persona>/<file>.md`: "<delta>" (decided <date>)
- pdt-<persona> · wiki · <target>: "<episode_name>" (decided <date>)

## Repeated patterns
- recent_turns: <persona> ≥3 fails on `<area-tag>` (last <N> turns)
- fail-patterns: `<area>` cumulative <M> across versions
- po-memory pushback: "<verbatim>" (≥2 occurrences)

## Surfaced for next Version
- dropped/deferred promotions: list (next Phase 1 disposition input)
```

## Retrospective read sources (no new persona calls)

5a/5b/5c/5d sub-steps **read stored memory**, never spawn fresh persona analysis. Allowed sources:

1. **project notes** — `docs/{designer,developer,qa}/project-notes.md` + `decisions.md` (approved promotions land here)
2. **po-state recent_turns** — rolling 10 (failure pattern detection)
3. **wiki / Graphiti persona lessons** — `mcp__graphiti__search_memory_facts` (graphiti) or wiki-keeper SEARCH (keeper) or `~/.productune/wiki/persona-<x>/INDEX.md` (fs)
4. **po-memory** — `~/.productune/po-memory.md` `## Model/Effort Calibration` + `## Product taste` + `## Recent corrections / to-avoid`
5. **approved-promotion archive** — `pending_promotions[]` filtered `status ∈ {approved, edited}` ∧ `decided_at ∈ [version.started_at, version.ended_at]`. New audit source — captures what user actually accepted into doctrine this Version.

Persona invocation in 5a/5b/5c is for *synthesis* of these reads, not fresh analysis. 5d is fully mechanical.

## Phase 5 retrospective sequence (PO orchestrates)

Per-step detail lives in each persona file (5a/5c in `pdt-designer.md`, 5b in `pdt-qa.md`, 5d in `pdt-po.md`). PO runs in order. **Reads** column = source set from above (1-5).

| Step | Persona | Model/Effort | Reads | Output |
|---|---|---|---|---|
| 5a | `pdt-designer` | opus + xhigh | 1, 2, 3, 5 | fill outcome.observed_result if measurable now (lazy: null otherwise); append `feature-history.md`; propose next-V backlog |
| 5b | `pdt-qa` | opus + xhigh | 1, 2, 3, 5 | aggregate this V's `fail-patterns.md`; cross-V trend; propose next-V `type:test` candidates |
| 5c | `pdt-designer` | sonnet + medium | 1, 4, 5 + 5a/5b ctx | write `docs/retrospectives/<version>.md` from 5a + 5b ctx + read sources |
| 5d | PO | mechanical | 4, 5 | append calibration log; mirror `retrospective_path`; surface to user with next-V candidates + dropped promotions |
