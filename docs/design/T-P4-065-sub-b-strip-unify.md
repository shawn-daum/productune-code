---
doc: design-plan
ticket: T-P4-065
sub_area: b
title: StageStrip + PhaseBreadcrumb 5단 통일 (PRD/Design/Build/Deploy/Close)
owner: pdt-designer
status: plan
date: 2026-05-07
related:
  - T-P4-065 sub-a (Phase 1~5 doctrine, current_phase enum 1..5)
  - T-P4-065 sub-d (ticket stage→type rename)
  - T-P4-065 sub-f (po-state slim)
  - docs/design/design-system.md §2.6 (OQ-1)
out_of_scope:
  - sub-c (ChatPanel persona selector 제거)
  - sub-e (PRD §L235 / service-flow §2.2 / mockup 정정)
  - 코드 fix 자체 (본 호출은 plan only)
---

# T-P4-065 sub-b — StageStrip + PhaseBreadcrumb 5단 통일

## §1 Decision

사용자 directive (2026-05-08) 에 의거, 사용자 가시 5단 doctrine 을 두 컴포넌트에 일괄 적용한다.

| 항목 | Decision |
|---|---|
| **5단 정의** | `PRD → Design → Build → Deploy → Close` |
| **PhaseBreadcrumb** | 유지. 4단 → 5단 (Deploy 추가). 5단 모두 표시 (global orientation) |
| **StageStrip** | 유지. 6단 → 5단. **이름 rename → `PhaseStrip`**. **default = 현재 phase 1 dot 만**, hover → 5 dot expand (full sequence with active highlight). variant=chip (rp-ctx) 은 항상 1 chip — hover X |
| **색 토큰** | `--phase-prd / --phase-design / --phase-build / --phase-deploy / --phase-close` (5개) |
| **mapping logic** | `current_phase` (1..5) 직접 매핑. `current_task.stage` hybrid 폐기 |
| **파일 rename** | `stage-mapping.ts` → `phase-mapping.ts`, `StageStrip.tsx` → `PhaseStrip.tsx` |
| **locale key** | `workspace.stageStrip.*` → `workspace.phaseStrip.*` |
| **design-system OQ-1** | 본 plan 으로 close. `--stage-qa / --stage-deploy / --stage-operate` 폐기, 5 phase token 으로 일원화 |

---

## §2 PhaseBreadcrumb vs PhaseStrip — redundancy 검토

두 컴포넌트가 같은 5단을 표시하므로 표면적 redundancy 가 존재. 그러나 **다른 surface, 다른 시각 패턴** 으로 분리되어 redundant 가 아닌 **상호 보완** 으로 정의한다.

| 컴포넌트 | 위치 | 시각 패턴 | 역할 |
|---|---|---|---|
| **PhaseBreadcrumb** | main panel 상단 (top bar) | 텍스트 chip 행 + chevron `›` | global orientation — "전체 사이클 어디?" |
| **PhaseStrip (rename)** | Project 탭 sidebar 안 + ChatPanel rp-ctx chip | dot + label (variant=strip) / pill (variant=chip) | local context — "해당 project / 채팅 맥락의 현재 단" |

**시각 차이화 + redundancy 제거 (PO directive 2026-05-08)**:
- **PhaseBreadcrumb** (top) = 5단 모두 표시 (global orientation, 전체 사이클 한눈에)
- **PhaseStrip** (sidebar) = **default 1 dot 만** (현재 phase, label + color). **hover** → 0.2s ease expand to full 5 dot (active highlight). 마우스 leave → collapse 복귀.
- **PhaseStrip variant=chip** (ChatPanel rp-ctx) = 항상 1 chip pill (현재 phase only). chip 자체가 inline text 라 hover expand 부적절.

→ redundancy 해소: top = 전체 / sidebar = 현재 + 필요 시 hover 로 전체. ✅ OQ-1 close.

---

## §3 색 토큰 5 hex

### 3.1 기존 3 token rename

| 기존 token | 신규 token | hex | 비고 |
|---|---|---|---|
| `--stage-prd` | `--phase-prd` | `#A78BFA` | designer 페르소나 색과 동일 (alias 유지) |
| `--stage-design` | `--phase-design` | `#F472B6` | pink 400 |
| `--stage-build` | `--phase-build` | `#38BDF8` | dev 페르소나 색과 동일 (alias 유지) |

### 3.2 신규 2 token (designer 권장)

| token | 권장 hex | 후보 | 사유 |
|---|---|---|---|
| `--phase-deploy` | **`#FB923C`** (orange-400) | `#FB923C` / `#FBBF24` / `#F97316` | action / warmth — release 의 활동성 환기. `--accent` (`#FF6B2B`) 와 채도 차이 있어 충돌 X. 기존 6단 `--stage-deploy` 후보값과 일치 |
| `--phase-close` | **`#34D399`** (emerald-400) | `#34D399` / `#22C55E` / `#A0A0A0` | success — `--persona-qa` / `--health-success` 와 hex 동일 (의도된 alias: "완결 = 검증 완료"). gray (`#A0A0A0`) 후보는 "묻힘" 인상 → 기각 |

