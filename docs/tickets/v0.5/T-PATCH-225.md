---
ticket_id: T-PATCH-225
version: v0.5
slug: phase2-hifi-optional-gate
title: Phase2 — hi-fi 목업(S5) 선택화 (mockup/userflow와 중복 시 skip, 애매하면 유저 OQ)
type: doctrine
status: todo
phase: 3
assignee: pdt-designer
requires_qa: true
requires_user_gate: true
area_tag: phase2-design
estimated_complexity: L2
risk_flags: []
created_at: 2026-06-19T00:00:00Z
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

S5를 **조건부 단계**로 전환:
- **skip 기준(명문화 필요)** 예시(designer가 판단): 단순 UI tweak / 단일 컴포넌트(분기 C 다수) ·
  S3 mockup이 이미 인터랙션·상태까지 충분 표현 · 신규 비주얼 패턴/복잡 인터랙션 없음 →
  S5 skip하고 S4 accept 후 바로 P3 build로.
- **hi-fi 필요 기준**: 신규 화면 다수 · 복잡 인터랙션/상태 전이 · 신규 디자인 패턴 도입 ·
  brand-heavy 화면 → S5 유지.
- **애매하면(기준으로 단정 불가) 유저 OQ**: "hi-fi 목업까지 만들까요? / 지금 mockup으로
  충분하면 바로 빌드할까요?" 2-옵션. 기본 추천은 designer가 기준으로 판단해 첫 옵션에.
- S5 skip 시 P3 close-gate가 hi-fi 산출물을 요구하지 않도록 정합(gate-without-producer 역방지 —
  skip이 gate를 block하지 않게).

## Acceptance

- **AC-1**: phase2-3-ticket-sequence.md에 S5 skip/keep 기준이 명문화되고, 분기 A/B/C에서 S5가
  조건부로 표기된다(항상-포함 아님).
- **AC-2**: 기준으로 명확히 skip 가능한 슬라이스(단일 컴포넌트 등)에서 designer가 S5 없이
  S4 accept → P3로 진행할 수 있다.
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
