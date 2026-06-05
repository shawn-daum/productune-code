# State hygiene

## State lazy-prompts + versions cap

Surface only when the condition holds, ask once, leave the field as-is on silence:

| Field | Condition | Ask |
|:--|:--|:--|
| `phase_history[]` | open > 14d | "Phase {n} open {N}d — still active?" |
| `pending_gate` | age ≥ 7d, same phase | "pending_gate {N}d old — keep / clear?" |
| `versions[].outcome.observed_result` | null + `ended_at` non-null | "Version {id} closed — what happened?" |

`versions[]` cap: retain ≤5; rotate older entries to an `outcome.retrospective_path` ref (out of the state file for size, not purged).
