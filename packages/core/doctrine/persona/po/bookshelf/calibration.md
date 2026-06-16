# Calibration — the model/effort feedback loop

Read at turn-open, write at task-close. Per-project weight, separate from `routing.md`
`recent_turns`.

Data: per-task `.productune/po-state.json :: current_task.calibration_outcome` (drops with
`current_task = null`); per-project `docs/po/calibration-log.md` (Tier1, repo-relative — Read
tool works, no `$HOME`/`~` expand), 1 line/task.

Cross-cutting lessons (model behavior / harness quirk) are NOT calibration entries — promote them
to doctrine (routing/calibration bookshelf or common), not this log.

## Read (turn open, mandatory)

Scan last ~8 entries (routing bias only). Match by 3-tuple `(persona, complexity_class, area_tag)` —
persona ∈ `pdt-{designer,developer,qa}`; complexity_class `L1-single`…`L7-net-new`;
area_tag = task domain (`auth`, `payments`, `refactor-cross-cut`, `prd-r1`, …). 3/3 → high
weight; 2/3 → moderate; 1/3 → ignore. History needing estimate+1 → start one notch higher.
3+ deviating on same 3-tuple → feeds `routing.md` Step-up +1 next dispatch.

## Write (task close, mandatory)

Append 1 line only when task archives `done | blocked | abandoned` AND deviates (estimate
≠ actual OR escalation triggered OR user rework). Smooth pass → no entry.

```
- (YYYY-MM-DD) <persona> · <complexity_class> · <area_tag> · estimate=<model>/<effort> → actual=<model>/<effort> · QA <pass|fail>(<loops>) · rework=<y|n> · internal_redo=<n> · escalation=<none|skill|model|surface> [· lane=patch] [· deviation=<what>] · note: <one-line>
```

```
- (2026-04-29) pdt-developer · L6-multifile · auth-refactor · estimate=sonnet/medium → actual=opus/xhigh · QA pass(1) · rework=n · internal_redo=0 · escalation=model · note: cross-cutting needed opus
```

Field rules:
- `estimate` — Step 1 first-call model/effort, before recovery.
- `actual` — last actually-used. `actual=opus/max` implies a Step 1 choice (`max` never comes from recovery).
- `QA pass(N)` — final pdt-qa result + loop count. `n/a` for no-QA tasks.
- `rework=y` — user-driven redo only ("redo" / "no good" — any lang); never PO-internal.
- `internal_redo=<n>` — count of own re-invocations (same persona/task) for spec mismatch; 0 if none.
- `escalation=skill|model|surface|none` — which strike resolved it, by name; `max` never appears.
- `lane=patch` — present when the task went through the patch lane (`routing.md`).
- `deviation=<what>` — MANDATORY whenever a standard step was skipped or bypassed (`qa-skip` / `gate-waive` / `po-direct-edit` …). A skip logged as a clean success raises the prior for the next skip — never record a deviation as if the full procedure ran.
- `note` — 1-line judgement.
- model/effort literals only: `haiku/low`, `sonnet/medium`, `sonnet/high`, `opus/xhigh`, `opus/max`. Never `default` / `normal` / `extended`.
- Plan-first tasks: log impl phase's model/effort (final substantive call).

Append (mechanical):

```bash
LINE="- ($(date -u +%F)) ..."   # fill per format
printf '%s\n' "$LINE" >> docs/po/calibration-log.md   # project Tier1, single append, no race
```

## Archive-rotate (cap 100 lines)

When the project `docs/po/calibration-log.md` > 100 lines (per-project — rare), at next turn open:
1. Same-3-tuple duplicates → keep most recent.
2. Entries > 1 year → move to `## Model/Effort Calibration (archived)`.
3. Still > 100 → mark oldest `[SUPERSEDED <date>]`.
