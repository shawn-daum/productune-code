# Quality-based escalation (LLM-as-a-judge inspired)

After persona returns, PO inspects 4 quality signals. Any trips → 3-option menu to user.

## Quality signals

1. **Self-reported confidence** — output JSON `confidence: low|medium|high` + `unresolved: [...]`
2. **Schema completeness** — required fields missing (e.g. dev with `changed_files:[]` + `ready_for_qa:false` + populated `partial_changes`)
3. **Downstream invalidation** — pdt-qa `overall:fail`, pdt-designer compliance check `deviations:[...]` non-empty
4. **User feedback** — next turn says "이거 별론데" / "다시" / "안 맞아"

Any one trips → PO surfaces all 3 options at once:

```
[PO] pdt-developer 결과 confidence=low (unresolved: ["Next 16 middleware 명 변경 못 찾음"]).
     [1] retry — model sonnet → opus, effort medium → high (resume same session)
     [2] skill 검색 — "Next.js 16 routing" 키워드로 skill 레지스트리 조회
     [3] 그냥 진행 (Follow-ups 로 surface)
     선택? [1/2/3/Enter=1]
```

## Path 1 — Tier-up retry

Resume same `session_id` (persona keeps prior context) + model + effort one notch up.

```bash
SID=$(jq -r --arg p "$PERSONA" '.current_task.persona_sessions[$p]' "$STATE")
PRIOR_MODEL=$(jq -r --arg p "$PERSONA" '.current_task.persona_session_meta[$p].model_history[-1]' "$STATE")
PRIOR_EFFORT=$(jq -r --arg p "$PERSONA" '.current_task.persona_session_meta[$p].effort_history[-1]' "$STATE")

# tier-up — capped at xhigh; max only via Stage 1 routing
case "$PRIOR_MODEL" in haiku) NEW_MODEL=sonnet;; sonnet) NEW_MODEL=opus;; opus) NEW_MODEL=opus;; esac
case "$PRIOR_EFFORT" in
  low) NEW_EFFORT=medium;;
  medium) NEW_EFFORT=high;;
  high) NEW_EFFORT=xhigh;;
  xhigh|max) NEW_EFFORT=xhigh;;   # capped — escalation never promotes to max
esac

NO_COLOR=1 claude --resume "$SID" --model "$NEW_MODEL" --print --output-format json \
  "이전 시도 미해결: $UNRESOLVED. 더 깊이 reasoning 해서 다시 시도. extended thinking budget: $NEW_EFFORT."
```

**Loop cap: 2 retries per persona per task.** After 2nd retry confidence still low → mark `blocked` + surface (same flow as Persona evolution Stage A).

**`max` NOT reachable via Path 1.** `max` exists only as Stage 1 routing choice for net-new product/system thinking (PRD R1, design system from scratch, system architecture — `routing.md`). Persona fails at `xhigh` → `max` not the answer; failure indicates *task framing* needs revisiting (Path 2 skill search) or user step-in (Path 3 surface).

## Path 2 — Skill search and apply

PO calls `skill-fetch search "<query>"`. Query from `unresolved` items or task keywords:

```bash
QUERY="$(echo "$UNRESOLVED" | head -1)"
RESULTS=$(skill-fetch search "$QUERY" --json --limit 3 2>/dev/null \
  || echo '[{"name":"<skill-fetch 미설치>","source":"manual","desc":"polyskill.ai 직접 검색"}]')
```

Surface top 3 (title + source + short desc):
```
[PO] skill 검색 결과:
     [a] nextjs-routing-15-to-16  (PolySkill, ★42)  — Next.js routing migration helper
     [b] react-server-actions     (Anthropic Skills) — RSC + actions patterns
     [c] middleware-debugging     (skills.sh)        — Edge → Fluid Compute migration
     선택? [a/b/c/skip]
```

On selection:
- skill-fetch installed: `skill-fetch install <name>` → re-invoke persona in same session (skill auto-loads + task body cites skill path)
- not installed: PO emits manual install (`/plugin install <marketplace>` or git clone) → on user OK, re-invoke

Install fail / skill not fit → fall back to Path 1.

## Path 3 — Just proceed

User accepts result as-is. PO surfaces unresolved in final summary's "Follow-ups".

## User prefix shortcuts

- `/retry` → Path 1 immediately (skip 3-option menu)
- `/skill <query?>` → Path 2 immediately
- (Path 3 needs no prefix — just next turn)

## Escalation = under-estimate signal (calibration mandatory)

3-option menu firing means PO's Stage 1 routing was **under-estimate**. Path 1/2 fires:

- Mark `current_task.calibration_outcome.escalation_triggered = true`
- Bump `actual_complexity` +1 or +2 (Path 1 retry × 1 = +1; Path 1 × 2 or xhigh use = +2)
- On task close, calibration line writer populates `escalation=Path1` (or Path2)

Goal: same signal class auto-starts one notch higher next time. Path 3 (just proceed) is NOT counted as escalation — *unless* `user_rework_requested = true` next turn, which triggers calibration_outcome update.

`max` never appears in `escalation=` — not an escalation outcome. Calibration line shows `actual=opus/max` → PO chose `max` at Stage 1 routing (bias for next time: this task class needs `max` directly).

## Disposition correction learning (separate from quality)

Independent of quality escalation: user corrects PO disposition ≥2× (`/new` after `→ continuing` or vice versa) → append to `po-memory.md` Workflow preferences. (Stage 3 step 17 in `stages.md`.)
