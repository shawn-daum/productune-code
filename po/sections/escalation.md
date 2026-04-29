# Quality-based escalation (LLM-as-a-judge inspired)

After a persona returns, PO inspects 4 quality signals. If any trips, surface a 3-option menu to the user.

## Quality signals

1. **Self-reported confidence** — output JSON `confidence: low|medium|high` + `unresolved: [...]`
2. **Schema completeness** — required fields missing (e.g. pdt-developer with `changed_files: []` + `ready_for_qa: false` + populated `partial_changes`)
3. **Downstream invalidation** — pdt-qa `overall: fail`, pdt-designer compliance check `deviations: [...]` non-empty
4. **User feedback** — user's next turn says "이거 별론데" / "다시" / "안 맞아"

If any one trips, PO surfaces all 3 options at once:

```
[PO] pdt-developer 결과 confidence=low (unresolved: ["Next 16 middleware 명 변경 못 찾음"]).
     [1] retry — model sonnet → opus, effort medium → high (resume same session)
     [2] skill 검색 — "Next.js 16 routing" 키워드로 skill 레지스트리 조회
     [3] 그냥 진행 (Follow-ups 로 surface)
     선택? [1/2/3/Enter=1]
```

## Path 1 — Tier-up retry

Resume same `session_id` (persona keeps prior attempt context) + model + effort one notch up.

```bash
SID=$(jq -r --arg p "$PERSONA" '.current_task.persona_sessions[$p]' "$STATE")
PRIOR_MODEL=$(jq -r --arg p "$PERSONA" '.current_task.persona_session_meta[$p].model_history[-1]' "$STATE")
PRIOR_EFFORT=$(jq -r --arg p "$PERSONA" '.current_task.persona_session_meta[$p].effort_history[-1]' "$STATE")

# tier-up — note: capped at xhigh; max is reachable only via Stage 1 routing
case "$PRIOR_MODEL" in haiku) NEW_MODEL=sonnet;; sonnet) NEW_MODEL=opus;; opus) NEW_MODEL=opus;; esac
case "$PRIOR_EFFORT" in
  low) NEW_EFFORT=medium;;
  medium) NEW_EFFORT=high;;
  high) NEW_EFFORT=xhigh;;
  xhigh|max) NEW_EFFORT=xhigh;;   # capped — escalation never promotes to max
esac

NO_COLOR=1 claude --resume "$SID" --model "$NEW_MODEL" --print --output-format json \
  "이전 시도에서 다음 항목이 미해결이었습니다: $UNRESOLVED. 더 깊이 reasoning 해서 다시 시도하세요. extended thinking budget: $NEW_EFFORT."
```

**Loop cap: 2 retries per persona per task.** After 2nd retry still confidence=low → mark `blocked` and surface (same flow as Persona evolution Stage A).

**`max` is NOT reachable via Path 1 escalation.** `max` exists only as a Stage 1 routing choice for net-new product/system thinking (PRD first-round, design system from scratch, system architecture decisions — see `routing.md`). When a persona fails at `xhigh`, escalating to `max` is not the answer; the failure itself indicates the *task framing* needs revisiting (Path 2 skill search) or the user needs to step in (Path 3 surface).

## Path 2 — Skill search and apply

PO calls `skill-fetch search "<query>"`. Query derived from `unresolved` items or task keywords:

```bash
QUERY="$(echo "$UNRESOLVED" | head -1)"
RESULTS=$(skill-fetch search "$QUERY" --json --limit 3 2>/dev/null \
  || echo '[{"name":"<skill-fetch 미설치>","source":"manual","desc":"polyskill.ai 에서 직접 검색"}]')
```

Surface top 3 to user (title + source + short desc):
```
[PO] skill 검색 결과:
     [a] nextjs-routing-15-to-16  (PolySkill, ★42)  — Next.js routing migration helper
     [b] react-server-actions     (Anthropic Skills) — RSC + actions patterns
     [c] middleware-debugging     (skills.sh)        — Edge → Fluid Compute migration
     선택? [a/b/c/skip]
```

On selection:
- skill-fetch installed: `skill-fetch install <name>` → re-invoke persona in same session (skill auto-loads + task body cites skill path)
- not installed: PO emits manual install command (`/plugin install <marketplace>` or git clone) → on user OK, re-invoke

Install failure / skill not a fit → fall back to Path 1 proposal.

## Path 3 — Just proceed

User accepts result as-is. PO surfaces unresolved items in the final summary's "Follow-ups".

## User prefix shortcuts

- `/retry` → Path 1 immediately (skip 3-option menu)
- `/skill <query?>` → Path 2 immediately
- (Path 3 needs no prefix — just the next user turn)

## Escalation = under-estimate signal (calibration mandatory)

The 3-option menu firing means PO's Stage 1 routing was an **under-estimate**. When Path 1/2 happens:

- Mark `current_task.calibration_outcome.escalation_triggered = true`
- Bump `actual_complexity` one notch ↑ or two notches ↑ (Path 1 retry × 1 = +1; Path 1 × 2 or xhigh use = +2 recommended)
- On task close, the `calibration.md` line writer must populate `escalation=Path1` (or Path2)

Goal: the same signal class auto-starts one notch higher next time. Path 3 (just proceed) is NOT counted as escalation — *unless* `user_rework_requested = true` arrives next turn, which triggers calibration_outcome update.

`max` never appears in `escalation=` because it's not an escalation outcome. If a calibration line shows `actual=opus/max`, that means PO chose `max` at Stage 1 routing (the bias for next time becomes "this task class needs `max` directly").

## Disposition correction learning (separate from quality)

Independent of quality escalation: when the user corrects PO's task disposition ≥2× (`/new` after `→ continuing` or vice versa), append to `po-memory.md` Workflow preferences. (Stage 3 step 17 in `stages.md` covers this.)
