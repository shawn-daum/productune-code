---
ticket_id: T-PATCH-002
round: phase3-fixes
stage: doctrine-update
status: done
assignee: pdt-designer
created_at: 2026-04-30T00:00:00Z
started_at: 2026-04-30T06:00:34Z
completed_at: 2026-04-30T06:05:39Z
duration_min: 5
estimated_complexity: L3
risk_flags: doctrine, protocol-change
---

# T-PATCH-002: 티켓 완료 후 사용자 검증 게이트

**Round**: phase3-fixes  **Stage**: doctrine-update  **Status**: done  **Assignee**: pdt-designer
**PRD anchor**: [docs/prd/productune.md](../../prd/productune.md)
**Estimated complexity**: L3  **Risk flags**: doctrine, protocol-change

> Phase 3 dogfood 에서 발견된 PO 오케스트레이션 버그 — 티켓 완료 후 사용자 확인 없이 다음 티켓을 즉시 위임하는 문제. PO가 검증 게이트를 doctrine 수준에서 강제하도록 수정.

---

## Request

### 문제

T-006 완료 시점에 migration 0004·0005 가 live DB에 미적용 상태였음. PO는 사용자 확인을 받지 않고 즉시 T-007을 위임 → 사용자가 T-006 결과를 검증하기 전에 T-007이 실행됨. 티켓 완료 = "페르소나가 done 반환" 이지, "라이브 환경 반영 완료" 가 아님을 PO가 구분하지 못한 케이스.

### 수정

티켓 완료 후 사용자 검증 게이트 프로토콜을 doctrine에 추가.

#### 1. 완료 요약 + 검증 체크리스트 서피싱

페르소나가 `done` 반환 직후, PO가 다음 형식으로 사용자에게 노출:

```
✅ T-NNN 완료. 확인해줘:
 [ ] <검증 항목 1 — 티켓 AC에서 도출>
 [ ] <검증 항목 2>

확인되면 다음 티켓 시작할게.
```

검증 항목 도출 소스 (우선순위 순):
- 티켓 AC 중 **사용자 액션 또는 라이브 환경 확인** 이 필요한 항목
- 페르소나 output에 등장한 경고 (e.g. "migration 미적용", "env var 누락")
- 외부 사이드 이펙트 (migration, env 변경, 외부 서비스 호출, DNS 변경 등)

검증 항목이 0건이면 → 이 게이트 스킵 가능 (아래 예외 조건 참조).

#### 2. 사용자 응답 처리 분기

| 응답 | PO 동작 |
|---|---|
| `완료` / `ok` / `go` / `확인` (또는 동의어) | 다음 티켓 위임 진행 |
| `나중에` / `잠깐` / `wait` | 다음 티켓 홀드. 재개 요청 시 위임 |
| 문제 발견 (자유 텍스트) | follow-up 티켓 발행 후 대기. 다음 티켓 진행 X |

#### 3. 자동 진행 허용 예외 (게이트 스킵 조건)

아래 **두 조건 중 하나** 충족 시에만 사용자 확인 없이 자동 진행:

1. 세션 시작 시 사용자가 명시적으로 `자동으로 다 돌려줘` / `auto mode` 를 발화
2. 해당 티켓이 **사용자 대면 사이드 이펙트 없음** (순수 리팩터, migration 없음, env 변경 없음, 외부 서비스 호출 없음)

두 조건 모두 불충족이면 → 게이트 필수 발동.

---

## Inputs

- PRD: [docs/prd/productune.md](../../prd/productune.md)
- 기존 doctrine: [po/sections/delegation.md](../../../po/sections/delegation.md), [po/sections/stages.md](../../../po/sections/stages.md)
- Phase 3 dogfood 케이스: T-006 완료 후 T-007 즉시 위임 (migration 미적용 미검증)

## Acceptance

- [ ] `po/sections/delegation.md` 에 "Post-ticket verification gate" 섹션 신설
  - 게이트 발동 트리거 (페르소나 `done` 반환 후) 명시
  - 완료 요약 메시지 포맷 (위 ✅ 형식) 포함
  - 검증 항목 도출 소스 3종 명시
  - 사용자 응답 처리 분기 표 포함
  - 자동 진행 허용 예외 조건 2종 명시
- [ ] 예외 조건 판단 로직: "사이드 이펙트 없음" 판정 기준 (migration 없음 / env 변경 없음 / 외부 서비스 호출 없음 / 순수 리팩터) 을 detection rule로 1줄씩 정의
- [ ] T-PATCH-001의 pre-flight 게이트(위임 전)와 본 게이트(완료 후)가 충돌 없이 순서 명확히 정의: `pre-flight → 위임 → 페르소나 실행 → 완료 → verification gate → 다음 티켓`
- [ ] 세션 시작 시 auto mode 발화 감지 → `po-state.json` 에 `auto_mode: true` 플래그 기록 방식 명시 (게이트 스킵 근거)
- [ ] 검증 항목이 0건인 경우 스킵 처리 규칙 명시

## Out of scope

- Phase 4 GUI 카드 구현 ("T-NNN 완료 → 검증 요청 카드" / [확인 완료 → 다음 티켓] 버튼) — Phase 4 Round 별도 티켓
- 자동 사이드 이펙트 감지 도구 (정적 분석 / AST 스캔) — 현재는 PO 텍스트 스캔으로 처리
- 검증 항목 자동 테스트 실행 — doctrine 수준에서는 사용자 수동 확인만
- pre-flight 게이트 변경 (T-PATCH-001 scope)

---

## Notes

- 본 게이트는 **사용자가 라이브 환경 검증 주체인 모든 상황** 에 적용. 랄프(RALPH) 같은 자율 검증 환경이 아니면 필수.
- 완료 요약 메시지는 caveman lite 한글로 surface. doctrine 본문은 영어 유지 (기존 정합).
- Phase 4 GUI 카드 (`T-NNN 완료 → 검증 요청 카드`) 는 본 doctrine 게이트를 UI로 노출하는 레이어. doctrine이 선행 필수.
