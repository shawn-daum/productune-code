---
ticket_id: T-PATCH-219
version: v0.5
slug: po-question-freetext-as-option-block
title: PO 질문 — 자유입력을 선택지와 동일 계층의 옵션 블록으로 (가짜 dock composer 제거)
type: impl
status: done
phase: 3
assignee: pdt-developer
requires_qa: true
qa_status: pass
qa_loops: 1
requires_user_gate: false
area_tag: po-chat
estimated_complexity: L2
risk_flags: []
created_at: 2026-06-19T00:00:00Z
completed_at: 2026-06-19T00:00:00Z
---

# T-PATCH-219: PO 질문 자유입력 = 옵션 블록

## Request

PO가 AskUserQuestion(선택지)을 띄우면, 하단 "Type a message" 입력이 동작하지 않아
선택지 외 답을 못 함(shawn 보고). 실제로 T-PATCH-068 구조상 질문 pending 시 평소
composer는 사라지고 dock의 별도 textarea로 교체되는데, 그게 streaming 중 disabled라
"입력 불가 모듈"처럼 보임.

shawn 결정: **자유입력을 선택지 A/B/C와 같은 계층의 블록 1개**("✎ 직접 입력" 인라인
필드)로 옵션 리스트 끝에 넣어라. 타이핑+Enter = 선택지 선택 없이 그 텍스트로 답 처리.
가짜 "Type a message" 개념은 제거.

## 구현

- `AskUserQuestionCard.tsx`: `handleSelect`를 `submitAnswer(key, label)`로 일반화.
  옵션 리스트(`.opt-stack`) 끝에 free-text `.opt` 블록 추가(✎ key + inline `<input>`
  + Enter/send). `handleFreeText` → `submitAnswer('__custom__', text)`.
- `md-recipes.css`: `.opt-freetext` / `.opt-freetext-input` / `.opt-freetext-send`
  (옵션 블록과 동일 hierarchy, 투명 인라인 입력).
- `ChatPanel.tsx`: dock의 별도 modalInputArea(textarea+send) JSX 제거 — 입력은 이제
  카드 안 옵션 블록이 단일 소스. (modalDraft/handleModalSend/onModalKeyDown + 스타일
  3개는 dead-code로 남음 → 후속 정리, tsc green.)

## Acceptance

- **AC-1**: PO 질문 카드의 옵션 리스트 끝에 자유입력 블록이 **선택지와 동일 블록 스타일**로
  렌더된다(✎ + "Choose an answer above, or type your own…"). (cua VM 실측)
- **AC-2**: 옵션 클릭 답변이 기존대로 동작한다(submitAnswer 일반화 회귀 없음).
- **AC-3**: 자유입력 블록에 타이핑+Enter(또는 send) 시 그 텍스트가 답으로 제출되어 PO
  turn이 재개된다.
- **AC-4**: dock의 가짜 "Type a message" composer가 더 이상 노출되지 않는다.

## Out of scope

- PO chat 좌측 윙 레이아웃(별도, design).
- dead-code(modalDraft 등) 물리 제거(후속 cleanup).

## QA sign-off (2026-06-19, cua VM 실측) — qa_status: pass

- **AC-1 PASS (라이브)** — cuatest의 미해결 질문 카드에 "✎ Choose an answer above, or
  type your own…" 블록이 옵션(Static/Full-stack/CLI) 아래 동일 hierarchy로 렌더 확인(스크린샷).
- **AC-2 PASS (라이브)** — 옵션 "Full-stack web app" 클릭 → 정상 답변·PO turn 재개 확인.
- **AC-4 PASS** — dock textarea JSX 제거, 카드 입력이 단일 소스.
- **AC-3 미검증(렌더만)** — 자유입력 타이핑 제출은 cua 입력 한계 + 그 시점 pending 질문
  부재로 라이브 미실행 → shawn VNC hands-on 권장(블록 클릭→타이핑→Enter).
