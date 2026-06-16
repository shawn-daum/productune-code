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

## po-state v2 shape invariants (2026-06-15, reconciled 2026-06-16) [T-PATCH-139/154]

In the same turn-open pass, hold po-state at schema_version 2: stamp `schema_version = 2` when it is absent or below 2; drop any `past_tickets` array and never recreate it (`docs/tickets/<version>/T-NNN.md` is the source of truth). Merge in-place with jq — never full-rewrite the file — and confirm `slug`, `request_summary`, `artifacts`, `persona_sessions`, `version`, `phase` survive the pass.

The migrate does NOT strip an active `current_task`'s work-state scratch — it only drops `past_tickets` and stamps `schema_version`. Active scratch (`progress`/`decisions`/`next`/`carry`/`plan`, per `delegation.md`) is an allowed ephemeral cache; leave it. The strip discipline is scoped to `past_tickets` (forbidden) and the v1→v2 stamp — not to active scratch.

### Work-state home = brief (po-state scratch is a cache) [T-PATCH-152/154]

The DURABLE / cross-session SoT for active-task work-state — progress, decisions, next, carry-forward, plan notes — is the brief (`briefs/<slug>.md`). po-state `current_task` scratch is permitted as a same-session convenience cache (the named scratch keys in `delegation.md`, NOT arbitrary freeform), but it is NOT authoritative — the brief is.

A v1→v2 migrate shrinking `current_task` (dropping `past_tickets` / non-v2 cruft) is EXPECTED + LOSSLESS — durable work-state is in the brief, not the dropped fields. This "shrink expected / do not restore" applies to the `past_tickets` + v1→v2 stamp ONLY; an active task's scratch is no longer shrunk. Do NOT restore the `.bak` to recover dropped `past_tickets` (re-creates the forbidden array → re-cleaned next session → loop).

Turn-open work-state recovery path = read the brief (+ ticket board) as SoT; the same-session scratch cache, if present, is a convenience only.

### po-state JSON writes = jq atomic merge ONLY [T-PATCH-168]

Every po-state write goes through `jq` (or `python -m json` equiv) atomic merge — read JSON, mutate the parsed structure, write whole valid JSON back. NEVER string-append / `sed` / `heredoc` onto the JSON structure (array/object). One missing comma corrupts the whole file → po-state unparseable → GUI version display breaks (paepyeong repro, T-167). This hardens the existing "merge in-place, never full-rewrite" invariant: the merge engine must be a JSON tool, never raw text.

Active-scratch array growth (`progress.done` etc., the named scratch keys in `delegation.md`) uses structure-safe jq — `jq '.current_task.progress.done += ["…"]'` — never hand-edit the array text. Same rule for any scratch object/array: jq operators only, no raw append. (Pairs with T-167: write-safe here + read-robust GUI = two defensive layers.)
