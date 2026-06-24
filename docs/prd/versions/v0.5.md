# PRD: productune

**Slug**: productune    **Created**: 2026-04-28    **Status**: v0.5 — Phase 3 Build in-progress

> 자체 PRD. productune 이 만들고자 하는 제품에 대한 정의이자, 동시에 productune 자기 자신의 다음 라운드 목표를 누적 기록하는 곳.
>
> **버전 스냅샷**: 닫힌 버전의 PRD 는 [`versions/`](./versions/) 에 close 시점 불변 기록으로 보존 (P5 close 시 자동 — `versions/v0.4.md` 등). 이 파일은 항상 현재 그림.

---

## Why — 비전

**개발에 대해 잘 알지 못하는 기획자가 프로덕트를 성공적으로 만들어낼 수 있는 툴.**

"잘 알지 못한다" =
- 제품 스펙, 구현 난이도는 어느 정도 가늠 가능
- CLI 환경에 익숙하지 않음
- 복잡한 개발 지식 (빌드 시스템, 디버깅, 아키텍처 패턴) 은 깊이 모름

"성공적으로" = "특정 문제를 해결하는 방식으로 시장에 내놓을 수 있는 상태" — 단순히 동작하는 게 아니라 PRD 가 정의한 acceptance criteria 를 만족하고 사용자에게 가치를 전달.

오케스트라처럼 4 명의 전문가 페르소나 (PO + Designer + Developer + QA) 가 함께 곡 (제품) 을 tune 하면서 만들어 가는 컨셉. PO 가 지휘자 역할, 각 페르소나가 자신의 악기 (영역) 를 연주.

## Who — 타깃 사용자

| 항목 | 정의 |
|---|---|
| **주 사용자** | 기획자 / 1인 PM / 제품 오너 — 코드를 직접 짜진 않지만 무엇을 만들지 정의할 수 있는 사람 |
| **공통 특성** | 스펙 / 구현 난이도 추정 가능, CLI 미숙, 복잡 개발 지식 X |
| **사용 시점** | 새 MVP 시작 / 기존 제품의 다음 라운드 / 실험 프로토타입 |
| **사용하지 않는 사람** | 풀스택 개발자가 코드 직접 짜는 것이 더 빠른 케이스 — productune 은 **위임 + 검증** 도구이지 IDE 보조가 아님 |

## How — 4-phase 롤아웃

| Phase | 목표 | 인터페이스 | 상태 |
|---|---|---|---|
| Phase 1 | CLI 기반 핵심 구조 + dogfood-ready | terminal 명령어 (`productune`) | ✅ 완료 (v0.1~v0.3) |
| Phase 2 | 사용자가 실제 프로젝트 1 개로 dogfood 완주 → MVP 검증 | 동일 (CLI) | ✅ 완료 (issue-tracker · paepyeong dogfood) |
| Phase 3 | UI 화 — onboarding + 일반 사용 모두 UI | web/desktop UI | ✅ 완료 (v0.4 GUI) |
| **Phase 4 (지금)** | **terminal 무의존 GUI 풀 사이클** — PRD → 디자인 → 구현 → 배포 → 운영을 터미널 없이 완주 | GUI (Phase 3 위에 얹는 layer) | **진행 중 — v0.5 Planner UX** |

> Phase 1, 2 가 성공해야 Phase 3 진입. UI 는 검증된 흐름 위에 얹는 layer 이지, 검증 전에 만들지 않음. Phase 4 는 Phase 3 의 UI 를 한 단계 더 추상화 — "개발을 한 번도 만져보지 않은 사람도 완주" 가 합격선.

## 완료된 라운드 — Phase 1 ~ 3 (스냅샷 참조)

Phase 1 (CLI MVP — 4 페르소나 / ticket system / dynamic routing / skill / 3-tier 메모리), Phase 2 (실프로젝트 dogfood), Phase 3 (GUI 화) 는 v0.1~v0.4 에서 완료. 당시 범위 · Non-goals · acceptance criteria 전문은 close 시점 불변 스냅샷 [`versions/v0.4.md`](./versions/v0.4.md) 참조.

## Phase 4 — terminal 무의존 GUI 풀 사이클 (future)

### 컨셉

**"개발 모르는 사람도 프로덕트 생산을 완주할 수 있게."**

Phase 1–3 이 검증한 CLI / orchestration core + 기본 UI 위에, **터미널을 한 번도 직접 열지 않고도 PRD → 디자인 → 구현 → 배포 → 운영 한 사이클을 GUI 만으로 완주** 할 수 있는 단일 GUI. Phase 3 의 dogfood 결과 — 진짜 비-개발자 사용자는 환경 설정 / env 관리 / 외부 서비스 가입 단계에서 막힘 — 을 정면으로 해소.

핵심 원칙:
- **터미널 무의존** — 사용자에게 명령어 외우게 하지 않는다. 필요한 shell 은 agent 가 띄운다.
- **시각화 우선** — 코드가 아닌 디자인 / 다이어그램 / 카드 단위로 사고할 수 있게.
- **친절한 안내** — 외재 지식 (최신 공식 문서) 을 실시간 fetch 해 가이드. LLM 의 memorized API 는 신뢰 X.
- **풀 사이클** — PRD 시작 → 배포 / 운영까지 한 UI 안에서 흐름이 보임.

> **단일 모드 결정 (2026-05-04)**: productune GUI 는 단일 모드다. "planner / developer 분기" 를 제거했다 — developer 는 terminal 에서 개발하면 되고, productune GUI 가 두 페르소나의 UX 를 동시에 책임지면 scope 가 폭증한다. productune GUI 를 사용하는 사람은 누구든 동일한 GUI 를 쓴다.

### 설치 시점 — 2-level onboarding

onboarding 은 **앱 레벨**과 **프로젝트 레벨** 두 단계로 분리된다.

#### Level 1 — 앱 onboarding (최초 1회, `~/.productune/productune.env` 없을 때)

First-run wizard (GUI):

1. **Engine 선택** — `Claude Code` (기본) / `Codex` / 둘 다
2. **Wiki 백엔드** — `Filesystem` (기본, 의존성 없음) / `Graphiti` (Docker 필요). 하드웨어 tier 자동 감지 후 추천 표시.
3. **API Key 입력** — 선택한 engine 에 맞는 key (ANTHROPIC_API_KEY / OPENAI_API_KEY). [건너뛰기] 가능 — 나중에 Settings 에서 변경.
4. **완료** — `~/.productune/productune.env` 생성, agents 심링크, po-instructions.md 복사.

완료 후 → HomeView (프로젝트 선택 화면). 이후 Settings 탭에서 언제든 변경 가능.

#### Level 2 — 프로젝트 onboarding (새 프로젝트마다)

