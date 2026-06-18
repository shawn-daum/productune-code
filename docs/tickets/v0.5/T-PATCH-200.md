---
ticket_id: T-PATCH-200
version: v0.5
slug: persona-pane-memory-hierarchy
title: Persona pane — 기억 계층화 재설계 + hook/mcp/workflow-settings 비노출
type: refactor
status: in-progress
phase: 3
assignee: pdt-developer
requires_qa: true
qa_status: pending
requires_user_gate: true
area_tag: persona-pane
risk_flags: >
  PersonaDefTab 의 LT_MEMORY 하드코딩 맵을 doctrineListTiers IPC 로 교체한다 —
  listTiers 가 bookshelf 하위까지 열거하는지(relName 이 bookshelf/foo.md 로
  오는지) 검증 필요. 아니면 explorer:listDir 보강. habit 인라인 저장 시
  DoctrineFileTabHost 가 감싸던 save-choice/conflict UX 를 잃을 수 있음 → 최소
  mtime conflict 토스트 유지. Tier1 habit editable 플래그 확인(쓰기 화이트리스트).
  hook/mcp/workflow-settings 진입점 제거 시 탭 타입 union/디스패처는 고아로
  남음 — prune 또는 "unreachable 의도적 비노출" 주석.
estimated_complexity: L4
created_at: 2026-06-17T00:00:00Z
---

## 배경 / 목적

