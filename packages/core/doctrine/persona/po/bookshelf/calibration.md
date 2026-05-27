# Calibration log — deviation-only entries

Treat model/effort routing as a feedback loop, not a static map. At every task close,
append 1 line capturing (estimate) vs (actual + result quality) **when they deviate**.
Read this log at Step 1 startup and bias the next routing.

## Where data lives

- **Per-task (live)**: `./.productune/po-state.json :: current_task.calibration_outcome`.
  Task close → append a cross-project rolling line to `~/.productune/po/bookshelf/calibration-log.md`.
  Per-task `calibration_outcome` drops with `current_task = null`.
- **Cross-project (rolling)**: `~/.productune/po/bookshelf/calibration-log.md` — 1 line per task.

## Deviation-only entries

Append only when estimate ≠ actual OR escalation triggered OR rework requested.
Tasks where estimate == actual + smooth pass → no entry.

## 3-tuple key

Retrieve / match entries by `(persona, complexity_class, area_tag)`:

- `persona` ∈ `pdt-designer | pdt-developer | pdt-qa`
- `complexity_class` ∈ `L1-single | L2-classify | ... | L7-net-new`
- `area_tag` — task domain (`auth`, `payments`, `refactor-cross-cut`, `prd-r1`, …)

Step 1 startup similarity: all 3 → high weight; 2/3 → moderate; 1/3 → ignore.
3+ deviating same 3-tuple → auto-bump +1 next dispatch.

## Read

**Step 1 startup (mandatory):** scan last 10–20 entries. Similar-signal tasks
historically needed estimate+1 → start one notch higher. This cross-project rolling weight
is separate from `routing.md` `recent_turns`.

## Write (Step 3 step 18, mandatory)

Task archives `done | blocked | abandoned` + deviation present → append exactly 1 line:

```
- (YYYY-MM-DD) <persona> · <complexity_class> · <area_tag> · estimate=<model>/<effort> → actual=<model>/<effort> · QA <pass|fail>(<loops>) · rework=<y|n> · internal_redo=<n> · escalation=<none|skill|model|surface> · note: <one-line>
```

Examples:

```
- (2026-04-29) pdt-developer · L6-multifile · auth-refactor · estimate=sonnet/medium → actual=opus/xhigh · QA pass(1) · rework=n · internal_redo=0 · escalation=model · note: cross-cutting needed opus
- (2026-04-29) pdt-designer · L7-net-new · prd-r1 · estimate=opus/max → actual=opus/max · QA n/a · rework=n · internal_redo=0 · escalation=none · note: clarity A=0.04 (3 iter) — appropriate
```

## Field rules

- `estimate=<model>/<effort>` — Step 1 routing's first call (before escalation).
- `actual=<model>/<effort>` — last actually-used. `actual=opus/max` → Step 1 routing
  choice (max not reachable via escalation).
- `QA pass(N)` — final pdt-qa result + loop count. `n/a` for no-QA tasks.
- `rework=y` — Step 3 **user** feedback indicated rework ("redo" / "no good" — any lang).
  Strictly user-driven; NOT for PO-internal redos.
- `internal_redo=<n>` — count of PO-driven re-invocations same persona / task because
  output didn't match spec. 0 if none.
- `escalation=skill|model|surface|none` — which strike resolved it, logged by NAME (not
  number) to avoid ambiguity, or `none`. `max` never appears.
- `note` — 1-line judgement.

### Format slot — model/effort literal names only

Valid: `haiku/low`, `sonnet/medium`, `sonnet/high`, `opus/xhigh`, `opus/max`.
Invalid: `pdt-developer/default`, `default/default`, `sonnet/normal`, `opus/extended`.

For plan-first tasks, log the **impl phase's** model/effort (final substantive call).
Plan phase lives in `persona_session_meta.<persona>.effort_history` for retro.

## Mechanical append

```bash
LINE="- ($(date -u +%F)) ..."   # fill per format
CALIBRATION_LOG=~/.productune/po/bookshelf/calibration-log.md
printf '%s\n' "$LINE" >> "$CALIBRATION_LOG"
```

Single `printf` append → almost no race risk.

## Archive rotate (cap 100 lines)

`~/.productune/po/bookshelf/calibration-log.md` >100 lines → cleanup at start of next PO turn:

1. Same-3-tuple duplicates — keep most recent.
2. Entries >1 year — move to `## Model/Effort Calibration (archived)`.
3. Still >100 — mark oldest `[SUPERSEDED <date>]`.