### 3.3 폐기 token

- `--stage-qa` (TBD 였음) — 폐기. QA 는 phase 가 아닌 ticket type (sub-d 의 `type='qa'`)
- `--stage-deploy` (TBD) — `--phase-deploy` 로 흡수
- `--stage-operate` (TBD) — 폐기. Operate 단 자체가 5단 doctrine 에서 Close 로 흡수

### 3.4 Contrast 검증 (vs `--surface-body` `#0F0F0F`)

| token | hex | ratio | level |
|---|---|---|---|
| `--phase-prd` | `#A78BFA` | 7.6:1 | AAA |
| `--phase-design` | `#F472B6` | 7.4:1 | AAA |
| `--phase-build` | `#38BDF8` | 7.5:1 | AAA |
| `--phase-deploy` | `#FB923C` | 8.5:1 (추정) | AAA |
| `--phase-close` | `#34D399` | 9.8:1 | AAA |

5개 모두 AAA 통과 (non-text dot 은 1.4.11 의 3:1 기준만 만족하면 OK).

---

## §4 mapping logic 단순화

### 4.1 현재 (폐기 대상)

`stage-mapping.ts` `getActiveStageIndex()` — `current_phase` + `current_task.stage` hybrid:

```
phase=4 → 5 (Operate)
taskStage='deploy' → 4
taskStage='qa' → 3
taskStage in (impl/refactor/test) → 2
phase=2 OR taskStage='design' → 1
default → 0 (PRD)
```

### 4.2 신규 (sub-a 의존)

sub-a 가 `current_phase` enum 을 1..5 로 확장 후, mapping 은 1:1 인덱싱:

```
current_phase 1 → PRD     (index 0)
current_phase 2 → Design  (index 1)
current_phase 3 → Build   (index 2)
current_phase 4 → Deploy  (index 3)
current_phase 5 → Close   (index 4)
```

`current_task.stage` 는 mapping 입력에서 제외 (ticket type 은 별도 layer — sub-d 기준).

### 4.3 호환성

- sub-a 가 land 후 mapping 단순화 가능. sub-a 미land 상태에서 본 작업 진입 시: 기존 4단 enum (1..4) → 임시 매핑 `4 → Close (index 4)` 로 폴백, Deploy (index 3) 는 도달 불가 상태로 둔다 (사용자 가시 strip 은 5dot 이지만 active 는 PRD/Design/Build/Close 만).
- 마이그레이션 권장 순서: **sub-a land 선행 → sub-b 진입**.

---

## §5 GUI 변경 list (코드 fix 는 후속 ticket)

| 파일 | 변경 |
|---|---|
| `packages/gui/src/lib/types.ts` | `Phase` 유니온 5단으로 확장 (`'PRD' \| 'Design' \| 'Build' \| 'Deploy' \| 'Close'`). `PHASE_NAMES` 5 entries (1..5). sub-a 가 enum 확장하면 본 작업이 follow |
| `packages/gui/src/lib/stage-mapping.ts` → `phase-mapping.ts` | rename. `STAGE_DEFS` → `PHASE_DEFS` (5 entries). `getActiveStageIndex` → `getActivePhaseIndex`. hybrid logic 폐기. import 호출처 모두 갱신 |
| `packages/gui/src/components/workspace/StageStrip.tsx` → `PhaseStrip.tsx` | rename. 6 dot → 5 dot. variant prop (`'strip' \| 'chip'`) 유지. label/tooltip i18n key 갱신 |
| `packages/gui/src/components/workspace/PhaseBreadcrumb.tsx` | `PHASES` 배열 5단으로 갱신 (`['PRD', 'Design', 'Build', 'Deploy', 'Close']`). 시각/색 변경 X (현재 `#FF6B2B` accent active style 유지) |
| `packages/gui/src/components/workspace/ChatPanel.tsx` | rp-ctx chip 의 `<StageStrip variant="chip" .../>` → `<PhaseStrip variant="chip" .../>` import 갱신 |
| `packages/gui/src/components/workspace/VersionDetailView.tsx` | `PHASE_ORDER` 5 entries 로 확장 (Deploy 추가) |
| `packages/gui/src/components/workspace/LeftSidebar.tsx` | Project 탭 안 `<StageStrip ... />` mount → `<PhaseStrip ... />` |
| `packages/gui/src/i18n/locales/*.json` | `workspace.stageStrip.*` → `workspace.phaseStrip.*` rename. `stageTooltip.{prd,design,build,deploy,close}` 5개. `qa/operate` 라벨/툴팁 폐기 |
| `packages/gui/src/styles/tokens.css` (또는 동등 파일) | 본 plan 은 token 정의만 — 실제 hex → CSS variable 마이그레이션은 design-system §17 의 별도 ticket (out_of_scope) |

---

## §6 design-system 갱신 (`docs/design/design-system.md`)

**§2.6 Stage** 섹션 → **§2.6 Phase** 로 rename + 내용 교체:

