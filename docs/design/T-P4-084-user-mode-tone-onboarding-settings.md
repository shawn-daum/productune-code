---
doc: design-plan
ticket: T-P4-084
title: User mode (developer / planner) — tone 분기 onboarding + Settings
owner: pdt-designer
status: draft
round: phase4-r4-fix
date: 2026-05-11
applies_to: gui (WorkspaceShell + OnboardingWizard + SettingsView + i18n catalog)
related_tickets:
  - T-P4-015  # First-run Onboarding Wizard
  - T-P4-048  # Settings 탭
  - T-P4-056  # i18n (en/ko) + Step 0
  - T-P4-057  # locale protected-token linter
  - T-P4-024  # Settings — git-rules.json (advanced 섹션 hidden 후보)
out_of_scope:
  - UI 분기 (layout/component 분기 X — tone/lexicon 만)
  - 페르소나 응답 언어 분기 (별 doctrine — pdt-designer.md "PO owns end-user localization")
  - 외부 어휘 (git/branch/worktree) 자체 노출 정책 (PRD R2 git 추상화 — 본 ticket 은 그 위 tone layer 만)
---

# T-P4-084 — User mode (developer / planner) tone 분기

## §1 Goal

productune 사용자는 두 segment 가 명확히 다른 어휘 ceiling 을 가진다.
- **developer**: terminal / git / IDE 용어 익숙. 기술 어휘 + 자연어 둘 다 OK.
- **planner (기획자)**: 개발 용어 익숙하지 X. 기술 어휘 노출 시 진입 장벽.

본 ticket 은 onboarding 에서 사용자 mode 를 명시 선택받아 `~/.productune/settings.json`
에 저장하고, GUI 전반의 **tone** (모달 / hint / tooltip / 에러 메시지 / 어휘 mapping)
을 분기한다. **UI 분기 X** — layout / 컴포넌트 / 기능 노출은 단일 그대로. 어휘 ceiling
만 mode 별로 조정.

