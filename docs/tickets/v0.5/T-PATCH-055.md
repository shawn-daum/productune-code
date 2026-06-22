---
ticket_id: T-PATCH-055
version: v0.5
phase: 3
type: impl
status: done
assignee: pdt-developer
created_at: 2026-06-05T12:00:00Z
estimated_complexity: L1
risk_flags: none
slug: label-text-fixes-batch
qa_status: skipped
requires_qa: false
area_tag: gui-labels
---

# T-PATCH-055: 레이블/텍스트 픽스 배치

## Request

4가지 레이블/텍스트 수정:
1. PersonaPresenceBar의 `designer` / `dev` 표시 → `Designer` / `Developer` (대문자, 전체 이름)
2. Ticket tab 버전탭에서 `팀 검토` → `QA`
3. PersonaDefTab(또는 TeamPanel) 내 tier 라벨 이름 변경 — T0 교리 → **T0 공통 기억**, T1 프로젝트 → **T1 프로젝트 기억**, T2 개인 → **T2 개인 기억**
4. Main panel에 패널이 1개만 남아 있을 때 탭의 X 닫기 버튼 숨기기

## Acceptance Criteria

- [ ] AC-1: `packages/gui/src/store/personaPresence.ts` — `PERSONA_LABELS.designer = 'Designer'`, `PERSONA_LABELS.dev = 'Developer'`
- [ ] AC-2: `packages/gui/src/locales/ko.json` — `"review": "팀 검토"` → `"review": "QA"` (ticket tab 버전탭)
- [ ] AC-3: `packages/gui/src/locales/ko.json` — tier labels 갱신:
  - `"tierT0": "T0 · 공통 기억"`
  - `"tierT1": "T1 · 프로젝트 기억"`
  - `"tierT2": "T2 · 개인 기억"`
- [ ] AC-4: `packages/gui/src/components/workspace/main/TabBar.tsx` (또는 PaneNode) — leaf pane이 1개일 때 해당 탭의 X 버튼 렌더링 숨김 (`display: none` 또는 조건부 렌더링)
- [ ] AC-5: locale `en.json`에도 AC-3 대응 영문 업데이트

## Plan

- `packages/gui/src/store/personaPresence.ts` lines 27-31
- `packages/gui/src/locales/ko.json` lines 240, 524-526
- `packages/gui/src/locales/en.json` tier label 대응
- `packages/gui/src/components/workspace/main/TabBar.tsx` 또는 `PaneNode.tsx` — 탭 개수 1일 때 X 버튼 조건부 숨김