[새 프로젝트 만들기] wizard:

1. **slug 입력** — 프로젝트 이름 (영소문자·하이픈)
2. **GitHub 연결** — Device Flow OAuth → private repo 자동 생성. 건너뛰기 가능 (로컬 전용).

[기존 폴더 열기] 흐름:
- `.productune/` 존재 → 그대로 열기
- 하위 폴더 중 `.productune/` 포함된 것 1개 이상 → 사용자 선택
- 없음 → "이 폴더에 productune 설치하고 시작" 버튼 → `project:installAt` 실행 (선택한 폴더에 직접 init)

### 핵심 기능

#### 1. 간편한 설치 과정 + 2-level onboarding

설치 출력은 전부 progress UI 뒤로 숨기고, 사용자에게는 단계와 결과만 보인다.

- (a) 앱 최초 실행 시 engine / wiki backend / API key 선택 wizard (T-P4-015).
- (b) 새 프로젝트마다 slug 입력 + GitHub OAuth (선택).
- terminal 출력은 progress UI 뒤로 숨긴다.
- 실패 시 사람이 읽을 수 있는 메시지 + 다음 액션 버튼을 보여준다.
- 이후 Settings 탭에서 engine / wiki backend 를 변경할 수 있다.

#### 2. GUI 시각화 — PO 채팅 (단일 PO 세션)

프로젝트당 하나의 PO 세션만 운영한다. PRD 작성 → 제품 설계 과정은 채팅이 아니라 탭에서 시각화한다.

- Right Panel 은 **PO Chat 전용**으로 우측 340px 고정/접힘(FAB 복원)이다.
- PRD 작성 → 제품 설계 과정은 Project 탭 + Main split-pane tabs 에서 시각화한다.
- 티켓 정보는 Side Panel 의 Project 탭 Rounds/Tickets sub-items 와 Main 의 `ticket-review` 탭에 status / 담당 페르소나 / model+effort / 위임 trace / 산출물 링크로 표시한다.
- GUI multi-chatroom 모델은 폐기하며, CLI / non-GUI 환경에서만 multi-session 가능성을 보존한다.

**세션 저장소**: `<projectDir>/.productune/chat.json` — 단일 파일이며 `messages` + `claude_session_id` + `updated_at` 를 담는다.

#### 3. GUI 시각화 — 디자인 단계 명시화

PRD 직후 곧장 코드로 가지 않고, **디자인 방향성 결정 stage** 를 별도로 노출한다. 사용자는 코드 diff 가 아닌 디자인 산출물 기반으로 검토 / 의사결정한다.

- 산출물 포맷 = **md + Mermaid.js + Excalidraw** (전부 로컬, 외부 서비스 의존 없음).
- Claude design skill 이 Mermaid 를 native 로 출력한다 (시퀀스 / 플로우 / 상태도).
- Phase 4 GUI 는 Electron/React renderer 안에 Mermaid.js 또는 React Mermaid component 를 번들해 markdown code fence 를 inline 렌더링한다.
- Excalidraw React 컴포넌트를 Electron renderer 에 임베드해 와이어프레임을 그린다.
- 디자인 시스템은 풍부한 md 렌더링 (color swatch / typography preview) 으로 표현한다.
- **Figma 연동은 하지 않는다** (토큰 비용 예측 불가).

**viewing 경로 — 외부 CLI 무의존이 정상 보기**: 현재/수동 검토 경로는 GitHub Markdown preview 또는 VS Code Markdown preview 로 Mermaid fence 를 확인한다. Phase 4 GUI 정상 보기 경로는 외부 CLI 에 의존하지 않는다. Mermaid viewer 는 zoom/pan, source toggle, source copy, render error fallback(원문 코드 + 오류 메시지)을 제공하고, SVG/PNG export 는 필요해지면 후속 옵션으로 추가한다. `@mermaid-js/mermaid-cli` 는 export/자동 이미지 생성용 선택 도구일 뿐 정상 GUI viewing 필수 의존성이 아니며, 도구/라이브러리 추가 설치가 필요할 때는 사용자 동의를 먼저 받는다.

#### 4. 메모리 / Wiki 편집기 진입점

- Team 탭 안의 Wiki / Memory 섹션에서 현재 저장된 3-tier 메모리 (session / project `docs/*` / wiki Graphiti) 를 본다.
- Main 의 `markdown` / review 탭으로 열어 수정·검토할 수 있다.
- 잘못 학습된 사실 / 오래된 결정 정정은 PO gate 를 거쳐 반영한다.
- 우측 별도 패널은 만들지 않는다.

#### 5. 터미널 비의존 dev 환경 — agent 자동화

dev 환경이 필요한 시점에 agent 가 자동으로 shell 을 띄우고, 사용자는 명령을 외울 필요가 없다.

- `npm run dev`, `supabase start`, `vercel dev` 등 dev 환경이 필요한 시점에 agent 가 자동으로 shell 을 띄운다.
- health check 후 GUI 에 "준비됨" 만 알린다.
- 종료 / 재시작도 GUI 버튼으로 한다.
- 구현은 **node-pty** — macOS / Linux 의 PTY 와 Windows ConPTY 를 단일 API 로 추상화해 OS 별 분기 코드를 최소화한다.

#### 6. 터미널 비의존 dev 환경 — 친절한 세팅

외부 서비스 setup 은 LLM training data 가 아닌 최신 공식 문서를 실시간 fetch 해 안내한다.

- `init` 시 `.env.local` 디폴트 생성 + `.gitignore` 자동 등록.
- vercel / supabase / github 등 외부 서비스 setup 시 **최신 공식 문서를 실시간 fetch** 해 step-by-step 가이드 제공 (가입 링크부터 토큰 발급, 권한 설정까지).
- LLM training data 에 의존하지 않는다.

**Fetch 정책**: TTL 24h + stale-while-revalidate. 오프라인 시 마지막 캐시를 보여주고 "마지막 업데이트: N시간 전" 배너를 표시한다. rate-limit 시 exponential backoff 후 캐시 fallback.

#### 7. env 관리 GUI panel — 3-layer + 상태 badge + 코드 스캔 경고

환경을 3 개 레이어로 정리한다. **로컬이 기본** — 사용자는 배포 직전까지 미리보기 / 프로덕션 환경을 만들 필요가 없다.

