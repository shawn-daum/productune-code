---
ticket_id: T-PATCH-163
version: v0.5
slug: composer-working-indicator
title: PO 작업 중 composer를 CLI 스타일 라이브 인디케이터로 (spinner+동사+elapsed+~tokens)
type: code
status: todo
phase: 3
assignee: pdt-designer
requires_qa: true
qa_status:
requires_user_gate: false
area_tag: composer-working-indicator
risk_flags: [design-needed]
estimated_complexity: L3
created_at: 2026-06-16T00:00:00Z
started_at:
completed_at:
duration_min:
---

# T-PATCH-163: composer 작업 중 인디케이터

## 동기 (user)
PO 작업(turn in-progress) 중엔 어차피 메시지 입력 불가 → 그 자리를 claude-code CLI 스타일 라이브 인디케이터로. "✶ Orchestrating… (4m 10s · ↓ 11.9k tokens)" 같은 "열심히 작업 중" 피드백. (persona bar=누가 / 이건=진행상황 — 보완.)

## 데이터 소스 (조사 완료)
- **작업 중 여부**: `workspace.streaming` (true=turn in-progress). composer가 이미 이걸로 disable.
- **활동 동사**: `sessionHealth` state로 구동 — `healthy/streaming`→"작업 중", `delegating`(+persona)→"Designer에게 위임 중", `compacting`→"정리 중" 등. (CLI의 whimsical 동사 대신 persona/health 기반 한국어 추천 — 정보성↑.)
- **elapsed**: streaming true 전환 시각을 캡처(workspace에 `streamingSince` 추가) → 1s tick로 "Nm Ns" 표시.
- **tokens(근사)**: exact count 미노출. `po:onToken` chunk 누적 텍스트 길이로 근사(chars/~4 → "↓ ~N.Nk"). 근사 표기(~) 또는 생략 선택. (exact 필요 시 po-runner가 usage 토큰 emit하는 별도 작업 — 본 티켓은 근사.)

## Designer plan-first 결정 (open)
1. 레이아웃: composer 입력칸 자리에 인디케이터 overlay/replace (spinner + 동사 + elapsed · ~tokens). 우측 stop 버튼(이미 있음, 이미지#13)과 공존.
2. 동사 카피 세트(health state별 한국어) + spinner 스타일(✶ 회전 등, reduced-motion 가드).
3. tokens 근사 표기 방식("↓ ~11.9k" vs 생략) + elapsed 포맷.
4. SessionHealth 배너/PoFab와 중복 안 되게(역할 분담).

## 구현 (dev, plan 후)
- `workspace.streamingSince` (streaming true 전환 시 stamp, false 시 clear).
- composer 컴포넌트(위치: ChatPanel 하단 입력부 — dev가 정확히 식별)에서 streaming 시 인디케이터 렌더: useState 1s 타이머(elapsed), sessionHealth 구독(동사), onToken 누적 길이(근사 토큰 — poEvents에서 per-turn 카운트 노출).
- react-best-practices: 타이머 cleanup, CSS-only spinner, reduced-motion.

## Acceptance
- AC-1: streaming 중 composer 자리에 spinner+동사+elapsed(+근사 tokens) 라이브 표시, 1s 갱신.
- AC-2: 동사가 health state 반영(위임 중엔 persona 명시).
- AC-3: turn 종료(streaming false) 시 인디케이터 사라지고 입력칸 복귀. stop 버튼 동작 유지.
- AC-4: reduced-motion 시 spinner 정지. build PASS.

## Note
- design-first(레이아웃/카피/spinner) → dev(streamingSince+타이머+근사토큰). exact 토큰은 후속 옵션.
