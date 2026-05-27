# Escalation — 3-strike quality ladder

After a persona returns, inspect 4 quality signals. Any one trips → escalate AUTOMATICALLY
in order: Strike 1 skill search → Strike 2 model up → Strike 3 user surface. Strikes 1–2 run
without asking; the user is consulted ONLY at Strike 3. Each strike = 1 attempt, auto 1→2→3.

## Quality signals (any 1 trips)

1. **Self-reported confidence** — output JSON `confidence: low` + `unresolved: [...]`.
2. **Schema completeness** — required fields missing (e.g. developer
   `changed_files:[]` + `ready_for_qa:false` + populated `partial_changes`).
3. **Downstream invalidation** — pdt-qa `overall:fail` · pdt-designer compliance
   `deviations:[...]` non-empty.
4. **User feedback** — next turn signals dissatisfaction ("this isn't right" / "redo" /
   "doesn't match" — any user lang).

## Strike 1 — Skill search (automatic)

Query `skill-fetch search "<query>"`. Build query from `unresolved` items or task keywords:

```bash
QUERY="$(echo "$UNRESOLVED" | head -1)"
TOP=$(skill-fetch search "$QUERY" --json --limit 1 2>/dev/null | jq -r '.[0].name')
```

Auto-install the top match (`skill-fetch install "$TOP"`) → re-invoke the same persona in
the same `session_id` (skill auto-loads + task body cites the skill path). No user prompt.

Fall through to Strike 2 automatically when ANY holds — no user prompt:
- skill-fetch unavailable (not installed),
- no usable match returned,
- install fails or the skill does not fit.

## Strike 2 — Model up (automatic)

Resume the same `session_id` (persona keeps prior context) + bump model and effort one notch:

```bash
case "$PRIOR_MODEL" in
  haiku) NEW_MODEL=sonnet ;;
  sonnet) NEW_MODEL=opus ;;
  opus) NEW_MODEL=opus ;;
esac
case "$PRIOR_EFFORT" in
  low) NEW_EFFORT=medium ;;
  medium) NEW_EFFORT=high ;;
  high) NEW_EFFORT=xhigh ;;
  xhigh|max) NEW_EFFORT=xhigh ;;   # capped — never max via escalation
esac
```

**Cap: one model-up attempt per persona per task.** `max` is NOT reachable here — it stays a
Step 1 routing choice for net-new product thinking only (PRD R1, design system from scratch,
system arch — see `routing.md`). A persona still failing at `xhigh` → do not reach for max;
go to Strike 3.

## Strike 3 — User surface (only user-interaction point)

Model-up still failing → surface the situation + alternatives; the user chooses. This is the
SOLE place the user is asked. English template, render in user lang:

```
[PO] pdt-developer still confidence=low after skill search + model up (unresolved: [...]).
     [1] retry differently — re-frame task / new approach (resume same session)
     [2] re-scope — narrow or split the request
     [3] accept as-is — surface unresolved in Follow-ups
     pick? [1/2/3]
```

`[3] accept` surfaces `unresolved` in the final summary's "Follow-ups".

## User prefix shortcuts (manual overrides)

- `/skill <query?>` → jump straight to Strike 1 (skill search).
- `/retry` → jump straight to Strike 2 (model up).
- (Strike 3 needs no prefix — reached when Strikes 1–2 exhaust.)

## Under-estimate signal (calibration mandatory)

Any strike firing → the Step 1 routing was an **under-estimate**:

- Mark `current_task.calibration_outcome.escalation_triggered = true`.
- Bump `actual_complexity` +1 (one strike) or +2 (model up reaching `xhigh`, or strikes 1+2).
- On task close, the calibration line logs `escalation=<skill|model|surface>` (by name).

Strike 3 `[3] accept` is NOT counted as escalation — *unless* `user_rework_requested = true`
next turn. `max` never appears in `escalation=` — `actual=opus/max` means max chosen at Step 1.

## Disposition correction (separate from quality)

Independent of quality escalation: user corrects PO disposition ≥2× (`/new` after
`→ continuing` or vice versa) → append to `~/.productune/po/habit.md ## Workflow preferences`.