| 레이어 | 의미 | 매핑 | 비고 |
|:--|:--|:--|:--|
| 🖥️ 로컬 | "지금 내 컴퓨터에서 실행할 때" | `.env.local` | 기본값. `init` 시 자동 생성 + `.gitignore` 자동 등록. plaintext. |
| 🔍 미리보기 | "배포 전 테스트할 때" | Vercel preview env / 검증용 중간 환경 (내부 `dev`) 활성 시 자동 매핑 | Settings 의 `useDevBranch=true` 토글 시 활성. **배포 준비 시** [+ 환경 추가] 로도 추가 가능. |
| 🚀 프로덕션 | "실제 사용자가 쓰는 서비스" | Vercel production env / 내부 `main` | 항상 보호. |
| 🛡️ 외부 점검 | 선택, 첫 런칭 후 토글 | 내부 `staging` | Settings 의 `useStagingEnv=true` 시 활성. default off. |

**base ↔ env 매핑**: 내부 `main` = 🚀 프로덕션, 내부 `dev` (opt-in) = 🔍 미리보기, 내부 `staging` (opt-in, default off, 첫 런칭 후 활용) = 🛡️ 외부 점검.

**UI 구조**: 좌측 환경 selector + 우측 variable table. 변수 추가 시 적용 환경을 선택할 수 있다 (로컬만 / 전체).

변수 상태 badge:

| Badge | 의미 |
|:--|:--|
| ✅ | 전체 동기 |
| ⚠️ | prod 없음 (배포 시 해당 기능 비활성 경고) |
| 🔴 | 로컬 없음 (현재 실행 불가) |
| 🔒 | secret masking (클릭 시 일시 노출) |

**코드 스캔 경고**: agent 가 코드를 스캔해 `process.env.XXX` 를 매핑 → "이 키 없으면 결제 기능 안 됩니다" 수준의 의미 있는 경고를 띄운다 (T-ENV-06). Phase 4 MVP 에서는 외부 (Vercel) 동기를 배포 명령 시점에만 수행하며, 양방향 실시간 sync 는 미포함이다.

#### 8. 풀 사이클 UI

- process 시작 (PRD 작성) → 끝 (배포 + 마무리) → 다음 사이클 진입의 흐름을 보여준다.
- 사용자가 **현재 어느 phase 인지 직관적으로 인지** 할 수 있다.
- 위쪽 독립 5-phase breadcrumb row 는 두지 않는다.
- Phase 정보는 Side Panel **Project 탭 phase strip** 과 Right Panel **PO Chat ctx chip** 에서 노출한다.

#### 9. 프로젝트 관리 UI

앱 실행 시 두 진입점을 제공하고, recent projects 리스트로 빠른 재진입을 지원한다.

- (a) **[새 프로젝트 만들기]** → `~/productune/projects/<slug>/` 자동 생성 + `init` 자동 실행. 사용자는 파일시스템 탐색이 불필요하다. **기본 진입점.**
- (b) **[기존 폴더 열기]** (고급 사용자) → 폴더 선택 → `.productune/` 없으면 "이 폴더에 productune 시작하기" 버튼 노출 → `project:installAt` 실행 (선택한 폴더에 직접 init).

#### 10. Git 추상화 레이어 — 작업 흐름 규칙

비-개발자에게 git 개념을 노출하지 않는다. **Ticket 단위 worktree** + base 보호 + 2단계 게이트 + Settings 토글이 핵심이다.

UI 매핑:

- **[자동저장 (백그라운드)]** = 현재 작업 (ticket worktree) 안 자동 commit (페르소나 turn 종료 + 상태 변화 트리거; 메시지 = ticket-id + persona summary).
- **[배포 준비]** = 작업 worktree push + (toggle 시) 검증용 중간 환경 (내부 `dev`) 매핑.
- **[배포하기]** = 프로덕션 환경 (내부 `main`) PR 자동 생성 → squash merge → Vercel deploy. **사용자 명시 클릭만 트리거**, PO 자동 결정 X.
- **[버전 히스토리]** = ticket 단위 그룹 + 페르소나 trace inline 카드 UI (커밋 메시지 = 사람이 읽을 수 있는 자연어).

**Worktree-per-ticket**: ticket 발행 = `<project>/.productune/worktrees/<ticket-id>/` 자동 생성. 내부 branch 명 = `feature/<ticket-id>/<slug-kebab>` 또는 `fix/<ticket-id>/<slug-kebab>` (risk_flags / stage 자동 분류). 사용자 화면엔 Project 탭 active ticket row + Status bar 의 "작업공간 준비됨" 배지로만 표현하고, branch/worktree 어휘는 노출하지 않는다.

**Base branch 직접 작업 차단**: 프로덕션 (내부 `main`) 은 항상 차단한다. 검증용 중간 환경 (내부 `dev`) 은 Settings 의 `useDevBranch=true` 시 차단한다. 차단 동작은 두 가지다.

- (a) GUI 가 base 위 자동저장 거부 + 친절 모달 ("보호된 환경입니다. 작업공간에서 시작해주세요." + [새 작업 시작] CTA).
- (b) `.git/hooks/pre-push` 자동 설치 (productune init 시).

**Settings — 작업 흐름 규칙 패널**: `<project>/.productune/git-rules.json` (project-tracked) + `~/.productune/git-rules.default.json` (global default). 4 토글 + 2 텍스트:

| Key | Type / default | 라벨 |
|:--|:--|:--|
| `useDevBranch` | boolean, default false | 검증용 중간 환경 사용 |
| `useStagingEnv` | boolean, default false, 첫 런칭 후 활성 | 외부 점검 환경 사용 |
| `featureBranchPrefix` | text, default "feature" | 기능 작업 prefix |
| `fixBranchPrefix` | text, default "fix" | 수정 작업 prefix |
| `protectedBranches` | auto-derived, display only | — |
| `autosaveTriggers` | Phase 5 lock | — |

**단순 수정도 ticket 필수**: doctrine §2A' 그대로. ticket-id 없는 자동저장은 거부하며, trivial (typo/import) 은 현재 worktree 내에서 OK.

`init` 시 GitHub OAuth 팝업 → private repo 자동 생성 → remote 자동 설정. 사용자는 `git` 명령어를 한 번도 보지 않는다.

#### 11. 페르소나 skill set + 적용 여부 시각화

- Side Panel **Team 탭**에서 각 페르소나 (PO / Designer / Developer / QA) 의 보유 skill 목록과 현재 task 에서 실제 invoke 된 skill 을 확인한다.
- `Matrix ↗` 는 Main 의 `skill-matrix` 탭을 연다.
- "이번 작업에 사용된 skill: `to-prd`, `pm-product-discovery:interview-script`" 수준의 trace 는 PO Chat inline trace 와 Project 탭 Recent Activity 에서 보조 노출한다.

### 기술 스택 (Phase 4 GUI)

