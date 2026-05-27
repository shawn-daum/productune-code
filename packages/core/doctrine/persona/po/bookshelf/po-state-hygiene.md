# po-state hygiene — turn-start cleanup

5-rule sweep at every turn-start. PO shell mechanical. Steady-state ~4–5 KB. ≤100 lines.

## When

Step 1 of every PO turn (right after reading ~/.productune/po/habit.md + po-state.json). Skip silently if
po-state.json absent (new project / fresh init).

## 5 rules

### 1. Always-purge `past_tickets[]`

V2 schema removed this field — ticket md = SoT. Any residual data is stale.

```bash
jq '.past_tickets = []' .productune/po-state.json > /tmp/ps.json \
  && mv /tmp/ps.json .productune/po-state.json
```

### 2. Trim `recent_turns[]` to last 5

Project-wide rolling window. Failure-pattern detection input.

```bash
jq '.recent_turns |= .[-5:]' .productune/po-state.json > /tmp/ps.json \
  && mv /tmp/ps.json .productune/po-state.json
```

Reset to `[]` at Version close (failure context = version-scoped).

### 3. Clear stale `pending_gate`

GUI-deprecated; field retained for legacy compat.

- `current_phase > from_phase` → auto-clear (`jq '.pending_gate = null'`).
- Age ≥ 7d AND `current_phase == from_phase` → surface once: `"pending_gate is {N}d
  old — keep / clear?"` — await user reply.

### 4. Detect `current_task` done → close

`current_task.status` ∈ `done | blocked | abandoned` but still populated:

```bash
jq '.current_task.persona_sessions = {}' "$STATE"      # clear sessions FIRST
jq '.current_task = null' "$STATE"                     # THEN null current_task
```

Order matters: persona_sessions cleared *before* `current_task = null`.

### 5. Prune dead `persona_sessions{}`

Per-ticket session ids. On ticket close, both `persona_sessions{}` and
`persona_session_meta{}` dropped (audit lives in ticket md `## Persona Activity`).
Sweep removes orphaned entries where `current_task` is null or status terminal.

## Non-blocking lazy prompts

Surface only when conditions met, ask once:

| Field | Condition | Surface |
|:--|:--|:--|
| `phase_history[]` | open > 14d | "Phase {n} open {N}d — still active?" |
| `pending_gate` | age ≥ 7d same phase | "pending_gate {N}d old — keep / clear?" |
| `versions[].outcome.observed_result` | null + `ended_at` non-null | "Version {id} closed — what happened?" |

User silence → leave field as-is.

## `versions[]` cap

≤5 entries retained. Older = `outcome.retrospective_path` ref. Not purged — rotated
out of state file for size.

## NOT touched

- Ticket md files — SoT, retained indefinitely.
- `persona_session_meta` for live `current_task` — cleared only on ticket close.
- `pending_promotions[]` — drained explicitly (Step 1b), not hygiene-purged.
- `~/.productune/po/bookshelf/calibration-log.md` — separate cap (`calibration.md`).

## Implementation sketch (single jq pass)

```bash
jq '
  .past_tickets = []
  | .recent_turns |= (. // [] | .[-5:])
  | if (.pending_gate // null) != null
      and (.current_phase // 0) > (.pending_gate.from_phase // 0)
    then .pending_gate = null
    else .
    end
' .productune/po-state.json > /tmp/ps.json && mv /tmp/ps.json .productune/po-state.json
```

Lazy surfaces (rules 3, 4, 5 condition checks) emit via PO chat — separate from jq write.

## Trace

Emit 1-line on change: `→ state hygiene: pruned past_tickets (N), trimmed recent_turns (M→5)`.
No change → silent.
