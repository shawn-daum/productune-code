---
ticket_id: T-PATCH-253
version: v0.5
slug: doctrine-surface-review-visuals
title: doctrine — 검토용 visual 산출물은 사용자에게 직접 surface(open/render). 에이전트의 Read-image는 사용자 미노출
type: doctrine
status: done
phase: 4
assignee: pdt-designer
requires_qa: true
qa_status: pass
qa_loops: 1
requires_user_gate: false
area_tag: doctrine
estimated_complexity: L1
risk_flags: []
created_at: 2026-06-24T00:00:00Z
---

# T-PATCH-253: surface review-visuals to the user

## Request

shawn(2026-06-24): 작업 중 시각 산출물(아이콘 미리보기·비교 이미지 등)을 사용자가 검토하도록
만들 때, 에이전트가 **Read 툴로 이미지를 보는 건 에이전트한테만 보이고 사용자에겐 안 뜸** — 직접
`open`으로 띄워줘야 한다. "doctrine에 이런 거 없나?" → 확인 결과 **부분만 존재**:
- `common/habit.md:16` "Artifact path-reveal"는 **`docs/artifacts/<version>/` deliverable에만**
  ("never for any other Write") path 출력 + `.html`은 `file://` + `open -R`. 임시 검토용 visual
  (deliverable 아닌 미리보기/스크린샷/비교)은 커버 안 됨 = 갭.

## Acceptance

- **AC-1**: `common/habit.md`(Tier 0, all-subagent-read)에 규칙 추가/확장 — 에이전트가 **사용자
  검토를 위해 만든 이미지/시각 산출물**(deliverable 여부 무관: 미리보기·비교·렌더·스크린샷 등)은
  사용자가 실제로 볼 수 있게 **surface**해야 한다: macOS GUI 세션이면 `open <path>`(또는 `.html`은
  `file://`/`open`). 에이전트의 **Read(이미지)는 사용자 비노출**임을 명시.
- **AC-2**: 기존 path-reveal(:16, docs/artifacts deliverable 한정)과 **정합** — 중복/모순 없이.
  deliverable=기존 path-reveal 규칙, 임시 검토 visual=본 신규 규칙으로 분기 명확. fail-open(비-GUI/
  headless/CI는 path만, open skip).
- **AC-3**: cap 준수(common/habit.md 줄수 before/after, breach 시 flag). 간결 1~2줄.

## Out of scope
- 기존 docs/artifacts path-reveal 규칙 자체 변경. 자동 스크린샷 캡처 기능.

## Plan
designer: common/habit.md에 review-visual surface 규칙 1~2줄(path-reveal와 분기 cross-ref). QA grill(정합·cap·fail-open).

## Outcome
shipped — `common/habit.md` §2에 "Review-visual surface" 룰 1줄(31→32): 사용자 검토용 visual(deliverable 무관)은 `open <abs-path>`로 surface, 에이전트 Read-image는 사용자 비노출 명시, :16 path-reveal와 don't-double-fire cross-ref(finalized deliverable=:16 / ad-hoc review=신규), GUI 게이트·fail-open 재사용. designer author → QA pass(loop1): :16과 mutually-exclusive 확인, ghost ref 0, cap OK.

## Persona Activity
| persona | role | model | result |
|---|---|---|---|
| pdt-designer | author (common/habit.md) | sonnet | done |
| pdt-qa | grill | sonnet | qa_status: pass (loop1, 0 must-fix) |
