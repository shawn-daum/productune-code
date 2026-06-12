---
ticket_id: T-PATCH-129
version: v0.5
slug: pretendard-ui-text-font
title: UI 텍스트 폰트 — Inter 대신 Pretendard 단독 리드 (전 제품)
type: doctrine
status: done
phase: 3
assignee: pdt-designer
requires_qa: false
requires_user_gate: false
area_tag: designer/doctrine
estimated_complexity: L2
risk_flags: []
created_at: 2026-06-12
started_at: 2026-06-12
completed_at: 2026-06-12
duration_min: 6
---

# T-PATCH-129: UI 텍스트 폰트 — Inter 대신 Pretendard 단독 리드 (전 제품)

## Request

shawn (대화 합의, 2026-06-12): Inter 는 한글 글리프가 없어 한글이 시스템 폰트로 fallback 되며 메트릭이 어긋난다. style-library 앵커는 Inter 를 폰트로 빈번히 지정한다(74종 중 62종 언급, 약 20종은 실제 body/primary). 따라서 디자인 작업(앵커 적응 · DS 작성 · mockup · hi-fi)에서 UI 텍스트 폰트로 Inter 가 지정될 자리에는 **Pretendard 를 단독 리드로 제시/도출**한다(Latin + 한글 커버, Inter 메트릭 호환). 대상 언어와 무관하게 **모든 제품**에 적용.

결정 세부:
- dual stack 아님 (`Inter, Pretendard` 형태 거부) — Pretendard 가 리드하고 Inter 는 UI 텍스트 폰트로 출고되지 않는다.
- 앵커가 지정한 mono/display 폰트는 불변 — 이 룰은 Inter 의 UI 텍스트 역할만 대상으로 한다.

홈 결정: 제너릭 크로스-프로젝트 디자인 크래프트 파일인 `ux-principles.md` (designer habit §4 상 모든 디자인 작업에서 자동 참조). 단일 권위 홈, 중복 없음.

## Acceptance

- BDD-1: Given 디자이너가 앵커 적응/DS/mockup/hi-fi 를 작업 / When UI 텍스트 폰트로 Inter 가 후보로 나옴 / Then Pretendard 가 폰트 스택의 단독 리드로 도출된다 (Inter 는 UI 텍스트로 미출고).
- BDD-2: Given 대상 제품의 언어가 영어 전용 / When 동일 작업 / Then 그래도 Pretendard 단독 리드를 적용한다 (언어 무관).
- BDD-3: Given 앵커가 mono/display 폰트를 지정 / When 적응 / Then 해당 폰트는 변경되지 않는다 (룰 범위 밖).
- BDD-4: `packages/core/doctrine/persona/designer/bookshelf/ux-principles.md` 에 본 룰이 1개 존재하며 `(2026-06-12) [T-PATCH-129]` 소스 태그를 단다.
- BDD-5: SoT 와 미러(`/Users/x/.productune/doctrine/.../ux-principles.md`)가 byte-identical.

## Out of scope

- 앵커 mono/display 폰트 정책.
- Inter 를 호출하는 기존 style-library 앵커 파일들의 일괄 재작성 (룰은 적응 시점에 적용 — 앵커 SoT 불변).
- 프로젝트별 `design-system.md` 토큰 갱신 (각 프로젝트가 룰을 APPLY).
- 폰트 로딩/번들/웹폰트 인프라 등 구현 작업.

## Plan

1. `ux-principles.md` SoT 에 §13 "Typography — UI text font" 룰 1개 append (act-time voice, 영어, 소스 태그).
2. 미러로 byte-identical cp.
3. cap 상태 보고 — 본 룰 추가로 파일이 100줄 캡을 초과(106줄). 기존 12개 원칙을 lossy 하게 깎는 것보다 룰 보전이 net 이득이므로 캡 breach 를 backlog 로 기록(기존 phase2-3 breach 처리 방식과 동일). 후속 promotion: 타이포그래피 묶음 분리 또는 파일 리밸런스 검토.

## Outcome

null

## Persona Activity

| persona | session_id | started_at | completed_at | model | effort |
|:--|:--|:--|:--|:--|:--|
