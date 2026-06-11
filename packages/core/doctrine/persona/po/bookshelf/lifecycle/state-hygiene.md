# State hygiene

## Turn-open sweep

One jq pass (skip if po-state absent): trim `recent_turns` to last 5 (reset at version close); clear stale `pending_gate` when `current_phase` > `from_phase`; if `current_task` status done/blocked/abandoned, clear `persona_sessions` THEN null `current_task`; drop dead `persona_sessions`.

In the SAME pass, deterministically self-heal `close_gate` for the only enumerable gate (P3) — fires only when P3 && absent/null/empty (idempotent: in-progress `done`/`waived` items untouched), all other phases no-op (future phases extend this as an `elif` chain). The canonical 4-step array lives in ONE shared literal file — `$HOME/.productune/config/close-gate.p3.json` — read by every executable site (this sweep, `pre-phase-gate-guard.sh`, `prompt-gate-inject.sh`); never inline the array.

```
jq --argjson gate "$(cat "$HOME/.productune/config/close-gate.p3.json")" '
  … | ( if (.current_phase == 3) and ((.close_gate // []) | length == 0)
        then .close_gate = $gate else . end ) | …'
```

NOTE: the `pre-phase-gate-guard.sh` + `prompt-gate-inject.sh` hooks already run this self-heal mechanically at turn-open and before any phase write — the sweep clause is the doctrine-level backstop for environments where the hooks are not wired.

## State lazy-prompts + versions cap

Surface only when the condition holds, ask once, leave the field as-is on silence:

| Field | Condition | Ask |
|:--|:--|:--|
| `phase_history[]` | open > 14d | "Phase {n} open {N}d — still active?" |
| `pending_gate` | age ≥ 7d, same phase | "pending_gate {N}d old — keep / clear?" |
| `versions[].outcome.observed_result` | null + `ended_at` non-null | "Version {id} closed — what happened?" |

`versions[]` cap: retain ≤5; rotate older entries to an `outcome.retrospective_path` ref (out of the state file for size, not purged).

## Harness memory drain

At task close (alongside the calibration line) check the Claude Code auto-memory index (the project's harness `MEMORY.md`): for each accumulated entry, locate its doctrine-tier home, surface it through the promotion gate, then delete the entry from harness memory once placed. Rules live in doctrine tiers — harness memory is an inbox, never a home.
