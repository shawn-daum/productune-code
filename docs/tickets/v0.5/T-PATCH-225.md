---
ticket_id: T-PATCH-225
version: v0.5
slug: phase2-hifi-optional-gate
title: Phase2 — hi-fi 목업(S5) 선택화 (mockup/userflow와 중복 시 skip, 애매하면 유저 OQ)
type: doctrine
status: done
phase: 3
assignee: pdt-designer
requires_qa: true
requires_user_gate: true
area_tag: phase2-design
estimated_complexity: L2
risk_flags: []
created_at: 2026-06-19T00:00:00Z
qa_status: pass
qa_loops: 1
completed_at: 2026-06-22T00:00:00Z
---

# T-PATCH-225: Phase2 hi-fi 목업 선택화

## Request

shawn(2026-06-19): Phase2에서 hi-fi 목업(S5)을 **항상** 만들 필요는 없음 — mockup
candidates(S3) + user flow(S4)와 많이 겹치는 경우가 있음. PO/designer 판단(기준 필요)으로
**skip 가능**하게, 애매하면 유저에게 물어보게: "hi-fi 목업 만들어드릴까요? 아니면 (지금
mockup으로) 충분하면 바로 빌드할까요?"

## 현황

`designer/bookshelf/phase2-3-ticket-sequence.md`의 분기 A/B/C 모두 **S5(hi-fi)를 항상 포함**:
- A = S1–S2b + S3–S4 + **S5**
- B = S3–S4 + **S5**
- C = **S5** only
S3(mockup_candidates) + S4(userflow)가 이미 시각/플로우를 충분히 전달하는 슬라이스에서도
S5가 강제돼 중복 산출 + 게이트 1회 추가.

## 설계 방향

S5를 **조건부 단계**로 전환 (단 **Branch C는 예외 — S5 skip 불가**, shawn 결정 2026-06-22):
- **Branch C 예외**: C는 S5만 도는 분기(S1–S4 없음)라 skip하면 design 산출물 0 → C는 S5 항상 keep
  (최소 1개 design 산출물 보장). **S5 skip은 A/B에서만**(accept된 S4 mockup이 빌드를 이미 전달).
- **skip 기준 (A/B만, designer 판단)**: ALL 충족 시 — S3+S4가 이미 인터랙션·상태 충분 표현 ·
  신규 비주얼 패턴 없음 · 복잡 인터랙션 없음 → S4 accept 후 바로 P3 build (accept된 S4 위에서만 skip).
- **hi-fi keep 기준**: ANY — Branch C · 신규 화면 다수 · 복잡 인터랙션/상태 전이 · 신규 패턴 ·
  brand-heavy → S5 유지.
- **애매하면(A/B, 기준 단정 불가) 유저 OQ**: "hi-fi 목업까지 만들까요? / 지금 mockup으로
  충분하면 바로 빌드할까요?" 2-옵션, designer 기준 판단을 첫 옵션에.
- S5 skip 시 P3 close-gate가 hi-fi를 요구하지 않도록 정합(skip이 gate block 안 함).

## Acceptance

- **AC-1**: phase2-3-ticket-sequence.md에 S5 skip/keep 기준이 명문화되고, A/B에서 S5가 조건부로
  표기된다(항상-포함 아님). **Branch C는 S5 required(skip 불가)로 표기**된다.
- **AC-2**: A/B에서 기준 충족 시(accept된 S4 위) designer가 S5 없이 P3로 진행할 수 있다.
  **Branch C는 S5를 skip할 수 없다**(design 산출물 0 방지).
- **AC-3**: 애매한 케이스에서 designer가 2-옵션 OQ("hi-fi 만들까 / 바로 빌드")를 유저에게
  surface한다.
- **AC-4**: S5 skip 시 P3 close-gate(`phase3-close-gate.md`)가 hi-fi 부재로 block하지 않는다
  (close-gate가 hi-fi를 조건부로 본다).
- **AC-5**: hi-fi가 필요한 케이스(복잡 인터랙션 등)에서는 S5가 여전히 강제된다(과-skip 방지).

## Out of scope

- S3/S4 자체 변경. 분기 A/B/C 진입 기준(상단 axes) 변경.

## QA 노트

doctrine 변경 검증(grill): S5 조건부 표기 정합 · close-gate cross-persona 의존(hi-fi 요구)
정합 · skip/keep 기준 모호성 없는지. 참고: `qa/bookshelf/design-review.md`.

## 구현 요약 (2026-06-22)

`designer/bookshelf/phase2-3-ticket-sequence.md` 편집:
- 분기 A/B/C 모두 S5를 `S5, conditional` / "if kept"로 표기 (항상-포함 제거). C는 "usually
  skipped → straight to P3, keep only when new pattern/complex interaction" (AC-1).
- 신설 S5 step: skip 기준(ALL: 단일 컴포넌트 · S3가 인터랙션/상태 충분 표현 · 신규 비주얼/복잡
  인터랙션 없음) / keep 기준(ANY: 신규 화면 다수 · 복잡 상태전이 · 신규 패턴 · brand-heavy) /
  애매 시 2-옵션 OQ. skip 시 S4 accept → P3, T3 `done`+1줄 outcome, gate 없음 (AC-1/2/3/5).
- 티켓 emission 표: T3(S5) 항상 emit(statusline 0/0 방지) + skip 시 gate 없이 done 명기.
- `phase3-close-gate.md`: producer 노트에 "hi-fi(S5)는 close-gate item 아님 — skip은 valid,
  hi-fi 부재로 close block 금지" 추가. DS/type/color/asset은 빌드 기준 검증 유지 (AC-4).
- cross-persona: `po/bookshelf/lifecycle/index.md` P2 라인 — "accepted hi-fi" → "accepted design
  (S5 conditional)", C 분기 = "S5 only — required, not skippable" (Branch C 예외, shawn 2026-06-22).
- **Branch C 예외 반영(2026-06-22)**: skip은 A/B-only, C는 S5 항상 keep → 최소 design 산출물 1개 보장.
  분기표·skip step·C 설명·lifecycle·티켓 AC 전부 정합.
- cap: 파일 134→147 (+13). 두 기능 추가분 ~26 중 ~13을 기존 줄 압축으로 상쇄. 잔여 trim debt는
  backlog cap-curation 항목에 갱신 명기.

## Sign-off
AC-1~5 충족. grill self-check pass (S5 조건부 표기·close-gate 조건부·cross-persona 정합).