- **GUI 런타임**: **Electron + React/TypeScript (Vite renderer)** — 데스크톱 우선, native shell 자동화 / OS keychain / 파일시스템 접근이 필요해 web app 이 아닌 Electron 채택. Vite 로 renderer 빌드 속도 확보.
- **Shell 자동화**: **node-pty** — mac/linux PTY + Windows ConPTY 단일 API.
- **다이어그램**: **Mermaid.js** (텍스트 기반, claude design skill native output; Electron/React renderer 에서 inline 렌더링) + **Excalidraw** (와이어프레임, React 컴포넌트 임베드). 정상 viewing 은 Mermaid CLI 없이 동작하며, CLI 는 SVG/PNG export 등 선택 기능에서만 사용.
- **문서 fetch**: TTL 24h + stale-while-revalidate (offline / rate-limit 대응).

### 배포 플랫폼 전략

`init` 시 배포 플랫폼 선택 (기본값: **Vercel**). Phase 4 MVP = Vercel 완전 구현. 나머지 (Netlify, Railway, Cloudflare Pages 등) 는 코드 수준에서 `DeployProvider` 인터페이스만 정의 — 실제 구현은 Phase 5 에서. 비-개발자에게는 "Vercel (추천 — 가장 쉬움)" 이 기본 선택, 다른 옵션은 회색 처리 + "Phase 5 에서 지원 예정" 안내.

`DeployProvider` 가 추상화하는 책임: 프로젝트 생성 / env 동기화 / preview·production deploy 트리거 / 빌드 로그 수신 / 도메인 관리. Vercel 구현체는 `vercel` CLI + Vercel REST API 를 backend 로 사용하되, 사용자에게는 GUI 버튼만 노출.

### Phase 3 → Phase 4 transition notes (dogfood 학습)

Phase 3 dogfood 에서 발견된 두 가지 비-개발자 사용자 페인 — Phase 4 에서 정면 해소:

- **case1: 환경 설정 가이드를 최신 공식 문서 fetch 로 제공** — Phase 3 dogfood 사용자 (개발 비숙련) 는 **vercel 가입부터 해야 하는지조차 인지하지 못함**. 교훈 → 환경 setup 가이드는 **내재된 지식 (LLM training data) 이 아닌 최신 공식 문서를 실시간 fetch** 해 제공. Vercel / Supabase / GitHub / Cloudflare 등 모든 외부 서비스 setup 이 동일 패턴. "이 페이지에서 → 이 버튼 → 이 값을 복사" 수준의 구체성.
- **case2: env 관리 GUI panel + `.env.local` 자동 생성** — env 를 버전별로 코드 에디터 열어 직접 입력해야 하는 마찰. 교훈 → Phase 4 `init` 시 `.env.local` 디폴트 생성 + `.gitignore` 자동 등록 + GUI env panel 제공. 사용자는 코드 에디터를 열 필요 없음.

### Non-goals (Phase 4)

- Phase 1–3 의 CLI / orchestration core 변경 (Phase 4 는 위에 얹는 GUI layer 만; backend 는 그대로)
- Multi-user / 팀 협업 / 권한 모델 (별도 phase)
- 자체 IDE / 코드 에디터 구축
- 비-Vercel / 비-Supabase 인프라의 first-class 지원 (Phase 4 는 가장 흔한 stack 부터; 이후 확장)
- 모바일 / iPad 클라이언트 (desktop GUI 우선)
- **비-Vercel provider first-class 지원** (Phase 4 는 Vercel only; 다른 provider 는 `DeployProvider` 인터페이스 정의까지 — 실제 구현은 Phase 5)
- **Figma 연동** (토큰 비용 예측 불가 — Mermaid + Excalidraw 로 대체)
- **prod / preview env 의 양방향 실시간 sync** (Phase 4 MVP 에서는 배포 시점 단방향 push 만)
- **OS keychain 기반 secret 저장** (.env.local plaintext + Vercel env 로 충분; keychain 통합은 Phase 5+)
- **GUI 멀티 채팅방** (2026-05-06 결정: GUI 는 단일 PO 세션. CLI/non-GUI 에서는 multi-session 가능성 보존)

### Acceptance criteria (Phase 4 완료 기준)

다음 모두 충족 시 Phase 4 합격:

- [ ] 사용자가 **한 번도 터미널을 직접 열지 않고** PRD → 디자인 → 구현 → 배포 한 사이클 완주 (manual dogfood; 비-개발자 1 명)
- [ ] PO 채팅 GUI — 프로젝트당 단일 PO 세션 (`chat.json`) 이 메시지를 유지하고, Right Panel PO Chat 이 340px 고정/접힘(FAB 복원)으로 동작함
- [ ] Right Panel 페르소나 presence bar (T-P4-049) — PO Chat 세션 header 하단에 PO / Designer / Developer / QA 4 칩만 표시; 상태는 `idle` / `working` / `done` 3종. **작업 내용 / prompt / full response 노출 금지** (상태 + artifact/output 이름만). `working` = persona 색 filled-dot blink (label 정지, 동시 working 허용); `done` = 사용자가 확인할 때까지 유지 + hover 시 artifact/output 이름만 tooltip
- [ ] PRD 작성 후 **디자인 단계 (디자인 시스템 / UX flow)** 가 코드 단계 진입 전 별도 stage 로 명시 노출되고, 디자인 산출물 (md + Mermaid + Excalidraw) 이 채팅에 inline 표시. Mermaid 는 Electron/React 내장 viewer 로 렌더되며 zoom/pan, source toggle/copy, render error fallback 을 지원하고 외부 CLI 없이 정상 viewing 가능.
- [ ] 메모리 / wiki 편집기 panel 에서 사용자가 직접 항목 수정 → 다음 페르소나 호출에 즉시 반영 (수정 → 호출 → trace 에 반영 확인 가능)
- [ ] dev 환경이 필요한 시점에 agent 가 node-pty 기반으로 자동으로 shell 띄우고 (`npm run dev` 등) 사용자는 GUI 에서 status 만 확인 / 종료 가능
- [ ] `init` 직후 `.env.local` 자동 생성 + `.gitignore` 에 자동 등록 확인 (실제 파일 검증)
- [ ] vercel / supabase setup 가이드가 **최신 공식 문서 fetch 결과** 로 노출 (training data 에 없는 최근 변경 사항 — 예: 2026 년 신규 UI — 도 정확히 안내) + 오프라인 시 캐시 + "N시간 전 업데이트" 배너 동작
- [ ] env 관리 panel 3-layer (로컬 / 미리보기 / 프로덕션) + 상태 badge (✅ / ⚠️ / 🔴 / 🔒) + 코드 스캔 기반 누락 경고 동작
- [ ] 풀 사이클 UI 에서 사용자가 현재 단계 (PRD / Design / Build / Deploy / Close) 를 Project 탭 phase strip + PO Chat ctx chip 으로 한눈에 인지 + 다음 단계 액션 버튼 제공
- [ ] 앱 실행 시 [새 프로젝트 만들기] → `~/productune/projects/` 하위 자동 생성 + `init` 완료 (사용자가 파일시스템 탐색 없이 시작 가능)
- [ ] **[배포하기] 버튼 → 프로덕션 환경 PR 자동 생성 → squash merge → Vercel deploy 전 과정을 agent 가 처리; 사용자는 git 명령어 입력 없음 + 프로덕션 직접 push 차단 검증 + Settings 의 `useDevBranch=true` 시 검증용 중간 환경 직접 push 도 차단됨**
- [ ] 배포 플랫폼 선택 화면에서 Vercel 기본값 + 다른 provider 선택지 노출; Vercel 선택 시 전체 플로우 동작 확인
- [ ] 페르소나 skill 시각화 panel 에서 각 페르소나 보유 skill 목록 + 현재 task invoke 된 skill 을 사용자가 확인 가능
- [ ] Settings — 작업 흐름 규칙 패널에서 `useDevBranch` / `useStagingEnv` / branch prefix 토글이 `git-rules.json` 에 저장되고 다음 ticket 부터 즉시 반영됨

