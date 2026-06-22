---
ticket_id: T-PATCH-158
version: v0.5
slug: po-runner-agent-tool-detect
title: po-runner 위임 감지 도구명 'Task'→'Task'|'Agent' (persona 활성 안 되던 진짜 root)
type: impl
status: done
phase: 3
assignee: pdt-developer
requires_qa: true
qa_status:
requires_user_gate: false
area_tag: persona-presence
risk_flags: [po-runner, core-runtime]
estimated_complexity: L1
created_at: 2026-06-16T00:00:00Z
started_at:
completed_at:
duration_min:
---

# T-PATCH-158: 위임 감지 도구명 Task|Agent

## Root (repro로 확정)
재빌드 GUI에서 PO가 sub-agent 위임 시 도구명이 **`Agent`**(subagent_type: pdt-designer 등) — Claude Code가 sub-agent 도구를 Task→Agent로 리네임. 그러나 po-runner는 `'Task'`만 감지(po-runner.ts:408, 615) → `delegating` health emit이 영영 안 됨 → PersonaPresenceBar의 designer/dev/qa가 'working'으로 안 켜짐. (T-148 wiring은 정상 — 트리거가 도구명 불일치로 안 걸렸을 뿐.)

## Fix
`packages/gui/electron/po-runner.ts` — 위임 감지를 **`'Task'` OR `'Agent'`** 둘 다로 (리네임 대응 + 하위호환):
- line ~408 `handleToolUseHealth`: `if (toolName === 'Task')` → `if (toolName === 'Task' || toolName === 'Agent')`.
- line ~615 subagent_type 추출: `if (part.name === 'Task' && ...)` → `if ((part.name === 'Task' || part.name === 'Agent') && typeof part?.input?.subagent_type === 'string')`.
- (상수로 묶어도 됨: `const DELEGATE_TOOLS = ['Task','Agent']` → `.includes(...)`.)

다른 로직(persona-aware dedupe, detail.persona/task, poEvents 매핑) 불변.

## Acceptance
- AC-1: 도구명이 `Agent`인 위임 tool_use → `delegating` emit + detail.persona=subagent_type → designer/dev/qa 'working' 활성. (새 빌드 hands-on: 실제 designer 위임 시 Designer 캐릭터 애니.)
- AC-2: `Task`(구 이름)도 여전히 감지(하위호환).
- AC-3: `pnpm --filter @productune/gui build` PASS. po-runner.ts 외 변경 없음.

## Note
- 이게 "persona가 PO만 활성" 의 진짜 root. T-148(wiring)·T-147(배너)·T-155(카운트)와 별개 트리거 버그.
- 새 빌드/electron 재시작 후 적용.
