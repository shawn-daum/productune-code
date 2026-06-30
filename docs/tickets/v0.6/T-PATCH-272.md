---
ticket_id: T-PATCH-272
version: v0.6
slug: chatonly-pure-chat
title: chat-only 시작화면 = 순수 PO 채팅만 (ActivityBar 숨김 + WelcomePanel 제거 + 채팅 full-width) (#18, #11 refine)
type: impl
status: done
phase: 3
assignee: pdt-developer
requires_qa: true
qa_status: pass
qa_loops: 1
requires_user_gate: false
area_tag: gui
estimated_complexity: L2
risk_flags: []
created_at: 2026-06-30T00:30:00Z
---

# T-PATCH-272 (#18): chat-only = pure PO chat

#11(T-269) chat-only 실물 확인 후 shawn 피드백. 현 chat-only = ActivityBar(좌측 아이콘) 그대로 + WelcomePanel(가운데 `{ }` 인트로 "오른쪽 PO와 대화하며 시작해요") + 채팅(우측, 작음). → **순수 PO 채팅만** 원함.

## Acceptance
- **AC-1**: chat-only 모드(current_version==null)에서 **ActivityBar 완전 숨김**(현재 컬럼 그대로 노출 — dim도 아님). 
- **AC-2**: 가운데 **WelcomePanel(인트로) 제거** — 별도 인트로 영역 없이 PO 채팅만.
- **AC-3**: PO 채팅이 **full-width(=primary, 크게)**. 첫 대화 시 작던 문제 해소.
- **AC-4 무회귀**: version 생기면(#14/#11) 다시 full 레이아웃(ActivityBar + Sidebar + MainPanel + chat)으로 reversible 복귀. 타이틀바(traffic light + "{} <project>")는 유지.

## Out of scope
- full 레이아웃(버전 있을 때) 변경. PO 첫 인사/안내는 채팅 메시지로(별도 패널 X).

## Plan
dev(subsystem A WorkspaceShell dynamicGrid + WelcomePanel 작성자): chat-only 그리드 템플릿을 `chat`만(또는 titlebar+chat)으로, ActivityBar 컬럼/렌더 제외, WelcomePanel 마운트 제거. `pnpm dev` 핫리로드로 즉시 확인. QA: chat-only=순수채팅 / 버전 생성 시 full 복귀 무회귀(build + 시각).

## Outcome
done — chat-only(current_version==null) = 순수 PO 채팅만: ActivityBar 완전 숨김 + WelcomePanel 제거(파일 삭제, welcome locale 키 제거) + chat-only dynamicGrid = 단일 컬럼. 첫 full-width가 큰 화면서 너무 넓다는 피드백 → **gridTemplateColumns: minmax(0,760px) + justifyContent:center** (CHATONLY_CHAT_MAX_WIDTH=760, 읽기폭). full 레이아웃(버전 있을 때) byte-identical 무회귀. QA: build green(npm run build). ※ 760 폭 user-eyeball 최종 confirm은 미완(full→760 변경 직후 trust 버그로 빠짐) — 폭 tweak 가능, runtime flag.

## Persona Activity
(PO-managed)
