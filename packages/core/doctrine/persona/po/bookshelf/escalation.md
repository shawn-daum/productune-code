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

Query skill-fetch search with the unresolved items or task keywords; auto-install the top
match and re-invoke the same session. No usable match / skill-fetch unavailable / install
fails → fall through to Strike 2 automatically (no user prompt).

## Strike 2 — Model up (automatic)

Resume the same session and bump model one tier (haiku→sonnet→opus) + effort one notch
(low→medium→high→xhigh) — never max. One model-up attempt per persona per task; still failing
at `xhigh` → Strike 3.

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

Any strike firing means Step 1 under-estimated — mark
`current_task.calibration_outcome.escalation_triggered = true` and bump `actual_complexity`
(+1 one strike, +2 if model-up reached `xhigh`). The calibration line logs escalation by
name — format lives in `bookshelf/calibration.md`.

Strike 3 `[3] accept` is NOT escalation unless `user_rework_requested` next turn; `max` never
appears in `escalation=` (`opus/max` means max chosen at Step 1).

## Disposition correction (separate from quality)

Independent of quality escalation: user corrects PO disposition ≥2× (`/new` after
`→ continuing` or vice versa) → append to `~/.productune/po/habit.md ## Workflow preferences`.
