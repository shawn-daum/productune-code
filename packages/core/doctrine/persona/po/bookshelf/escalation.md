# Escalation — 3-strike quality ladder

Persona returns → inspect 4 quality signals. Any 1 trips → escalate AUTO in order:
Strike 1 skill search → Strike 2 model up → Strike 3 user surface. 1–2 run without asking;
user consulted ONLY at Strike 3. Each strike = 1 attempt.

## Quality signals (any 1 trips)

1. **Self-reported** — output JSON `confidence: low` + `unresolved: [...]`.
2. **Schema incompleteness** — required fields missing (e.g. developer `changed_files:[]` +
   `ready_for_qa:false` + populated `partial_changes`).
3. **Downstream invalidation** — pdt-qa `overall:fail` · pdt-designer compliance
   `deviations:[...]` non-empty.
4. **User feedback** — next turn signals dissatisfaction ("this isn't right" / "redo" /
   "doesn't match" — any lang).

## Strike 1 — Skill search (auto)

Query skill-fetch with unresolved items / task keywords; auto-install top match, re-invoke
same session. No match / unavailable / install fails → Strike 2 (no user prompt).

## Strike 2 — Model up (auto)

Resume same session, bump model 1 tier (haiku→sonnet→opus) + effort 1 notch
(low→medium→high→xhigh) — never max. One model-up per persona per task; still failing at
`xhigh` → Strike 3.

## Strike 3 — User surface (SOLE user-interaction point)

Surface situation + alternatives; user chooses. English template, render in user lang:

```
[PO] pdt-developer still confidence=low after skill search + model up (unresolved: [...]).
     [1] retry differently — re-frame task / new approach (resume same session)
     [2] re-scope — narrow or split the request
     [3] accept as-is — surface unresolved in Follow-ups
     pick? [1/2/3]
```

`[3] accept` → surface `unresolved` in final summary "Follow-ups".

## User prefix shortcuts (manual overrides)

- `/skill <query?>` → jump to Strike 1.
- `/retry` → jump to Strike 2.
- (Strike 3 = no prefix; reached when 1–2 exhaust.)

## Under-estimate signal (calibration mandatory)

Any strike firing = Step 1 under-estimated → set
`current_task.calibration_outcome.escalation_triggered = true`, bump `actual_complexity`
(+1 one strike, +2 if model-up reached `xhigh`). Log escalation by name per
`bookshelf/calibration.md` line format.

Strike 3 `[3] accept` is NOT escalation unless `user_rework_requested` next turn.
