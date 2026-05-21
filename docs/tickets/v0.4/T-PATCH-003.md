---
ticket_id: T-PATCH-003
version: v0.4
round: phase3-fixes
type: doctrine-update
status: todo
assignee: pdt-designer
created_at: 2026-05-04T06:10:00Z
started_at: null
completed_at: null
duration_min: null
estimated_complexity: L3
risk_flags: doctrine, protocol-change, persona-schema
slug: response-skills-used-persona-session-meta
qa_status: pending
qa_loops: 0
---

# T-PATCH-003: 페르소나 response 에 `skills_used` 필드 + persona_session_meta 누적

**Round**: phase3-fixes  **Stage**: doctrine-update  **Status**: todo  **Assignee**: pdt-designer
**PRD anchor**: [docs/prd/productune.md](../../prd/productune.md)
**Related ticket**: [T-P4-044](../phase4/T-P4-044.md) (페르소나 skill 시각화 UI — 본 doctrine 보강의 데이터 소비자)
**Estimated complexity**: L3  **Risk flags**: doctrine, protocol-change, persona-schema

> 페르소나 호출 turn 마다 어떤 skill 을 invoke 했는지 기록되지 않음. T-P4-044 (페르소나 패널 "이번 작업 skill trace") 의 데이터 소스가 부재. doctrine 보강으로 페르소나 response schema 에 `skills_used` 필드 추가 + PO 가 `persona_session_meta.<persona>.skills_used` 에 누적하도록 명시.

---

## Request

### 문제

T-P4-044 페르소나 패널이 "이번 작업: `to-prd`, `pm-product-discovery:interview-script`" 같은 skill trace 를 inline 표시해야 함. 그런데 현재 PO doctrine 어디에도 페르소나가 호출한 skill 을 기록하는 메커니즘이 없음:

- 페르소나 response JSON schema (`delegation.md`) 에 `skills_used` 필드 정의 X
- post-delegate hook 이 skill 정보 머지 안 함
- `persona_session_meta` 에 skills 누적 슬롯 X

결과: T-P4-044 UI 만들어도 데이터가 없어 placeholder 만 보임.

### 수정

#### 1. 페르소나 response schema 에 `skills_used` 필수 필드 추가

`~/.productune/sections/delegation.md` 의 페르소나 응답 형식 정의에 다음 필드 추가:

```json
{
  "persona": "pdt-developer",
  "session_id": "...",
  "changed_files": [...],
  "commands_run": [...],
  "skills_used": ["mattpocock/tdd", "to-prd"],   ← 신규
  "notes": "...",
  "confidence": "high",
  "unresolved": [],
  "ready_for_qa": true,
  "promotion_candidates": []
}
```

- 빈 배열 OK (skill 안 쓴 turn).
- skill id 형식: 그대로 (`namespace/name` 또는 단일 이름) — 페르소나 시스템 메시지에 등록된 형태.
- 페르소나 정의 파일 (`~/.claude/agents/pdt-developer.md` 등) 에 "응답 JSON 에 항상 `skills_used` 포함" 라인 추가.

#### 2. post-delegate hook 에서 머지

`~/.productune/scripts/hooks/post-delegate-state-write.sh` (기존) 가 `persona_session_meta.<persona>.turns` 등 갱신 시, 같이 `.skills_used` 배열 누적:

```bash
# pseudo
NEW_SKILLS=$(echo "$RESPONSE_JSON" | jq -r '.skills_used // [] | .[]')
jq --arg p "$PERSONA" --argjson new "$NEW_SKILLS_JSON" '
  .current_task.persona_session_meta[$p].skills_used =
    ((.current_task.persona_session_meta[$p].skills_used // []) + $new | unique)
' state ...
```

#### 3. `persona_session_meta` 스키마 문서화

`~/.productune/sections/tickets.md` 의 schema 예시에 `skills_used` 필드 명시.

#### 4. 회귀 테스트

페르소나 1회 invoke (sonnet 기본) → response 에 `skills_used` 들어왔는지 확인 → po-state 에 머지됐는지 확인. 안 들어오면 페르소나 정의 라인 강조 (italic / bold / 따로 헤더).

---

## Acceptance

- [ ] `delegation.md` 의 응답 schema 예시에 `skills_used` 필수 필드 추가
- [ ] 4개 페르소나 정의 파일 (`pdt-po`, `pdt-designer`, `pdt-developer`, `pdt-qa`) 에 "응답에 항상 `skills_used` 포함" 명시
- [ ] post-delegate hook 에서 `persona_session_meta.<persona>.skills_used` 에 머지 (unique array)
- [ ] `tickets.md` schema 예시 갱신 — `skills_used` 필드 노출
- [ ] 회귀: 페르소나 1회 호출 → po-state 에 skills_used 들어옴 검증
- [ ] T-P4-044 UI 가 placeholder 대신 실 데이터 표시 (이 ticket close 후 별도 verify)

---

## Out of scope

- skill 사용 빈도 분석 / 통계 UI (Phase 5+)
- skill 등록 / 비활성화 GUI
- T-P4-044 UI 자체 (별 ticket — 본 ticket 은 데이터 파이프라인만)

---

## Notes

- T-P4-044 (R4 workspace shell 번들) 은 본 ticket 미완료 상태에서 placeholder ("이번 작업 — 데이터 없음 (T-PATCH-003 대기)") 로 출고됨. T-PATCH-003 close 후 placeholder → 실 데이터 표시 자동 전환.
- 페르소나 response schema 변경은 회귀 위험 — 변경 후 1회 dogfood (T-006 류 간단 ticket) 로 검증.
