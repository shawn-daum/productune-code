---
ticket_id: T-PATCH-175
version: v0.5
slug: cmdp-prd-and-version-commands
title: Cmd+P 신규 명령 — PRD 열기 + V:(버전; 현재→프로젝트, 과거→버전히스토리)
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

# T-PATCH-175: Cmd+P PRD + V: 명령

## 요청 (user)
- **PRD 명령**: PRD 문서 열기(현 버전 PRD — `docs/prd/PRD.md` 또는 prd_anchor). cmd+p에서 바로.
- **V: 명령**(버전): 버전 목록 → 선택 시 — **현재 버전이면 현재 프로젝트(워크스페이스) 띄움**, **지난 버전이면 버전 히스토리(VersionDetailView/VersionHistory) 띄움**.

## Fix (command palette — T-174와 같은 파일, 174 이후 순차)
- `prd` 명령 추가: PRD md를 main pane(markdown viewer)으로 open. 경로 = po-state prd_anchor 또는 config/관례 `docs/prd/PRD.md`. (기존 파일 open 패턴 재사용.)
- `v:` prefix(또는 `version`) 명령: po-state `versions[]` 나열 → 선택:
  - `id === current_version` → 현재 프로젝트 워크스페이스 포커스(또는 VersionDetailView 현재).
  - else(과거) → VersionDetailView/VersionHistory 해당 버전 open.
- 기존 cmd+p 명령 등록 패턴 + VersionsPanel/VersionDetailView 라우팅 재사용.

## Acceptance
- AC-1: Cmd+P `prd` → PRD 문서 열림.
- AC-2: `v:` → 버전 목록; 현재 버전 선택=현 프로젝트, 과거=버전 히스토리.
- AC-3: build PASS.

## Note
- PRD 경로 결정: prd_anchor 우선, 없으면 docs/prd/PRD.md fallback. (dev가 코드서 prd 경로 출처 확인.)
