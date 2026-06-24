---
ticket_id: T-PATCH-256
version: v0.5
slug: first-turn-reply-clobbered-by-chatpanel-reload
title: 첫 메시지 PO 응답이 화면/저장에서 사라짐 — FreshComposer→WorkspaceShell reveal 레이스가 streaming 버블을 덮어씀
type: impl
status: done
phase: 4
assignee: pdt-developer
requires_qa: true
requires_user_gate: false
area_tag: po-chat
estimated_complexity: L2
risk_flags: [store-core]
qa_status: pass
qa_loops: 0
completed_at: 2026-06-24
created_at: 2026-06-24T00:00:00Z
---

# T-PATCH-256: first-turn reply clobbered by ChatPanel reload race

## Request

shawn(2026-06-24): release dmg 설치 → 프로젝트 생성 → 첫 메시지("간단한 투자 도와주는앱") 전송 →
**응답이 화면에 안 뜸**. 단 OS 알림은 떠서 "시스템상 대답은 한 것 같다". CLI 환경 꼬임 의심.

## 진단 (확정)

CLI/파싱 문제 아님. 백엔드는 정상 — claude가 PO 답변을 풀로 생성했고(세션 transcript
`6a65a1cb…`에 "투자를 도와주는 앱을 만들고 싶으시군요!…" 그대로 존재), 세션 생성·turn 완료·
`po-turn-done` 알림(창 backgrounded)까지 정상. 그런데 `chat.json`에는 **user 메시지 + session_id만**
남고 assistant 응답이 없음. 동일 spawn(`--agent pdt-po --include-partial-messages --print
--output-format stream-json …`)을 해당 프로젝트 cwd에서 재현 → `text_delta` 정상 스트리밍 확인
(`which claude` = cmux 번들 v2.1.187이지만 무관).

근본 원인 = **렌더러 첫 턴 레이스 — mount 시 chat.json 디스크 리로드가 스트리밍 placeholder를 덮어씀**.
EntryGate가 `pending`이면 첫 메시지를 **FreshComposer**에서 보냄: `poSendMessage`(claude 첫 토큰까지
~2s)를 쏜 뒤 곧바로 `onConfirm()`으로 WorkspaceShell을 드러냄. WorkspaceShell mount 시 **두 컴포넌트가
같은 store에 chat.json을 중복 로드**:

1. (R1) WorkspaceShell `setProject(project)` reveal을 "switch"로 보고 messages/streaming 리셋(else
   브랜치도 streaming/inFlight 리셋).
2. (R2) **LeftSidebar** mount effect `chatGetSession()→setMessages(s.messages)` — **가드 전무**.
3. (R3) **ChatPanel** mount effect `chatGetSession()→setMessages(...)`.

chat.json은 그 순간 user 메시지만 있음(assistant는 `onDone`에야 persist). 그래서 R2/R3가
`setMessages([userMsg])`로 **스트리밍 중 assistant placeholder를 통째로 덮어씀** → 이후 `onToken`이
사라진 seg id를 찾아(`findIndex<0`) 전부 drop → `onDone`이 빈 placeholder prune → 화면·저장 모두 공백.
session_id는 별도 경로로 persist되어 chat.json에 남음.

**cua/playwright-electron 클린빌드 재현으로 확정**: ChatPanel만 가드한 1차 수정으론 부족 — 로그상
`onMsgId`(msgs 1→2) → ChatPanel guard skip → **LeftSidebar `setMessages(len1)`** → `onToken findIdx=-1`
drop → `onDone` 빈 prune. **LeftSidebar가 실제(또는 공동) 범인.** 둘 다 가드 후: 스트리밍 중 PO 버블
라이브 표시(cursor 포함) + chat.json에 assistant persist 확인. (T-P4-119는 listener 등록 레이스만
해결, setMessages 덮어쓰기 경로 미해결이었음.)

## Acceptance

- **AC-1**: 신규 프로젝트 첫 메시지 전송 시 PO 응답이 채팅에 정상 표시되고 `chat.json`에 persist된다
  (assistant segment 1개 이상). 빈 채팅으로 끝나지 않는다.
- **AC-2**: 첫 턴 reveal 직후 streaming 표시(working indicator/PO sprite working)가 끊기지 않는다
  (T-PATCH-252 의도 유지).
- **AC-3 (무회귀)**: 2번째 이후 일반 턴, 기존 프로젝트 열기, ⌘R 리하이드레이트, 진행 중 A→B 프로젝트
  전환 — 모두 정상(전환 시 새 프로젝트는 디스크에서 정상 reload, 이전 프로젝트 streaming 잔상 없음).
- **AC-4**: store core(`setProject`) 변경이 cross-project bleed를 재유발하지 않음(switch 브랜치 유지).

## Plan / Outcome (구현 완료)
dev:
1. `FreshComposer.handleSend` — `poSendMessage` 발사 **전에** `setProject(project)` + `appendMessage(userMsg)`
   로 store 소유권 확보 + user 버블 시딩(이후 reveal이 same-project else 브랜치로 들어가 messages 보존).
2. `store/workspace.setProject` else(same-project) 브랜치 — in-flight 필드(streaming/inFlightMsgId/
   streamingSince/turnCharCount) 리셋 제거(미persist라 ⌘R엔 무영향, 첫 턴 reveal엔 보존). switch
   브랜치는 그대로(cross-project 리셋 유지).
3. **`LeftSidebar` 로드 effect (실제 범인) + `ChatPanel` 로드 effect** — 둘 다
   `(streaming || inFlightMsgId) && messages.length>0` 이면 디스크 reload skip(스토어가 라이브 대화
   소유). A→B 전환은 switch 리셋으로 streaming=false 후 effect 재실행 → 정상 reload.

검증: cua/playwright-electron 클린빌드 재현 — 스트리밍 중 PO 버블 라이브(cursor 포함) + chat.json에
assistant persist 확인. AC-1/2 충족. 빌드(tsc+vite+electron) 통과.

follow-up(별도): ChatPanel·LeftSidebar가 동일 chat.json을 중복 로드하는 구조 — 단일 로더로 통합 검토.

## Out of scope
- po-runner 파싱/CLI 해석(정상 확인). 알림 동작. cmux claude 바이너리.

## Outcome
근본 원인 = mount 시 chat.json 디스크 리로드가 스트리밍 placeholder를 덮어쓰는 첫 턴 레이스. 1차로
ChatPanel만 가드했으나 부족 — playwright-electron 클린빌드 재현으로 **LeftSidebar**의 가드 없는
`chatGetSession→setMessages`가 실제(공동) 범인임을 확정. 4곳 수정(FreshComposer 시딩, setProject else
보존, ChatPanel+LeftSidebar in-flight 가드). 재현 검증: 스트리밍 중 PO 버블 라이브(cursor) + chat.json에
assistant persist. 빌드(tsc+vite+electron) 통과, dmg(Productune-0.5.0-arm64) 반영. follow-up(별도 티켓
후보): ChatPanel·LeftSidebar 중복 chat 로더 단일화.

## Persona Activity
(PO-managed)
