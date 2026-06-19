---
ticket_id: T-PATCH-223
version: v0.5
slug: chatpanel-dock-composer-deadcode-cleanup
title: ChatPanel — dock composer dead-code 제거 (T-PATCH-219 후속)
type: refactor
status: todo
phase: 3
assignee: pdt-developer
requires_qa: true
requires_user_gate: false
area_tag: po-chat
estimated_complexity: L1
risk_flags: []
created_at: 2026-06-19T00:00:00Z
---

# T-PATCH-223: ChatPanel dock composer dead-code 정리

## Request

T-PATCH-219에서 질문 dock의 별도 textarea(가짜 "Type a message")를 제거하면서
관련 심볼이 미사용으로 남음(tsc green이라 빌드는 통과하나 dead-code):

- `ChatPanel.tsx`: `modalDraft`/`setModalDraft` 상태, `handleModalSend`(useCallback),
  `onModalKeyDown`, 그리고 스타일 `modalInputArea`/`modalTextarea`/`modalSendBtn`.

자유입력은 이제 `AskUserQuestionCard`의 옵션 블록이 단일 소스이므로 위 심볼은 전부 제거.

## Acceptance

- **AC-1**: 위 미사용 심볼/스타일이 제거되고 tsc green.
- **AC-2**: 질문 pending/일반 composer 동작 회귀 없음(질문 시 카드 입력, 평소 시 하단 composer).

## Out of scope
신규 기능 없음 — 순수 정리.
