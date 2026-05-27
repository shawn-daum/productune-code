# Escalation — 3-strike quality ladder

After persona returns, PO inspects 4 quality signals. Any trips → 3-option menu to user.
≤100 lines.

## Quality signals (any 1 trips)

1. **Self-reported confidence** — output JSON `confidence: low` + `unresolved: [...]`.
2. **Schema completeness** — required fields missing (e.g. developer
   `changed_files:[]` + `ready_for_qa:false` + populated `partial_changes`).
3. **Downstream invalidation** — pdt-qa `overall:fail` · pdt-designer compliance
   `deviations:[...]` non-empty.
4. **User feedback** — next turn signals dissatisfaction ("this isn't right" / "redo" /
   "doesn't match" — any user lang).

Any one trips → surface all 3 options at once. English template, rendered in user lang:

```
[PO] pdt-developer returned confidence=low (unresolved: [...]).
     [1] retry — model sonnet → opus, effort medium → high (resume same session)
     [2] skill search — query "<topic>" against the skill registry
     [3] proceed as-is (surface in Follow-ups)
     pick? [1/2/3/Enter=1]
```

## Path 1 — Tier-up retry

Resume same `session_id` (persona keeps prior context) + model + effort one notch up.

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

**Loop cap: 2 retries per persona per task.** After 2nd retry still low → `blocked` + surface.

**`max` NOT reachable via Path 1.** `max` is Step 1 routing choice for net-new product
thinking only (PRD R1, design system from scratch, system arch — see `routing.md`).
Persona failing at `xhigh` → max isn't the answer; failure indicates *task framing*
needs revisit (Path 2 skill search) or user step-in (Path 3 surface).

## Path 2 — Skill search and apply

PO calls `skill-fetch search "<query>"`. Query from `unresolved` items or task keywords:

```bash
QUERY="$(echo "$UNRESOLVED" | head -1)"
RESULTS=$(skill-fetch search "$QUERY" --json --limit 3 2>/dev/null \
  || echo '[{"name":"<skill-fetch not installed>","desc":"search polyskill.ai"}]')
```

Surface top 3 (title + source + short desc). On selection:
- skill-fetch installed → `skill-fetch install <name>` → re-invoke persona in same
  session (skill auto-loads + task body cites skill path).
- not installed → PO emits manual install instructions → on user OK, re-invoke.
- install fail / skill not fit → fall back to Path 1.

## Path 3 — Just proceed

User accepts result as-is. PO surfaces `unresolved` in final summary's "Follow-ups".

## User prefix shortcuts

- `/retry` → Path 1 immediately (skip 3-option menu)
- `/skill <query?>` → Path 2 immediately
- (Path 3 needs no prefix — just next turn)

## Under-estimate signal (calibration mandatory)

3-option menu firing → PO Step 1 routing was **under-estimate**:

- Mark `current_task.calibration_outcome.escalation_triggered = true`.
- Bump `actual_complexity` +1 (Path 1 × 1) or +2 (Path 1 × 2 or xhigh use).
- On task close, calibration line gets `escalation=Path1` (or `Path2`).

Goal: same signal class auto-starts one notch higher next time. Path 3 (just proceed)
NOT counted as escalation — *unless* `user_rework_requested = true` next turn.

`max` never appears in `escalation=` — not an escalation outcome. `actual=opus/max`
means PO chose `max` at Step 1.

## Disposition correction (separate from quality)

Independent of quality escalation: user corrects PO disposition ≥2× (`/new` after
`→ continuing` or vice versa) → append to `~/.productune/po/habit.md ## Workflow preferences`.
