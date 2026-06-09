---
ticket_id: T-PATCH-073
version: v0.5
phase: 3
type: build
status: done
assignee: pdt-developer
created_at: 2026-06-08T00:00:00Z
estimated_complexity: L2
risk_flags: chat-panel, ask-user-question, persistence
slug: ask-question-dismiss-persist
qa_status: pending
requires_qa: false
area_tag: gui-chat
parent_ticket: T-PATCH-068
---

# T-PATCH-073: AskUserQuestion X-보류 영속화 (재등장 방지)

## Context

shawn: T-068 질문 모달이 issue-tracker 등에서 **계속 재등장**. 근본 원인 = `handleDismissQuestion`(X) 가 **transient `dismissedQuestionId`(useState)** 만 세팅하고 원본 질문 메시지를 resolved/dismissed 로 **영속화하지 않음**. ChatPanel 리마운트 / 프로젝트 전환 / chat.json 재로드 시 `dismissedQuestionId` 가 null 로 리셋되고 원본 질문은 여전히 `unresolved` → `pendingQuestion` 이 다시 잡아 **재등장**.

대조: option-select(`AskUserQuestionCard.handleSelect`)는 `setMessages` 로 payload.resolved 패치 + main-side answer handler 가 영속화 → 재등장 안 함. X 경로엔 그 영속화가 없음.

## Acceptance Criteria

- [ ] AC-1: X(보류) 클릭 시 원본 ask-user-question 메시지가 resolved/dismissed 로 패치되고 chat.json 에 영속화됨
- [ ] AC-2: 리마운트 / 프로젝트 전환 / 앱 재시작 후에도 보류한 질문이 재등장하지 않음
- [ ] AC-3: 기존 동작 유지 — PO 버블 "질문 답변 보류, 어떻게 진행하시겠어요?" 합성+표시 (LLM 없이), 패널 닫힘
- [ ] AC-4: option-select 영속화(기존)·재등장 방지 회귀 없음

## Plan

**File: `packages/gui/src/components/workspace/ChatPanel.tsx` (`handleDismissQuestion` ~L221-238)**

handleSelect 의 영속화 패턴을 차용:
1. `setMessages` 로 원본 `pendingQuestion` 메시지의 payload 를 dismissed 표시로 패치(예: `resolved: { chosenKey: '__dismissed__' }` 또는 payload 에 `dismissed: true` 플래그 — `pendingQuestion` 의 `!resolved` 가드가 제외하도록). store 패치 후 그 패치가 chat.json 에 남도록 영속화.
2. 영속화 경로: handleSelect 는 main-side answer handler(`api.chatAnswerQuestion`)가 resolved 패치를 영속화함. X 에는 answer 호출이 없으므로, (a) 동일 main-side 핸들러를 dismissed 마커로 호출하거나 (b) 메시지 편집을 chat.json 에 반영하는 api(있으면)로 패치된 메시지를 영속화. dev 가 기존 메시지-수정 영속 메커니즘 확인 후 mirror.
3. `dismissedQuestionId` transient 가드는 즉시 숨김용으로 유지 가능하나, 영속 패치가 진짜 backstop. `pendingQuestion`(most-recent-only, T-068)이 dismissed 패치를 제외하도록 확인.

## Note

QA 불요(로직), 단 shawn 이 리로드/프로젝트전환 후 재등장 없음 확인 필요.
