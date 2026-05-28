# Calibration — the model/effort feedback loop

Record every deviating delegation and let the history bias the next routing pick: read at
turn-open, write at task-close. This cross-project weight is separate from the in-version
`recent_turns` weight in `routing.md`.

Data: per-task live in `.productune/po-state.json :: current_task.calibration_outcome`
(drops with `current_task = null`); cross-project rolling in
`~/.productune/po/bookshelf/calibration-log.md`, 1 line per task.

## Read (turn open, mandatory)

Scan the last 10–20 entries. Match by 3-tuple `(persona, complexity_class, area_tag)` —
persona ∈ `pdt-{designer,developer,qa}`; complexity_class `L1-single`…`L7-net-new`;
area_tag = task domain (`auth`, `payments`, `refactor-cross-cut`, `prd-r1`, …). All 3 match →
high weight; 2/3 → moderate; 1/3 → ignore. Similar tasks historically needing estimate+1 →
start one notch higher. 3+ deviating entries on the same 3-tuple → auto +1 next dispatch.

## Write (task close, mandatory)

Append 1 line only when the task archives `done | blocked | abandoned` AND deviates (estimate
≠ actual OR escalation triggered OR user rework). Smooth pass (estimate == actual) → no entry.

```
- (YYYY-MM-DD) <persona> · <complexity_class> · <area_tag> · estimate=<model>/<effort> → actual=<model>/<effort> · QA <pass|fail>(<loops>) · rework=<y|n> · internal_redo=<n> · escalation=<none|skill|model|surface> · note: <one-line>
```

```
- (2026-04-29) pdt-developer · L6-multifile · auth-refactor · estimate=sonnet/medium → actual=opus/xhigh · QA pass(1) · rework=n · internal_redo=0 · escalation=model · note: cross-cutting needed opus
```

Field rules:
- `estimate` — your Step 1 first-call model/effort, before any recovery.
- `actual` — last actually-used. `actual=opus/max` implies a Step 1 choice (`max` never comes from recovery).
- `QA pass(N)` — final pdt-qa result + loop count. `n/a` for no-QA tasks.
- `rework=y` — user feedback demanded a redo ("redo" / "no good" — any lang); user-driven only, never a PO-internal redo.
- `internal_redo=<n>` — count of your own re-invocations (same persona/task) for spec mismatch; 0 if none.
- `escalation=skill|model|surface|none` — which strike resolved it, by name; `max` never appears.
- `note` — 1-line judgement.
- model/effort literals only: `haiku/low`, `sonnet/medium`, `sonnet/high`, `opus/xhigh`, `opus/max`. Never `default` / `normal` / `extended`.
- Plan-first tasks: log the impl phase's model/effort (the final substantive call).

Append (mechanical):

```bash
LINE="- ($(date -u +%F)) ..."   # fill per format
printf '%s\n' "$LINE" >> ~/.productune/po/bookshelf/calibration-log.md   # single append, no race
```

## Archive-rotate (cap 100 lines)

When `calibration-log.md` > 100 lines, clean at next turn open:
1. Same-3-tuple duplicates → keep the most recent.
2. Entries > 1 year → move to `## Model/Effort Calibration (archived)`.
3. Still > 100 → mark the oldest `[SUPERSEDED <date>]`.
