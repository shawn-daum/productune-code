---
ticket_id: T-PATCH-236
version: v0.5
slug: disabled-with-explanation-doctrine-decision
title: disabled-with-explanation designer 지침 정착 결정 — 채택/기각 후 Tier1 author
type: doctrine
status: todo
phase: 3
assignee: pdt-designer
requires_qa: false
requires_user_gate: true
area_tag: ux-doctrine
estimated_complexity: L1
risk_flags: [doctrine-change, user-gate-required]
created_at: 2026-06-22T00:00:00Z
---

# T-PATCH-236: disabled-with-explanation 지침 정착 결정

## Request

T-PATCH-220 designer+dev promotion 후보(2026-06-22):

> "disabled primary action은 옆에 derived·행동-명시 사유 한 줄 동반
> (disabled-with-explanation, never disabled-and-silent)"

T-199 AC-6 교훈 일반화. hook 강제가 불가(임의 UI에서 '그 버튼의 사유'를 정적으로
감지할 수 없음) → designer act-time 지침으로만 성립.

현재 상태: 정착 여부 user 보류 중.

## 이 티켓의 목적 — 결정 우선

이 티켓은 **구현 티켓이 아니다.** AC-0(결정)만 달성하면 done이고,
채택 시에만 AC-1(Tier1 저술)으로 진행한다.

## Acceptance

- **AC-0(필수)**: shawn이 이 지침의 채택 또는 기각을 결정한다.
  - **기각** → 티켓 close(abandoned). 백로그 항목 제거.
  - **채택** → AC-1 진행.
- **AC-1(채택 시만)**: designer가 `docs/designer/ux-principles.md`(또는 적절한
  Tier1 파일) 에 `disabled-with-explanation` 지침을 작성·author한다.
  - grill 통과 기준: 지침이 act-time에 적용 가능한 구체적 기준을 포함하고
    hook 강제 불가 이유가 명시됨.
- **AC-2(채택 시만)**: T-199 AC-6 교훈 cross-ref가 지침 본문에 포함됨.

## Out of scope

- hook 기반 강제(임의 UI 정적 감지 불가 — 이미 결론).
- 기존 화면 일괄 소급 수정(채택 후에도 신규 화면부터 적용).

## 의존성

- T-PATCH-220(교훈 출처, 완료).
- T-PATCH-199 AC-6 사례(cross-ref 참고, 완료).
