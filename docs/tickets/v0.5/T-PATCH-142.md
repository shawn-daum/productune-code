---
ticket_id: T-PATCH-142
version: v0.5
slug: promotion-schema-explicit-fields
title: promotion-candidate schema 7→10 (persona · title · expected_effect 명시화)
type: doctrine
status: done
phase: 3
assignee: pdt-designer
requires_qa: true
qa_status: pass
requires_user_gate: false
area_tag: promotion-schema
estimated_complexity: L2
risk_flags: [core-doctrine, all-persona-read]
created_at: 2026-06-16T00:00:00Z
started_at:
completed_at:
duration_min:
---

# T-PATCH-142: promotion-candidate schema 7→10

## Request

Tier 0 core doctrine 변경 (doctrine-editing flow, user-approved). 모든 persona 가 emit 하는 promotion-candidate 가 **대상(subject) · 이름(name) · 기대효과(expected-effect)** 를 명시적으로 싣도록 7-field 스키마를 10-field 로 확장한다. 추가 필드:

- `persona`: `po` | `designer` | `developer` | `qa` — candidate 가 겨냥하는 doctrine 의 persona. 기존엔 `target` 경로에 **암묵적**으로만 있었음 → 명시화.
- `title`: entry/rule 의 짧은 human-readable 이름. `area_tag`(kebab area tag) 와 **구별**됨.
- `expected_effect`: 채택 시 forward-looking 결과 — 무엇이 개선되는가 / 어떤 bug-class 가 방지되는가. `rationale`(왜 지금, 티켓에 anchored) 와 **구별**됨.

기존 7 필드(scope, pattern, target, delta, rationale, area_tag, source_ticket) 는 불변. 결과 = 10 필드.

이 파일은 ALL persona 가 읽는 core doctrine → full impact sweep + byte-identical mirror 적용.

## Acceptance

- SoT `packages/core/doctrine/common/bookshelf/promotion-candidate-schema.md` 의 JSON 블록에 3 필드 추가 + 각 1줄 설명, `## 7 fields` 헤딩 → `## 10 fields`.
- Mirror `~/.productune/doctrine/common/bookshelf/promotion-candidate-schema.md` 가 SoT 와 **byte-identical**.
- CONSUMER `packages/core/doctrine/persona/po/bookshelf/promotion-process.md` 의 "Schema + 7 fields" → "10 fields"; 4-quadrant 표는 그대로 유효(persona/title/expected_effect 는 scope×pattern 라우팅을 바꾸지 않음).
- GENERATOR `common/habit.md` §3 점검: 필드를 enumerate 하거나 "7 fields" 라 하면 갱신; 스키마 파일만 참조하면 변경 불필요임을 명시.
- 다른 어떤 파일도 "7 fields" 를 하드코드하지 않음(grep 확인).

## Out of scope

- promotion-candidate 의 4-quadrant 분류 로직(scope × pattern) 변경 — 추가 3 필드는 routing 축이 아님.
- 기존 7 필드의 의미/이름 변경.
- po-state / 다른 schema 의 동반 변경.

## Plan

> assignee: **pdt-designer** · model: **sonnet** · effort: **medium**
> authoring rules (doctrine-editing.md, PO-injected): P0 act-time voice · English only · bookshelf SCHEMA field-list edit = curated structural edit(파일 기존 스타일 일치, append-log 아님) · SoT 편집 → mirror byte-identical.

### Impact sweep (doctrine-editing.md 체크리스트 — Tier1 도 "update every GENERATOR" flag)

| # | surface | applied/n-a | what |
|:--|:--|:--|:--|
| 1 | SoT `…/common/bookshelf/promotion-candidate-schema.md` | applied | JSON 에 persona/title/expected_effect 추가 + 3 distinctness 불릿, 헤딩 7→10 |
| 2 | Mirror `~/.productune/…/promotion-candidate-schema.md` | applied | SoT 를 `cp` → byte-identical 확인 |
| 3 | GENERATOR `common/habit.md` §3 | n-a | §3 은 스키마 파일만 참조("Schema: `bookshelf/promotion-candidate-schema.md`"), 필드 enumerate 안 함 → 변경 불필요 |
| 4 | CONSUMER `po/bookshelf/promotion-process.md` | applied | "Schema + 7 fields" → "10 fields"; 4-quadrant 표 유효 확인 |
| 5 | 다른 파일 "7 fields" 하드코드 | applied(n-a result) | grep 결과 doctrine 내 잔여 없음 |

## Outcome
<!-- Phase 5 -->

## Persona Activity
<!-- PO-managed -->
