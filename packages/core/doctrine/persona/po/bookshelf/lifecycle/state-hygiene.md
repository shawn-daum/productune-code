# State hygiene

## Turn-open sweep

One jq pass (skip if po-state absent): trim `recent_turns` to last 5 (reset at version close); clear stale `pending_gate` when `current_phase` > `from_phase`; if `current_task` status done/blocked/abandoned, clear `persona_sessions` THEN null `current_task`; drop dead `persona_sessions`.

`close_gate`: if `current_phase` has an enumerable gate (P3) and `close_gate` is absent/empty → lazy-instantiate from that phase's sub-file (same mapping as the phase-transition write); phases with no enumerable gate stay empty. Absent `close_gate` is never an error. (2026-06-05)[T-PATCH-041]

## State lazy-prompts + versions cap

Surface only when the condition holds, ask once, leave the field as-is on silence:

| Field | Condition | Ask |
|:--|:--|:--|
| `phase_history[]` | open > 14d | "Phase {n} open {N}d — still active?" |
| `pending_gate` | age ≥ 7d, same phase | "pending_gate {N}d old — keep / clear?" |
| `versions[].outcome.observed_result` | null + `ended_at` non-null | "Version {id} closed — what happened?" |

`versions[]` cap: retain ≤5; rotate older entries to an `outcome.retrospective_path` ref (out of the state file for size, not purged).
