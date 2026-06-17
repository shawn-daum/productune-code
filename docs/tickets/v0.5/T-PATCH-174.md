---
ticket_id: T-PATCH-174
version: v0.5
slug: cmdp-cleanup-and-space-bug
title: Cmd+P 정리 — tab:/s:/mcp: 명령 삭제 + p: 뒤 띄어쓰기 시 커맨드 취소 버그
type: code
status: done
phase: 3
assignee: pdt-developer
requires_qa: true
qa_status: pass
requires_user_gate: false
area_tag: command-palette
risk_flags: []
estimated_complexity: L2
created_at: 2026-06-16T00:00:00Z
started_at:
completed_at:
duration_min:
---

# T-PATCH-174: Cmd+P 정리 + space 버그

## 요청 (user)
1. 거의 안 쓰는 명령 **삭제**: `tab:`(탭), `s:`(Skills), `mcp:`(MCP).
2. **버그**: `p:` 입력 후 **띄어쓰기**하면 커맨드가 취소됨(파싱이 space에서 prefix 인식 풀림).

## Fix
- command palette 컴포넌트(grep: cmd+p / commandPalette / CommandPalette / palette / 'p:' prefix 파서) 에서:
  1. `tab:` / `s:` / `mcp:` prefix 명령 정의 제거(+ 관련 핸들러·i18n).
  2. prefix 파싱이 `p:` 뒤 공백을 만나도 prefix 모드 유지하도록 수정(공백을 쿼리 일부로, prefix 취소 트리거에서 space 제외). 현재 로직 확인 후 space-cancel 제거.

## Acceptance
- AC-1: Cmd+P에 tab:/s:/mcp: 명령 없음.
- AC-2: `p:` 입력 후 공백 쳐도 커맨드 유지(취소 안 됨).
- AC-3: 다른 prefix 명령 회귀 없음. build PASS.

## Note
- 신규 명령(PRD, V:)은 T-PATCH-175 (같은 파일 — 175는 174 후 순차).
