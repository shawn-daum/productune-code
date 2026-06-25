---
ticket_id: T-PATCH-261
version: v0.6
slug: doctrine-build-process-gates
title: doctrine — 코드리뷰 게이트(#5) + 빌드후 run-prompt 단계(#3) + type:test 트리거 재조정(#4)
type: doctrine
status: done
phase: 3
assignee: pdt-designer
requires_qa: true
qa_status: pass
qa_loops: 1
requires_user_gate: false
area_tag: doctrine
estimated_complexity: L3
risk_flags: []
created_at: 2026-06-25T01:55:00Z
---

# T-PATCH-261: build-process doctrine — code-review gate + run-prompt + test-trigger

PRD SoT = docs/prd/PRD.md v0.6 (#5 코드리뷰, #3 룰부분, #4 트리거). **load-bearing 게이트 변경** → designer PLAN-FIRST → QA PLAN-GRILL → author → QA post-GRILL (calibration 2026-06-22/23 룰). 코드 변경 0(룰만).

## Acceptance
- **AC-1 (#5 코드리뷰 게이트)**: diff를 correctness/재사용/단순화 관점으로 훑는 코드리뷰를 doctrine에 신설 — **하이브리드**: (a) risk-gated per-ticket(risk_flags/대규모 diff), (b) close-gate 누적 1회. 하네스 `/code-review`·`/simplify` 스킬 호출로 수행(신규 코드 0). 위치 = `po/bookshelf/lifecycle/p3-build.md`(build-loop + close-gate) + `qa/habit.md`(실행 주체) 정합.
- **AC-2 (#3 run-prompt 단계)**: 빌드 완료 → close gate 사이에 "앱 ▶Run + 눈확인 + 통합 시각 grill" **prompted-but-skippable** 단계를 p3-build.md에 명문화(하드 close-block 추가 X — 권고 단계). 기존 GUI ▶Run 활용 명시.
- **AC-3 (#4 type:test 트리거 재조정)**: 현 트리거(risk auth/payments/PII·≥3스텝·area≥3실패·user explicit)가 GUI엔 거의 미발화 → 트리거 재조정(예: user-facing/시각 surface, GUI 컴포넌트 신규 등 추가 검토). qa/habit.md + p3-build.md test-trigger 정합.

## Out of scope
- 코드 변경(vitest 배선=#4 code는 별 티켓 / smoke 시각=#3 code는 별 티켓). 여긴 룰만.
- close_gate 4-step 시퀀스에 blocking step 신규 추가(#3은 prompted, no-block).

## Plan
designer PLAN-FIRST(게이트 의미론·close_gate 영향·기존 시퀀스 보존 설계) → QA PLAN-GRILL → author(p3-build.md + qa/habit.md, cap 주의) → QA post-GRILL. user에 게이트 강도 결정 이미 받음(#5 하이브리드 / #3 skippable).

## Outcome
done — designer PLAN-FIRST → QA PLAN-GRILL → author → QA post-GRILL(fail MF-1 → byte-identical fix → PO-verify pass). 편집: ticket-ops.md(#5a per-ticket 코드리뷰 게이트, risk-gated, correctness=blocking/reuse·simplify=advisory, ≤3-retry 재사용) · p3-build.md(#5b close 누적 코드리뷰=advisory pre-step·close_gate 배열 비변경 / #3 run-prompt prompted-skippable·기존 ▶Run / #4 트리거 재조정) · qa/habit.md(#4 트리거 동기 + #3 통합 시각grill 보강). generator-SoT(close_gate 4-step + close-gate.p3.json) 무손상 검증됨. **AC-1 배치 편차(SF-1)**: #5 실행주체를 qa/habit가 아닌 ticket-ops+p3-build에 둠 — code-review=PO 하네스 act, QA는 read-only(persona 경계 invariant) 보존 위해 의도적 redirect. MF-1(트리거 byte-identical) PO diff verify 752B 동일.

## Persona Activity
(PO-managed)
