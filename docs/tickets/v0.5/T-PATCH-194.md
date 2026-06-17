---
ticket_id: T-PATCH-194
version: v0.5
slug: routing-hold-floor-step-up-exempt
title: 라우팅 — "hold floor" 예외: 확정 플랜 충실 실행은 step-up 면제
type: doctrine
status: done
phase: 3
assignee: pdt-designer
requires_qa: true
qa_status: pass
requires_user_gate: false
area_tag: routing-doctrine
risk_flags: none
estimated_complexity: L3
created_at: 2026-06-17T00:00:00Z
started_at: 2026-06-17T00:00:00Z
completed_at: 2026-06-17T00:00:00Z
duration_min: 20
---

## Intent
intent 키워드(architecture / refactor / system-wide / i18n / migration)는 보통 step-up 트리거다. 그런데 그 키워드가 이미 **확정된 플랜의 충실한 실행**(opus가 floor에서 작성해 깨끗한 상태, 또는 스펙이 확정된 티켓 작성)을 가리킬 때까지 step-up을 강제하면, 키워드가 한 일(작성 게이팅)이 끝났는데도 불필요하게 모델/노력을 올리게 된다. 이 경우에 한해 floor 유지를 허용한다.

## The rule
- **intent 키워드 단독 매치일 때만** hold floor: intent 키워드가 *유일한* step-up 트리거였고, 작업이 확정 플랜의 충실한 실행일 때 floor 유지.
- 충실한 실행의 정의: opus가 floor에서 작성했고 깨끗함(`escalation.md` 시그널 미개방), 또는 스펙이 확정된 티켓 작성.
- **carve-out (예외의 예외, step-up 유지)**:
  - **risk area**(auth / payments / PII / migration / DS / public API)가 건드려지면 적용 안 됨 — step-up 유지.
  - `recent_turns` 실패 ≥2 이거나 escalation 시그널이 살아 있으면 적용 안 됨 — step-up 유지.
- 판정: 스펙 확정 → floor / net-new 또는 모호 → opus에서 작성.

## AC
- [x] `routing.md`의 `## Adjust the default` 섹션, Step-down −1 불릿 바로 다음 + Recovery 불릿 바로 앞에 Hold floor 불릿 1개 삽입.
- [x] 표 / Step-up / Step-down / Recovery 불릿 및 그 외 라인 무수정 (additive only).
- [x] intent-keyword-only hold 조건 명시.
- [x] risk-area carve-out 보존(risk area 터치 시 step-up 유지).
- [x] fail-streak(`recent_turns` ≥2) 및 escalation 시그널 carve-out 보존.
- [x] spec-settled → floor / net-new·ambiguous → opus 판정 명시.
- [x] `~/.productune/` 미러는 PO 담당 — SoT 파일만 편집.

## Note
plan-GRILL(pdt-qa)이 원안에서 **risk-area 취소 구멍**(intent 키워드가 단독 트리거일 때 risk area가 함께 걸려도 hold floor가 잘못 적용될 수 있던 표현)을 잡아 FAIL 처리했고, 출고된 표현은 그 grill로 교정된 버전이다. 적용 표현 = grill output.
