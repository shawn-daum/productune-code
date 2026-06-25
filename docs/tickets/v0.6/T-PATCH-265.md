---
ticket_id: T-PATCH-265
version: v0.6
slug: toolcall-detail-toggle-default-open
title: tool-call 최하단 토글(도구 상세 인자) 기본 expanded (#13)
type: impl
status: done
phase: 3
assignee: pdt-developer
requires_qa: true
qa_status: pass
qa_loops: 1
requires_user_gate: false
area_tag: po-chat
estimated_complexity: L1
risk_flags: []
created_at: 2026-06-25T02:30:00Z
---

# T-PATCH-265 (#13): tool-call detail toggle default-open

## Request
PO 채팅 tool-call 표시에서 최하단 토글(도구 상세 내용: path/limit 등 인자)이 기본 접힘 → 도구 펼쳐도 내용 보려면 한 번 더 펼쳐야 함. 기본 expanded로.

## Acceptance
- AC-1: tool-call 상세(인자) 토글 default = open/expanded. 도구 펼치면 전체 내용 바로 노출.
- AC-2: 토글 접기/펴기 동작 유지(default만 변경). 무회귀.

## Plan
dev: tool-call 렌더 컴포넌트(ChatPanel tool 표시부)의 detail 토글 초기 state expanded. QA: 도구 표시 시 상세 즉시 노출 확인.

## Outcome
ToolRow (ToolUseGroup.tsx) inner detail toggle: useState(false) → useState(true). Outer group toggle unchanged (still collapses by default). Single-line change.

## Persona Activity
(PO-managed)
