# T-P4-040 Stage Strip — Implementation Plan

**Created**: 2026-05-07  **Author**: pdt-developer  **Ticket**: T-P4-040

---

## 1. Project Tab Position Decision

**Decision: Option A — ActivityBar에 Project 탭 신설** (현재 4번째 자리, settings 앞)

근거:
- mockup.html `#ab-project` 버튼이 명시적으로 존재함 (Explorer / Project / Team / Settings 순)
- design doc §3.1 Activity Bar = "4 아이콘 — Explorer / Project / Team / Settings"
- 현재 구현은 tickets/artifacts/versions/settings — mockup 비정합. Project 탭 신설이 정합성 복구 경로
- Option B (tickets 탭 흡수)는 "Project" 개념 손실 + 설계 훼손

ActivityBar 아이콘 순서 (신규):
1. Explorer (`FolderTree` — FolderOpen 유지)
2. Project (`LayoutDashboard`)
3. Team (`Users`)
4. Settings (`Settings`)

> 기존 `tickets` / `artifacts` / `versions` ActivityIcon 값은 하위호환 유지 (LeftSidebar 분기 추가).
> 단, WorkspaceShell `activeIcon` 기본값을 `'project'`로 변경.

---

## 2. 6-Stage Mapping Logic

po-state 필드: `current_phase` (1..4) + `current_task.stage` (design|impl|refactor|test|qa|deploy)

| Stage Strip | 판별 조건 (priority 순) |
|---|---|
| PRD | `current_phase === 1` |
| Design | `current_phase === 2` 또는 `current_task.stage === 'design'` |
| Build | `current_task.stage in ['impl','refactor','test']` |
| QA | `current_task.stage === 'qa'` |
| Deploy | `current_task.stage === 'deploy'` |
| Operate | `current_phase === 4` (Close phase) |

**순서**: PRD < Design < Build < QA < Deploy < Operate (고정 인덱스 0..5)

**activeIndex 계산**:
```ts
function getActiveStageIndex(poState: PoState | null): number {
  if (!poState) return 0 // PRD default
  const phase = poState.current_phase
  const taskStage = poState.current_task?.stage
  if (phase === 4) return 5           // Operate
  if (taskStage === 'deploy') return 4 // Deploy
  if (taskStage === 'qa') return 3     // QA
  if (taskStage === 'impl' || taskStage === 'refactor' || taskStage === 'test') return 2 // Build
  if (phase === 2 || taskStage === 'design') return 1 // Design
  return 0 // PRD (phase === 1 또는 no state)
}
```

**item 상태**:
- `index < activeIndex` → `done`
- `index === activeIndex` → `cur`
- `index > activeIndex` → `pending`

**'Operate' 가정**: po-state `current_phase === 4` (Close) 는 deploy 완료 후 운영 단계로 해석.
po-instructions doctrine 에 `current_phase == 4` = Close 라고 명시되어 있으므로 Operate와 Close를 동치로 처리.

---

## 3. 색 토큰

mockup.html CSS 변수 (진실):
```
--stage-prd:     #A78BFA  (violet)
--stage-design:  #F472B6  (pink)
--stage-build:   #38BDF8  (sky)
--stage-qa:      #34D399  (emerald)  ← mockup 명시
--stage-deploy:  #FB923C  (orange)   ← mockup 명시
--stage-operate: #FBBF24  (amber)    ← mockup 명시
```

React 컴포넌트에서 CSS 변수 사용 불가 (inline style) → 상수 맵으로 정의.

---

## 4. rp-ctx stage chip 통합 방식

현재 ChatPanel `rp-ctx`:
- `PHASE_COLOR` 맵 (PRD/Design/Build/Close 4종)
- `PHASE_NAMES[current_phase]` 라벨

변경:
- `stage-mapping.ts` 의 `getActiveStageIndex` + `STAGE_DEFS` 사용
- chip 라벨 = `STAGE_DEFS[activeIndex].label` ("PRD" / "Design" / ... / "Operate")
- chip 배경 = stage 색 (어두운 bg + stage 색 텍스트, mockup `.stage-chip` 패턴)
- 기존 `PHASE_COLOR` / `PHASE_NAMES` 는 ChatPanel 에서만 제거 (다른 곳 사용 시 유지)

mockup `.stage-chip` = `background:#1f2a3a` + `color:var(--stage-build)` (Build 예시)
→ 공통 패턴: bg `#1e1e2e` (어두운) + color = stage 색

---

## 5. 파일 목록

| 파일 | 역할 |
|---|---|
| `src/lib/stage-mapping.ts` | 신규 — STAGE_DEFS + getActiveStageIndex |
| `src/components/workspace/StageStrip.tsx` | 신규 — Project 탭 + rp-ctx variant |
| `src/components/workspace/ActivityBar.tsx` | 수정 — ActivityIcon 타입 + Project 탭 추가 |
| `src/components/workspace/LeftSidebar.tsx` | 수정 — project 분기 추가 |
| `src/components/workspace/ChatPanel.tsx` | 수정 — rp-ctx chip → stage-mapping 사용 |
| `src/views/WorkspaceShell.tsx` | 수정 — 기본 activeIcon 변경 + project 분기 |
| `src/locales/en.json` | 수정 — workspace.stageStrip.* + activityBar.project |
| `src/locales/ko.json` | 수정 — 동일 키 한글 |

---

## 6. StageStrip variant

- `variant="strip"` (default) — Project 탭 전체 strip (dot + label, 240px scroll)
- `variant="chip"` — rp-ctx 단일 pill (현재 stage만)

---

## 7. 240px 폭 제약

mockup: `stage-strip` = `display:flex; flex-wrap:wrap` 또는 수평 scroll.
→ `overflowX: 'auto'`, `flexWrap: 'nowrap'` — 좁은 폭에서 4개 노출 후 scroll.
separator `›` 포함 아이템 최소 폭 약 52px × 4 = 208px → 240px 에서 4개 노출, 5번째부터 scroll.
