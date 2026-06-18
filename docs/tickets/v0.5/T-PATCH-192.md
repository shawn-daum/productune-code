---
ticket_id: T-PATCH-192
version: v0.5
type: fix
status: user-verify
phase: 4
assignee: pdt-developer
created_at: 2026-06-17T00:00:00Z
estimated_complexity: L1
risk_flags: none
slug: chatpanel-duplicate-message-key
qa_status: pending
---

# T-PATCH-192: ChatPanel 메시지 목록 중복 key 경고

> 채팅 메시지 렌더링 중 React 경고 `Encountered two children with the same key`
> 가 발생. 같은 message id 가 `messages` 배열에 두 번 존재할 수 있다는 신호 —
> 중복/누락 렌더 위험.

## §1 Background

콘솔 경고 (2026-06-17, T-PATCH-191 작업 중 발견):

```
Warning: Encountered two children with the same key, `m-1781584984531-psldpv`.
  at div … ChatPanel (src/components/workspace/ChatPanel.tsx)
```

- `ChatPanel`은 `renderItems = injectDividers(groupToolTraces(messages), …)` 를
  `item.key`(= message id)로 렌더.
- 동일 id 메시지가 `messages`에 두 번 들어가면 key 충돌 → React가 중복/누락을
  일으킬 수 있음(unsupported).
- 발생 경로 미확정. 후보:
  - `appendMessage` 외 경로(`setMessages`, 스트리밍 final 치환 등)에서 같은 id
    재삽입
  - 세션 복원(chat.json) + 런타임 append 가 같은 id 로 겹침
  - id 생성 충돌(`m-${ts}-${rand}`) — 가능성 낮음

## §2 Acceptance

- [ ] 중복 발생 경로 재현/특정 (어떤 append 경로가 같은 id 를 두 번 넣는지)
- [ ] 근본 원인 수정 (append/merge dedup 일원화) — 렌더 레벨 key 회피가 아닌
      데이터 레벨에서 중복 제거
- [ ] 콘솔에서 duplicate-key 경고 사라짐
- [ ] 기존 메시지 렌더/스트리밍/세션 복원 회귀 없음

## §3 Notes

- 기능 영향은 경미(경고 수준)하나, 중복/누락 렌더 잠재 버그라 fix 대상.
- T-PATCH-191(인앱 브라우저) 작업 중 부수 발견, 범위 밖이라 별도 티켓으로 분리.