### Open questions (Phase 4 — 모두 해소됨, 2026-04-30 OQ 세션)

모두 OQ 세션에서 확정:

1. ~~planner mode GUI 런타임~~ → ✅ **Electron + React/TypeScript (Vite renderer)**. native shell / 파일시스템 / 권한 접근이 필요해 web app 배제, Tauri 대신 ecosystem 성숙도와 React 생태계 활용성으로 Electron 선택.
2. ~~dev shell 자동화 OS 추상화~~ → ✅ **node-pty** (mac/linux PTY + Windows ConPTY 단일 API; OS 별 분기 코드 최소화).
3. ~~최신 공식 문서 fetch 캐싱 / 오프라인 / rate-limit~~ → ✅ **TTL 24h + stale-while-revalidate**. 오프라인: 마지막 캐시 + "마지막 업데이트: N시간 전" 배너. rate-limit: exponential backoff → 캐시 fallback.
4. ~~디자인 산출물 포맷 (md only vs Figma)~~ → ✅ **md + Mermaid.js + Excalidraw (전부 로컬, 외부 서비스 의존 X)**. Figma 는 토큰 비용 예측 불가로 제외. Claude design skill 이 Mermaid native 출력, Phase 4 GUI 가 Mermaid.js/React component 로 inline 렌더링, Excalidraw React 컴포넌트로 와이어프레임, 디자인 시스템은 풍부한 md 렌더링. Mermaid CLI 는 export-only 선택 도구.
5. ~~env secret 저장 위치 (keychain vs 클라우드)~~ → ✅ **`.env.local` (plaintext, gitignored) for 로컬 + Vercel env for prod/preview**. Phase 4 MVP 에서 sync 없음. 사용자는 배포 전까지 prod / preview env 추가 필요 X.
6. ~~multi-chat 격리 정책~~ → ✅ **GUI 단일 PO 세션 (2026-05-06 결정)**. GUI 에서는 프로젝트당 하나의 PO 세션만 운영. 스토리지 = `<projectDir>/.productune/chat.json`. CLI / non-GUI 환경에서는 multi-session 가능성 보존.

## v0.5 — Planner UX, first serious pass (Phase 4 sub-cycle)

> **Slug**: v0.5-p1-prd  ·  **Status**: PRD ready (clarity loop converged, A ≈ 0.04)  ·  **Authored**: 2026-06-01 (pdt-designer)
>
> v0.5 is a **build cycle inside Phase 4** (terminal-free GUI full cycle). v0.4 landed the
> doctrine architecture (4-tier memory, 9 ticket types, 7 status) + a schema-driven GUI
> workspace. v0.5 is the first cycle that takes **planner UX itself** as the primary goal:
> the GUI and PO absorb the backend↔frontend technical seam and re-surface it as
> *layered, simple information with a clear next-action at every moment*, so a non-developer
> planner never has to look at the seam directly. The Phase-4 acceptance ethos
> ("complete a cycle without ever opening a terminal") is carried one level deeper here.

### Why

A planner can describe *what* to build but is not fluent in CLI and does not hold deep
build/debug/architecture knowledge. v0.4 proved the orchestration core and the GUI shell,
but information was still surfaced flat — everything visible at once, with no per-moment
"do this next" signal. v0.5 closes that gap: **stratified information + a clear action at
each point in the cycle**, so attention is spent on product decisions, not on hunting
through the interface or the technical layer underneath it.

### Who

Unchanged from the master Who/Phase-4 — the planner / solo-PM / product owner who defines
*what* but does not code. v0.5 specifically optimizes the moments where this user previously
had to drop to the terminal or read raw technical artifacts.

### How — 3 tracks, 14 items

- **Track A — Planner UX (9):** the core of the version. Reorders and adds the navigation
  surface, the artifacts viewer, ticket-detail, search, keyboard movement, rate-limit
  visibility, and a PO-chat upgrade.
- **Track B — Persona / infra (4):** brings the GUI in sync with the new doctrine
  architecture, makes the skill 2-layer model explicit, adds OS-level notifications, and
  ships an unsigned `.dmg`.
- **Track C — Infra hardening (1):** a fresh-install CI smoke test.

### What — 14 items (intent · in / out · solution shape · per-item AC)

#### A1 — Left-panel reorder
- **Intent**: a fixed, predictable 5-tab order that puts deliverables up front.
- **In**: Project → **Artifacts (new)** → Team → Explorer → Settings, order fixed.
- **Out**: any tab-content rework beyond ordering (A2 owns Artifacts content).
- **Solution**: reorder `ActivityBar.tsx` entries; Explorer = the existing file-tree tab.
- **AC**: ActivityBar renders exactly these 5 in this order; order is not user-reorderable.

#### A2 — Artifacts tab (new)
- **Intent**: read internal design deliverables in-GUI without a file explorer or terminal.
- **In**: left list → main-panel viewer for `docs/prd/`, `docs/artifacts/<version>/`,
  `docs/designer/`. md → md viewer (code-block syntax highlight); mermaid → mermaid viewer;
  html → browser-style view via `<webview>`.
- **Out**: editing artifacts (read-only this version); rich nav / TOC template (→ v0.6).
- **Solution**: new sidebar list + main-pane tab type; reuse the existing `browser`
  tab-type (`<webview>`, per `TabContent.tsx`) for html; reuse the Phase-4 Mermaid viewer.
- **AC**: each of md / mermaid / html opens in its correct viewer from the list; html renders
  in `<webview>`; no terminal or OS file explorer needed to reach any listed artifact.