본 ticket 은 PRD R2 git 추상화 § ("사용자에게 git 명령어 무노출 — 자동저장/배포 준비/
배포하기/버전히스토리 매핑") 의 **응용** — 외부 어휘 자체는 dev 든 planner 든 모두
숨기는 게 doctrine. 본 ticket 은 *그 위에서* dev 모드는 보조 어휘 (괄호 안 영문 hint /
advanced 섹션 노출) 를 허용하고, planner 모드는 그것마저 줄인다.

## §2 2 modes 정의

| Mode | 정의 | 노출 어휘 ceiling |
|---|---|---|
| **developer** | terminal / git / IDE 작업방식에 익숙. 영문 dev 어휘를 보조로 보면 더 잘 이해. | 자연어 primary + 영문 dev 어휘 secondary (괄호 보조 / advanced 섹션 노출). **외부 어휘 (worktree / branch / merge) 자체 노출은 여전히 X** — productune doctrine 정합. |
| **planner** | 개발 용어 익숙하지 X. 친절 자연어 우선. | 자연어 only. 영문 dev 어휘는 최대한 hidden. advanced 섹션 (MCP / Hooks / stream-json) hidden 또는 단순화. |

**핵심 invariant** — mode 와 무관하게 다음은 동일:
- layout / 컴포넌트 / 기능 노출 (단일 GUI 정책, ROADMAP line 22)
- 페르소나 ID 영문 보호어 (PO / Designer / Dev / QA) — T-P4-057 linter 강제
- doctrine 단위 (Phase / Round / Ticket / stage·status enum) — T-P4-057 linter 강제
- PRD / Phase 5단 lifecycle 자체 (어휘는 강제 영문)

## §3 어디서 tone 분기

### 3.1 분기 대상

| 영역 | dev mode | planner mode |
|---|---|---|
| 모달 (confirm / warn / error) | 영문 보조 hint 허용 (예: "자동저장 (commit) 합니다") | 보조 hint 제거 ("자동저장 합니다") |
| Inline hint / tooltip | dev 어휘 inline 노출 OK | 자연어로 paraphrase |
| 에러 메시지 (Bash / network / Vercel 실패) | stack/error code 노출 + 자연어 요약 | 자연어 요약 only + "자세히 보기" expand 로 dev info |
| Settings advanced 섹션 (MCP / Hooks / stream-json 등) | 노출 | hidden 또는 simplified |
| 산출물 표시 (artifact name / log line) | dev 어휘 OK | 자연어 paraphrase 또는 hidden |

### 3.2 분기 대상 X (mode invariant)

- Persona name (PO / Designer / Dev / QA) — T-P4-057 보호어
- doctrine 단위 (Phase / Round / Ticket) — T-P4-057 보호어
- stage·status enum (todo / in-progress / done / blocked / abandoned) — T-P4-057 보호어
- schema field / product name — T-P4-057 보호어
- Phase 5단 이름 (PRD / Design / Build / Deploy / Close) — T-P4-057 보호어 후보 (T-P4-065 정합)
- 외부 어휘 (git / branch / worktree / merge) — 둘 다 X (PRD R2 doctrine)

## §4 i18n 통합 path

3 후보 비교 후 **권장 = 단일 key + mode-aware getter (with fallback)**.

| 후보 | 장점 | 단점 |
|---|---|---|
| A. dual catalog namespace (`en.dev.json` / `en.planner.json` 등) | namespace 깔끔 | 카탈로그 4 배 (en/ko × dev/planner), drift 위험 |
| B. ICU MessageFormat (`{mode, select, developer{...} planner{...} other{...}}`) | 한 key 안에서 표현, 표준 ICU | i18next configure 부담, key body 비대 |
| **C. 단일 key + mode-aware getter + suffix override** | 카탈로그 1배 (mode 차이 key 만 `.dev` / `.planner` suffix), drift 최소 | i18next custom resolver wrap 필요 |

**채택 = C**.

```json
// en.json
{
  "modal.autosave.body": "자동저장 합니다",
  "modal.autosave.body.dev": "자동저장 (commit) 합니다",

  "tooltip.deploy.preview": "배포 준비",
  "tooltip.deploy.preview.dev": "배포 준비 (PR 생성)",

  "settings.section.mcp.title.dev": "MCP servers",
  "settings.section.mcp.title": "외부 도구 연결"
}
```

Resolver 규칙:
1. mode = `dev` → `<key>.dev` 가 있으면 사용, 없으면 `<key>` fallback.
2. mode = `planner` → `<key>.planner` 가 있으면 사용, 없으면 `<key>` fallback.
3. base `<key>` = planner-friendly default (대부분 case 에서 planner 가 더 짧은 표현).

이유:
- 대부분 key 는 mode invariant — 카탈로그 비대 X.
- mode 차이 key 만 suffix 로 명시. drift 가 한 곳에 모인다.
- 신규 key 추가 시 default 만 쓰면 두 mode 모두 동작 (자동 fallback).
- T-P4-057 linter 와 정합 — base key 의 보호어 검사 그대로, suffix 도 추가 검사 path 만 늘리면 됨.

## §5 Onboarding flow

T-P4-015 First-run Onboarding Wizard 의 step 시퀀스 갱신.

```
Step 0 (T-P4-056): UI 언어 (English / 한글)
Step 0.5 (T-P4-084 신규): 사용자 mode (developer / planner)
Step 1+: 기존 (Engine / Wiki / API Key / ...)
```

### Step 0.5 화면 spec

```
┌─────────────────────────────────────────────────────────┐
│  당신은 어떻게 일하시나요?                                │
│  productune 의 어휘를 당신에게 맞게 조정합니다.            │
│                                                          │
│  ┌──────────────────┐    ┌──────────────────┐           │
│  │   [code icon]    │    │   [user icon]    │           │
│  │                  │    │                  │           │
│  │   developer      │    │   planner        │           │
│  │                  │    │                  │           │
│  │  terminal / git  │    │  기획자 / PM /   │           │
│  │  / IDE 익숙      │    │  비-개발자        │           │
│  │                  │    │                  │           │
│  │  영문 보조 어휘  │    │  자연어 only.    │           │
│  │  + advanced 섹션 │    │  기술 어휘 최소  │           │
│  └──────────────────┘    └──────────────────┘           │
│                                                          │
│  [건너뛰기 — 나중에 설정]              [선택]            │
└─────────────────────────────────────────────────────────┘
```

- 2 카드 (selectable, 클릭 시 outline accent).
- "건너뛰기" 클릭 시 = **default mode 미설정** + Settings 에서 사후 선택 유도 (StatusBar 또는 onboarding banner 에 1회 reminder).
- "선택" 활성화 = 카드 하나 선택 시.
- 선택 결과 → `~/.productune/settings.json` 의 `userMode: "developer" | "planner" | null`.
- 즉시 반영 — wizard Step 1+ 부터 이미 mode 별 tone 적용.

### Step 0.5 i18n key (en + ko, dev/planner suffix X — 본 step 은 mode 선택 자체이므로 단일 key)

```json
{
  "onboarding.step0_5.title": "...",
  "onboarding.step0_5.subtitle": "...",
  "onboarding.step0_5.card.developer.title": "developer",
  "onboarding.step0_5.card.developer.body": "...",
  "onboarding.step0_5.card.planner.title": "planner",
  "onboarding.step0_5.card.planner.body": "...",
  "onboarding.step0_5.cta.skip": "...",
  "onboarding.step0_5.cta.select": "..."
}
```

"developer" / "planner" 두 단어는 본 ticket 의 **보호어 후보** — T-P4-057 linter 에 추가 (영문 보존, 번역 X). 이유: mode 자체가 영문 enum 값이며 doctrine 일관성.

## §6 Settings 통합

T-P4-048 Settings 탭 의 기존 sub-tab list (Environment / Models / MCP / Hooks / Language) 에 **General** sub-tab 신규 또는 **Language** sub-tab 안에 mode 토글 통합.

**권장 = "General" sub-tab 신규** — language + user mode 같이 묶임. 이유:
- Language sub-tab 에 mode 까지 넣으면 sub-tab 의미가 모호 ("Language" 인데 mode?).
- General sub-tab 은 mode invariant 한 user preference (앞으로 timezone / date format 등 확장 여지) 까지 흡수 가능.

### Settings → General sub-tab layout

```
┌──────────────────────────────────────────────────────────┐
│  General                                                 │
│  ──────────────────────────────────────────────────────  │
│                                                          │
│  UI 언어                                                  │
│  ( ) English      (•) 한글                                │
│                                                          │
│  ──────────────────────────────────────────────────────  │
│                                                          │
│  사용자 mode                                              │
│  ( ) developer    (•) planner    ( ) 미설정              │
│                                                          │
│  developer: terminal / git / IDE 익숙. 영문 보조 어휘.    │
│  planner: 기획자 / 비-개발자. 자연어 only.                │
│                                                          │
│  [변경 사항은 즉시 반영됩니다]                             │
└──────────────────────────────────────────────────────────┘
```

- Radio group (3 option: developer / planner / 미설정).
- "미설정" 선택 시 = base key fallback (대부분 planner-friendly).
- 즉시 반영 — react context (`UserModeProvider`) + zustand store. 앱 재시작 X.
- Settings 변경 → `~/.productune/settings.json` write + IPC broadcast → 모든 renderer reload.

### sub-tab list 동기 (T-P4-048 비고 갱신)

T-P4-048 의 sub-tab list 에 "Language" 가 T-P4-056 land 시 추가됐듯, 본 ticket land 시 **"General"** sub-tab 항목 추가 + Language 를 General 안으로 이동. ROADMAP T-P4-048 비고 갱신 (PO 위임 — 본 ticket land 시 동기).

## §7 어휘 매핑 표 (1차)

본 표는 1차 — 정밀 audit 은 **후속 ticket (T-P4-085 또는 R5 enhancement)** 으로 분리.
본 ticket 에서는 *핵심 surface area* (모달 / 에러 / Settings 섹션 제목) 만 cover.

### 7.1 Modal / inline message

| 영역 | dev mode | planner mode |
|---|---|---|
| 자동저장 모달 body | "자동저장 (commit) 합니다" | "자동저장 합니다" |
| 배포 준비 tooltip | "배포 준비 (PR 생성)" | "배포 준비" |
| 배포 confirm body | "프로덕션에 배포합니다 (squash merge → Vercel deploy)" | "프로덕션에 배포합니다" |
| Conflict 에러 모달 | "merge conflict — 두 작업이 같은 파일 같은 줄을 변경했습니다. 해결 후 다시 시도하세요." | "두 작업이 같은 위치를 변경했습니다. 해결 후 다시 시도하세요." |
| Network 실패 toast | "Vercel API timeout (10s) — 재시도?" | "배포 서버 응답 지연 — 재시도?" |

### 7.2 Settings 섹션 제목

| 영역 | dev mode | planner mode |
|---|---|---|
| Settings → MCP servers | "MCP servers" | "외부 도구 연결" |
| Settings → Hooks | "Hooks" | "자동 실행 규칙" |
| Settings → Stream-json log | "Stream-json log" | (hidden — advanced 섹션) |
| Settings → Models | "Models" | "AI 모델" |
| Settings → Environment | "Environment" | "환경 변수" |
| Settings → Git rules (T-P4-024) | "Git 작업 규칙" | "작업 흐름 규칙" |

### 7.3 Persona / doctrine — invariant (T-P4-057)

| 영역 | dev mode | planner mode |
|---|---|---|
| Persona | PO / Designer / Dev / QA | PO / Designer / Dev / QA |
| Phase | Phase 4 / Phase 5 | Phase 4 / Phase 5 |
| stage·status enum | todo / in-progress / done | todo / in-progress / done |

### 7.4 외부 어휘 — 둘 다 X (PRD R2 doctrine)

| 영역 | dev mode | planner mode |
|---|---|---|
| git branch | (노출 X) | (노출 X) |
| worktree | (노출 X) | (노출 X) |
| merge | (노출 X) | (노출 X) |

**예외** — dev mode 의 "배포 준비 (PR 생성)" 같은 *괄호 보조 hint* 는 doctrine breach 후보. 사용자 directive 의 의도는 "PRD R2 git 추상화 위에서 dev 모드는 영문 보조 어휘 약간 허용" 으로 해석. 본 보조 hint 의 적정 수위는 **OQ-2 사용자 confirm 대상**.

## §8 PRD update 영향

본 ticket land 는 PRD / ROADMAP 의 다음 항목과 정합 필요 — PO 가 본 ticket 의 design plan 승인 후 처리:

1. **ROADMAP line 22 갱신** — "GUI 모드 | 단일 모드 — planner/developer 분기 없음 (2026-05-04 결정)" → "단일 UI / **2 tone** (developer / planner) — tone-aware messaging 도입 (2026-05-11 추가)". UI 분기는 여전히 X.
2. **PRD §10 / Phase 4 onboarding 섹션 보강** — 사용자 mode 선택 step 추가, tone-aware messaging doctrine 추가. 별 ticket 또는 본 ticket 안에서 PRD update 항목 cover.
3. **design-system §1.5.2 보강** — "익숙한 경험 + 점진적 정보" sub-rule 에 본 ticket 의 mode 분기를 *구현 메커니즘* 으로 명시. doctrine 갱신.
4. **T-P4-057 보호어 표 갱신** — "developer" / "planner" enum 값을 보호어 후보로 추가 검토.

위 4 항목은 **본 ticket 의 acceptance 외 부수효과** — 별 PO task 로 분리 위임.

## §9 회귀 / 정합 risk

| 회귀 후보 | risk | 완화 |
|---|---|---|
| T-P4-015 wizard step 시퀀스 변경 | 신규 사용자만 영향 (기존 사용자 wizard 미경유) | 기존 사용자는 Settings 에서 mode 사후 선택 + 1회 banner reminder |
| T-P4-048 Settings sub-tab list 추가 | low — sub-tab 1개 추가만 | General sub-tab 신규 (Language 흡수) |
| T-P4-056 i18n 카탈로그 schema | 카탈로그 key 의 `.dev` / `.planner` suffix 신규 | resolver fallback 으로 기존 key 동작 보장 |
| T-P4-057 linter | 보호어 표에 "developer" / "planner" 추가 필요 | linter 표 갱신 별 (본 ticket 안에서 cover 또는 fix-forward) |
| ROADMAP line 22 "단일 모드" 정합 | PRD/doctrine 일관성 risk | PRD update task 로 분리 위임 (§8.1) |

## §10 Open questions (사용자 결정 받기)

| OQ | 질문 | designer 권장 |
|---|---|---|
| OQ-1 | mode default — 신규 사용자는 developer 또는 planner 중 어느 게 default? 또는 강제 선택? | **사용자 명시 선택 강제 (default null)** — onboarding Step 0.5 진행 차단 X 단 "건너뛰기" 명시. 추정 default 의 위험 (영문 어휘로 planner 압도 또는 자연어로 dev 어색) 회피. |
| OQ-2 | dev mode 의 영문 보조 hint 적정 수위 — 괄호 안 영문 (`자동저장 (commit) 합니다`) OK? 또는 dev 도 자연어 only? | **괄호 보조 OK** — dev 사용자는 영문 어휘로 정확성 더 잘 파악. 단 "PR" / "merge" 같은 외부 어휘 자체는 둘 다 X 유지. |
| OQ-3 | Settings 의 mode 토글 위치 — Language sub-tab 안 또는 신규 General sub-tab? | **General sub-tab 신규** (§6). Language 흡수. |
| OQ-4 | advanced 섹션 (MCP / Hooks / stream-json) 의 planner mode 처리 — hidden / simplified / unchanged? | **hidden + 자연어 paraphrase 가 있는 일부는 simplified 노출** (§7.2). 완전 hidden 시 사용자가 advanced 진입 X 못함. simplified path = MCP servers → "외부 도구 연결", Hooks → "자동 실행 규칙". stream-json log 는 hidden. |
| OQ-5 | 어휘 매핑 표 의 정밀화 — 본 ticket 에서 full audit vs 후속 ticket 분리? | **후속 ticket 분리 (T-P4-085 또는 R5 enhancement)**. designer chunking memory rule 정합 (1~2 산출물 max). 본 ticket 은 §7 의 핵심 surface area 만 cover. |

## §11 implementation scope (dev 위임용)

본 ticket = design plan + i18n catalog 수정 + minimal Wizard/Settings impl. **L4 estimated**.

### Sub-areas

| Sub-area | 작업 | 산출물 | est. |
|---|---|---|---|
| **A** i18n catalog suffix | `en.json` + `ko.json` 의 §7 key 들에 `.dev` / `.planner` suffix 추가. base key 는 planner-friendly. | 2 file edit | S |
| **B** i18next resolver wrap | `useT()` hook (또는 `i18n.t` wrap) 가 `userMode` context 읽어 suffix fallback 처리. | `packages/gui/src/i18n/useUserModeT.ts` 신규 | M |
| **C** UserModeProvider + store | `~/.productune/settings.json` r/w + zustand `useUserMode` store + React context. IPC `settings:getUserMode` / `settings:setUserMode`. | `packages/gui/src/store/useUserMode.ts` + Electron IPC + preload | M |
| **D** Onboarding Step 0.5 | wizard 에 Step 0.5 화면 추가 (§5). 2 카드 + 건너뛰기. | `packages/gui/src/components/onboarding/Step0_5UserMode.tsx` | M |
| **E** Settings General sub-tab | Settings 탭 sub-tab list 에 "General" 추가. Language 흡수 + mode radio group. 즉시 반영. | `packages/gui/src/components/workspace/SettingsView.tsx` (edit) + General sub-tab component | M |
| **F** Wizard skip + reminder banner | "건너뛰기" + 사용자 mode null 상태일 때 1회 banner. | wizard + StatusBar/banner integration | S |
| **G** QA — manual mode switch 검증 | dev → planner 토글 시 §7 surface area 가 즉시 반영되는지 spot check. | manual log | S |

### Out of scope (별 ticket)

- 전체 어휘 매핑 표 정밀 audit (T-P4-085 후속 ticket 권장 — §7 의 1차 표 외 모든 user-facing 문구).
- T-P4-057 linter 의 "developer" / "planner" 보호어 추가 (별 fix ticket 또는 본 ticket fix-forward).
- ROADMAP line 22 / PRD §10 / design-system §1.5.2 doctrine 갱신 (PO task).
- light theme / accessibility audit / animation tuning.

### Acceptance 핵심

- 신규 사용자 wizard 진입 → Step 0 (언어) → Step 0.5 (mode) → Step 1+ 흐름 동작.
- Step 0.5 의 "건너뛰기" + 사후 Settings 변경 path 동작.
- Settings General sub-tab 에서 mode 토글 즉시 반영 (앱 재시작 X).
- §7.1 표 5 항목 + §7.2 표 6 항목이 mode 토글 시 즉시 paraphrase.
- 페르소나 ID / Phase / stage·status enum 은 dev/planner 둘 다 영문 보존 (T-P4-057 linter pass).
- 외부 어휘 (git / branch / worktree / merge) 는 dev/planner 둘 다 노출 X.

## Implementation notes (dev 참고)

- `useT()` resolver 는 매 render 마다 mode 읽는 비용 — `useUserMode` 는 zustand subscribe 로 mode 변경 시만 re-render trigger.
- `userMode` IPC = onboarding 시 1회 write + Settings 변경 시 write. read 는 앱 시작 시 1회 + Settings 진입 시.
- React context 보단 zustand 가 prop drilling 없이 mode-aware getter 쓰기 편함. SettingsView 변경 → store dispatch → 전 컴포넌트 reactive.
- Wizard Step 0.5 의 카드 컴포넌트 = design-system §8 (recipe) 의 selectable card 패턴 따름. lucide icon (`Code` / `User` 또는 `UserCog`).
- "건너뛰기" 시 banner 는 design-system §1.5.3 Predictability — 익숙한 정보 띠 (top banner) 패턴.
- 다른 컴포넌트 i18n key 들 (ChatPanel / StatusBar / 모달들) 은 본 ticket 범위 아님 — 본 ticket 은 §7 만 cover. 후속 ticket 에서 audit-and-replace 진행.

## Promotion Candidates (top-level JSON 으로도 emit)

- project — `docs/designer/decisions.md`: `(2026-05-11) T-P4-084: i18n key 의 mode suffix (.dev / .planner) + fallback resolver 채택 — dual catalog / ICU MessageFormat 대비 카탈로그 비대 X + drift 최소.`
- project — `docs/designer/decisions.md`: `(2026-05-11) T-P4-084: 사용자 mode = onboarding Step 0.5 명시 선택 강제 (default null). 추정 default 의 위험 (영문 어휘로 planner 압도 또는 자연어로 dev 어색) 회피.`
