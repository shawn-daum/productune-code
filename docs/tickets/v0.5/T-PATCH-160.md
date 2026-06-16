---
ticket_id: T-PATCH-160
version: v0.5
slug: explorer-json-viewer
title: 탐색(explorer)에서 연 .json도 JSON viewer로 (artifacts와 동일)
type: code
status: done
phase: 3
assignee: pdt-developer
requires_qa: true
qa_status: pass
requires_user_gate: false
area_tag: json-viewer
risk_flags: []
estimated_complexity: L1
created_at: 2026-06-16T00:00:00Z
started_at:
completed_at:
duration_min:
---

# T-PATCH-160: explorer .json → JSON viewer

## 현 상태 (조사 완료)
- 산출물(artifacts)은 `.json`을 `artifact-json` 탭(`ArtifactJsonTab.tsx` — 접이식 트리/breadcrumb/find)으로 연다 (`ArtifactsPane.tsx:140-141`).
- **탐색(explorer)은 `.json`을 raw code-view로 연다** — `ExplorerPane.tsx:13-29` `resolveTabKind()`가 `.json`을 `TEXT_EXTS`에 넣어 `{ type: 'code-view', readonly: true }` 반환 → `CodeViewTab`(raw 텍스트).

## Fix
`packages/gui/src/components/explorer/ExplorerPane.tsx`:
- `resolveTabKind()`에서 `.json`을 `TEXT_EXTS`에서 제외하고 `{ type: 'artifact-json' }` 반환하도록 분기 추가.
- 탭 open 시 props `{ absPath, relPath, projectDir }` 전달 (ArtifactJsonTab 계약 — `projectDir`는 code-view 경로에서 이미 사용 가능, line ~91).
- `ArtifactJsonTab`은 그대로 재사용(변경 없음 — absPath/relPath/projectDir 받아 `api.artifactsReadFile`로 로드).

## Acceptance
- AC-1: 탐색에서 `.json` 파일 open → artifacts와 동일한 JSON 트리 뷰어로 렌더(raw 텍스트 아님).
- AC-2: relPath breadcrumb + 접이식 트리 + find 동작.
- AC-3: 다른 확장자(.yml/.ts 등)는 종전대로 code-view 유지. build PASS.
