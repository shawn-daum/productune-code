---
ticket_id: T-PATCH-210
version: v0.5
slug: lang-rule-acceptance-plan-designsystem-english
title: 언어 규약 정정 — Acceptance·Plan·design-system.md를 영어로 (유저가 안 읽음)
type: docs
status: done
phase: 3
assignee: pdt-po
requires_qa: false
requires_user_gate: false
area_tag: doctrine-language
created_at: 2026-06-18T00:00:00Z
---

## 배경 / 목적

`common/habit.md:14` 언어 규약이 "human-readable docs"를 user_lang으로 묶으면서 ticket
**Acceptance / Plan** 과 **design-system.md** 까지 user_lang(한글)으로 지정했음. 그런데
명시된 근거는 "the user reads these directly"인데, 이들은 **유저가 읽지 않는다**:
- **Plan** = 구현 단계 스펙(파일 편집·경로·diff) → Developer/agent가 실행.
- **Acceptance** = done 기준(build green, grep 0건 등) → dev/QA가 검증.
- **design-system.md** = 토큰/recipe/§1.5 내부 SoT → designer/dev가 참조. 유저가 보는 건
  `docs/artifacts/<version>/design-system-*.html` **렌더**(user-gate)지 .md가 아님.

→ 자기 논리(user_lang = 유저가 읽는 것)에 모순. 기준을 **"유저가 직접 읽나"** 로 재정의.

## 설계 결정

`common/habit.md:14` 재작성:
- **User-facing → user_lang**: ticket Request/배경, `PRD.md`, retrospectives, `docs/artifacts/`
  user-gate 산출물(**design-system HTML 렌더 포함**).
- **Developer/machine-facing → English**: ticket **Acceptance + Plan**, `design-system.md`(내부
  SoT), dispatch `[ctx]`/return envelope/po-state(+JSON). 키·enum·protected vocab·경로는 항상 영어.
- **new writes only, never retro-translate** — 기존 한글 Acceptance/Plan/design-system.md는
  소급 번역 안 함.

## 수정 파일 목록

| 파일 | 변경 |
|------|------|
| `packages/core/doctrine/common/habit.md` (+ `~/.productune` 미러) | §Language 재작성: 기준 = "유저가 읽나"; Acceptance/Plan/design-system.md → 영어, design-system HTML 렌더는 user_lang 유지 |

## Acceptance

- AC-1: habit.md §Language가 Acceptance/Plan/design-system.md를 English(dev-facing)로 분류, design-system HTML 렌더 + PRD + 아티팩트 + Request는 user_lang으로 유지. repo + 미러 동기.
- AC-2: "new writes only, never retro-translate" 유지 — 기존 한글 미소급.
- AC-3: 기존 protected-vocab/키/경로 영어 규칙 불변.

## 비고

- 적용은 신규 티켓부터(Designer가 Acceptance/Plan을 영어로 작성). 기존 다수 한글 Acceptance/
  Plan은 grandfather.
- design-system HTML(유저 리뷰 대상)과 design-system.md(내부 SoT)의 언어가 갈리는 점 명확화.
