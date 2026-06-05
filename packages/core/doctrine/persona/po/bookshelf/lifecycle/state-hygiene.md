# State hygiene

## Turn-open sweep

One jq pass (skip if po-state absent): trim `recent_turns` to last 5 (reset at version close); clear stale `pending_gate` when `current_phase` > `from_phase`; if `current_task` status done/blocked/abandoned, clear `persona_sessions` THEN null `current_task`; drop dead `persona_sessions`.

In the SAME pass, deterministically self-heal `close_gate` for the only enumerable gate (P3) — fires only when P3 && absent/null/empty (idempotent: in-progress `done`/`waived` items untouched), all other phases no-op (future phases extend this as an `elif` chain): (2026-06-05)[T-PATCH-042]

```
| ( if (.current_phase == 3) and ((.close_gate // []) | length == 0)
    then .close_gate = [
      {"step":"backlog_triage","status":"pending","waivable":false},
      {"step":"design_review","type":"design","status":"pending","waivable":false},
      {"step":"prd_check","type":"design","status":"pending","waivable":true},
      {"step":"security_6","type":"qa","status":"pending","waivable":true}
    ] else . end )
```

## State lazy-prompts + versions cap

Surface only when the condition holds, ask once, leave the field as-is on silence:

| Field | Condition | Ask |
|:--|:--|:--|
| `phase_history[]` | open > 14d | "Phase {n} open {N}d — still active?" |
| `pending_gate` | age ≥ 7d, same phase | "pending_gate {N}d old — keep / clear?" |
| `versions[].outcome.observed_result` | null + `ended_at` non-null | "Version {id} closed — what happened?" |

`versions[]` cap: retain ≤5; rotate older entries to an `outcome.retrospective_path` ref (out of the state file for size, not purged).