#### A3 — Project-menu cleanup
- **Intent**: remove the detour through the GUI home for common project actions; one Recent.
- **In**: (a) File → Open Project = OS finder dialog directly (no GUI home); (b) Open New
  Window = home (not the same project); (c) home Recent ↔ status-bar Recent unified to a
  single source (home currently shows root project only; status-bar drops root project).
- **Out**: project-creation wizard changes.
- **Solution**: single Recent source feeding both surfaces; menu wiring to the OS dialog.
- **AC**: Open Project opens the OS dialog with no home stop; Open New Window lands on home;
  the same Recent list (same entries, same order) appears in home and status-bar.

#### A4 — CLI statusline
- **Intent**: see phase + in-phase ticket progress from the `productune` CLI prompt.
- **In**: phase label next to branch (`prd / build / …`) + in-phase ticket progress, e.g.
  `[v0.5 P1·3/12]`.
- **Out**: GUI statusline (this is the terminal statusline).
- **Solution**: statusline reads phase + ticket counts from `po-state.json` / ticket scan.
- **AC**: the CLI statusline shows the current phase and an `[<version> P<phase>·<done>/<total>]`
  progress token that updates as tickets close.

#### A5 — Chat rate-limit display
- **Intent**: when the Anthropic API session is rate-limited, show recovery time instead of a
  silent stall.
- **In**: parse rate-limit response headers (`retry-after` etc.) → surface a recovery
  countdown in the chat UI. **Scope = Anthropic API direct responses only** this version.
- **Out**: MCP / AI-gateway / other-provider rate-limit surfacing (future).
- **Solution**: header parse in the PO response path → countdown component in chat.
- **AC**: under a 429/limit response, the chat shows a recovery countdown derived from the
  response header; normal responses show nothing.

#### A6 — cmd+p header expansion
- **Intent**: one VS Code-style search entry covering everything navigable.
- **In**: inline search bar in the GUI header; cmd+p expands that bar; search targets =
  tickets / tabs / skills / MCP / artifacts / personas.
- **Out**: full-text content search inside artifacts.
- **Solution**: extend the existing `QuickOpenPalette` index (already covers
  files/tickets/personas/skills) with tabs / MCP / artifacts; bind to the header bar.
- **AC**: cmd+p expands the header search; each of the 6 target categories is reachable and
  returns results; selecting a result routes to the right surface.

#### A7 — Ticket detail view
- **Intent**: selecting a ticket shows a real detail page, not a jump into the Tickets tab.
- **In**: cmd+p select ticket → **ticket detail page in the main panel**; shows the Korean
  body (authored by designer, `## Request (KR)`-style section *inside the ticket md* — no
  sidecar, no runtime translation, per decision-2) + dispatch progress visual (persona
  session state / next action).
- **Out**: editing the ticket from the detail view.
- **Solution**: new main-pane ticket-detail tab type; renders ticket md + dispatch state.
- **AC**: cmd+p ticket-select opens the detail page in the main panel (does **not** switch to
  the Tickets tab); the page shows the KR body and the dispatch/persona progress visual.

#### A8 — cmd 1/2/3/4
- **Intent**: keyboard jump to the Nth tab in the active tab-group.
- **In**: cmd 1/2/3/4 → move to `leaf.tabs[N-1]` of the active `LeafPaneNode`.
- **Out**: cross-pane movement; tabs beyond 4.
- **Solution**: keybind → active-leaf tab index (per `store/workspace.ts`).
- **AC**: with ≥N tabs in the focused pane, cmd N activates the Nth tab; no-op past the count.

#### A9 — PO chat upgrade
- **Intent**: PO chat reads as a first-class surface and lets the user act inline.
- **In**: (a) markdown render polish — tables (currently ugly), code blocks, lists,
  blockquotes all on consistent design-system tokens; (b) inline action buttons / native
  AskUserQuestion — clickable option cards when the PO asks a question; promotion
  approve/reject also inline.
- **Out**: streaming/markdown engine swap.
- **Solution**: design-system token pass on the markdown renderer + an inline
  action-card component bound to the PO question / promotion events.
- **AC**: tables/code/list/blockquote render on design-system tokens; a PO question renders
  clickable option cards; promotion approve/reject is actionable inline from chat.

#### B1 — GUI ↔ doctrine sync
- **Intent**: the GUI fully reflects the new doctrine architecture.
- **In**: 4-tier memory, 9 ticket types, 7 status reflected across TeamPanel / TicketsTab /
  VersionHistoryView / SkillMatrixTab / promotion-drain UI / statusline / file-watcher.
  **Absorbs** carried-forward T-P4-146 (MCP server add + name rename), T-P4-147
  (autosaveTriggers UI enable), T-P4-148 (PersonaDefTab persona-spec edit).
- **Out**: doctrine *content* changes (this is GUI reflection of existing doctrine).
- **Solution**: enum/schema alignment across the listed components; unlock the three
  Phase-5-locked panels.
- **AC**: ticket-type / status / tier enums in the GUI match doctrine 1:1; MCP add+rename,
  autosaveTriggers UI, and PersonaDefTab editing are all live.

#### B2 — Skill 2-layer made explicit
- **Intent**: make the explicit-allowlist vs auto-invoke distinction a stated doctrine rule
  and show it in the GUI.
- **In**: doctrine states Layer 1 (explicit allowlist) vs Layer 2 (auto-invoke); mapping
  expansion (phuryn pm-toolkit; mattpocock prototype / zoom-out / diagnose); productune-
  domain-irrelevant categories (pm-data-analytics, pm-marketing-growth) get a skip-install
  option; SkillMatrixTab gains `[explicit] / [auto] / [unused]` labels.
- **Out**: new skill authoring (designer-author-skill deferral stays separate).
- **Solution**: doctrine section + mapping table update; SkillMatrix label rendering; install
  skip toggle for irrelevant categories.
- **AC**: doctrine names the 2 layers; SkillMatrix shows the 3 labels per skill; irrelevant
  categories can be skipped at install.

#### B3 — OS notifications
- **Intent**: background dispatch is core to the product, so completion/escalation/gate
  moments must reach the user outside the window.
- **In**: OS-level notification on dispatch-done / escalation-raised / phase-gate-entry.
- **Out (this version)**: notification preferences/quiet-hours UI. **Platform scope =
  macOS (Notification Center) first** (matches the `.dmg`/Phase-4 desktop target); Windows
  parity is a follow-up, not a v0.5 gate.
- **Solution**: Electron `Notification` on the three event types from the PO event stream.
- **AC**: each of the three events fires a native macOS notification while the window is
  backgrounded; clicking focuses the relevant surface.

