---
ticket_id: T-PATCH-165
version: v0.5
slug: tool-list-exclude-subagent-tools
title: 도구 리스트가 subagent 내부 도구(Write/Edit 등)까지 표시 — PO 자기 도구만 (nested 필터)
type: impl
status: done
phase: 3
assignee: pdt-developer
requires_qa: true
qa_status: pass
requires_user_gate: false
area_tag: tool-announce-filter
risk_flags: [po-runner, needs-stream-spec]
estimated_complexity: L2
created_at: 2026-06-16T00:00:00Z
started_at:
completed_at:
duration_min:
---

# T-PATCH-165: 도구 리스트 subagent 도구 제외

## 증상 (user, repro)
PO가 dev IMPL 위임(Agent) 후 "도구 N개" 리스트에 Bash/Read/**Write/Edit** 줄줄이 표시 — PO는 orchestrator라 코드 Write/Edit 안 하는데. = **subagent(dev)의 내부 도구**가 PO 도구 카운트/리스트에 섞임.

## 분석 (조사 완료)
- po-runner `handleStreamJsonLine`(556~): `type==='assistant'`의 `message.content[]` 중 모든 `tool_use`를 `cb.onAnnounce({level:'tool', toolName, toolInput})` → renderer가 "도구 N개" 리스트에 수집.
- `--verbose` 스트림에 subagent(sidechain) 내부 tool_use가 섞여 들어오는데 po-runner가 **top-level vs nested 구분 없이 전부 announce** → 오염.
- turns.jsonl은 GUI cost 로그(raw stream 아님)라 마커 확인 불가. **raw stream-json의 nested 마커는 Claude Code 사양** → claude-code-guide 확인 중(parent_tool_use_id / isSidechain / parentUuid / 다른 session_id 등 中).

## Fix (마커 확정 후)
- po-runner의 tool_use announce 분기에서 **nested(subagent) 이벤트를 필터** — claude-code-guide가 확정한 마커(예: `obj.parent_tool_use_id != null` 또는 `obj.session_id !== mainSessionId` 등)로 스킵.
- 결과: PO의 top-level 도구만 표시. **Agent/Task 디스패치는 1개 엔트리로** 유지(이미 announce됨), 그 subagent 내부 Read/Write/Edit/Bash는 제외.
- delegating health emit(persona 활성)은 top-level Agent tool_use 기준이므로 영향 없게(필터가 그건 통과).
- (옵션) 향후: subagent 도구를 Agent 엔트리 하위로 접어서 보여주는 UX도 가능하나 본 티켓은 "PO 도구만" 우선.

## Acceptance
- AC-1: dev/designer/qa 위임 시 "도구 N개"가 **PO 자기 도구 + Agent 디스패치 엔트리만** 카운트(subagent 내부 Write/Edit/Read/Bash 제외).
- AC-2: persona 활성(delegating)·정상 PO 도구 표시는 회귀 없음.
- AC-3: build PASS.

## Note — 마커 진단 결과 (claude-code-guide + 실측)
- **공식 docs는 sidechain 구분 필드를 미문서화** (claude-code-guide 확인). headless transcript도 헤드리스 `--print`에선 마커 노출 안 됨(확인).
- 즉 **마커는 실측으로만 확정**: dev가 fix 첫 스텝으로 raw 스트림 1샘플 캡처 — (a) po-runner에 임시 raw-line 로깅 추가 후 실제 위임 1회, 또는 (b) standalone `claude --agent pdt-po --print --output-format stream-json --verbose '<위임 유발 프롬프트>'` 실행 → subagent tool_use 줄의 top-level 필드 확인.
- **유력 후보(1순위 검증 대상)**: 메시지 봉투의 `obj.parent_tool_use_id` — sidechain(subagent) 이벤트면 non-null(부모 Agent tool_use id), top-level이면 null/부재. 확인되면 `handleStreamJsonLine` 진입부에서 `if (obj?.parent_tool_use_id != null) { /* nested: skip tool announce (delegating/persona는 top-level Agent에서 이미 처리) */ }` 로 필터. 다른 필드(session_id 차이 등)면 그에 맞게.
- blind-fix 금지 — 캡처로 필드 확정 후 필터.
- po-runner가 top-level/nested 무필터인 건 코드상 확실(원인 확정). stale 빌드 무관.
