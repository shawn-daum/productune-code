---
ticket_id: T-PATCH-258
version: v0.6
slug: v0-6-prd-authoring
title: v0.6 PRD authoring — 도그푸딩 완주 + 안정화 (clarity loop)
type: design
status: done
phase: 1
assignee: pdt-designer
requires_qa: false
requires_user_gate: true
area_tag: prd
estimated_complexity: L3
risk_flags: []
created_at: 2026-06-25T00:16:18Z
---

# T-PATCH-258: v0.6 PRD authoring

PO↔Designer↔user comms vehicle for v0.6 P1. Drive the clarity loop → ready `docs/prd/PRD.md` (v0.6 section). user_lang = ko.

## Request (raw ask — shawn, 2026-06-25)

**Theme = 도그푸딩 완주 + 안정화.** v0.5가 깐 풀사이클 인프라를 비개발자가 GUI-only로 실제 PRD→Close 완주하는 걸 *관찰*하는 게 북극성(v0.5 observed_result=null carry). 그 완주를 깨끗하게 만드는 아래 6개 dogfood-stabilize 갭 해소 + 6차 dmg 리빌드(T-254/256/257 미반영분).

1. **[DESIGN-S1] DS 옵션 제시 방식.** 현재 S1에서 3안을 텍스트+대충 도식으로 줌 → 비개발자가 구분 불가. (a) **처음부터 렌더된 HTML 시안 3개**로 제시. (b) 3안이 서로 너무 비슷한 문제 → A·B안 = 기존 doctrine(Fit), **C안 = 매번 디자인 웹서치 기반 완전히 새로운 방향을 Claude 창의성으로 발산**.
2. **[DESIGN-S2b] 에셋 생성 2건.** (a) **SVG 고집 금지** — 생성형 PNG(Codex/핸드오프) 우선 + "유저가 PNG 돌려주면 Claude가 SVG로 변환/후처리"하는 루프 신설(현 ③ SVG 폴백으로 너무 빨리 빠짐). (b) 이미지모델 핸드오프 **프롬프트는 user_lang 무관 무조건 영어**(한글 프롬프트 = 이미지 품질저하).
3. **[BUILD] run+눈확인+통합 시각 grill 단계 신설.** 빌드 완료 → close gate 사이에 "앱 실제 run(dev run) + 유저 눈확인 + 통합 시각 grill" 단계가 codify 안 됨. 현 smoke=mount+console만이라 CSS깨짐/간격 못 잡음(fail-pattern T-PATCH-095 5루프). smoke 시각 사각 보강.
4. **[TEST] 작동 감사.** `type:test` 트리거가 리스크-게이트라 GUI엔 거의 미발화 + `.test.ts`들(core/gui)이 vitest/jest 러너 미배선으로 실행 안 될 가능성(turbo test → core `.mjs` 2개만). 러너 배선 확인·수정 + 트리거 재조정.
5. **[CODE-REVIEW] 게이트 신설.** `type:refactor`+GRILL은 있으나 diff를 correctness/재사용/단순화로 훑는 코드리뷰 패스 부재. 빌드루프 or close-gate에 코드리뷰 신설(하네스 `/code-review`·`/simplify` 활용 검토).
6. **[CARRY] T-PATCH-255** — PO 턴 tool 실패(macOS TCC 파일접근 거부) silent 종료 → actionable 노출 (v0.5 이월).

## Acceptance
- `docs/prd/PRD.md` v0.6 섹션 = `state: ready` (clarity score A ≤ 0.05, 또는 PO finalize).
- 6개 scope item 각각 PRD에 Why/What/AC 수준으로 반영(구현 설계 아님 — P2/P3 몫).
- 북극성 + validation_method + input_metrics 정의 (`version_outcome` emit → PO가 po-state 미러).
- 이 중 doctrine-only 변경(#1~#5 대부분)과 product/code 변경(#3 build-run UX, #4 test 배선, #6 T-255) 구분 명시.

## Plan
clarity loop (opus/xhigh, R2+): feature-history.md + fail-patterns.md(docs/qa/bookshelf/) 읽기 → 6 item별 clarity 질문을 user에게(PO 경유) → A ≤ 0.05까지 ≤5 loop. ready PRD emit + version_outcome.

## Outcome
done — PRD v0.6 (docs/prd/PRD.md) state:ready, 14 items, A≤0.05. clarity loop 3 pass (9→14 items, scope reopened twice by user). version_outcome 정의(북극성=dogfood-ready 상태, 실제 완주 관찰은 v0.7 carry) → po-state versions[v0.6].outcome 미러. user P1 gate 승인 2026-06-25. doctrine 4 / code 10(GUI lifecycle→view 클러스터 #9·#10·#11·#14 + 독립 6).

## Persona Activity
(PO-managed)
