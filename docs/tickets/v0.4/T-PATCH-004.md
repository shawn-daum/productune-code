---
ticket_id: T-PATCH-004
version: v0.4
round: phase3-fixes
type: doctrine
status: done
phase: 3
assignee: pdt-designer
created_at: 2026-05-04T06:30:00Z
started_at: 2026-05-04T06:30:00Z
completed_at: 2026-05-04T06:35:00Z
duration_min: 5
estimated_complexity: L2
risk_flags: doctrine, protocol-change
slug: ad-hoc-patch-routing-designer-ticket
qa_status: pending
qa_loops: 0
---

# T-PATCH-004: Ad-hoc patch routing — designer 경유 ticket 생성

**Round**: phase3-fixes  **Stage**: doctrine-update  **Status**: done  **Assignee**: pdt-designer
**PRD anchor**: [docs/prd/productune.md](../../prd/productune.md)
**Estimated complexity**: L2  **Risk flags**: doctrine, protocol-change

> PRD 에서 발행된 ticket 외 단발성 지시 (디자인 수정, 버그 fix, UX 미세조정 등) 는 PO 가 직접 developer 에 던지지 않고 designer 를 거쳐 plan + ticket(s) 화한다. designer 가 QA 필요 여부도 판단. 한 지시 → 여러 ticket OK.

---

## Request

### 문제

현재 doctrine (`stages.md`) 의 Stage 2 흐름은 fresh idea (new product/feature) 케이스만 명시:
- 2A Discovery → 2B PRD → 2B' Design → 2C Routing

ad-hoc patch (사용자가 "이 버튼 색깔 바꿔줘", "이 부분 버그 같아" 같은 단발성 지시를 던질 때) 의 흐름이 명시 안 됨. PO 가 즉흥적으로 developer 에 직접 위임하면:
- ticket 화 안 됨 → 추적 불가, persona activity 표 누락
- QA 필요 여부 PO 가 임의 판단 → 일관성 부재
- 한 지시 안에 design + dev 두 성격 섞이면 routing 모호

### 수정

`stages.md` 의 Stage 2 안에 새 sub-stage `2A'. Ad-hoc patch routing` 을 추가:

1. patch vs fresh idea 분류 cue 명시
2. patch 는 designer 에 위임 → designer 가 plan + ticket(s) 발행 + 각 ticket 의 `requires_qa` 결정
3. 한 지시에 성격 다른 여러 ticket OK
4. PO 는 발행된 ticket(s) 를 dependency 순으로 routing (Stage 2C 와 동일)
5. patch 는 PRD body 갱신 X (필요시 designer 가 별도 PRD-update ticket 생성)

---

## Acceptance

- [ ] `~/.productune/sections/stages.md` Stage 2 안에 `2A'. Ad-hoc patch routing` sub-stage 추가
- [ ] patch vs fresh idea 분류 cue 명시 ("X 좀 고쳐줘" / "X 만들자" 등)
- [ ] designer ticket 발행 schema 에 `requires_qa: bool` 명시
- [ ] 한 지시 → 여러 ticket 가능 명시 (한 designer turn 의 `tickets[]` 가 ≥1)
- [ ] PRD body 변경 X 원칙 명시
- [ ] grep "ad-hoc\|patch routing" stages.md → 반영 확인

---

## Out of scope

- patch ticket 의 `round` 필드 디렉토리 컨벤션 표준화 (`patches/<topic>` vs 현재 active round) — 케이스마다 designer 판단으로 위임. Phase 5 에서 표준화 검토.
- "트리비얼 patch (typo, import 정리)" 의 PO 직접 처리 한도 — 현재 default Path 1 (in-conversation) 따름. 상한 정책은 추후.
