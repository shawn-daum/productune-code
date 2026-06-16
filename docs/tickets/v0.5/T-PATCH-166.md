---
ticket_id: T-PATCH-166
version: v0.5
slug: po-text-token-streaming
title: PO 텍스트 토큰 단위 스트리밍 (타자기 효과) — --include-partial-messages
type: code
status: review
phase: 3
assignee: pdt-developer
requires_qa: true
qa_status:
requires_user_gate: false
area_tag: text-streaming
risk_flags: [po-runner, stream-parse]
estimated_complexity: L3
created_at: 2026-06-16T00:00:00Z
started_at:
completed_at:
duration_min:
---

# T-PATCH-166: PO 텍스트 토큰 스트리밍

## 동기 (user)
PO 텍스트가 뭉텅이로 한 번에 나옴 → 글자별 타이핑(스트리밍)처럼 보이게.

## 원인
po-runner는 `type:'assistant'`의 **완성된 text part**만 `cb.onToken`(po-runner.ts:582-583). claude가 완성 assistant 메시지로 주므로 청크 단위 → 타자기 X. spawn args에 `--include-partial-messages` 없음.

## Fix (A = 진짜 토큰 스트리밍, claude-code-guide 확인)
`--include-partial-messages`를 켜면 토큰 단위 `content_block_delta`/`text_delta` 이벤트가 옴. (헤들리스 `--print --output-format stream-json --verbose`와 호환, `--agent`/`--permission-mode`와 직교.)

### po-runner 변경
1. **spawn args**(po-runner.ts:447-458)에 `--include-partial-messages` 추가(첫+resume 공통).
2. **delta 핸들러 추가** (`handleStreamJsonLine`):
   ```
   type:'stream_event' && event.type:'content_block_delta' && event.delta.type:'text_delta'
     → cb.onToken(msgId, event.delta.text)   // 토큰 단위 누적 = 타자기
   ```
3. **이중 append 방지**: partial 켜면 최종 `type:'assistant'` 메시지에 **전체 텍스트가 다시** 옴 → assistant 핸들러에서 **text part는 onToken 하지 말 것**(이미 delta로 받음). 단 **tool_use part는 그대로 처리 유지**(delegating/persona/도구 announce는 완성 assistant 메시지 기준 — T-148/165 유지). 즉 assistant 핸들러: text 스킵, tool_use 유지.
4. **nested(subagent) delta 처리** (T-165 정합): subagent의 text delta가 PO bubble 오염 안 되게 — `stream_event`에 nesting 마커(`parent_tool_use_id` 또는 다른 필드)가 실리는지 실측 후, nested delta는 onToken 스킵. (마커 미확인 시 — subagent text가 PO bubble에 섞이면 raw 덤프로 stream_event의 sidechain 필드 확정. T-165와 같은 마커 클래스.)

### 정합 주의 (기존 작업)
- T-148 delegating / T-164 subagent-done / T-165 nested 필터는 `type:'assistant'`/`type:'user'` 기준 — 그대로. delta는 TEXT 전용 신규 경로.
- MessageBubble 커서(streaming 중 ▋)는 그대로 — 이제 글자별로 따라감.

## Acceptance
- AC-1: PO 텍스트가 토큰/글자 단위로 점진 렌더(타자기). 한 번에 뭉텅이 X.
- AC-2: 텍스트 이중 표시 없음(delta + 최종 assistant 중복 append 방지).
- AC-3: tool 도구 표시·persona delegating·subagent-done·nested 필터(T-148/164/165) 회귀 없음.
- AC-4: subagent 내부 text가 PO bubble에 안 섞임(nested delta 스킵).
- AC-5: build PASS. 새 빌드 hands-on 검증(스트리밍 체감 + 회귀).

## Note
- 실측 의존: stream_event delta의 nesting 마커(AC-4)는 라이브 1턴 덤프로 확인 후 필터(T-165와 동일 마커 가능성). blind 금지.
- 이거 들어가면 T-163(작업중 인디케이터)의 근사 토큰 카운트도 delta 수로 더 정확해질 수 있음(시너지).
