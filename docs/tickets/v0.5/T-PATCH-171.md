---
ticket_id: T-PATCH-171
version: v0.5
slug: working-indicator-tweaks
title: 작업중 인디케이터 다듬기 — 토큰 단위 표기 + 작업중엔 파일버튼 숨김 + status·stop 한 줄 컴팩트
type: code
status: review
phase: 3
assignee: pdt-developer
requires_qa: true
qa_status:
requires_user_gate: false
area_tag: composer-working-indicator
risk_flags: []
estimated_complexity: L2
created_at: 2026-06-16T00:00:00Z
started_at:
completed_at:
duration_min:
---

# T-PATCH-171: 작업중 인디케이터 다듬기 (T-163 후속)

## 요청 (user)
1. **`↓ ~19` 단위 없음** → 무슨 수치인지 불명확. 단위 붙이기 — 근사 출력 토큰이므로 `↓ ~19 tok`(또는 `~19 토큰`). (T-163 formatApproxTokens 가 chars/4 근사.)
2. **작업 중엔 파일(📎 paperclip/attach) 버튼도 숨김** — streaming 중엔 첨부 불가하니 버튼 자체 비표시.
3. **작업중 status row + 멈춤(stop) 버튼을 같은 row로 = 컴팩트.** 현재 인디케이터(textarea 자리)와 stop(inputRow 아래)이 2줄 → streaming 시 한 줄로(인디케이터 + 우측 stop).

## Fix (ChatPanel.tsx — T-163 WorkingIndicator + inputRow)
- formatApproxTokens 출력에 단위 `tok` 추가(`↓ ~N.Nk tok` / `↓ ~N tok`). i18n 키면 ko/en 정합.
- streaming && !rateLimited 일 때: inputRow의 paperclip 버튼 숨김(렌더 조건에 `!streaming`).
- 레이아웃: streaming 시 WorkingIndicator와 stop 버튼을 **한 row**에(인디케이터 flex:1 좌측 + stop 우측). 즉 textarea→인디케이터 토글 시 inputRow도 컴팩트 1줄 구성으로. (idle: 기존 textarea + inputRow 그대로.)

## Acceptance
- AC-1: 작업 중 토큰 수치에 단위(`tok`/토큰) 표기.
- AC-2: 작업 중 paperclip 버튼 비표시(idle 시 복귀).
- AC-3: 작업 중 인디케이터 + stop 버튼이 한 줄(컴팩트). idle 레이아웃 회귀 없음. build PASS.