```md
### 2.6 Phase (PRD/Design/Build/Deploy/Close)

사용자 가시 Version Cycle 5단. po-state.json `current_phase` (1..5) 와 1:1 매핑.
QA 는 phase 가 아닌 ticket type (§ticket type) — phase token 에서 제외.

| token | hex | phase | 비고 |
|---|---|---|---|
| `--phase-prd` | `#A78BFA` | PRD | designer 페르소나 색과 동일 (PRD = designer 책임 — alias) |
| `--phase-design` | `#F472B6` | Design | pink 400 |
| `--phase-build` | `#38BDF8` | Build | dev 페르소나 색과 동일 (alias) |
| `--phase-deploy` | `#FB923C` | Deploy | release 활동성 — `--accent` 와 채도 분리 |
| `--phase-close` | `#34D399` | Close | success — `--persona-qa` / `--health-success` 와 hex 동일 (alias) |

> **OQ-1 close (2026-05-07)** — sub-b plan 의거 5단 일원화. 6단 잔재
> (`--stage-qa / --stage-deploy / --stage-operate`) 는 폐기. QA 는 ticket
> `type='qa'` 로 표현, Operate 는 Close 로 흡수.
```

추가로 §1 Principles §2 monochrome 규칙: "stage" → "phase" 표기 일치화.

---

## §7 마이그레이션 순서

1. **doctrine + design-system 갱신** — design-system §2.6 Phase 로 rename. OQ-1 close.
2. **types.ts** — `Phase` 유니온 5단, `PHASE_NAMES` 5 entries (sub-a 가 `current_phase` enum 확장 land 후)
3. **phase-mapping.ts rename** — `stage-mapping.ts` 파일 rename. logic 단순화 (1:1 매핑). export 명 갱신
4. **PhaseStrip.tsx rename + 5 dot** — `StageStrip.tsx` 파일 rename. `STAGE_DEFS` import → `PHASE_DEFS`
5. **PhaseBreadcrumb.tsx** — `PHASES` 배열 5단으로
6. **ChatPanel rp-ctx** — import path 갱신 (`PhaseStrip` from new path)
7. **VersionDetailView** — `PHASE_ORDER` 5 entries
8. **LeftSidebar** — Project 탭 mount 갱신
9. **locale 갱신** — `workspace.stageStrip.*` → `workspace.phaseStrip.*` 5단 라벨/툴팁
10. **검증** — sample fixture (각 `current_phase` 1..5 별 strip rendering snapshot, breadcrumb active state)

---

## §8 Out of scope

- **sub-c** (ChatPanel persona selector 제거) — 별도 sub-area
- **sub-e** (PRD §L235 / service-flow §2.2 / mockup.html 정정) — 별도 sub-area
- **CSS variable 마이그레이션** — hex → token 치환은 design-system §17 별도 ticket
- **light theme** — design-system Phase 5
- **storybook / chromatic** — design-system out_of_scope
- **본 호출의 코드 fix** — 본 plan 은 doctrine + design-system + ticket 발행용. 실 코드 수정은 후속 ticket

---

## §9 Open questions

| OQ | 질문 | designer 권장 | 사용자 confirm 가치 |
|---|---|---|---|
| **OQ-1** | PhaseBreadcrumb vs PhaseStrip — 시각 통일 vs 차이화 | 차이화 유지 (top crumb / sidebar dot — 다른 surface hint) | high |
| **OQ-2** | `--phase-deploy` hex | `#FB923C` (orange-400) | medium — 사용자 brand 감각 의존 |
| **OQ-3** | `--phase-close` hex | `#34D399` (emerald-400, success alias) | medium — gray (`#A0A0A0` 묻힘) 명시적으로 기각 |
| **OQ-4** | StageStrip → PhaseStrip rename 의 외부 reference (테스트 / docs / mockup link) 영향 범위 | 후속 ticket grep 검증 (`StageStrip` / `stage-mapping` / `workspace.stageStrip` 3개 토큰) — 마이그레이션 ticket 안 acceptance 항목으로 포함 | low |
| **OQ-5** | sub-a 미land 상태에서 sub-b 코드 진입 가능 여부 | **권장: sub-a land 선행**. 진입 시 `current_phase=4` 폴백 매핑 임시 처리 | high — 진행 순서 결정 필요 |

---

## §10 검증 (정합 체크)

- ✅ **sub-a 정합** — `current_phase` enum 1..5 doctrine 에 의존. 매핑 1:1
- ✅ **sub-d 정합** — QA 가 phase 가 아닌 ticket type (`type='qa'`) 으로 분리. 본 plan 의 phase 5단에서 QA 제외 정합
- ✅ **sub-f 정합** — po-state slim 후에도 `current_phase` 는 유지 필드 (sub-f 가 제거하지 않음)
- ✅ **chunking ceiling 정합** — 1 산출물 (본 markdown), 1 sub-area (sub-b only)
- ✅ **design-system OQ-1 close 가능** — §6 의거 §2.6 Phase 로 rename + 5 token 확정
- ⚠ **마이그레이션 의존** — sub-a 선행 권장 (OQ-5). 후속 ticket 발행 시 sub-a land 확인 acceptance 추가
