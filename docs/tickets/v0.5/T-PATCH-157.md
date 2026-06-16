---
ticket_id: T-PATCH-157
version: v0.5
slug: askuserquestion-answer-not-delivered
title: AskUserQuestion 선택 답변이 PO에 전달 안 됨 → PO가 텍스트로 재질문 (진단-우선)
type: code
status: done
phase: 3
assignee: pdt-developer
requires_qa: true
qa_status: pass
requires_user_gate: false
area_tag: askuserquestion-answer
risk_flags: [po-runner, cross-process, needs-runtime-repro]
estimated_complexity: L4
created_at: 2026-06-16T00:00:00Z
started_at:
completed_at:
duration_min:
---

# T-PATCH-157: AskUserQuestion 답변 미전달 (진단-우선)

## 증상 (user 확인, paepyeong GUI)
PO가 OQ(AskUserQuestion, 예 "지금 커밋?")를 띄움 → 사용자가 선택지 **제대로 선택** → **PO가 답을 못 받고** "다이얼로그가 닫힌 것 같습니다, 텍스트로 직접 여쭙니다"며 **같은 질문을 텍스트로 재질문**.

## 정적 분석 (PO, 2026-06-16)
- 답변 경로: 카드 → `chat:answerQuestion({sessionId, answerText, chosenKey})` (po.ts:68) → `runPoTurn({text: answerText, resume})` (po.ts:97). 핸들러 로직 = 정상.
- **session_id 캡처 정상으로 RULED-OUT**: po-runner가 `system.init` 이벤트(턴 시작, po-runner.ts:572)에서 capturedSessionId 설정 → `result` 없어도 onDone(534)이 전달. 즉 resume sessionId는 유효할 것.
- **유력 가설 = dangling tool_use**: AskUserQuestion은 tool_use로 emit되나 GUI가 `continue`로 skip(po-runner.ts:594-600) → tool_result 미제공 → PO 세션이 **미해결 tool_use로 종료**. `claude --resume <sid> --print <answerText>`로 이으면, 대화가 미해결 AskUserQuestion tool_use로 끝난 상태 + 새 user text 라 claude가 answerText를 그 질문의 답으로 바인딩 못 하고 재질문할 수 있음.

## 진단 스텝 (새 빌드에서 repro 먼저 — blind-fix 금지)
1. 재빌드한 GUI에서 OQ repro. po-runner 로그/stream-json 캡처: (a) AskUserQuestion 턴이 `result`를 emit하는지/`close` 시 capturedSessionId 값 (b) `chat:answerQuestion`이 받은 sessionId (c) resume 턴의 stream-json 첫 system.init + 그 PO가 본 직전 컨텍스트(미해결 tool_use 포함 여부) (d) PO가 answerText를 답으로 인식 vs 재질문.
2. 가설 확정 후 fix 방향 택1:
   - (A) answer를 plain user text가 아니라 **AskUserQuestion tool_use에 대한 synthetic tool_result**로 주입(가능하면) → dangling 해소.
   - (B) AskUserQuestion 턴을 tool_use로 두지 말고 PO가 질문을 **assistant text로 종료**하도록(턴이 깨끗이 끝남) + answer는 다음 user text — 그러면 dangling 없음. (T-PATCH-037 설계 재검토.)
   - (C) resume 프롬프트에 "직전 네 질문에 대한 사용자 답: <answerText>" 같은 명시 래핑으로 바인딩 강제(경량 우회).

## Acceptance (fix 후)
- AC-1: OQ 선택 → PO가 그 답을 받아 진행(재질문 X). 새 빌드 hands-on 검증.
- AC-2: 답 전달 실패 시에도 graceful(현 텍스트 fallback 유지)하되, 정상 경로에선 fallback 안 탐.

## Note
- cross-process + --print resume 거동이라 런타임 trace 필수. 정적 단정 금지(blind-iterate 교훈).
- 현 GUI는 stale 빌드 가능 — 새 빌드에서 재현되는지부터.