`PersonaDefTab.tsx` 의 altitude 가 뒤집혀 있다:
- 7줄짜리 thin agent spec(`~/.claude/agents/pdt-po.md`, 내용은 "Act per injected
  doctrine")이 **360px 미리보기 박스**(`:192-202, specViewerWrap height:360`)를 차지.
- 정작 행동을 좌우하는 메모리는 파일참조 1줄로 쪼그라듦(`:208-220`).
- **"PROJECT MEMORY" 섹션(`:222-241`)은 기억이 아니라 런타임 상태**(current version
  / active task / promo pending / last seen, po-state 파생 `:136-145`)다 — 라벨 거짓.

또한 같은 pane/Team/Settings 가 엔진 배관을 기획자에게 노출:
- persona pane `mcpServers` 행(`:174-179`) + PERSONA_META `mcpServers` 필드.
- Team 패널 MCP nav row(`TeamPanel.tsx:359, :426`).
- Settings 의 `mcp` / `hooks` / `workflow` 서브탭(`SettingsView.tsx:14,23-25,33-38`).

목표: **한 pane 안의 progressive disclosure** 로 기억을 계층화하고, 편집 불가/
무관한 엔진 배관(hook·mcp·workflow-settings)을 비노출. **앱 단위 모드분리는 안 함.**

(Tier 0 는 비노출 — 편집 불가하므로 클러터. skill-matrix / cost-archive 는 유지.)

---

## 설계 결정

### PANE — persona pane 재구성 (순서: 헤더 → 고급 → 프로젝트 기억 → 장기 기억)

| 영역 | 처리 |
|------|------|
| **헤더** | avatar · 이름 · 역할 + **상태 칩**(작업중 T-NNN / 대기) — 옛 "PROJECT MEMORY" 런타임값 흡수. modelHint 유지. |
| **고급(접힘, 기본 닫힘)** | id · permissionMode · source + 7줄 spec 미리보기. `mcpServers` 행 **제거**. |
| **프로젝트 기억 · 이 프로젝트에서만 (Tier 1, `docs/<persona>/`)** | `habit.md` → **인라인 미리보기(편집 가능)**. bookshelf/기타 → **사람 라벨 단 파일참조 row**(탭 열기). |
| **장기 기억 · 모든 프로젝트 (Tier 2, `~/.productune/<persona>/`)** | 동일: habit 인라인, 나머지 파일참조. |

- 데이터 소스: 하드코딩 `LT_MEMORY` 제거 → `api.doctrineListTiers(dir, projectDir)`
  (`preload.ts:725`). `tier !== 0` 필터.
- partition: `relName === 'habit.md'` → 인라인, 나머지(`exists` true) → 파일참조.
- 파일참조 라벨맵(파일명 fallback): habit→습관, calibration-log→라우팅 보정 로그,
  corrections→교정 피드백, project-notes→프로젝트 노트, user-knowledge-state→
  사용자 이해 상태, doctrine-editing→doctrine 편집 규칙.
- 빈 상태: habit 없으면 "이 프로젝트에서 아직 학습한 규칙 없음".
- habit 인라인 = 기존 `MarkdownViewer` 프리미티브 재사용(load=`doctrineReadFile`,
  save=`doctrineWriteFile` w/ expectedMtime).

### HIDE — 엔진 배관 진입점 제거

| 위치 | 조치 |
|------|------|
| `PersonaDefTab.tsx:35,42,49,56,174-179` | `mcpServers` 필드 + 행 제거. |
| `TeamPanel.tsx:359,426` | MCP nav row(`openTab('mcp-servers'...)`) 삭제. |
| `SettingsView.tsx:14,23,25,33-38` | 서브탭 union 에서 `mcp`/`hooks`/`workflow` 제거 + 각 openTab 분기 + 라벨 제거. Settings 엔 general/cost 만 잔류. |
| `workspace.ts:48-50`, `TabContent.tsx:61-63` | `mcp-servers`/`hooks`/`workflow-settings` 탭 타입은 도달 불가 → prune 또는 "unreachable — 의도적 비노출(T-PATCH-200)" 주석. |

---

## 수정 파일 목록 (files-to-touch)

| 파일 | 변경 |
|------|------|
| `packages/gui/src/components/workspace/main/panes/PersonaDefTab.tsx` | 전면 재구성(상기 PANE). MemoryTier 섹션 컴포넌트 분리 권장. |
| `packages/gui/src/components/workspace/TeamPanel.tsx` | MCP nav row 삭제. |
| `packages/gui/src/components/workspace/SettingsView.tsx` | mcp/hooks/workflow 서브탭 제거. |
| `packages/gui/src/store/workspace.ts` / `main/TabContent.tsx` | 고아 탭 타입 prune/주석. |
| `packages/gui/src/locales/en.json` / `ko.json` | 새 섹션/라벨/빈상태 키 추가(동기). |

---

## Acceptance Criteria

- **AC-1**: agent spec 은 기본 닫힌 "고급" 섹션 안에 들어가고, pane 진입 시 메모리 계층이 프라임 자리를 차지한다.
- **AC-2**: 프로젝트 기억(Tier1)·장기 기억(Tier2) 각각 habit 이 인라인 편집 미리보기로, bookshelf/기타가 사람 라벨 단 파일참조 row 로 표시된다. 원시 경로가 1차 라벨로 노출되지 않는다.
- **AC-3**: habit 없는 티어는 "아직 학습한 규칙 없음" 빈 상태를 표시한다.
- **AC-4**: 런타임 상태(version/task/promo/last-seen)는 헤더 칩으로 이동하고 "PROJECT MEMORY" 라벨은 사라진다.
- **AC-5**: persona pane 에 `mcpServers` 행이 없다.
- **AC-6**: Team 패널 / Settings 어디서도 `mcp-servers`·`hooks`·`workflow-settings` 탭을 열 수 없다(진입점 grep 0건). Settings 서브탭은 general/cost 만.
- **AC-7**: 4개 persona(po/designer/developer/qa) 모두에서 pane 이 정상 렌더(designer 의 대형 bookshelf 포함 — 파일참조 다수는 스크롤).
- **AC-8**: 고아 탭 타입은 prune 되었거나 의도적 비노출 주석이 달려있다.

---

## 구현 주의 사항

1. **doctrineListTiers bookshelf 열거 여부** 먼저 확인. top-level 만이면 `explorer:listDir`(`preload.ts:888`)로 bookshelf/ 보강.
2. **habit 인라인 저장 conflict** — `doctrine-file` 탭은 `DoctrineFileTabHost` 가 save-choice/conflict 모달을 감쌌다. 인라인 직접 쓰기는 그 UX 를 잃으므로, 인라인 저장도 host 플로우를 타게 하거나 최소 mtime conflict 토스트를 붙인다.
3. **Tier1 editable 플래그** false 면 인라인 미리보기를 읽기전용으로.

## QA 노트

shawn hands-on. 4개 persona 순회 렌더, habit 인라인 편집·저장·conflict, 파일참조
탭 열기, mcp/hooks/workflow 진입점 부재 확인.