#### B4 — Unsigned `.dmg` distribution
- **Intent**: hand teammates an installable build without code-signing.
- **In**: electron-builder devDependency + config + `.icns` app icon + `dist:mac` script +
  team README right-click→Open Gatekeeper-bypass guide. `install.sh` and `.dmg` stay
  separate (option A).
- **Out**: code signing / notarization; auto-update.
- **Solution**: electron-builder mac target producing an unsigned `.dmg`; README bypass note.
- **AC**: `dist:mac` produces a `.dmg` that installs on a clean mac via the documented
  right-click→Open path; `install.sh` flow is unchanged.

#### C1 — Fresh-install CI smoke
- **Intent**: catch install regressions before they reach a teammate.
- **In**: CI workflow that, in an isolated `$HOME`, runs `install.sh < /dev/null` to pass;
  a lint hook grepping/blocking absolute-path symlink targets; bootstrap-doctrine ↔
  install.sh env-file key parity check; one post-install PO session to confirm
  dispatch-cost-strip behavior.
- **Out**: full e2e GUI CI.
- **Solution**: GitHub Actions job with isolated `$HOME`, the four checks above.
- **AC**: CI fails on any of — non-interactive install break, absolute-path symlink target,
  env-key drift, or broken dispatch-cost-strip — and passes a clean install.

### Carried-forward reconciliation (v0.4 deferrals)

| v0.4 deferral | v0.5 disposition |
|---|---|
| T-P4-091 / T-P4-092 — Round 9 full-cycle non-dev dogfood (13-AC evidence) | **IN** — folded into the v0.5 acceptance gate (see below). |
| T-P4-146 / 147 / 148 — Phase-5 unlocks (MCP add+rename / autosaveTriggers UI / PersonaDef edit) | **IN** — absorbed into **B1**. |
| T-P4-050~055 design-gate viewer (Mermaid/Excalidraw/design-system/hi-fi) | **PARTIAL** — Mermaid/md/html viewing covered by **A2**; Excalidraw + hi-fi mockup preview remain **OUT** (later cycle). |
| T-P4-060~064 dev-env automation · T-P4-070~072 memory/wiki editor · T-P4-080~082 deploy abstraction · T-P4-069 §1.5 audit · T-P4-124 designer-author-skill | **OUT** — not in v0.5 scope; remain deferred. |
| PRD HTML full template (sidebar TOC, rich nav) | **OUT** — moved to v0.6 (decision-3). |

### Acceptance — v0.5 gate

Gate = **(b) full-cycle non-developer dogfood.** v0.5 passes when **both** hold:

- [ ] All **14 items** each meet their per-item AC above.
- [ ] A non-developer planner completes **one full cycle (PRD → Design → Build → Deploy →
      Close) using the GUI only**, without ever opening a terminal or reading the raw
      technical seam — incorporating the carried-forward **Round 9 full-cycle non-dev
      dogfood** (T-P4-091/092, 13-AC evidence) as the run of record.

This is the direct test of the v0.5 thesis ("the planner reaches the goal directly").

### Success metrics → version_outcome

- **North star**: a non-developer planner completes one GUI-only full cycle (PRD→Close)
  with **zero terminal use and zero raw-technical-seam reads** — the carried-forward Round 9
  full-cycle non-dev dogfood, run to completion.
- **Input metrics**:
  1. 14 / 14 scope items pass their per-item AC.
  2. Count of forced terminal drops during the cycle = **0**.
  3. The three B3 OS notifications (dispatch-done / escalation / phase-gate) each fire at the
     correct moment during the run.
  4. Every navigation the cycle requires (Artifacts viewer, ticket-detail, cmd+p across all 6
     targets, cmd 1–4) is reachable GUI-only.
  5. Round 9 13-AC evidence collected (T-P4-091/092).
- **Validation method**: observed full-cycle non-dev dogfood — one planner, one real project,
  PRD→Design→Build→Deploy→Close, GUI-only — paired with the 14-item per-AC checklist pass.

## OSS reference

이 PRD 와 doctrine 의 핵심 컨셉은 모두 정립된 OSS standard 위에 구축:

