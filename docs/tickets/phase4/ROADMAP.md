# Phase 4 실행 로드맵

**Slug**: phase4-gui-full-cycle  **Created**: 2026-04-30  **Status**: planned (Phase 3 완료 후 진입)
**PRD anchor**: [docs/prd/productune.md#phase-4--terminal-무의존-gui-풀-사이클-future](../../prd/productune.md#phase-4--terminal-무의존-gui-풀-사이클-future)

> Phase 4 ("terminal 무의존 GUI 풀 사이클") 의 라운드별 티켓 분해. 모든 OQ 결정사항 (2026-04-30 OQ 세션) 은 PRD 에 확정 — 본 로드맵은 그것을 실행 가능한 작업 단위로 펼친 것.

---

## 컨텍스트 요약 (PRD + OQ 결정사항)

| 결정 영역 | 채택 |
|---|---|
| GUI 런타임 | **Electron + React/TypeScript (Vite renderer)** |
| Shell 자동화 | **node-pty** (mac/linux PTY + Windows ConPTY) |
| 디자인 산출물 | **md + Mermaid.js + Excalidraw** (전부 로컬, 외부 서비스 의존 X — Figma 제외). Mermaid 는 GUI renderer 내장, CLI 는 export-only 선택 |
| 문서 fetch | **TTL 24h + stale-while-revalidate** + 오프라인/rate-limit fallback |
| Env 모델 | **`.env.local` 기본 + 3-layer (로컬/미리보기/프로덕션) 가산식** + Vercel env 단방향 push |
| 배포 | **Vercel 완전 구현** + `DeployProvider` 인터페이스 (Phase 5 확장) |
| Git 추상화 | 사용자에게 git 명령어 무노출 — 자동저장/배포 준비/배포하기/버전히스토리 매핑. **Ticket-단위 worktree** + base 보호 + 2단계 게이트 + Settings 토글 (`useDevBranch`/`useStagingEnv`). default = base `main` only (Option A). |
| 프로젝트 관리 | `~/productune/projects/<slug>/` 자동 생성 (기본 진입점) |
| GUI 모드 | **단일 모드** — planner/developer 분기 없음 (2026-05-04 결정). 동일 GUI 를 모든 사용자가 사용 |
| **GUI PO 세션** | **단일 PO 세션** — 프로젝트당 하나. 멀티 채팅방 X (2026-05-06 결정). CLI/non-GUI 는 multi-session 가능성 보존 |
| **UI 언어** | **English default + 한글 opt-in** (2026-05-07 결정). 사용자 wizard Step 0 에서 명시 선택, Settings 에서 사후 변경. 페르소나 응답 언어는 별도 doctrine. T-P4-056 |

---

## 선결 조건 (prerequisite)

Phase 4 는 다음 둘이 모두 충족되어야 진입:

1. **Phase 3 완료** — Phase 2 dogfood 합격 + Phase 3 UI layer 구축 + Phase 3 dogfood 1 회 (case1/case2 페인 검증). PRD `Phase 3 → Phase 4 transition notes` 참조.
2. **Round 0 (monorepo 전환) 완료** — 본 로드맵 첫 라운드. `packages/core` (CLI / orchestration) + `packages/cli` (기존 entry) + `packages/gui` (Electron) 분리. CLI core 변경 없이 GUI layer 만 위에 얹는 PRD 원칙을 코드 구조에서 강제.

---

## 타임스탬프 필드 표준 (Phase 4 대시보드 데이터 소스)

Phase 4 의 모든 시각화 (Project 탭 티켓 rows / stage strip / Right PO Chat ctx chip / 페르소나 활동 trace / 풀 사이클 progress) 는 일관된 타임스탬프 필드에 의존. **이 표준은 Phase 4 진입 전 (T-PATCH-001 패치) 에 doctrine 에 반영** — 표준이 먼저 자리잡혀야 Round 0 부터의 티켓이 데이터를 정확히 채움.

### 티켓 markdown frontmatter 필수 필드

```yaml
---
ticket_id: T-P4-010
round: phase4-r1
type: impl
status: todo
assignee: pdt-developer
created_at: 2026-MM-DDTHH:MM:SSZ   # 티켓 생성 시각
started_at: null                    # in-progress 진입 시각
completed_at: null                  # done/abandoned 진입 시각
duration_min: null                  # completed_at - started_at (분)
estimated_complexity: L5
risk_flags: none
---
```

`status` 전이 시 자동 갱신: `todo → in-progress` 시 `started_at` 채움, `in-progress → done|abandoned|blocked` 시 `completed_at` + `duration_min` 채움. PO post-delegate hook 또는 Designer round-close 단계에서 `jq` 로 mechanical update.

### po-state.json `past_tickets` 스키마 보강

기존 `started_at`/`ended_at` 에 추가:
- `created_at` (티켓 최초 생성 시각 — `started_at` 보다 이름)
- `duration_min` (closed 후 mechanical compute)

```json
{
  "ticket_id": "T-P4-010",
  "slug": "...", "title": "...",
  "created_at": "...", "started_at": "...", "ended_at": "...",
  "duration_min": 47,
  "status": "done", "stage": "impl",
  "calibration_outcome": { "...": "..." }
}
```

### `persona_session_meta` 에 `started_at` 필드 추가

기존 `created_at` (세션 시작) + `last_seen` (최근 turn) 에 더해:
- `started_at` — 페르소나가 해당 티켓에서 처음 invoke 된 시각 (`created_at` 과 동일하지만 의미 분리: `created_at` = 세션 ID 발급, `started_at` = 작업 진입). 페르소나별 활동 시간선 시각화에 사용.

```json
"persona_session_meta": {
  "pdt-designer": {
    "id": "...",
    "created_at": "...",
    "started_at": "...",
    "last_seen": "...",
    "turns": 4,
    "model_history": ["opus", "..."],
    "effort_history": ["max", "..."],
    "complexity_level": "L6",
    "confidence_history": [0.7, 0.85, 0.9, 0.92]
  }
}
```

### 적용 시점

- T-PATCH-001 (Phase 3 protocol fix) 에서 doctrine + ticket template 갱신.
- Round 0 첫 티켓부터 신규 표준 적용.
- 기존 `past_tickets` 데이터는 **마이그레이션 X** — `created_at`/`duration_min` 누락된 항목은 GUI 에서 "—" 표시 + warning badge.

---

## 라운드별 티켓 분해

### Round 0 — Monorepo 구조 전환 (prerequisite)

목표: CLI core (`packages/core`) 와 GUI (`packages/gui`) 를 동일 repo 에서 분리 관리. Phase 4 의 PRD 원칙 ("GUI 는 CLI core 위 view layer") 을 패키지 경계로 강제.

| Ticket | 제목 | 담당 | 비고 |
|---|---|---|---|
| **T-P4-001** | Monorepo setup — pnpm workspaces 또는 turborepo 채택 + `packages/core`, `packages/cli`, `packages/gui` 디렉터리 골격 | pdt-developer | 둘 중 선택은 plan 단계에서 결정 (turborepo 추천 — 캐시 + 병렬 빌드) |
| **T-P4-002** | 기존 CLI 페르소나 / `po-state.json` / skills / hooks 를 `packages/core` 로 이관 (zero behavior change) | pdt-developer | 회귀 테스트: `docs/testing.md` Phase 0–6 모두 pass 유지 |
| **T-P4-003** | `packages/gui` Electron + React/TS + Vite boilerplate 초기화 — main process / preload / renderer 분리 + secure IPC 패턴 | pdt-developer | renderer 에서 직접 `child_process` X; main 만 core 호출 |

**Round 0 합격 기준**: 기존 CLI 동작 100% 보존 + Electron 빈 창 띄우기 성공 + `pnpm -r build` 통과.

---

### Round 1 — 설치 + 프로젝트 관리 + init

목표: 사용자가 파일시스템 / 터미널을 직접 보지 않고 첫 프로젝트를 시작 가능.

| Ticket | 제목 | 담당 | 비고 |
|---|---|---|---|
| **T-P4-010** | `productune init` — slug + `.productune/config.json` 생성; `project:installAt` IPC (기존 폴더에 직접 init) | pdt-developer | CLI 와 GUI 양쪽에서 동일 init flow 호출 |
| **T-P4-011** | [새 프로젝트 만들기] 버튼 — `~/productune/projects/<slug>/` 자동 생성 + `init` 자동 실행 + GitHub OAuth (선택) | pdt-developer | slug 충돌 시 suffix 자동 부여 (`-2`, `-3`) |
| **T-P4-012** | [기존 폴더 열기] flow — 폴더 선택 → `.productune/` 감지 → 없으면 "이 폴더에 productune 시작하기" 버튼 노출 → `project:installAt` 실행 | pdt-developer | 보조 진입점; self / descendant / none 3개 분기 처리 |
| **T-P4-013** | recent projects 홈 화면 — 앱 실행 시 최근 N 개 프로젝트 + 최근 활동 시각 표시 | pdt-designer + pdt-developer | 카드 UI; `created_at` / `last_seen` 활용 |
| **T-P4-014** | GitHub OAuth 팝업 → private repo 자동 생성 + git remote 설정 | pdt-developer | scope: `repo`; OAuth 실패 시 "건너뛰기" 옵션 (로컬만 작업) |

**Round 1 합격 기준**: 사용자가 [새 프로젝트 만들기] → 첫 PRD 작성 화면까지 터미널 무노출 도달.

---

### Round 2 — Git 추상화 레이어 (작업 흐름 규칙)

목표: 사용자가 git 개념 (branch / commit / PR / merge / worktree / dev / staging) 을 한 번도 보지 않고 작업 ↔ 배포 사이클 진행. **Ticket 단위 worktree** + base 보호 + 2단계 게이트 + Settings 토글이 핵심.

| Ticket | 제목 | 담당 | 비고 |
|---|---|---|---|
| **T-P4-020** | Ticket-단위 worktree 자동 생성 + base branch 차단 | pdt-developer | ticket 발행 = `<project>/.productune/worktrees/<ticket-id>/` 자동. branch = `feature/<ticket-id>/<slug>` 또는 `fix/...` (risk_flags / stage 자동 분류). `.git/hooks/pre-push` 설치. base = 프로덕션 (default), `useDevBranch=true` 시 검증용 중간 환경도 보호. `git-rules.json` 로드. |
| **T-P4-021** | [자동저장] = ticket worktree 안 자동 commit | pdt-developer | 트리거: 페르소나 turn 종료 + 상태 변화. `post-delegate-autosave` hook. 메시지 = `T-NNN [persona/turn N] <persona output 1줄 summary>`. base worktree 면 noop + 친절 모달. |
| **T-P4-022** | [배포 준비] / [배포하기] 2단계 게이트 | pdt-developer | [배포 준비] = ticket worktree push + (toggle 시) 검증용 중간 환경 매핑. [배포하기] = 프로덕션 PR 자동 생성 → squash merge → Vercel deploy. **사용자 명시 클릭만 트리거**, PO 자동 결정 X. conflict 시 자연어 메시지. |
| **T-P4-023** | [버전 히스토리] 카드 UI — ticket 단위 그룹 + 페르소나 trace inline | pdt-designer + pdt-developer | git log 자연어 카드. ticket-id 별 묶음. round 필드 활용해 "이번 라운드 N개 작업" 표시. 외부 어휘 (branch/merge/worktree) 노출 금지. |
| **T-P4-024** (신규) | Settings — 작업 흐름 규칙 패널 + `git-rules.json` r/w | pdt-designer + pdt-developer | `<project>/.productune/git-rules.json` (project-tracked) + `~/.productune/git-rules.default.json` (global). 4 토글 + 2 텍스트: `useDevBranch` / `useStagingEnv` / `featureBranchPrefix` / `fixBranchPrefix` / `protectedBranches` (display) / `autosaveTriggers` (Phase 5 lock). 토글 변경 = 다음 ticket 부터 즉시 반영. PRD L143 의 "Settings 탭" 약속 첫 구체화. |

**Round 2 합격 기준**: 기획자가 PR / 브랜치 / 커밋 / worktree / dev / merge / staging 어휘 한 번도 안 보고 한 번 [배포하기] 성공 + 프로덕션 (내부 `main`) 직접 push 차단 검증 + `useDevBranch=true` 토글 시 검증용 중간 환경 (내부 `dev`) 직접 push 도 차단 검증 + Settings 의 작업 흐름 규칙 패널에서 `useDevBranch` / `useStagingEnv` / branch prefix 토글이 즉시 반영됨.

---

### Round 3 — Env 관리 panel

목표: env 를 코드 에디터 없이 GUI 만으로 관리. `.env.local` 자동 생성 + 3-layer + 코드 스캔 누락 경고.

| Ticket | 제목 | 담당 | 비고 |
|---|---|---|---|
| **T-P4-030** | 3-layer 환경 selector 컴포넌트 — 🖥️ 로컬 (기본) / 🔍 미리보기 / 🚀 프로덕션 (가산식 추가) | pdt-designer + pdt-developer | 미리보기/프로덕션은 [+ 환경 추가] 버튼으로만 노출 |
| **T-P4-031** | variable table + 상태 badge (✅ / ⚠️ / 🔴 / 🔒) + secret masking (클릭 시 일시 노출) | pdt-designer + pdt-developer | badge 의미: 전체 동기 / prod 없음 / 로컬 없음 / secret |
| **T-P4-032** | 변수 추가/수정/삭제 + 적용 환경 선택 (로컬만 / 전체) | pdt-developer | 삭제는 confirmation + 영향받는 코드 위치 미리 표시 |
| **T-P4-033** | `.env.local` read/write — 로컬 환경 직접 편집의 backend | pdt-developer | atomic write + `.gitignore` 자동 등록 검증 |
| **T-P4-034** | Vercel env 단방향 push (prod/preview, Vercel 연결 시 활성) | pdt-developer | 양방향 sync 는 Phase 5; MVP 는 배포 시점 push 만 |
| **T-P4-035** | agent 코드 스캔 → `process.env.XXX` 매핑 → 누락 키 의미 있는 경고 | pdt-developer + pdt-qa | 예: "이 키 없으면 결제 기능 안 됩니다"; AST 분석 + 주변 함수명/주석 활용 |

**Round 3 합격 기준**: 사용자가 `.env.local` 파일 한 번도 안 열고 결제용 API 키 추가 → 배포까지 완주.

---

### Round 4 — 풀 사이클 UI + PO 채팅

목표: mockup-source 4-region IDE shell 정렬 — Project 탭 stage strip, Right PO Chat 단일 세션, Main split-pane tabs, Team 탭 skill 시각화.

| Ticket | 제목 | 담당 | 비고 |
|---|---|---|---|
| **T-P4-040** | Project 탭 내부 6-stage `stage-strip` + Right PO Chat ctx `stage-chip` | pdt-designer + pdt-developer | 상단 독립 breadcrumb row 구현 X. po-state 의 `current_task.stage` 와 1:1 매핑 |
| **T-P4-041** | Right Panel PO Chat — 340px 고정/접힘(FAB 복원) + 단일 PO 세션 + ctx line + 6 메시지 타입 | pdt-designer + pdt-developer | `chat.json` 단일 파일 기반. Right Panel 은 PO Chat 전용. claude `--output-format stream-json` 활용 |
| **~~T-P4-042~~** | ~~멀티 채팅방 (라운드/토픽별)~~ — **deprecated (2026-05-06)** | — | GUI 단일 PO 세션 결정으로 폐기. T-P4-041 이 단일 세션 전체 흡수. CLI/non-GUI 용도로 향후 재발행 가능 |
| **T-P4-043** | Project 탭 Rounds → Tickets sub-items + Main `ticket-review` 탭 | pdt-designer + pdt-developer | 독립형 ticket board 화면 X. status / assignee / model+effort / trace / 산출물 링크 + timestamp 표시 |
| **T-P4-044** | Side Panel Team 탭 — Personas + Skills + Wiki/Memory + Promotion candidates | pdt-designer + pdt-developer | Team/skill 은 우측 별도 panel 아님. `Matrix ↗` → Main `skill-matrix` 탭 |
| **T-P4-045** | Explorer 탭 — 파일 트리 + 검색 (regex/case/word) + ⌘⇧E 토글 | pdt-developer | Activity Bar Explorer icon 진입. fs.readdir 재귀 IPC. 결과 행 클릭 → markdown 탭 |
| **T-P4-046** | **Main split-pane + tab dispatcher (10 type) + drag-drop** | pdt-developer | **VS Code + cmux 패러다임. 재귀 hbox/vbox 트리 + 10 tab type dispatcher (markdown / design-gate / ticket-review / preview / qa-result / persona-def / env-view / skill-matrix / terminal / browser). drag-tab cross-pane move + pane resize 4px + 키바인딩 ⌘\\ / ⌘W. L5, Round 4 가장 복잡 — 첫 번째 구현 대상 권고.** |
| **T-P4-047** | Quick Open palette (⌘P) — 파일 / tab / 명령 fuzzy search | pdt-developer | command palette 1차 구현. T-P4-046 dispatcher 와 통합 |
| **T-P4-048** | Settings 탭 — Environment / Models / MCP / Hooks 통합 | pdt-developer | T-P4-024 stub 채우기. mockup §4.1 Settings spec 준수. T-P4-056 land 시 sub-tab list 에 Language 항목 동기 |
| **T-P4-049** | Persona presence bar — Right Panel PO Chat 세션 헤더 하단 4-페르소나 상태 표시 (24px strip) | pdt-developer | `T-P4-R4-workspace-shell` bundle. T-P4-041 의 한 줄 add-on. 4 칩 (PO/Designer/Dev/QA) × 3 상태 (idle/working/done). content 노출 X — 상태 + artifact 이름만. |
| **T-P4-056** | UI 언어 토글 (English / 한글) — onboarding Step 0 추가 + GUI 전반 i18n 도입 | pdt-developer + pdt-qa(light) | `react-i18next`. 카탈로그 `packages/gui/src/locales/{en,ko}.json`. 사용자 선택 = `~/.productune/settings.json` user-global. 고유어 (PO/Designer/Phase/stage·status enum/schema field/product name) 추출 금지. 9 컴포넌트 (workspace/* 8 + OnboardingWizard) 한글 추출. Settings 탭 Language sub-tab 추가 — T-P4-048 sub-tab list 동기 필요. dep: T-P4-015, T-P4-024. |
| **T-P4-057** (R4 fix) | locale protected-token linter fix — BSD grep `-P` no-op 수정 (bash + perl) | pdt-developer + pdt-qa(light) | T-P4-046 land 시 dev 발견: 기존 `check-locale-protected.sh` 가 macOS BSD grep `-P` 미지원으로 silent no-op → T-P4-049 의 `presence.doneNoArtifact: "완료"` baseline 통과. 새 스크립트 = bash + perl one-liner (PCRE 호환). 보호어 6 분류 전체 cover + 한글 후보 매핑 표. fix forward 로 `"완료"` → `"done"` 교체. dep: T-P4-056. |
| **T-P4-058** (R1+R4 fix) | init/openFolder hygiene — settings.local.json 잔재 정리 + GUI legacy 감지 + 모달 가시성 | pdt-developer + pdt-qa(light) | 다른 user 의 `.claude/settings.local.json` (kate.axz-pc absolute path) 따라와서 본 user Write 6 deny 발견 (paepyeong dogfood). `productune init` (CLI + GUI `project:installAt`) 이 foreign user path detect → backup + projectDir-templated default 박음. `.gitignore` 자동 추가. GUI `detectProductuneLayout` 신규 — `self-current` / `self-legacy` (po-state.json/briefs/po.lock 만, config.json X) / `none`. legacy → 사용자 confirm 후 idempotent migration. install 모달 contrast AAA (`#1C1C20` bg + `#E8E8EA` text). dep: T-P4-010, T-P4-012. |
| **T-P4-059** (R4 enh) | GUI PO session health visibility — 6 state surface (StatusBar + sticky banner + FAB badge) + CTA | pdt-developer + pdt-qa(light) | session restart escape hatch. 6 state: healthy / permission-blocked / rate-limited / compacting / delegating / error-other. po-runner.ts 의 stream-json envelope + stderr regex + child event + timeout heuristic 으로 감지. CTA: Restart modal / Retry / View log / Open settings link. dep: T-P4-041, T-P4-049, T-P4-058. paepyeong dogfood 발견 (PO 가 권한 deny 받아 정지됐는데 GUI visibility 없어 사용자 헤맸음). |
| **T-P4-065** (R4 fix, L5) | Phase 5단 (PRD/Design/Build/Deploy/Close) 통일 + ticket stage→type rename + ChatPanel selector 제거 + po-state slim + PRD/service-flow/mockup 정정 | pdt-developer + pdt-qa(light) | 6 sub-area 통합. (a) Phase 1~5 doctrine, (b) PhaseStrip 5단 + PhaseBreadcrumb 정렬 + 색 5 hex (--phase-deploy #FB923C / --phase-close #34D399), (c) ChatPanel selector 제거 (PO autonomy), (d) ticket stage→type rename + sections/stages.md → po-loop.md, (e) PRD §L235 / service-flow §2.2 / mockup HTML 5단 정정 + lifecycle-mechanics.md L41 오타 fix, (f) po-state past_tickets[] 통째 제거 + ticket md = SoT + useTicketScan hook + frontmatter 확장. schema_version 1→2 jq idempotent. PhaseStrip default 1 dot + hover expand 5 dot. dep: T-P4-040, T-P4-041, T-P4-046, T-P4-049 land. paepyeong + main dogfood 발견. |
| **T-P4-066** (R4 fix, L4) | Promotion lifecycle GUI/IPC impl — Drain pending_promotions[] surface + mechanical write 자동 호출 + retrospective archive read | pdt-developer + pdt-qa(light) | doctrine 5 단계 fix (commit `07a3183` + lifecycle-mechanics.md) 의 코드 impl. IPC: state:appendPendingPromotion / listPendingPromotions / resolvePendingPromotion / autoDropStale. WorkspaceShell turn-start drain surface (Cap 5/turn, 7-day stale-drop). tier 별 mechanical write 자동 호출 (project / wiki / work-note). retrospective viewer 가 approved archive (status ∈ {approved, edited} ∧ decided_at ∈ Version range) 표시. T-P4-065 schema_version 1→2 안에 fallback 포함 (pending_promotions[] 부재 → []). dep: T-P4-041 (PO Chat IPC), T-P4-065 (schema_version). 사용자 dogfood 발견 (promotion silent drop). |
| **T-P4-068** (R4 enh) | BackgroundTaskMonitor — PresenceBar count badge + StatusBar BackgroundTaskSegment + StatusBar height 28→36px | pdt-developer + pdt-qa(light) | 동시 sub-agent (designer×2 등) 호출 시 GUI visibility. PresenceBar chip 에 working≥2 count badge / StatusBar 신 segment 압축 표시 + portal hover popup (rows: persona / description / duration / status). po-runner stream-json `assistant.tool_use` ↔ `result` (tool_use_id 매칭) 으로 spawn/complete 감지. useBackgroundTasks zustand 별 slice. §1.5 Predictability — Idle placeholder 항상 노출. dep: T-P4-049 (PresenceBar), T-P4-059 (StatusBar segment 패턴). 사용자 dogfood 발견 (designer × 2 동시 호출 시 visibility 부재). |
| **T-P4-069** (R4 fix, design) | Design system §1.5 UX principles audit — 기존 GUI 컴포넌트 정합 검증 + critical violation fix ticket trigger | pdt-designer + pdt-developer | doctrine §1.5 (5 sub-rules: Few Things / Familiar / Predictability / Feedback / Escape) 가 land 됐지만 기존 컴포넌트 검증 미완. component × sub-rule matrix 작성 + critical/minor 우선순위 분류 + critical violation 별 fix ticket 발행. 알려진 violation: ChatPanel restart button feedback 부재 (§1.5.4). dep: design-system §1.5, pdt-designer.md mandatory consult. |
| **T-P4-096** (R4 fix) | UserMode default → planner + Settings General i18n parity — store/onboarding 초기값 null→planner, `settings.general.userMode.*` + `settings.tabGeneral` 추가 | pdt-developer | dep: T-P4-056, T-P4-057. MCP/Hooks/Env/Models 서브섹션 제외 (→ T-P4-048/T-P4-084). |
| **T-P4-097** (R4) | Project side panel 2-section split — "현재 버전" + "버전 히스토리" sp-section, current click → `version-current:{id}` 탭 (kanban), past click → `version-history:main` 탭 (linear), tab id in-place rename swap, v1 default 시드 | pdt-developer | dep: T-P4-023 (land), T-P4-095. plan: `docs/design/T-P4-097/plan.md`. |
| **T-P4-098** (R4) | Team panel Skills section collapse — SkillRow 리스트 제거, 단일 "스킬 매트릭스 →" row + N count badge, 클릭 시 main `skill-matrix` 탭 open | pdt-developer | dep: T-P4-044 (Team tab land). L1 trivial. |

**Round 4 합격 기준**: 사용자가 Project 탭 stage strip / PO Chat ctx chip 으로 현재 위치를 즉답 가능 + 단일 PO 세션 메시지 유지 확인 + Main split-pane / Quick Open / Team 탭 skill trace 가 mockup 과 정합 + **English / 한글 토글이 wizard Step 0 + Settings 양쪽에서 동작 + 즉시 반영 (앱 재시작 X) + 고유어 (Phase / stage·status enum / 페르소나 ID) 가 두 언어 모두 영문 그대로 표시 (T-P4-057 linter 가 카탈로그 baseline 강제)**. **T-P4-046 (Main split-pane) 이 Round 4 의 골격** — 다른 ticket 의 탭 open 은 모두 이 dispatcher API 를 거침.

---

### Round 5 — 디자인 단계 GUI 시각화 layer

> **Note**: Design stage (system / flow / mocks 3종 티켓 발행) 는 CLI doctrine (`po/sections/stages.md` Stage 2B')에서 L4+ mandatory로 이미 정의. Round 5 는 그 CLI 흐름을 Electron GUI 에서 시각화하는 레이어. CLI 시기에도 Design stage 는 동작함.

목표: PRD 직후 코드로 가기 전 디자인 stage 를 GUI 에서 명시 노출 + 사용자가 디자인 산출물 기반으로 인터랙티브 검토.

| Ticket | 제목 | 담당 | 비고 |
|---|---|---|---|
| **T-P4-050** | PRD → Build 사이 Design stage 명시 노출 — Stage 전이 시 사용자 승인 게이트 | pdt-designer + pdt-developer | "코드 시작 전 디자인 확인하기" 버튼 |
| **T-P4-051** | Mermaid.js 렌더링 컴포넌트 — UX flow / 사용자 여정 / 화면 전환 다이어그램 | pdt-developer | Electron/React renderer 에서 inline 렌더. zoom/pan, source toggle/copy, error fallback. Mermaid CLI 는 export-only 선택 |
| **T-P4-052** | Excalidraw React 컴포넌트 embed — 와이어프레임 인터랙티브 편집 | pdt-developer | 저장 = `docs/design/<slug>/<file>.excalidraw.json` |
| **T-P4-053** | 디자인 시스템 md 렌더링 — 컬러 스와치 + 타이포그래피 프리뷰 + 컴포넌트 갤러리 | pdt-designer + pdt-developer | 풍부한 md (커스텀 react component) — Figma 대체 |
| **T-P4-054** | 디자인 산출물 → 사용자 검토/승인 flow — "이대로 진행" / "다시 작업" / "특정 부분 수정" | pdt-designer + pdt-developer | 승인 시 Build stage 진입; 거절 시 Designer 재호출 |
| **T-P4-055** | High-fidelity UI mockup preview — Build 전 현실감 있는 예시 화면 승인 | pdt-designer + pdt-developer | generated image preview 는 visual agreement only. canonical source 는 md/Mermaid/Excalidraw/design system |

**Round 5 합격 기준**: 사용자가 디자인 시스템 / UX flow (전체) / 와이어프레임 (핵심 화면 a few) / hi-fi mockup (핵심 화면 a few, HTML/CSS 정적 프리뷰) 4 종 산출물을 GUI 에서 모두 보고 승인 → Build 진입. Mermaid diagram 은 외부 CLI 없이 앱 안에서 렌더되며, render 실패 시 원문/오류 fallback 으로 검토를 계속할 수 있음. Mockup preview 는 실제 텍스트/픽셀/최종 구현을 보장하지 않는 non-canonical visual agreement asset 으로 표시한다.

---

### Round 6 — 터미널 비의존 dev 환경

목표: dev 환경 / 외부 서비스 setup 을 agent 가 자동 처리 + 가이드는 최신 공식 문서 fetch.

| Ticket | 제목 | 담당 | 비고 |
|---|---|---|---|
| **T-P4-060** | node-pty 기반 shell 자동화 — `npm run dev` / `supabase start` / `vercel dev` 자동 실행 | pdt-developer | mac/linux PTY + Windows ConPTY 단일 API |
| **T-P4-061** | GUI shell status panel — 준비됨 / 에러 / 종료 버튼 + 로그 stream (선택적 펼치기) | pdt-designer + pdt-developer | 기본은 status badge 만; 사용자가 원할 때만 raw 로그 노출 |
| **T-P4-062** | 외부 서비스 setup 가이드 — TTL 24h + SWR fetch (Vercel / Supabase / GitHub 공식 문서) | pdt-developer | sitemap 기반 incremental fetch; "이 페이지 → 이 버튼 → 이 값" 수준 구체성 |
| **T-P4-063** | 오프라인 fallback + "마지막 업데이트: N시간 전" 배너 | pdt-designer + pdt-developer | 캐시 hit 시 항상 배너 표시 (가이드의 신뢰성 메타데이터) |
| **T-P4-064** | rate-limit exponential backoff + cache fallback | pdt-developer | 429 / 5xx 시 backoff (1s → 2s → 4s → ... → 캐시); 사용자에게는 transparent |

**Round 6 합격 기준**: 비-개발자가 vercel CLI 설치 / 가입 / 토큰 발급을 GUI 가이드 만으로 완주 + 오프라인 시에도 기본 동작 가능.

---

### Round 7 — 메모리 / Wiki 편집기

목표: 3-tier 메모리를 사용자가 직접 보고 수정 → 다음 페르소나 호출에 즉시 반영.

| Ticket | 제목 | 담당 | 비고 |
|---|---|---|---|
| **T-P4-070** | 3-tier 메모리 브라우저 — session / project (`docs/<persona>/*.md`) / wiki (Graphiti) tree | pdt-designer + pdt-developer | tier 별 색상 구분; 검색 + 필터 |
| **T-P4-071** | inline edit + diff preview — Monaco editor 로 markdown 편집 + 변경 전후 비교 | pdt-developer | 외부 에디터 의존 X |
| **T-P4-072** | "페르소나에 즉시 반영" 버튼 — 다음 위임에 수정 결과가 들어가는지 확인 trace 표시 | pdt-developer + pdt-qa | 메모리 invalidation + 다음 호출의 ctx 에 반영 검증 |

**Round 7 합격 기준**: 사용자가 잘못된 결정사항 1 개 정정 → 다음 페르소나 호출 trace 에 정정된 내용 반영 검증.

---

### Round 8 — 배포 플랫폼 추상화

목표: Vercel 완전 구현 + `DeployProvider` 인터페이스로 Phase 5 확장 준비.

| Ticket | 제목 | 담당 | 비고 |
|---|---|---|---|
| **T-P4-080** | `DeployProvider` 인터페이스 정의 — 프로젝트 생성 / env 동기화 / preview·prod deploy / 빌드 로그 / 도메인 관리 | pdt-developer | TypeScript interface + 추상 base class; Phase 5 provider 들이 implement |
| **T-P4-081** | Vercel provider 완전 구현 — `init` → `link` → env push → deploy + 로그 stream | pdt-developer | `vercel` CLI + Vercel REST API backend; 사용자에게는 GUI 버튼만 |
| **T-P4-082** | 배포 플랫폼 선택 화면 — Vercel 추천 (기본 선택) + 나머지 (Netlify / Railway / Cloudflare Pages) 회색 처리 + "Phase 5 지원 예정" 안내 | pdt-designer + pdt-developer | `DeployProvider` 인터페이스 직접 plug-in 가능 |

**Round 8 합격 기준**: Vercel 첫 배포 완주 + `DeployProvider` 인터페이스로 모의 provider 1 개 (e.g. `LocalDryRunProvider`) 동작 검증.

---

### Round 9 — Dogfood QA + Phase 5 입구

목표: Phase 4 합격 검증 + Phase 5 PRD 입력 도출.

| Ticket | 제목 | 담당 | 비고 |
|---|---|---|---|
| **T-P4-090** | 비-개발자 1 명 full cycle 완주 — PRD → Design → Build → QA → Deploy 한 사이클 | pdt-qa + 사용자 | manual dogfood; 터미널 직접 사용 횟수 = 0 검증 |
| **T-P4-091** | Phase 4 acceptance criteria 13 개 전체 검증 (PRD 참조) | pdt-qa | 각 AC 별 evidence 수집 |
| **T-P4-092** | Phase 4 레트로 → Phase 5 PRD 입력 작성 | pdt-designer | dogfood 페인 / 미해결 / 다음 phase 후보 정리 |

**Round 9 합격 기준**: 13 AC 전체 ✅ + 비-개발자 dogfood 완주 + Phase 5 PRD R1 진입 준비 완료.

---

## 의존 그래프 (요약)

```
Round 0 (monorepo) ─┬─→ Round 1 (init/프로젝트관리)
                    ├─→ Round 4 (풀 사이클 UI/채팅)
                    └─→ Round 6 (shell 자동화)

Round 1 ──→ Round 2 (Git 추상화) ─┬─→ Round 8 (배포 추상화)
              │ T-P4-020          │       ↑
              ├─ T-P4-021         │       │
              ├─ T-P4-022         │       │
              ├─ T-P4-023         │       │
              └─ T-P4-024 (parallel from T-P4-020)
                                          │
Round 3 (Env panel) ──────────────────────┘

Round 4 ──→ Round 5 (디자인 gate)
Round 4 ──→ Round 7 (메모리/wiki 편집기)

Round 2 ∪ Round 3 ∪ Round 5 ∪ Round 6 ∪ Round 7 ∪ Round 8 ──→ Round 9 (dogfood QA)
```

병렬 가능: Round 1 / Round 3 / Round 4 / Round 6 / Round 7 — 의존 끊긴 라운드는 인력 여유 시 병렬. Round 2 내부에서는 T-P4-024 가 T-P4-020 직후부터 parallel. T-P4-056 (i18n) 은 Round 4 안에서 다른 ticket 들과 병렬 — onboarding wizard (T-P4-015 land) + Settings (T-P4-024 land) 만 의존. T-P4-057 (locale linter fix) 는 T-P4-056 land 후 즉시 직렬.

---

## 외부 의존성 (PO pre-flight 체크용)

Phase 4 진입 시 사용자에게 사전 요청해야 할 외부 의존성 (T-PATCH-001 의 PO pre-flight 프로토콜에 따라 각 라운드 시작 전 체크):

| Round | 외부 의존성 | 확보 방법 |
|---|---|---|
| Round 1 | GitHub OAuth 앱 (Client ID / Secret) | productune 이 OAuth 앱 자체를 운영하거나, 사용자 본인 앱 발급 가이드 |
| Round 1 | GitHub repo 생성 권한 (`repo` scope) | OAuth 동의 시 자동 |
| Round 6 | Vercel 계정 + CLI 토큰 | T-P4-062 의 setup 가이드 |
| Round 6 | Supabase 계정 + 프로젝트 (사용 시) | T-P4-062 의 setup 가이드 |
| Round 8 | Vercel 프로젝트 link | T-P4-081 에서 자동 |

---

## Open questions (Phase 4 실행 단계)

PRD-level OQ 6 개는 모두 해소됨 — 본 로드맵 실행 중 발생하는 detail-level OQ 만:

- T-P4-001 의 monorepo 도구: pnpm workspaces vs turborepo — Round 0 plan 단계 결정
- ~~T-P4-022 의 PR auto-merge 정책: squash vs merge commit~~ → ✅ **squash merge**. 이유: 사용자 화면 ([버전 히스토리]) 에 ticket 단위 누적 메시지 1개로 표시되는 게 자연어 매핑과 정합. ticket worktree 의 N개 자동저장 → 프로덕션 환경에서 ticket-id summary 1줄로 squash. (2026-05-04 close)
- T-P4-035 의 코드 스캔 정밀도: AST-only vs LLM-augmented — Round 3 dogfood 후 결정
- T-P4-041 의 메시지 streaming 구현: SSE vs WebSocket vs Electron IPC bridge — Round 4 plan 단계 결정
- T-P4-052 의 Excalidraw 저장 포맷: `.excalidraw.json` (네이티브) vs SVG export 병행 — Round 5 plan 단계 결정
- ~~T-P4-056 의 OS locale 자동 감지 도입 시점~~ → ✅ **본 ticket 범위 안 = default highlight only** (`navigator.language` / `app.getLocale()` 가 ko-* 면 한글 옵션 pre-select). 자동 skip X — 사용자 Step 0 명시 선택 유지. (2026-05-07 close, PO directive)
- T-P4-057 후속: ESLint custom rule 또는 Node.js script 로 source code (`t('...')` 안의 보호어 enum 매개변수) 검사 확장 — R5 enhancement candidate.
- T-P4-059 의 claude stream-json envelope 패턴 (compact 명시? rate-limit reset 포맷?) — impl 단계 실측 후 design doc §9 close.

---

## Activity log

- **2026-04-30** — 로드맵 v1 작성. PRD OQ 세션 결과 + Phase 3 dogfood 학습 반영. Round 0–9 + 47 개 티켓 stub 정의. 타임스탬프 표준 + 외부 의존성 + 의존 그래프 명문화. T-PATCH-001 (PO pre-flight + 타임스탬프 스키마) 의 doctrine 반영을 본 로드맵의 prerequisite 로 기재.
- **2026-04-30** — T-P4-055 추가. Build 전 high-fidelity mockup preview 를 Design stage 승인 산출물로 확장. Preview 는 non-canonical visual agreement asset 으로 제한. 총 48 개 티켓.
- **2026-05-04** — mode 분기 (planner/developer) 제거. 단일 GUI 모드. Slug / PRD anchor / 컨텍스트 표 갱신. T-P4-010 제목 갱신 (mode 저장 → slug + config.json 생성 + installAt IPC). T-P4-012 비고 갱신 (3-분기 처리 명시). Round 1 합격 기준 + T-P4-013 설명 갱신. Round 9 AC 수 14 → 13 으로 갱신 (mode 분기 AC 제거).
- **2026-05-04 (Round 2 재정의 + git workflow 룰)** — Round 2 (Git 추상화 레이어) ticket 4→5 재정의. T-P4-020 = ticket-단위 worktree 자동 생성 + base 차단 (round-N → ticket-id 전환). T-P4-021 = ticket worktree 안 자동 commit. T-P4-022 = [배포 준비] / [배포하기] 2단계 게이트 (사용자 명시 클릭만). T-P4-023 = ticket 단위 그룹 카드 + 페르소나 trace inline. **T-P4-024 신설** = Settings — 작업 흐름 규칙 패널 + `git-rules.json` r/w (`useDevBranch`/`useStagingEnv`/branch prefix 토글). 의존 그래프에 T-P4-024 parallel 추가. Round 2 합격 기준 갱신 — worktree/dev/merge/staging 어휘 무노출 + base branch 직접 push 차단 + Settings 토글 즉시 반영. Open question close 1개 (T-P4-022 squash vs merge → squash). PRD §10 Git 추상화 + L151-156 env 매핑 + Phase 4 AC 13→14 동기 반영. 신규 doctrine `~/.productune/sections/git-workflow.md` 추가.
- **2026-05-06 (단일 PO 세션 결정)** — GUI multi-chatroom 모델 → single PO session per project. 컨텍스트 표에 "GUI PO 세션 = 단일" 항목 추가. Round 4 목표 갱신 ("멀티 채팅방 운영" → "단일 PO 세션 운영"). T-P4-041 제목/설명 갱신 (Right Panel PO Chat 단일 세션 + FAB 복원). T-P4-042 deprecated 표시 (GUI 에서 폐기 — T-P4-041 흡수, CLI/non-GUI 재발행 가능). Round 4 합격 기준 갱신 ("멀티 채팅방 2개 동시 운영" 제거 → "단일 PO 세션 메시지 유지 확인 + skill trace inline"). CLI/non-GUI multi-session 가능성 보존 명시.
- **2026-05-06 (mockup-as-source 정렬)** — ROADMAP Round 4 를 `mockup.html` / `showcase.html` 기준으로 재정렬. T-P4-040 = Project stage strip + PO ctx chip, T-P4-041 = Right PO Chat only, T-P4-043 = Project ticket sub-items + Main ticket-review, T-P4-044 = Team 탭. 상단 standalone breadcrumb / 독립 ticket board / 우측 Team panel 문구 제거.
- **2026-05-07 (T-P4-049 / T-P4-056 추가)** — Round 4 표에 두 ticket 추가. T-P4-049 = Persona presence bar (Right Panel PO Chat 헤더 하단 24px strip, 4 페르소나 × 3 상태 칩). T-P4-056 = UI 언어 토글 + i18n 도입 (English default + 한글 opt-in, react-i18next, onboarding Step 0 신규, Settings Language sub-tab, `~/.productune/settings.json` user-global). 컨텍스트 표에 "UI 언어" 항목 추가. Round 4 합격 기준 갱신 (i18n 토글 + 즉시 반영 + 고유어 영문 보존). T-P4-048 비고에 sub-tab 동기 명시. 본 ticket 은 처음 049 로 발행 요청되었으나 동일 일자 Persona presence bar 와의 번호 충돌로 056 으로 재배정.
- **2026-05-07 (T-P4-056 OS locale 정책 + redirect 정리)** — PO directive: OS locale 자동 감지를 본 ticket 범위 안에 포함하되 **default highlight 용도로만** (자동 skip X — 사용자 Step 0 명시 선택 유지). design plan §3 / §6 / §7 + ticket Step 0 / Out of scope 갱신. Open question close. `docs/design/T-P4-049-i18n-onboarding-toggle.md` redirect placeholder 삭제 (049 는 Persona presence bar 가 점유 — 빈 redirect 가 혼동 유발).
- **2026-05-07 (T-P4-057 추가 — locale linter no-op fix)** — T-P4-046 land 시 dev 가 발견: `packages/gui/scripts/check-locale-protected.sh` 의 `grep -P` 가 macOS BSD grep 미지원 → 모든 패턴 silent fail → 보호어 위반 사실상 미검사. 증거: T-P4-049 가 ko.json 에 `"완료"` 추가했는데 baseline 통과 (status enum `done` 한글 번역). 본 ticket 은 bash + perl one-liner 로 교체 (PCRE 호환), 보호어 6 분류 (페르소나/doctrine 단위/stage/status/schema/product) 전체 cover, 한글 후보 매핑 표 정리, fix forward 로 `"완료"` → `"done"` 교체. Round 4 합격 기준에 "T-P4-057 linter 가 카탈로그 baseline 강제" 단서 추가. PO directive 는 "T-P4-050 사용" 이었으나 050 은 R5 stub 점유 — R4 fix vs R5 design-gate 의미 분리를 위해 **T-P4-057** 채택. Open questions 에 R5 enhancement (ESLint / Node.js source-code 검사) candidate 추가.
- **2026-05-07 (T-P4-058 추가 — init/openFolder hygiene)** — paepyeong dogfood 중 발견: 다른 user(kate.axz-pc) 폴더 받아 작업하니 그 사람 `.claude/settings.local.json` 의 absolute path glob 만 박혀있어 본 user Write 6 deny. 또한 GUI [기존 폴더 열기] 가 `.productune/config.json` 만으로 self 감지 — paepyeong 처럼 옛 CLI 로 init 한 legacy layout (briefs/po-state.json 만, config.json X) 은 install 모달 띄워버림. install 모달 contrast 도 낮음. 본 ticket 4 sub-area 묶음: (1) settings.local.json foreign-user detect → backup + default 교체, (2) `.gitignore` 자동 추가, (3) `detectProductuneLayout` 3-kind (self-current / self-legacy / none) + 사용자 confirm migration, (4) 모달 contrast AAA. dep: T-P4-010, T-P4-012. agent permissionMode bypassPermissions 변경 (paepyeong 발견 직후 잘못된 fix) 은 별도 commit `63a32b5` 에서 rollback — 진짜 원인은 설정 잔재였음. 후속 commit `5ab7e2e` 에서 sub-agent layer (designer/developer/wiki-keeper, root + variants) 다시 bypassPermissions 로 정정 — sub-agent 권한 모델 = frontmatter 전용, 메인 세션만 settings.local.json 적용.
- **2026-05-07 (T-P4-059 추가 — PO session health visibility)** — paepyeong dogfood 추가 발견: settings 박은 후에도 기존 PO session 은 옛 cache 사용 → 같은 deny 반복. **session restart 가 fix**. 즉 claude code 의 permission state 가 session-level cache. 단순 edge case 가 아니라 token 소진 / auto compact / 페르소나 위임 대기 / 권한 누락 등 GUI 에서 PO 가 막힐 수 있는 상태들 전반을 사용자한테 visibility 줘야 함. 6 state surface (StatusBar 일반 indicator + sticky banner 심각 시 승격 + FAB badge), 사용자 CTA (Restart modal / Retry / View log / Open settings). 감지는 po-runner.ts 의 stream-json envelope + stderr regex + child event + timeout heuristic.
- **2026-05-08 (T-P4-065 발행 — Phase 5단 통일 + multi-axis hygiene L5)** — 사용자 dogfood 발견: 6단 mockup vs 4단 doctrine vs ticket stage 6 enum 의 3-axis 충돌 + po-state.json 의 ticket 누적 (`past_tickets[]` cap 50) + ticket md 와 중복 + ChatPanel persona selector 가 PO autonomy 위배. **directive history**: 1A (StageStrip 6→4) → designer 반박 (PRD AC #9 위배) → 사용자 5단 (PRD/Design/Build/Deploy/Close) 채택. 6 sub-area plan 모두 land: (a) Phase 1~5 doctrine, (b) PhaseStrip 5단 + PhaseBreadcrumb 정렬 (default 1 dot + hover expand) + 색 5 hex (deploy `#FB923C` / close `#34D399`), (c) ChatPanel selector 제거 (PO autonomy), (d) ticket stage→type rename + sections/stages.md → po-loop.md, (e) PRD §L235 / service-flow §2.2 / mockup HTML 5단 정정 + lifecycle-mechanics.md L41 오타 fix, (f) po-state past_tickets[] 통째 제거 + ticket md = SoT + useTicketScan + frontmatter 확장 (slug/qa_status/qa_loops). schema_version 1→2 jq idempotent. Phase transition gate 모든 boundary 사용자 명시 confirm 통일. design-system §2.6 OQ-1 close.
- **2026-05-08 (promotion lifecycle bug fix doctrine + T-P4-066 발행)** — 사용자 dogfood 발견: persona 가 `promotion_candidates` 반환했는데 PO 가 inline surface 못 한 case (백그라운드 sub-agent 결과 mid-turn) → drop. project / wiki lesson 누적 X. retrospective 가 보여줄 lesson 없음. 5 단계 fix path: (1) 13 페르소나 spec output rule top-level JSON 의무화, (2) `pending_promotions[]` schema (11 sub-keys), (3) `stages.md Step 1b — Drain` (Cap 5/turn, 7-day stale-drop, 4 응답 분기), (4) 기존 mechanical write 그대로, (5) lifecycle-mechanics.md retrospective sequence read sources 5 (project notes / recent_turns / wiki / po-memory / approved-promotion archive) + retrospective.md template 보강 (Approved promotions / Repeated patterns / Surfaced for next Version). doctrine 변경은 commit `07a3183` + 본 turn lifecycle-mechanics.md 갱신. T-P4-066 = GUI/IPC impl ticket (drain surface + mechanical write 자동 호출 + retrospective viewer integration). schema_version T-P4-065 의 1→2 안에 fallback 통합.
- **2026-05-08 (UX principles doctrine + T-P4-068 / T-P4-069 발행)** — 사용자 정리한 UX 철학 3 대원칙 8 sub-rule 을 productune doctrine 에 통합. 분리: 대원칙 1 (사용자 ≠ 우리, 타겟 이해 + 가설 관측) → `prd-and-output.md` §"User-centric principles" (기존 pm-product-discovery skills + version_outcome cross-reference). 대원칙 2 + 3 (사용자 ≠ 우리 + 당황 X) → `design-system.md` §1.5 UX principles 5 sub-rules (Few Things / Familiar / Predictability / Feedback / Escape) + §8.9 Empty pane recipe 신설 + ChatPanel restart button feedback 부재 dogfood 를 §1.5.4 anti-pattern 명시. `pdt-designer.md` 에 mandatory consult section 추가 (매 component spec / PR review 시 §1.5 체크리스트 강제). T-P4-068 = BackgroundTaskMonitor (PresenceBar count badge + StatusBar 신 segment + height 28→36px, 동시 sub-agent visibility). T-P4-069 = design-system §1.5 audit (기존 컴포넌트 정합 검증 + critical fix ticket trigger).
- **2026-05-12 (T-P4-096 발행 — UserMode default + i18n parity)** — 사용자 dogfood (2026-05-12): Settings General 탭에서 `settings.general.userMode.*` key 부재로 raw key string 노출 + UserMode default null 로 onboarding Step0_5 에서 아무 카드도 pre-select 안 됨. T-P4-096 = (A) `useUserMode` store `mode: null → 'planner'`, (B) `Step0_5UserMode` `useState(null) → useState('planner')`, (C) en/ko 양쪽 `settings.tabGeneral` + `settings.general.userMode.{title,description,developer,planner,unset}` 추가 (T-P4-057 protected-token 준수), (D) ROADMAP 갱신. MCP/Hooks/Environment/Models 서브섹션은 T-P4-048/T-P4-084 spec 전용 — 별도 follow-up.
- **2026-05-12 (T-P4-097 발행 — Side panel 2-section split)** — 사용자 dogfood directive: Project tab side panel 의 single VERSIONS master 를 "현재 버전" + "버전 히스토리" 2 sp-section 으로 분리. current row click → `version-current:{id}` 탭 (title=`v1`, kanban), past row click → `version-history:main` 탭 (title="버전 히스토리", linear). tab type 단일 `version-history` reuse — T-P4-023 1.5차 land 한 `isCurrentVersion → kanban` 분기 그대로. v1 default = PoState init 시 `versions[0]={id:'v1'}` 시드. Phase=Close transient 시 current → history 자동 이동. Tab rename = in-place id swap (close+reopen X). plan = `docs/design/T-P4-097/plan.md` v2 (opus/high, decisions a–g + ASCII mockup + tab dispatch 표 + §1.5 self-check). OQ-1/2/4/5 resolved (완료 / CSS :hover group / 즉시 history 이동 / id swap). dep: T-P4-023 (land), T-P4-095 (todo — version-id pill consumer).
- **2026-05-12 (T-P4-095 land — version naming rule + paepyeong migration)** — `016c4ad`. 5 sub-area: shared validator (`packages/gui/src/lib/version-id.ts`) + Wizard validator (VersionInitStep + NewProjectModal) + PO doctrine (lifecycle.md version-create regex step) + Ticket lint (`check-ticket-version.mjs` + tickets.md frontmatter rule) + Migration script (`migrate-version-id.mjs` dry-run + --apply + .bak backup). UI rendering no-op (existing code uses version.id directly). paepyeong migration applied: `paepyeong-v1 → v1` across po-state.json + 21 ticket md, backup `.bak.2026-05-12T05-33-37-348Z`, idempotency confirmed. worktree-isolated dev sonnet/medium 11min, squash merge 597+/10-. Open: OQ-A productune own version ids (v0.4-meta-dogfood 등) manual-needed category — 별도 PO decision. OQ-C cross-project view visual spec — 별 ticket.
- **2026-05-12 (T-P4-098 발행 — Team Skills section collapse)** — 사용자 dogfood directive: Team side panel 의 Skills section 에서 개별 SkillRow list 제거. 단일 "스킬 매트릭스 →" row + count badge 로 collapse. 클릭 시 main `skill-matrix` 탭 open (`openTab('skill-matrix', 'skill-matrix', {})`). Personas / Wiki·Memory section 변경 X. L1 trivial dev impl — T-P4-095/T-P4-097 land 후 순차 worktree dispatch. assignee: pdt-developer.
