---
ticket_id: T-PATCH-054
version: v0.5
phase: 3
type: build
status: done
assignee: pdt-developer
created_at: 2026-06-05T12:00:00Z
estimated_complexity: L2
risk_flags: persona-tab, hardcode
slug: persona-tab-skill-count-dynamic
qa_status: skipped
requires_qa: true
area_tag: gui-team-panel
---

# T-PATCH-054: Persona tab 스킬 개수 하드코딩 제거 → 동적 바인딩

## Request

Persona tab에서 스킬 개수가 하드코딩되어 있음. 실제 데이터에서 동적으로 읽어야 함.

## Acceptance Criteria

- [ ] AC-1: GUI 전체에서 per-persona 스킬 개수가 하드코딩된 곳 탐지 (grep: 숫자 리터럴 + 스킬/skill 근처)
- [ ] AC-2: 발견된 하드코딩 → `api.listSkills()` 반환 데이터의 `skill.personas` 필드로 동적 계산
- [ ] AC-3: SkillMatrixTab의 persona filter 칩에 per-persona 개수 badge 추가 (optional — 있으면 좋음)
- [ ] AC-4: PersonaDefTab 또는 TeamPanel에 per-persona 스킬 개수를 표시하는 UI가 있다면 동적으로 바인딩

## Plan

- `grep -rn "[0-9]" packages/gui/src/ | grep -i skill` 로 하드코딩 탐지
- `packages/gui/src/components/workspace/main/panes/SkillMatrixTab.tsx` — persona chip에 `skills.filter(s => s.personas.includes(p)).length` badge 추가
- `packages/gui/src/components/workspace/TeamPanel.tsx` 확인 — 이미 skillsTotal 동적 있음, 누락 부분만 보완