- **Real Engineering 워크플로** — [mattpocock/skills](https://github.com/mattpocock/skills) (23 skill: to-prd, to-issues, tdd, triage-issue, request-refactor-plan 등)
- **PM 워크플로** — [phuryn/pm-skills](https://github.com/phuryn/pm-skills) (65 skill, 8 plugin: pm-product-discovery, pm-product-strategy, pm-execution 등)
- **Task complexity 7-level** — LLMRouter, vLLM Semantic Router, LiteLLM, NVIDIA llm-router
- **Cascade routing + retry** — RouteLLM, C3PO, Maxim AI 의 3-tier cascade
- **Quality-based retry / LLM-as-a-judge** — Anthropic engineering "Demystifying evals", LangSmith, MLflow, Confident AI
- **Skill discovery** — PolySkill, skill-fetch (9 registry 통합)

## Open questions

- Phase 2 진입 시점: Phase 1 acceptance criteria 다 통과한 후 즉시 vs 1 주일 stabilization 후?
- Dogfood 프로젝트 후보: 사용자가 직접 픽 (별도 메모)
- GitHub repo `coolchestration` → `productune` 리네임 시점: Phase 1 완료 후
- pm-skills 의 65 skill 중 pdt-po (PO) 에 매핑할 우선순위: 각 plugin 의 Discovery / Strategy / Execution 그룹부터
- 한국어/영어 doctrine 분기: 현재 doctrine 영어 + UI 안내 한글 — 일관성 필요?

## Activity log

- **2026-04-28** — Round 1 (MVP) 시작. PRD 초안 작성. 4-phase persona 구조 + Real Engineering 워크플로 + dynamic tier + quality escalation + skill 통합 합의. (commit: `0731a09` rebrand)
- **2026-04-30** — Phase 4 ("개발 비숙련 기획자용 GUI 풀 사이클") 정식 추가. Phase 3 dogfood 학습 (case1: 환경 설정 가이드는 최신 공식 문서 fetch 필요 / case2: env 관리 GUI + `.env.local` 자동 생성) 을 transition notes 로 명문화. 롤아웃 테이블 3-phase → 4-phase 로 확장. Phase 4 acceptance criteria 10 개 + open questions 7 개 정의. install 시점 developer / planner 분기 도입(이후 2026-05-04 단일 모드 결정으로 제거).
- **2026-04-30 (doctrine 개선)** — 4개 이슈 해결: (1) hook 경로 stale → install.sh 재실행으로 복구. (2) PO ticket 권한 명확화 — lifecycle/Persona Activity는 PO mechanical OK; content는 Designer; 2-line refusal template 도입. (3) Real engineering workflow에 Design stage 정식 삽입 (L4+ mandatory, 산출물 3종 티켓). (4) `## Persona Activity` 섹션 신설 — PO가 매 delegation 후 1행 append.
- **2026-04-30 (OQ 세션)** — Phase 4 OQ 7 개 전체 확정. GUI 런타임 = Electron + React/TS (Vite), shell 자동화 = node-pty, 문서 fetch = TTL 24h + stale-while-revalidate, 디자인 산출물 = md + Mermaid + Excalidraw (Figma 제외), env = 로컬 기본 + 환경별 추가, 졸업 마이그레이션 = 불필요 (뷰 토글), 멀티채팅 = 기존 round 구조 매핑. 신규 기능 3 개 추가 (프로젝트 관리 UI, Git 추상화 레이어, 페르소나 skill 시각화). 배포 플랫폼 전략 추가 (Vercel 기본, `DeployProvider` 추상화, Phase 5 확장). Env 관리 UI 상세 스펙 확정 (3-layer, 상태 badge, 코드 스캔 경고).
- **2026-05-04 (Phase 4 GUI 구현 시작)** — Phase 4 self-dogfood 브랜치(`phase4-meta-dogfood`) 개설. T-P4-001: pnpm workspaces + turborepo monorepo 골격 (`packages/core`, `cli`, `gui`). T-P4-002: 기존 CLI core (agents, po, scripts, config) → `packages/core` 이관. T-P4-003: `packages/gui` Electron + React/TS + Vite 보일러플레이트 (main/preload/renderer, contextIsolation, secure IPC). mockup.html VSCode IDE 패러다임 전면 재설계 (4-column: Activity Bar 48px / Side Panel 260px / Main Panel flex-1 탭 시스템 / Right PO Chat 340px) + cmux-style pane splitting + Quick Open palette.
- **2026-05-04 (Round 1 완료)** — T-P4-010: `packages/core/src/init.ts` — `initProject()` + `init:project` IPC. T-P4-011: NewProjectModal (slug + GitHub OAuth) + `project:create` IPC. T-P4-012: `dialog:openFolder` IPC + `.productune/` 감지 + init 유도 배너 + `project:installAt` IPC (기존 폴더에 직접 init). T-P4-013: HomeView — recent projects 목록 (`projects:list` IPC, created_at 정렬). T-P4-014: GitHub Device Flow OAuth + private repo 자동 생성 + git remote 설정 (`GitHubOAuthFlow` 컴포넌트; `VITE_GITHUB_CLIENT_ID` project-level env). onboarding 2-level 구조 확정 (앱 레벨 T-P4-015 / 프로젝트 레벨 T-P4-011) 및 PRD 반영.
- **2026-05-04 (단일 모드 결정)** — mode 분기 (planner/developer) 제거. 단일 GUI 모드. 이유: developer 는 terminal 에서 개발하면 되고 productune GUI 가 두 페르소나 UX 를 동시에 책임지면 scope 폭증. `ProjectConfig.mode` 필드 / `NewProjectModal` step 2 (mode 선택) / `HomeView` modeBadge 제거. `project:installAt` IPC 신설로 "기존 폴더에 직접 init" 흐름 정상화.
- **2026-05-04 (git workflow 룰 도입)** — productune 의 git workflow 규약 정식화. **Ticket-단위 worktree** (`<project>/.productune/worktrees/<ticket-id>/`, branch = `feature/<ticket-id>/<slug>` 또는 `fix/...`) + base branch (프로덕션 항상 / 검증용 중간 환경 toggle 시) 직접 push 차단 + **2단계 게이트** ([자동저장] = ticket worktree commit / [배포 준비] = push & 중간 환경 매핑 / [배포하기] = 사용자 명시 클릭만 프로덕션 PR + squash merge). Settings 의 **작업 흐름 규칙 패널** (`<project>/.productune/git-rules.json`) 도입 — `useDevBranch` / `useStagingEnv` / branch prefix 토글. dev / staging 은 default off, 첫 런칭 후 사용자 toggle. 신규 doctrine `~/.productune/sections/git-workflow.md` 추가. Round 2 ticket 4→5 재정의 (T-P4-020 ~ 024) + T-P4-024 (Settings 패널) 신설. 어휘 가드레일에 `worktree` / `dev` / `merge` / `staging` 추가.
- **2026-05-06 (GUI 단일 PO 세션 결정)** — GUI multi-chatroom 모델 → single PO session per project. 데이터 모델: 다중 `chats/<uuid>.json` → 단일 `<projectDir>/.productune/chat.json`. IPC: listRooms/createRoom 등 제거 → `chat:getSession` / `chat:appendMessage` / `chat:setClaudeSessionId` / `chat:clearSession`. Right Panel: PO Chat 단일 세션 고정. Side Panel 은 Explorer / Project / Team / Settings 탭만 담당. CLI/non-GUI 에서는 multi-session 가능성 보존. T-P4-042 (멀티 채팅방) GUI 부분 deprecated.
- **2026-05-07 (persona presence bar)** — T-P4-049 신설: Right Panel PO Chat 헤더 하단 24px presence bar, PO/Designer/Dev/QA 4 칩, 상태 idle/working/done 3종 (waiting 제거 — PO 가 wait 직접 조율). Phase 4 Acceptance criteria 에 T-P4-049 항목 추가.
- **2026-05-08** — 사용자 가시 phase 5단 통일 (PRD / Design / Build / Deploy / Close). 6단 (PRD/Design/Build/QA/Deploy/Operate) 폐기 — QA 는 ticket type 으로, Operate 는 Close phase 의 retrospective 가 흡수. T-P4-065 전체 (sub-a~f).
- **2026-06-01 (v0.5 PRD ready)** — v0.5 "기획자 UX 1차 본격화" PRD 섹션 작성 (Phase 4 sub-cycle). clarity loop 수렴 (iter 2, A≈0.04). 3 트랙 14 항목 (A 기획자 UX 9 · B 페르소나/인프라 4 · C fresh-install CI smoke 1) 각 의도·범위(in/out)·솔루션·항목별 AC 정의. 이월 정리: T-P4-091/092 Round 9 full-cycle non-dev dogfood IN (= v0.5 acceptance gate), T-P4-146/147/148 → B1 흡수, T-P4-050~055 일부(Mermaid/md/html)는 A2 흡수·Excalidraw/hi-fi OUT, PRD HTML 풀템플릿 → v0.6 (decision-3). acceptance gate = (b) 풀사이클 비-개발자 도그푸드 (GUI-only PRD→Close + 14항목 AC). version_outcome (north star + 5 input metric + validation method) 도출. 산출물: PRD master EN 섹션 + `docs/artifacts/v0.5/PRD.html` (KR) + T-001 (T-P4 → v0.5 T-NNN id 체계 전환).
