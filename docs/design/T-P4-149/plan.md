# Plan — Session Lifecycle Policy: Per-Ticket Fresh / Per-Turn Resume

**Ticket**: T-P4-149  
**Slug**: session-lifecycle-policy  
**Area**: token-opt / delegation-doctrine  
**Date**: 2026-05-20  
**Author**: pdt-designer  
**Effort**: sonnet / high

---

## §Context

`delegation-template.md` 의 dispatch 로직:

```bash
SID=$(jq -r --arg p "$PERSONA" '.current_task.persona_sessions[$p] // ""' "$STATE")
[ -z "$SID" ] && set -- claude --agent "$PERSONA" ...
              || set -- claude --resume "$SID" ...
```

ticket 경계를 넘어도 `current_task.persona_sessions[$PERSONA]` 에 SID 가 남아 있으면 `--resume` 이 실행된다. 결과적으로 이전 ticket 의 전체 context (코드, 설계 내용, 수십 turn) 가 다음 ticket 에 그대로 인계된다.

**측정값**:

| 시나리오 | 5-ticket batch 비용 |
|:--|:--|
| 현행 (session 누적 resume) | ~$8.6 |
| per-ticket fresh | ~$2.5 |
| **절감** | **↓70%** |

crossover ≈ 3 tickets: 3번째 ticket 부터 fresh 가 resume 보다 경제적.
per-dispatch fresh 비용 ~$0.5 (이전 context 없이 task body + docs 만).

**문제 근원**: 명시적 doctrine 부재. `lifecycle.md` archive step 이 `current_task = null` 로 세션을 사실상 초기화하지만, PO 가 archive→allocate flow 를 건너뛰거나 case-(a) continuation 으로 분류할 때 SID 가 유지된다.

---

## §Goals

1. Doctrine 명문화 — `delegation.md` 에 "Session lifecycle: per-ticket fresh / per-turn resume" 룰.
2. Archive 단계 강화 — `lifecycle.md` archive bash 블록에 `persona_sessions = {}` 명시적 초기화를 archive 의 **첫 번째** 스텝으로 삽입.
3. po-state 누적 방지 — ticket close 후 `persona_sessions` 에 stale UUID 가 남지 않도록 한다.

---

## §Non-goals

- `closed_sessions[]` archive 구조 — UUID 이력 추적 필요 없음.
- `post-delegate-state-write.sh` hook 수정 (optional 강화로만 언급).
- multi-project 격리 (po-state.json 이 project-scoped 이므로 자동 분리).
- persona 간 session 공유 방지 (이미 `$PERSONA` 키로 분리됨).

---

## §Acceptance

| # | 조건 |
|:--|:--|
| AC-1 | `~/.productune/sections/delegation.md` 에 `## Session lifecycle (T-P4-149)` 섹션 추가 (per-ticket fresh / per-turn resume 규칙). |
| AC-2 | `~/.productune/sections/lifecycle.md` archive bash 블록 첫 줄에 `jq '.current_task.persona_sessions = {}'` 추가. |
| AC-3 | `po-state.json` 의 `current_task.persona_sessions` 가 ticket close 직후 `{}` 로 초기화됨. |
| AC-4 | 다음 ticket 최초 dispatch: SID = `""` → `--session-id` 없는 fresh call. |
| AC-5 | 동일 ticket 내 plan→impl 연속 호출: SID 유지 → `--resume` OK (resume 규칙 변경 없음). |

---

## §Changes

### Change 1 — `~/.productune/sections/delegation.md`

`## Chunking — per-call size limits` 섹션 **바로 앞**에 삽입:

```markdown
## Session lifecycle (T-P4-149)

**Per-ticket fresh / per-turn resume.**
Ticket close (status → `done` | `blocked` | `abandoned`) → immediately
`jq '.current_task.persona_sessions = {}'` (before `current_task = null`).
Next ticket's first dispatch = **no `--session-id`** (fresh call, clean context).
Within-ticket multi-turn (e.g. plan turn → impl turn, QA retry on same ticket) = `--resume "$SID"` OK.

> Rationale: 5-ticket session accumulation ~$8.6 → per-ticket fresh ~$2.5 (↓70%).
> Crossover at ~3 tickets: fresh cost < resume cost from that point.
```

---

### Change 2 — `~/.productune/sections/lifecycle.md`

`## Archive current_task → ticket md` 섹션의 bash 블록:

**현재:**
```bash
NOW=$(date -u +%FT%TZ); FINAL_STATUS="done"   # done | blocked | abandoned
TID=$(jq -r '.current_task.ticket_id' "$STATE")
VER=$(jq -r '.current_task.version // .current_version' "$STATE")
TICKET_MD="docs/tickets/$VER/$TID.md"
sed -i.bak -E "s/^status:.*/status: $FINAL_STATUS/" "$TICKET_MD" && rm -f "${TICKET_MD}.bak"
tmp=$(mktemp) && jq '.current_task = null' "$STATE" > "$tmp" && mv "$tmp" "$STATE"
```

**변경 후:**
```bash
NOW=$(date -u +%FT%TZ); FINAL_STATUS="done"   # done | blocked | abandoned
TID=$(jq -r '.current_task.ticket_id' "$STATE")
VER=$(jq -r '.current_task.version // .current_version' "$STATE")
TICKET_MD="docs/tickets/$VER/$TID.md"
sed -i.bak -E "s/^status:.*/status: $FINAL_STATUS/" "$TICKET_MD" && rm -f "${TICKET_MD}.bak"
# T-P4-149: clear sessions BEFORE null-out — next dispatch always fresh
tmp=$(mktemp) && jq '.current_task.persona_sessions = {}' "$STATE" > "$tmp" && mv "$tmp" "$STATE"
tmp=$(mktemp) && jq '.current_task = null' "$STATE" > "$tmp" && mv "$tmp" "$STATE"
```

**변경 이유**: `current_task = null` 이 논리적으로 sessions 를 포함해 전부 초기화하지만, PO 가 archive 전에 dispatch 를 실행하는 edge case 가 있다. `persona_sessions = {}` 를 archive flow 의 첫 스텝으로 두면, `current_task = null` 이전 시점에도 SID 가 비어 있어 dispatch template 이 항상 fresh call 을 선택한다.

---

## §Implementation notes (optional — developer)

### Hook 방어 로직 (강화 옵션)

`post-delegate-state-write.sh` 에서 SID capture 시 ticket boundary 탐지 guard 추가:

```bash
# pseudocode — cross-ticket SID inheritance 방지
PREV_TID=$(jq -r '.current_task.ticket_id // ""' "$STATE")
CURR_TID="${TICKET_ID:-}"   # dispatch 시점 env
if [ -n "$PREV_TID" ] && [ -n "$CURR_TID" ] && [ "$PREV_TID" != "$CURR_TID" ]; then
  # boundary detected — 기존 SID 를 덮지 않고 신규 SID 만 저장
  echo "⚠ cross-ticket boundary — session reset" >&2
fi
```

이 guard 는 doc change (Change 1+2) 로 이미 커버되므로 priority = low.

---

## §Out of scope

- `closed_sessions[]` archive 구조
- per-turn context pruning (별도 token-opt 아이디어)
- `delegation-template.md` 코드 라인 수정 (도큐먼트만 변경)

---

## §QA scope

| Field | Value |
|:--|:--|
| **QA invoke** | `skip` |
| **test target** | — |
| **사용자 dogfood** | — |
| **regression check** | — |

> 순수 doctrine doc 업데이트 (`~/.productune/sections/*.md`). 사용자-facing 코드 변경 없음.

---

## §Open Questions

없음.
