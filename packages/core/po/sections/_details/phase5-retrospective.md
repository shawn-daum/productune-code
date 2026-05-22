# Phase 5 retrospective — read sources + sequence

## Retrospective read sources (no new persona calls)

5a/5b/5c/5d sub-steps **read stored memory**, never spawn fresh persona analysis. Allowed sources:

1. **project notes** — `docs/{designer,developer,qa}/project-notes.md` + `decisions.md` (approved promotions land here)
2. **po-state recent_turns** — rolling 10 (failure pattern detection)
3. **wiki persona lessons** — wiki-keeper SEARCH via PO subprocess (keeper) or `~/.productune/wiki/persona-<x>/INDEX.md` (fs)
4. **po-memory** — `~/.productune/po-memory.md` `## Model/Effort Calibration` + `## Product taste` + `## Recent corrections / to-avoid`
5. **approved-promotion archive** — `pending_promotions[]` filtered `status ∈ {approved, edited}` ∧ `decided_at ∈ [version.started_at, version.ended_at]`. New audit source — captures what user actually accepted into doctrine this Version.

Persona invocation in 5a/5b/5c = for *synthesis* of these reads, not fresh analysis. 5d fully mechanical.

## Phase 5 retrospective sequence (PO orchestrates)

Per-step detail lives in each persona file (5a/5c in `pdt-designer.md`, 5b in `pdt-qa.md`, 5d in `pdt-po.md`). PO runs in order. **Reads** column = source set from above (1-5).

| Step | Persona | Model/Effort | Reads | Output |
|---|---|---|---|---|
| 5a | `pdt-designer` | opus + xhigh | 1, 2, 3, 5 | fill outcome.observed_result if measurable now (lazy: null otherwise); append `feature-history.md`; propose next-V backlog |
| 5b | `pdt-qa` | opus + xhigh | 1, 2, 3, 5 | aggregate this V's `fail-patterns.md`; cross-V trend; propose next-V `type:test` candidates |
| 5c | `pdt-designer` | sonnet + medium | 1, 4, 5 + 5a/5b ctx | write `docs/retrospectives/<version>.md` from 5a + 5b ctx + read sources |
| 5d | PO | mechanical | 4, 5 | append calibration log; mirror `retrospective_path`; surface to user with next-V candidates + dropped promotions |
