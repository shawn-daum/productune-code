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
stage: impl
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

**Round 4 합격 기준**: 사용자가 Project 탭 stage strip / PO Chat ctx chip 으로 현재 위치를 즉답 가능 + 단일 PO 세션 메시지 유지 확인 + Main split-pane / Quick Open / Team 탭 skill trace 가 mockup 과 정합.

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

병렬 가능: Round 1 / Round 3 / Round 4 / Round 6 / Round 7 — 의존 끊긴 라운드는 인력 여유 시 병렬. Round 2 내부에서는 T-P4-024 가 T-P4-020 직후부터 parallel.

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

---

## Activity log

- **2026-04-30** — 로드맵 v1 작성. PRD OQ 세션 결과 + Phase 3 dogfood 학습 반영. Round 0–9 + 47 개 티켓 stub 정의. 타임스탬프 표준 + 외부 의존성 + 의존 그래프 명문화. T-PATCH-001 (PO pre-flight + 타임스탬프 스키마) 의 doctrine 반영을 본 로드맵의 prerequisite 로 기재.
- **2026-04-30** — T-P4-055 추가. Build 전 high-fidelity mockup preview 를 Design stage 승인 산출물로 확장. Preview 는 non-canonical visual agreement asset 으로 제한. 총 48 개 티켓.
- **2026-05-04** — mode 분기 (planner/developer) 제거. 단일 GUI 모드. Slug / PRD anchor / 컨텍스트 표 갱신. T-P4-010 제목 갱신 (mode 저장 → slug + config.json 생성 + installAt IPC). T-P4-012 비고 갱신 (3-분기 처리 명시). Round 1 합격 기준 + T-P4-013 설명 갱신. Round 9 AC 수 14 → 13 으로 갱신 (mode 분기 AC 제거).
- **2026-05-04 (Round 2 재정의 + git workflow 룰)** — Round 2 (Git 추상화 레이어) ticket 4→5 재정의. T-P4-020 = ticket-단위 worktree 자동 생성 + base 차단 (round-N → ticket-id 전환). T-P4-021 = ticket worktree 안 자동 commit. T-P4-022 = [배포 준비] / [배포하기] 2단계 게이트 (사용자 명시 클릭만). T-P4-023 = ticket 단위 그룹 카드 + 페르소나 trace inline. **T-P4-024 신설** = Settings — 작업 흐름 규칙 패널 + `git-rules.json` r/w (`useDevBranch`/`useStagingEnv`/branch prefix 토글). 의존 그래프에 T-P4-024 parallel 추가. Round 2 합격 기준 갱신 — worktree/dev/merge/staging 어휘 무노출 + base branch 직접 push 차단 + Settings 토글 즉시 반영. Open question close 1개 (T-P4-022 squash vs merge → squash). PRD §10 Git 추상화 + L151-156 env 매핑 + Phase 4 AC 13→14 동기 반영. 신규 doctrine `~/.productune/sections/git-workflow.md` 추가.
- **2026-05-06 (단일 PO 세션 결정)** — GUI multi-chatroom 모델 → single PO session per project. 컨텍스트 표에 "GUI PO 세션 = 단일" 항목 추가. Round 4 목표 갱신 ("멀티 채팅방 운영" → "단일 PO 세션 운영"). T-P4-041 제목/설명 갱신 (Right Panel PO Chat 단일 세션 + FAB 복원). T-P4-042 deprecated 표시 (GUI 에서 폐기 — T-P4-041 흡수, CLI/non-GUI 재발행 가능). Round 4 합격 기준 갱신 ("멀티 채팅방 2개 동시 운영" 제거 → "단일 PO 세션 메시지 유지 확인 + skill trace inline"). CLI/non-GUI multi-session 가능성 보존 명시.
- **2026-05-06 (mockup-as-source 정렬)** — ROADMAP Round 4 를 `mockup.html` / `showcase.html` 기준으로 재정렬. T-P4-040 = Project stage strip + PO ctx chip, T-P4-041 = Right PO Chat only, T-P4-043 = Project ticket sub-items + Main ticket-review, T-P4-044 = Team 탭. 상단 standalone breadcrumb / 독립 ticket board / 우측 Team panel 문구 제거.
