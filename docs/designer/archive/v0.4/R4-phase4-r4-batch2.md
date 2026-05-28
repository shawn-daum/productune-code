# phase4-r4 Batch 2 — Designer Work Note

**Date**: 2026-05-19  **Session**: 5be4cbe1

## 티켓 emit 현황

| 티켓 | 제목 | 타입 | Assignee | 상태 |
|:--|:--|:--|:--|:--|
| T-P4-131 | design-system-author skill (G1) | design | pdt-designer | todo |
| T-P4-132 | deploy-playbook skill (G2) | design | pdt-designer | todo |
| T-P4-133 | qa-playwright-smoke skill (G9) | design | pdt-designer | todo |
| T-P4-134 | Playwright MCP install automation (G10) | impl | pdt-developer | todo |
| T-P4-135 | find-external skills G3+G4+G7 | design | pdt-designer | todo |
| T-P4-136 | PreToolUse frontmatter lint hook | impl | pdt-developer | done |
| T-P4-137 | SkillMatrix dynamic count + sort | impl | pdt-developer | todo |
| T-P4-138 | Kanban 7-col grid + STATUS_ORDER + i18n | impl | pdt-developer | todo |
| T-P4-139 | Phase gate UX removal + LeftSidebar PHASE strip | impl | pdt-developer | todo |

## 주요 설계 결정

1. **STATUS_ORDER** (T-P4-138): `['blocked','todo','in-progress','review','user-verify','done','abandoned']`
   - blocked 맨 왼쪽(긴급/주목), abandoned 맨 오른쪽(terminal archive)
   - 결정: 코드 주석 (decisions.md 대신 — promotion edit)
2. **i18n key 패턴** (T-P4-138): `workspace.tickets.status.<status>` — defaultValue fallback 포함
   - 결정: decisions.md approve (namespace 규칙 영구 보존)
3. **VersionHistoryView statusLabel 제거** (T-P4-138): hardcoded Korean map → t() 통합; `user-verify` 누락 버그 자동 수정
4. **SkillMatrix 정렬** (T-P4-137): `b.personas.length - a.personas.length || a.name.localeCompare(b.name)` — persona-overlap 내림차순 + 알파벳 tiebreak
5. **SKILLS_TOTAL 동적화** (T-P4-137): `window.api.listSkills()` IPC → `useState<number|null>` + loading `?` placeholder
6. **Phase gate chat-driven** (T-P4-139): PhaseTransitionGate modal 제거, PO 자연어 대화로 phase 전환. `pending_gate` schema + `phase:approve` IPC + 컴포넌트 파일은 legacy compat 보존.
7. **PreToolUse frontmatter lint** (T-P4-136): hook script + settings.json hooks.PreToolUse 등록, Write|Edit on docs/tickets/*/T-*.md → status/qa_status canonical enum 위반 시 exit 2 block.

## 감사 결과 — phuryn pm-* 퍼소나 과잉 배정

`inferPersonasFromPath` L1396: 모든 `phuryn/pm-*` → `['po','designer']` blanket 규칙.
- pm-data-analytics (3 skills) → **po 전용**
- pm-market-research (5/7 skills) → **po 전용**; customer-journey-map + user-personas 는 po+designer 유지
- pm-execution (1 skill) → **po 전용**
- pm-go-to-market → **per-skill split** (user 결정 c, 2026-05-19):
  - gtm-strategy / positioning / launch-plan → po+designer
  - ideal-customer-profile / pricing-strategy → po 전용
- 나머지(discovery, strategy, marketing-growth) → po+designer 유지 적절

→ follow-up impl ticket 발행 예정 — `inferPersonasFromPath` blanket rule을 path-level override map으로 교체.

## OQ resolution log

- ✅ pm-go-to-market persona 결정 = c (per-skill split, 2026-05-19)
- ✅ T-P4-136 settings.json 수동 등록 완료 = PO mechanical jq merge로 처리 (designer self-mod 하드 블록 우회, 2026-05-19)
- ✅ T-P4-124 drop-mv-script.sh 실행 완료 = PO 직접 실행, 40 skills `.archived-skills/`로 mv 처리 (2026-05-19)
- ✅ T-P4-139 LeftSidebar spacing check = dev smoke 시점 검증 (포지션 PO-fix amend 작업과 함께)
- ✅ T-P4-139 doctrine 3-file 업데이트 (po-loop-extras.md §4.1 / po-loop.md §4.2 / po-state-schema.md §4.3) = PO 직접 적용 (dev dispatch 전 선적용 권장)
