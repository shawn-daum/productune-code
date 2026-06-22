---
ticket_id: T-PATCH-052
version: v0.5
phase: 3
type: impl
status: done
assignee: pdt-developer
created_at: 2026-06-05T12:00:00Z
estimated_complexity: L2
risk_flags: po-chat, restart-session
slug: po-session-restart-ux
qa_status: skipped
requires_qa: true
area_tag: gui-chat
---

# T-PATCH-052: PO 세션 재시작 완료 UX — 모달 + chat 구분선

## Request

PO 세션 재시작 완료 후 아무 피드백이 없어서 됐는지 모름. 두 가지 개선:
1. 재시작 완료 시 **완료 모달** 하나 띄워주기
2. 채팅 내역에서 세션 재시작 지점에 **구분 border** 표시

## Acceptance Criteria

- [ ] AC-1: 세션 재시작 완료 이벤트 수신 시 간단한 완료 modal 표시 (`세션이 초기화되었습니다` 등) — 3초 후 자동 닫힘 또는 확인 버튼
- [ ] AC-2: 세션 재시작 후 이어지는 첫 메시지 직전 채팅 목록에 구분선(divider) 삽입 — "── 세션 초기화 ──" 형식 또는 날짜 구분선 스타일
- [ ] AC-3: 구분선은 메시지 목록 내에 영구 표시 (스크롤해도 유지)
- [ ] AC-4: 세션 재시작 중 버튼 비활성화(loading 상태) — 기존 RestartSessionModal과 연동

## Plan

- `packages/gui/src/components/workspace/ChatPanel.tsx` — restart 완료 이벤트 구독 + divider 삽입 로직
- `packages/gui/src/components/workspace/RestartSessionModal.tsx` — 완료 시 onComplete 콜백
- divider 컴포넌트: 인라인 스타일 또는 별도 `SessionDivider.tsx`
- 완료 모달: 기존 `BaseDirtyModal`/`GenericDirtyModal` 패턴 또는 toast-style
