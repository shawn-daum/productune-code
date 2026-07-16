# PRD: productune

**Slug**: productune    **Created**: 2026-04-28    **Status**: v1.2 — 실행 코드/메타 분리 PRD ready (경계 4결정 전부 확정; v1.1 closed 2026-07-16)

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

## v0.6 — 도그푸딩 완주 준비 + 안정화 (Phase 4 sub-cycle)

> **Slug**: v0-6-prd-authoring · **Status**: PRD ready (clarity loop 수렴, R2+) · **Authored**: 2026-06-25 (pdt-designer) · **Ticket**: T-PATCH-258
>
> v0.5 는 비-개발자 GUI 풀사이클을 *가능케 하는* 인프라(4-region IDE 셸 · PDS See layer · 14-item scope · 팀 dmg 배포 · cua clean-install)를 전부 shipped 했으나, **그 사이클을 비-개발자가 실제로 완주하는 것을 관찰하는 행위 자체는 미실시**(`observed_result=null`, v0.4→v0.5 2회 연속 carry). v0.6 은 그 관찰을 **깨끗하게** 실행할 수 있도록 v0.5 도그푸딩이 드러낸 **14개 안정화 갭을 닫고 검증해 빌드를 dogfood-ready 로 만든다.** 실제 완주(Round9 관찰)와 6차 dmg 리빌드는 v0.6 OUT — **v0.7 로 이월**.

### Why

v0.5 도그푸딩은 인프라가 다 깔린 뒤에도 비-개발자가 풀사이클을 시도하면 막힐 14개 마찰을 미리 노출했다. 이 마찰들은 "기능이 없다"가 아니라 **"프로세스/doctrine 가 비-개발자에게 결정을 떠넘기거나(S1 텍스트 3안 구분 불가), 산출물 품질을 떨어뜨리거나(S2b SVG 조기 폴백·한글 프롬프트), 깨진 걸 못 잡거나(빌드 후 시각 사각·테스트 미실행·코드리뷰 부재), 실패/상태를 침묵·오표시로 끝내거나(T-255 TCC silent · #7 tray 상시 빨간점), 정상 입력에 크래시·오작동(#8 leading-dash · #12 한글 Cmd+Enter), 진행/상태/산출물을 못 보거나(#9 워커 라이브 출력 · #10 워커 스프라이트 · #11 빈 패널 · #13 tool-call 토글 · #14 PRD 오토-노출 부재)"** 하는 형태다. 따라서 v0.6 의 What 은 신규 화면이 거의 없고, **doctrine 개정 + code/product 안정화로 완주의 질을 끌어올리는 데** 집중한다. 신규 GUI 항목 다수(#9·#10·#11·#14)는 **"lifecycle/worker-state → GUI view 반응"** 한 클러스터로, 워커 subagent 상태·출력의 GUI 파이프 + PO 라이프사이클→GUI 신호라는 공유 배선 위에 얹힌다. 북극성을 "관찰 실행"이 아니라 **"관찰이 깨끗하게 가능한 dogfood-ready 상태"** 로 잡는 이유는, 실제 관찰 행위(observed full-cycle run)와 그 전제인 6차 dmg 리빌드가 v0.7 로 이월됐기 때문이다 — 관찰 자체의 north-star 는 v0.7 로 계속 carry 한다.

### Who

마스터 Who/Phase-4 와 동일 — *무엇*을 만들지 정의하지만 코드는 짜지 않는 기획자 / 1인 PM. v0.6 은 특히 이 사용자가 **디자인 방향을 고르는 순간(S1)**, **에셋이 만들어지는 순간(S2b)**, **빌드 결과를 눈으로 확인하는 순간(#3)**, **PO 턴이 실패하는 순간(#6)**, **트레이로 차례를 인지하는 순간(#7)**, **`-`/한글로 메시지를 보내는 순간(#8·#12)**, **워커가 일하는 걸 지켜보는 순간(#9·#10)**, **첫 화면과 첫 산출물(PRD)을 마주하는 순간(#11·#14)**, **도구 호출 내용을 확인하는 순간(#13)** 에서 막히거나 잘못된 신호를 받지 않도록 한다.

### How — 14 안정화 갭 (변경 성격 분류)

각 항목을 **doctrine-only**(프로세스 룰 개정 — 코드 0) vs **product/code**(GUI·러너·핸들러 변경 동반) 로 분류한다. 항목별 상세는 What 에서 Intent / In·Out / AC 고도(altitude — 구현 설계는 P2/P3 몫)로 정의한다.

| # | 항목 | 변경 성격 | 주 SoT |
|:--|:--|:--|:--|
| S1 | DS 옵션 제시 (렌더 HTML 시안 3개 up-front + C안 발산) | **doctrine-only** | `designer/bookshelf/phase2-3-ticket-sequence.md` S1 |
| S2b | 에셋 생성 (PNG-우선 + PNG→SVG 루프 · 영어 프롬프트 무조건) | **doctrine-only** | 동 파일 S2b + `designer/habit.md` §5 |
| 3 | 빌드 run + 눈확인 + 통합 시각 grill (prompted pre-close) + smoke 시각 보강 | **doctrine + product/code** (smoke 보강 = code) | `po/.../lifecycle/p3-build.md` · `qa/habit.md` + smoke 하니스 |
| 4 | 테스트 러너 배선 + `type:test` 트리거 재조정 | **product/code + doctrine** (러너 배선 = code · 트리거 = doctrine) | `turbo.json`·package test 스크립트 + 트리거 doctrine |
| 5 | 코드리뷰 게이트 신설 (risk-gated 매-티켓 + close-gate 1회 누적, 하이브리드) | **doctrine-only** (하네스 스킬 호출 — 신규 코드 0) | build-loop + close-gate doctrine |
| 6 | T-PATCH-255 TCC silent-fail → actionable | **product/code** | po-runner / PO 응답 surface 레이어 |
| 7 | 트레이 빨간점 → awaiting-user 상태에서만 표시 | **product/code** | `packages/gui/electron/tray.ts` + PO turn-state |
| 8 | leading-dash 입력이 claude CLI 옵션 오파싱 → 크래시 안전처리 | **product/code** | `packages/gui/electron/po-runner.ts` arg 전달 |
| 9 | PO chat presence row — active 워커 페르소나 라이브 출력 스트림 | **product/code** (클러스터) | `PersonaPresenceBar.tsx` + 워커 output-stream 배선 (backlog "PO Log Terminal" 공유) |
| 10 | 워커 스프라이트 working 상태 미반영 (회색-idle 고착) | **product/code** (클러스터) | `PersonaPresenceBar.tsx` + 워커 subagent 상태→presence (cf. T-PATCH-252 PO판) |
| 11 | 조건부 워크스페이스 레이아웃 (PRD 인터뷰 중 PO 채팅 단독) | **product/code** (클러스터) | WorkspaceShell 레이아웃 + po-state version/PRD 유무 |
| 12 | 한글 IME Cmd+Enter 두 번 눌러야 전송 | **product/code** (standalone) | PO 채팅 submit 핸들러 isComposing/229 (cf. T-PATCH-196) |
| 13 | tool-call 최하단 토글 기본 expanded | **product/code** (standalone) | PO 채팅 tool-call 표시 컴포넌트 default state |
| 14 | PRD-ready/버전 생성 시 메인 패널 PRD 오토-노출 + 버전 자동 진입 | **product/code** (클러스터) | PO 라이프사이클→GUI 메인 패널 네비 신호 배선 |

### What — 14 항목 (Intent · In/Out · AC 고도)

#### S1 — DS 옵션 제시: 렌더 HTML 시안 3개 up-front + C안 창의 발산  *(doctrine-only)*
- **현재 동작**: S1 은 3안을 **TEXT**(토큰/타입/스페이싱 — HTML 금지)로 주고, 시각 프리뷰는 *동반될 때만* 폰트 실로드·차이 가시화를 요구. 3안 믹스 = Fit 2 + Stretch 1, divergence rule(어느 두 안도 4 mood label 중 ≥2 에서 차이)만 있고 **세 안 모두 기존 doctrine(style-library 인덱스) 앵커**에서 나온다.
- **문제(도그푸딩)**: 비-개발자는 텍스트 토큰 명세로 3안을 **구분하지 못한다**. divergence 를 지켜도 "색만 다른 같은 안" 체감. Stretch 1 도 인덱스 안쪽이라 진짜 새 방향이 안 나온다.
- **Intent (해소 확정)**: (a) S1 의 텍스트-컨셉 게이트를 **렌더된 HTML 시안 3개로 완전 대체** — 텍스트로 먼저 좁히지 않고 **3안 전부 up-front 렌더**한다. (b) A·B 안 = 기존 doctrine 앵커(Fit), **C 안 = 매 버전 디자인 웹서치 기반으로 Claude 창의성이 발산한, 진짜로 다른 방향**.
- **In**: S1 산출물 포맷을 TEXT-only → **렌더 HTML 3안(up-front, 전부)** 으로 개정. 3안 믹스 룰을 **A·B = Fit/doctrine 앵커 · C = 웹서치 grounding 발산(인덱스 우회)** 으로 재정의 + C 안 provenance(무엇을 웹서치·참조해 발산했나) 표기 의무화. 폰트 실로드·컴포넌트형/레이아웃 차이 가시화 요건을 **HTML-always 전제**로 승격. **3x 렌더 비용은 수용 — cost-gate 없음**(텍스트-선좁힘 도입하지 않음).
- **Out**: S2(DS render HTML)·S3/S4 흐름 불변. C안의 style-library 인덱스 등재는 별도. 시안 생성 병렬/순차·토큰 예산 *세부*는 P2/P3.
- **AC 고도**: S1 게이트에서 사용자가 **렌더된 3개 HTML 시안**(텍스트 컨셉 단계 없이 바로)을 보고 1–3 안을 고른다 · 세 안이 폰트/컴포넌트 형태/레이아웃에서 **시각적으로 명백히 다르게** 렌더된다(색만 다른 게 아님) · C 안은 doctrine 인덱스 밖 **웹서치 기반 발산**임이 provenance 로 표기된다 · 3안을 항상 up-front 렌더하며 cost-gate 로 줄이지 않는다.

#### S2b — 에셋 생성: PNG-우선 + PNG→SVG 후처리 루프 · 영어 프롬프트 무조건  *(doctrine-only)*
- **현재 동작**: S2b = 위임-우선 3단(① Codex → ② ChatGPT/Gemini 핸드오프 → ③ 유저 거부 시 Claude 직접 **SVG**). 핸드오프 = `external_tool_recommendation: {tool, why_external, prompt, expected_output_path}` (habit §5).
- **문제(도그푸딩)**: (a) 폴백 ③ 이 **SVG 직생성으로 너무 빨리 빠진다** — 생성형 PNG 가 품질이 훨씬 좋은데 "유저가 PNG 돌려주면 Claude 가 SVG 로 변환/후처리"하는 루프가 없어 SVG 고집으로 떨어진다. (b) 핸드오프 프롬프트가 user_lang(ko)로 나가면 이미지모델 품질이 떨어진다.
- **Intent**: (a) **생성형 PNG 우선** — ①/② 핸드오프로 PNG 를 받는 경로를 1급으로 두고, **"유저가 PNG 를 돌려주면 Claude 가 SVG 로 변환/후처리"하는 신규 루프**를 추가해 SVG-직생성(③)으로의 조기 폴백을 막는다. (b) 이미지모델 핸드오프 프롬프트는 **user_lang 무관 무조건 영어**.
- **In**: S2b 폴백 사다리를 `① Codex → ② 핸드오프(PNG 기대) → ②.5 유저-반납 PNG → Claude SVG 변환/후처리 → ③ 그래도 안 되면 Claude 직접 SVG(최후)` 로 개정. `expected_output_path` 가 PNG 를 기대하도록 + 반납 PNG 의 SVG 변환/후처리 단계(도구/방법 = P3)를 명문화. `external_tool_recommendation.prompt` 는 **항상 영어**라는 룰을 habit §5(SoT)와 S2b(참조) 양쪽에 박는다.
- **Out**: 로고/파비콘/og:image 에셋 *종류* 불변. Codex 위임 판정·이미지모델 선택 그대로. 자동 PNG→SVG 변환 *구현*(potrace 류 vs Claude 핸드) = P3.
- **AC 고도**: S2b 가 SVG 직생성으로 빠지기 전 **생성형 PNG 경로를 먼저 시도**한다(폴백 순서 PNG-우선) · 유저가 PNG 를 반납하면 Claude 가 SVG 로 변환/후처리하는 단계가 doctrine 에 존재 · 모든 이미지모델 핸드오프 프롬프트가 user_lang 과 무관하게 **영어**로 출력된다.

#### 3 — 빌드 run + 눈확인 + 통합 시각 grill (prompted pre-close) + smoke 시각 보강  *(doctrine + product/code)*
- **현재 동작**: 빌드 완료 → close-gate(backlog triage → design review → PRD check → security 6). QA 3-item = build green · smoke critical-path · acceptance. GUI smoke(`tests/smoke.spec.ts`) = **mount + console error 0 만** — 시각 렌더·스크롤·간격·CSS 깨짐 미검증.
- **문제(도그푸딩)**: smoke 시각 사각으로 CSS 깨짐/간격을 못 잡는다(fail-pattern **T-PATCH-095 5루프**의 구조적 원인). 빌드 완료↔close-gate 사이 "앱 실제 run + 눈확인 + 통합 시각 grill" 단계가 **codify 안 됨**(산발적 hands-on 만).
- **Intent (해소 확정)**: 빌드 완료 후 close-gate 진입 전, PO 가 사용자에게 **앱 실제 run(dev run) + 눈확인 + 통합 시각 grill 을 강하게 권하는 prompted pre-close 단계**를 신설한다 — **하드 게이트 아님**(통과 못 해도 close 차단하지 않음; 유저가 건너뛸 수 있음). 별개로 **smoke 시각 사각을 보강**(스크린샷/시각 어서션)한다.
- **In**: (doctrine) p3-build.md 의 close-gate **직전에 prompted "run+eyeball+visual-grill" 단계**를 명문화 — `close_gate` 4-step 시퀀스(backlog→design→prd→security)에 **blocking step 을 추가하지 않는다**; PO 가 권유하고 유저가 skip 가능한 pre-close 프롬프트로 모델링. qa/habit.md 시각 검증 룰 강화. (code) smoke 하니스에 시각 어서션(핵심 화면 스크린샷 캡처/체크) 추가 — v0.5 calibration anchor #3 을 자동화 쪽으로 한 발 당김.
- **Out**: 픽셀-퍼펙트 비주얼 회귀 인프라 전면 구축 아님(MVP = 핵심 화면 스크린샷 + 눈확인 유도). close_gate 에 새 blocking step 추가 금지(강도 = prompted-but-skippable 확정).
- **AC 고도**: 빌드 완료 시 PO 가 **앱 실제 run + 눈확인 + 통합 시각 grill 을 강하게 권하는 prompted 단계**가 doctrine 에 존재하고 실행된다 · 이 단계는 **close 를 차단하지 않으며 유저가 skip 할 수 있다**(blocking close_gate step 추가 없음) · smoke 가 mount+console 을 넘어 **핵심 화면의 시각 렌더를 캡처/검증**한다.

#### 4 — 테스트 러너 배선 + `type:test` 트리거 재조정  *(product/code + doctrine)*
- **현재 동작(검증됨)**: `turbo run test` → `packages/core` 의 `node test/schema-v-guard.mjs && node test/init-parity.mjs` **2개 .mjs 만 실행**. 저장소의 `.test.ts`/`.spec.ts` 6개(core: `schema-v-guard.test.ts`, `lint/vocabulary.test.ts` · gui: `smoke.spec.ts`, `ipc/costArchive.test.ts`, `useTicketScan.test.ts`, `dedupeMessagesById.test.ts`)는 **vitest/jest 가 의존성에 없고** `packages/gui` 에 `test` 스크립트조차 없어 **실행되지 않는다**. `type:test` 트리거는 리스크-게이트(auth/payments/PII · ≥3-step · area-tag ≥3 fail · 유저 명시)라 GUI 엔 거의 미발화.
- **문제(도그푸딩)**: 작성된 테스트가 러너 미배선으로 죽어 있고, 트리거가 GUI 에 거의 안 걸려 테스트가 실질적으로 작동 안 함.
- **Intent**: (a) `.test.ts`/`.spec.ts` 가 실제 실행되도록 **러너 배선**(vitest 도입 + per-package `test` 스크립트 + turbo 연결) 확인·수정. (b) `type:test` **트리거 재조정**으로 GUI 영역에도 합리적으로 발화.
- **In**: (code) core/gui 에 vitest(또는 동급) 배선 — 6개 기존 테스트가 `turbo test` 로 green/red 를 실제로 낸다. (doctrine) `type:test` 트리거 조건 재조정(예: GUI IPC fs 핸들러 신규 = traversal 가드 회귀 위험 → area-tag `*/ipc-security` 누적분 연동).
- **Out**: 새 테스트 *대량 작성* 아님(기존 6개 살리는 게 1차). 커버리지 목표·CI 게이팅 강도는 후속. 트리거 임계 정밀값은 doctrine P2 에서 확정.
- **AC 고도**: `turbo test`(또는 동급)가 기존 `.test.ts`/`.spec.ts` 6개를 **실제로 실행**해 통과/실패를 보고한다(silent 미실행 해소) · `type:test` 트리거가 재조정되어 GUI 위험 영역에서도 발화 가능 · 배선/트리거 변경이 turbo 설정·doctrine 에 반영된다.

#### 5 — 코드리뷰 게이트 신설 (하이브리드)  *(doctrine-only)*
- **현재 동작**: `type:refactor` + GRILL(loss-risk refactor) 은 있으나 **diff 를 correctness/재사용/단순화 관점으로 훑는 코드리뷰 패스가 없다**. QA = build/smoke/acceptance/디자인리뷰지 **코드 품질이 아니다**. 하네스에 `/code-review`·`/simplify` 스킬 존재.
- **문제(도그푸딩)**: 구현 diff 의 버그/중복/과복잡이 게이트 없이 통과 — 비-개발자는 코드 품질을 직접 검수 못 해 더 위험.
- **Intent (해소 확정)**: **하이브리드** — (a) 위험 티켓(risk_flags / 큰 diff)은 **per-ticket 코드리뷰**, 추가로 (b) close-gate 에서 **누적-diff 코드리뷰 1회**. 둘 다 하네스 `/code-review`·`/simplify` 활용.
- **In**: (doctrine) build-loop 에 risk-gated per-ticket 코드리뷰 + close-gate 에 cumulative-diff 코드리뷰 1회를 정의. correctness·재사용·단순화 3축 산출물 포맷 + `/code-review`·`/simplify` 호출 방식 명문화. risk-gate 판정 기준(risk_flags/diff 규모 임계)을 명시.
- **Out**: 신규 코드 0(하네스 스킬 호출 = doctrine 룰). 자동 픽스(`--fix`/`/simplify` 자동 적용 vs 제안만)는 P2 에서 확정. 모든 비-위험 티켓 per-ticket 리뷰는 아님(그건 close-gate 누적분이 커버).
- **AC 고도**: 위험 티켓(risk_flags/큰 diff)이 **per-ticket correctness/재사용/단순화 코드리뷰**를 거친다 · close-gate 에서 **누적-diff 코드리뷰 1회**가 실행된다 · 리뷰 결과가 actionable 형태로 기록되고 하네스 `/code-review`·`/simplify` 활용 방식이 doctrine 에 명시된다.

#### 6 — T-PATCH-255: PO 턴 tool 실패 silent → actionable  *(product/code · v0.5 carry)*
- **현재 동작**: PO 턴의 tool 실패 — 특히 macOS TCC(Downloads/Desktop/Documents) 거부 — 가 **응답 텍스트 없이 silent 종료**("도구 1개" + 대기, 유저 무안내). 5차 dmg cua 재현 확정(Allow → 정상, Don't Allow → 응답 없이 즉시 종료).
- **문제**: 비-개발자는 왜 멈췄는지 모르고 다음 행동을 알 수 없다(북극성 = 터미널-0 정합 직접 위협).
- **Intent**: tool 실패 시 **actionable 배너/메시지**(실패 사유 + 다음 행동) 노출.
- **In**: po-runner/PO 응답 surface 레이어가 tool 실패(특히 TCC 권한 거부)를 감지해 평이한 말로 사유 + 조치(예: "시스템 설정 → 개인정보 보호에서 접근 허용")를 보여준다. dev+QA L2 (티켓 본문 SoT = `docs/tickets/v0.5/T-PATCH-255.md`).
- **Out**: TCC 권한을 코드로 부여(불가) · 모든 tool 실패 분류 망라(1차 = TCC 권한 거부 + 일반 silent 종료 안내). real-OS 검증이라 cua-vm 하니스 필요(playwright 사각).
- **AC 고도**: PO 턴 중 tool 실패(TCC 권한 거부 포함) 시 사용자가 **무엇이 왜 실패했고 다음에 뭘 해야 하는지** 읽을 메시지를 본다(silent 종료 해소) · cua-vm 에서 거부 시나리오로 검증된다.

#### 7 — 트레이 빨간점: awaiting-user 상태에서만 표시  *(product/code)*
- **현재 동작**: 메뉴바 트레이 아이콘이 **빨간점을 상시 노출**한다. `tray.ts` 는 idle/working/waiting 아이콘을 갖고 waiting 아이콘이 red dot 을 carry(`payload.waiting` → "awaiting your input")하나, 실제로는 awaiting 외 상태에서도 빨간점이 떠 신호가 무의미해졌다.
- **문제(도그푸딩)**: 빨간점이 항상 떠 있으면 "내 차례"를 알리는 신호로 못 쓴다 — 비-개발자가 PO 가 자기에게 턴을 넘겼는지 트레이만 보고 판단할 수 없다.
- **Intent**: 빨간점을 **PO 가 턴을 사용자에게 넘긴 상태(awaiting-user)에서만** 표시 — idle/working 중에는 clear.
- **In**: `tray.ts` 의 badge(red dot) 표시를 **PO turn-state 에 정확히 게이팅** — awaiting-user 일 때만 waiting 아이콘(red dot), idle/working 시 dot 없는 아이콘. dev L2.
- **Out**: 트레이 아이콘 아트워크 재디자인 아님(상태↔아이콘 매핑 정정만). persona working 스프라이트 로직 불변.
- **AC 고도**: 트레이 빨간점이 **PO 가 턴을 사용자에게 넘긴(awaiting-user) 상태에서만** 표시된다 · idle/working 상태에서는 빨간점이 **clear** 된다 · 상태 전환 시 dot 표시가 PO turn-state 와 일치한다.

#### 8 — leading-dash 입력 크래시 안전처리  *(product/code)*
- **현재 동작(검증됨)**: po-runner(`po-runner.ts`)가 사용자 텍스트를 claude CLI 의 **마지막 positional arg 로 그대로 push**(`args.push('--print', '--output-format', 'stream-json', '--verbose', opts.text)`) — `--` end-of-options 구분자/escaping/stdin 없음. 메시지가 `-`/`--` 로 시작하면 claude CLI 가 옵션으로 오파싱 → `error: unknown option '- ...'` + exit code 1 → **턴 크래시**.
- **문제(도그푸딩)**: 사용자가 `-` 로 시작하는 정상 메시지(리스트 작성 등)를 보내면 PO 턴이 통째로 죽는다.
- **Intent**: leading-dash(및 옵션처럼 보이는) 입력을 **안전 처리** — CLI 오파싱 방지.
- **In**: po-runner 의 arg 전달을 `--`(end-of-options) 구분자 추가 / stdin 전달 / escaping 중 적절한 방식으로 수정해 사용자 텍스트가 항상 데이터로 전달되게. dev L1–L2.
- **Out**: 입력 sanitization 전면 재설계 아님(leading-dash/option-looking 케이스 안전처리에 집중). 별 backlog 의 "Invalid tool parameters"(AskUserQuestion resume race)와는 별개 이슈.
- **AC 고도**: `-`/`--` 로 시작하는 사용자 메시지가 claude CLI 에 **데이터로 전달**되어 `unknown option` 크래시(exit 1) 없이 정상 처리된다 · 옵션처럼 보이는 입력도 턴을 죽이지 않는다.

#### 9 — PO chat presence row: 워커 페르소나 라이브 출력 스트림  *(product/code)*
- **현재 동작**: PO Chat 하단 페르소나 presence row(`PersonaPresenceBar.tsx` + `store/personaPresence.ts`)는 PO/Designer/Developer/QA 4 스프라이트 + idle/working/done 상태만 표시. 그 영역이 세로로 클 때 **스프라이트 우측에 빈 공간이 많다.** po-runner 는 subagent(워커) 이벤트를 이미 인지하나(`subagent-done` presence 신호 · `subagentCaptureByParentId`), 워커의 라이브 출력은 PO 스트림 오염 방지를 위해 **필터링되어 GUI 로 흐르지 않는다**(po-runner.ts nested-event 필터).
- **문제(도그푸딩)**: 워커가 작업 중일 때 빈 공간만 있고 "지금 무엇을 하는지" 라이브 가시성이 없다 — 비-개발자가 진행 상황을 못 본다.
- **Intent**: 현재 active 한 **워커 페르소나(Designer/Developer/QA — PO 는 제외)** 의 라이브 터미널/출력 내용을 그 스프라이트 **우측(빈 공간)에 스트리밍** — 공간을 채우고 + 작동 중인 페르소나가 뭘 하는지 라이브로 보여준다.
- **In**: presence row 의 active 워커 스프라이트 우측에 해당 워커의 라이브 출력 스트림 영역 추가. PO 는 제외(워커만). **인프라 의존**: 워커 subagent 의 출력 스트림을 캡처해 GUI 로 파이프하는 배선이 필요 — 이는 backlog 의 **"PO Log Terminal 탭 미구현"**(2026-06-16; 워커/PO output-stream 배선 = po-runner 가 세션 트랜스크립트를 surface 하는 레이어)과 **동일 precondition**. 그 스트림 배선이 있으면 **재사용**하고, 없으면 #9 가 그 배선을 먼저 깐다(또는 backlog 항목과 한 dev plan 으로 스코프). dev L2–L3.
- **Out**: 인터랙티브 shell(node-pty) 아님(read-only 라이브 출력 표시). PO 자신의 출력 스트림 표시 아님(PO 응답은 채팅 본문이 이미 담당). 전체 PO Log Terminal 탭 *완성*은 별개(이건 presence-row 슬롯의 워커 스트림에 한정).
- **AC 고도**: active 워커(Designer/Developer/QA)의 **라이브 출력이 그 스프라이트 우측 빈 공간에 스트리밍**된다 · PO 는 이 스트림 대상에서 제외된다 · 워커 종료 시 스트림이 적절히 정리(idle 복귀)된다 · 워커 output-stream 배선이 존재하면 재사용하고 의존성을 명시한다(backlog "PO Log Terminal 탭" 항목과 공유 precondition).

> **클러스터 — "lifecycle / worker-state → GUI view 반응"** (#9 · #10 · #11 · #14): 이 4건은 같은 두 precondition 을 공유한다 — (i) **워커 subagent 의 상태/출력**(active 여부 + 라이브 텍스트)이 GUI 로 파이프되는 배선(#9 출력 · #10 상태), (ii) **PO 라이프사이클 이벤트**(version-open · PRD-ready 등)가 GUI 메인 패널을 구동하는 신호 배선(#11 조건부 레이아웃 · #14 PRD 오토-네비). **하나의 P2 design + 하나의 dev plan** 으로 묶는 것을 권장하고, 공유 배선을 먼저 깐 뒤 4개 표면을 얹는다. (#12 · #13 은 이 클러스터와 무관한 standalone input/display 마이너 픽스 — 디자인 산출물 없이 **P3-direct**.)

#### 10 — 워커 페르소나 스프라이트 활성화 (working 상태 미반영)  *(product/code · 클러스터)*
- **현재 동작**: presence row 의 워커 스프라이트(Designer/Developer/QA)가 해당 페르소나의 subagent 가 작업 중인데도 **회색-idle 에 머문다** — `state==='working'` 일 때만 sprite 애니메이션이 돌지만 워커 working 상태가 presence 로 안 흘러온다. v0.5 에서 **PO 스프라이트**의 동일 버그(streaming desync)는 T-PATCH-252 로 수정됨 — #10 은 그 **워커판**.
- **문제(도그푸딩)**: 워커가 일하는 동안 스프라이트가 죽어 있어 "누가 작동 중인지" 안 보인다(스크린샷 보고).
- **Intent**: active 워커 스프라이트가 작업 중 **working 상태로 활성화**(애니메이션)되게 — T-PATCH-252 의 PO 수정을 워커로 확장.
- **In**: 워커 subagent active 상태를 presence store 로 구동 — `subagent-done`/위임 시작 이벤트를 워커 chip state(`working`↔`idle`)에 매핑. **#9 와 동일 precondition**(워커 subagent 상태→GUI 배선) 공유. dev L2.
- **Out**: 스프라이트 아트워크 변경 아님(상태 구동만). PO 스프라이트는 이미 T-PATCH-252 에서 처리됨.
- **AC 고도**: 워커(Designer/Developer/QA) subagent 가 작업 중일 때 그 스프라이트가 **working 으로 활성화**된다 · 종료 시 idle 로 복귀한다 · PO 스프라이트 동작(T-PATCH-252)에 회귀가 없다.

#### 11 — 조건부 워크스페이스 레이아웃 (PRD 인터뷰 중 PO 채팅 단독)  *(product/code · 클러스터)*
- **현재 동작**: PO 가 PRD 인터뷰 루프를 도는 동안 po-state 에 `current_version`/PRD 파일이 아직 없어 다른 패널(Versions/Tickets/PRD/Artifacts)이 **빈 화면**으로 노출된다.
- **문제(도그푸딩)**: 비-개발자가 처음 마주치는 화면이 빈 패널 투성이라 혼란(스크린샷 보고).
- **Intent**: 렌더할 콘텐츠가 생기기 전(버전 생성 + PRD 파일 존재)까지는 **PO 채팅 UI 만 단독 표시**, 콘텐츠가 생기면 **전체 패널 레이아웃으로 확장**.
- **In**: po-state 의 `current_version` + PRD 파일 유무를 GUI 가 읽어 레이아웃을 조건부 전환(채팅-only → 풀 레이아웃). **PO 라이프사이클→GUI 신호 배선**(version-open) 공유 — #14 와 같은 precondition. dev L2–L3.
- **Out**: 패널 콘텐츠 *자체* 재설계 아님(렌더 게이팅만). 전환 애니메이션 정교화는 P2/P3.
- **AC 고도**: 버전/PRD 가 없는 동안 GUI 가 **PO 채팅만** 표시한다 · 버전 생성 + PRD 파일이 생기면 **전체 패널 레이아웃으로 확장**된다 · 전환이 PO 라이프사이클(version-open)과 동기된다.

#### 12 — 한글 IME Cmd+Enter 두 번 눌러야 전송  *(product/code · standalone, P3-direct)*
- **현재 동작(검증됨)**: PO 채팅 입력의 IME 조합 중 **첫 Cmd+Enter 가 IME 조합 확정에 먹혀** submit 핸들러로 안 가, 두 번째에야 전송된다. `isComposing`/keyCode 229 가 submit 경로에서 미처리(코드베이스에 `isComposing` 가드는 `FreshComposer.tsx:130`·`ChatPanel.tsx:197` 등에 존재하나 Cmd+Enter submit 경로는 이 케이스를 못 잡음; cf. T-PATCH-196 isComposing 패턴).
- **문제(도그푸딩)**: 한글 사용자가 메시지를 보낼 때마다 Cmd+Enter 를 두 번 쳐야 함.
- **Intent**: 한글 조합 중 Enter/Cmd+Enter 전송 핸들링 정합 — 첫 입력에 정상 전송.
- **In**: submit 핸들러가 `isComposing`/keyCode 229 를 T-PATCH-196 패턴대로 처리(조합 확정과 submit 을 구분). dev L1–L2. **standalone — 디자인 산출물 없음, P3-direct.**
- **Out**: 입력기 전반 재설계 아님(Cmd+Enter submit 경로 한정).
- **AC 고도**: 한글 조합 중 **첫 Cmd+Enter 로 메시지가 전송**된다(두 번 안 눌러도 됨) · 조합 확정과 전송이 혼동되지 않는다.

#### 13 — tool-call 표시 최하단 토글 기본 expanded  *(product/code · standalone, P3-direct)*
- **현재 동작**: PO 채팅 tool-call 표시의 **최하단(innermost) 토글**(도구 상세 = path/limit/args)이 **접혀(collapsed)** 있어, 도구를 펼쳐도 내용을 보려면 한 번 더 펼쳐야 한다.
- **문제(도그푸딩)**: 도구를 열면 바로 내용이 안 보여 클릭이 한 번 더 든다(스크린샷 보고).
- **Intent**: 최하단 토글을 **기본 open(expanded)** 으로 — 도구를 열면 전체 내용이 바로 노출.
- **In**: tool-call 상세 토글의 default state 를 expanded 로. dev L1. **standalone — 디자인 산출물 없음, P3-direct.**
- **Out**: tool-call 표시 레이아웃 재설계 아님(default open 여부만).
- **AC 고도**: tool-call 을 열면 최하단 상세(path/limit/args)가 **기본으로 펼쳐져** 추가 클릭 없이 보인다.

#### 14 — PRD-ready / 버전 생성 시 메인 패널 자동 PRD 노출 + 버전 자동 진입  *(product/code · 클러스터)*
- **현재 동작**: PRD 완성(P1 ready)/버전 생성 시 GUI 메인 패널이 **자동으로 PRD 를 안 띄우고 버전 진입도 자동 안 됨** → 유저가 수동으로 Version Detail/PRD 섹션을 클릭해야 한다. 근본: **PO(백엔드)가 GUI 메인 패널 뷰를 직접 못 연다**.
- **문제(도그푸딩)**: 첫 산출물(PRD)이 생겨도 비-개발자가 어디를 눌러야 할지 몰라 못 본다.
- **Intent**: PO 라이프사이클 이벤트(version-open · PRD-ready 등)가 **GUI 메인 패널을 자동 네비게이트**(PRD 오토-오픈/포커스 + 버전 자동 진입).
- **In**: **PO 라이프사이클→GUI 신호 배선** 신설 — version-open/PRD-ready 이벤트 → 메인 패널이 PRD 탭을 자동 오픈/포커스 + 해당 버전으로 진입. **#11 과 동일 precondition**(PO lifecycle→GUI 신호). dev L2–L3.
- **Out**: 모든 라이프사이클 이벤트의 자동 네비 망라 아님(1차 = version-open / PRD-ready). 사용자 수동 네비 경로 제거 아님(자동 + 수동 공존).
- **AC 고도**: PRD-ready/버전 생성 시 메인 패널이 **자동으로 PRD 를 띄우고 해당 버전으로 진입**한다(수동 클릭 불요) · PO 라이프사이클 이벤트가 GUI 메인 패널 네비게이션을 구동하는 배선이 존재한다.

> **스코프 경계(ticket Acceptance §4)**: **doctrine/process 갭 + 코드 안정화** = v0.6 (14 items). **doctrine-only** = S1 · S2b · #5 + #3/#4 의 트리거·룰 부분. **product/code** = #3 smoke 시각 보강 · #4 러너 배선 · #6 T-255 · #7 tray · #8 leading-dash · #9 presence-row 워커 스트림 · #10 워커 스프라이트 활성화 · #11 조건부 레이아웃 · #12 IME Cmd+Enter · #13 tool-call 토글 default · #14 PRD 오토-네비. **6차 dmg 리빌드(T-254/256/257 미반영분)** 와 **풀 도그푸드-런(Round9 비-개발자 관찰)** 은 **v0.6 OUT → v0.7 이월** — 본 PRD 는 14개 갭의 Why/What/AC 와 version_outcome 만 확정한다.

### Success metrics → version_outcome

- **North star** (reframed): v0.5 가 깐 풀사이클이 비-개발자에게 **깨끗하게 완주 가능한 dogfood-ready 상태가 되는 것** — 14개 안정화 갭이 닫히고 각 AC 가 검증되어, 다음 버전의 실제 관찰을 막을 마찰이 제거된 상태. (실제 *관찰된* 비-개발자 풀사이클 완주 = v0.7 north-star 로 계속 carry — v0.6 에서는 측정하지 않는다.)
- **Input metrics** (모두 v0.6 내 측정 가능):
  1. 14개 갭이 각자의 AC 를 충족(doctrine 개정 land + product/code 변경 동작).
  2. S1 게이트가 **렌더 HTML 3안 up-front** 로 동작하고 세 안이 시각적으로 명백히 다르다(텍스트 3안 구분-불가 해소).
  3. S2b 가 SVG 직생성 전 **PNG-우선 경로**를 타고, 핸드오프 프롬프트가 **무조건 영어**다.
  4. smoke 가 **핵심 화면 시각 렌더를 캡처/검증**하고, 빌드 후 **prompted run+eyeball+visual-grill 단계**가 doctrine 에 존재한다(T-PATCH-095 류 시각 사각 보강).
  5. `turbo test` 가 기존 `.test.ts`/`.spec.ts` 6개를 **실제로 실행**한다(미실행 → 실행 전환).
  6. 코드리뷰가 **risk-gated per-ticket + close-gate 누적 1회** 하이브리드로 실행된다.
  7. PO 턴 tool 실패 시 **silent 종료 없이 actionable 메시지**(T-255), 트레이 빨간점이 **awaiting-user 에서만**(#7), `-` 시작 입력이 **크래시 없이 처리**(#8) — 셋 다 검증.
  8. **lifecycle/worker-state→GUI 클러스터**(#9·#10·#11·#14)가 공유 배선 위에서 동작: 워커 라이브 출력이 presence row 에 스트리밍(#9, PO 제외) · 워커 스프라이트가 작업 중 **working 활성화**(#10) · PRD 인터뷰 중 **PO 채팅 단독 → 콘텐츠 생기면 풀 레이아웃**(#11) · PRD-ready/버전 생성 시 메인 패널이 **PRD 오토-노출 + 버전 자동 진입**(#14).
  9. 한글 조합 중 **첫 Cmd+Enter 로 전송**(#12) · tool-call 최하단 토글이 **기본 expanded**(#13) — 둘 다 검증.
- **Validation method**: 항목별 AC 체크리스트 패스 — doctrine 개정은 land + cross-ref 정합, code 변경은 build+smoke+해당 surface 검증으로. real-OS/TCC(#6) · 트레이(#7) · leading-dash(#8) · 한글 IME(#12)는 **cua-vm 하니스**(playwright 사각)로, 시각(#3) · 클러스터 GUI(#9·#10·#11·#14) · tool-call 토글(#13)은 **스크린샷 하니스 + 사람 눈확인**으로 검증. (실제 풀사이클 관찰은 v0.7 로 이월되어 본 버전 validation 에 포함하지 않는다.)

## v1.2 — 실행 코드 / 코드 메타 분리 (메타 전용 로컬 git)

> **Slug**: meta-code-split-local-git · **Status**: PRD ready (경계 4문 전부 결정 확정, A≈0.04) · **Authored**: 2026-07-16 (prdt-designer) · **Tickets**: T-361 (feature) · T-362 (productune dogfood, depends T-361)
>
> v1.2 는 단일 트랙이다 — prdt 가 관리하는 프로젝트에서 **실행 코드**와 **코드 메타**(PRD·티켓·wiki·retro·상태)를 분리해, GitHub(origin)에는 실제 돌아가는 코드만 올라가고 메타는 **메타 전용 로컬 git** 으로 prdt 가 자동 관리하게 만든다. shawn 확정 결정(2026-07-16): ① origin = 코드만 · ② 메타 = 로컬 메타 git, prdt 자동 커밋, 히스토리 보존, 원격 백업은 옵션 · ③ CLI·GUI 동일 동작 · ④ 신규 프로젝트 기본 적용 + 기존 프로젝트 마이그레이션 경로.

### Why — 문제

prdt 관리 프로젝트는 한 working tree 에 실행 코드와 코드 메타가 섞여 **전부 origin 에 push** 된다.

- productune 자체가 tracked 1086 중 메타(`docs/` 604 + `.prdt/`·`.productune/`·`briefs/`)가 코드(`packages/` 461)보다 많다.
- 코드 repo 를 공유·공개하는 순간 내부 티켓·retro·PRD·의사결정이 그대로 노출된다.
- 코드 diff 리뷰에 메타 노이즈(티켓 상태 변경, PRD 갱신)가 섞여 신호를 흐린다.
- 히스토리는 보존해야 한다 — doctrine #6("markdown is the source of truth")상 메타 변경 이력은 버려질 수 없는 자산이다.

### Who — 대상

마스터 Who 와 동일 — 코드를 직접 짜지 않는 기획자 / 1인 PM. 이 사용자는 git 개념을 노출받지 않으므로(§10 Git 추상화), 코드/메타 분리는 **prdt 가 전부 처리**하고 사용자에게는 "코드 repo 에 메타가 안 섞인다"는 결과만 보여야 한다. 1차 dogfood 사용자는 productune 자신(T-362).

### 핵심 개념 — 두 개의 git, 하나의 working tree

메타 파일은 **경로가 바뀌지 않는다**(contract fixed paths — `docs/prd/PRD.md` 등은 그 자리 유지). 대신 같은 working tree 위에 두 개의 git 이 공존한다.

| | 코드 repo | 메타 repo |
|:--|:--|:--|
| git-dir | `.git/` (기존) | `.prdt/meta.git/`(별도 git-dir, work-tree = 프로젝트 루트) |
| 추적 대상 | 메타 allowlist 를 **제외한** 전부 | 메타 allowlist **만** |
| origin | GitHub(기존 코드 remote) | 없음(로컬). 원격은 opt-in |
| 커밋 주체 | 기존 §10 autosave(ticket worktree) | prdt 메타 autosave(신규) |
| `git status` 노출 | 메타 변경 **안 보임**(.gitignore) | 메타 변경만 보임 |

코드 repo 의 `.gitignore` 가 메타 allowlist 를 제외하므로 메타 변경은 코드 `git status`·커밋·diff 에 나타나지 않는다. 메타 repo 는 그 반대 — allowlist 만 추적하고 자기 git-dir(`.prdt/meta.git/`)은 추적하지 않는다.

### 경계 결정 1 — 메타 / 코드 boundary (allowlist 방식) *(결정 확정)*

메타는 **명시적 allowlist** 로 정의한다. prdt 가 저작하는 경로만 메타이고, 그 외 전부(사용자가 만든 것 포함)는 코드다 — top-level `docs/` 를 통째로 메타로 삼지 않는다(일반 프로젝트의 `docs/` 는 제품 문서일 수 있으므로).

| 귀속 | 경로 |
|:--|:--|
| **메타** | `.prdt/`(단, 파생물 `index.db`·`turns.jsonl`·`sessions.json`·게이트 캐시는 양쪽 모두 gitignore) · `.productune/`(legacy) · `briefs/` · `docs/prd/` · `docs/tickets/` · `docs/wiki/` · `docs/designer/` · `docs/developer/` · `docs/po/` · `docs/qa/` · `docs/artifacts/` · `docs/retrospectives/` · `docs/archive/` |
| **코드** | `packages/` · `scripts/` · `.github/` · `README.md` · `DEPLOY.md` · `package.json` · `pnpm-*.yaml` · `turbo.json` · 그리고 allowlist 밖의 사용자 저작 `docs/` 파일 |

- `README.md`·`DEPLOY.md` 는 코드 repo 를 clone 한 사람이 제품을 빌드/배포하기 위한 문서이므로 **코드**다.
- allowlist 는 `.prdt/config.json` 에 저장돼 프로젝트별로 add/remove 가능하다 — productune 은 `docs/` 전 파일이 메타이므로 loose `docs/*.md`(`backlog.md`·`testing.md`·`MIGRATION.md`·`prdt-v1-*.md`)를 allowlist 에 추가한다.
- `.prdt/meta.git/` 자신은 코드·메타 양쪽 모두 gitignore(git-dir 은 어느 repo 도 추적하지 않는다).

### 경계 결정 2 — 메타 auto-commit 시점 / 단위 *(결정 확정)*

메타 커밋은 기존 §10 autosave 가 이미 계산하는 라이프사이클 신호를 **재사용**한다 — 새 트리거 체계를 만들지 않는다.

- **시점**: 페르소나 turn 종료 + 상태 전이(ticket status / qa status·loops 변경, stage 전환, PRD·wiki·design 산출물 write). 기존 `AutosaveChangeReason`(`status-change`·`qa-status-change`·`qa-loops-change`·`manual`)과 동일 beat.
- **단위**: 논리적 변경 1건 = 커밋 1건. 메시지 = 사람이 읽는 자연어(ticket-id + 페르소나 summary), 기존 `naturalize` 재사용.
- **diff 없으면 skip** — 기존 autosave 의 `diff-empty` skip 그대로.

### 경계 결정 3 — 코드 repo `.gitignore` 관리 주체 *(결정 확정)*

prdt 가 코드 repo `.gitignore` 안에 **marker 로 구분된 관리 블록**을 주입·유지한다.

- 블록은 `# >>> prdt meta (managed) >>>` … `# <<< prdt meta (managed) <<<` 마커로 감싸고, 그 안에 메타 allowlist 를 기록한다.
- prdt 는 마커 안쪽만 재작성하고 사용자가 손으로 쓴 나머지 `.gitignore` 라인은 절대 건드리지 않는다.
- allowlist 가 바뀌면(config 편집) 다음 turn 에 블록을 idempotent 하게 재동기화한다.
- init 시 자동 주입 — 사용자는 `.gitignore` 를 손대지 않는다.

### 경계 결정 4 — 기존 origin 에 push 된 메타 처리 *(결정 확정)*

두 갈래가 있고, 기본 정책은 안전한 쪽으로 확정하되 실제 파괴적 실행은 명시적 opt-in 으로 잠근다.

| 방식 | 효과 | 대가 | v1.2 정책 |
|:--|:--|:--|:--|
| (a) 추적 제거 only (`git rm --cached`) | 이후 커밋·status 에서 메타 사라짐 | **과거 히스토리엔 메타가 남음**(옛 커밋 `git log` 로 열람 가능) | **기본값** |
| (b) 히스토리 rewrite(filter-repo/BFG + force-push) | origin 전 히스토리에서 메타 완전 제거 | 파괴적 · force-push 필요 · 기존 clone 깨짐 | **명시적 opt-in 만**, 자동 실행 금지 |

- **기본 = (a) 추적 제거 only.** (b)는 contract("사용자 명시 지시 없이 force-push·파괴적 git 금지")상 자동화할 수 없으므로 default 가 될 수 없다.
- 마이그레이션 절차(공통): ① `.prdt/meta.git/` 초기화 → ② 현재 메타 파일을 메타 repo 로 최초 커밋(이관 시점 스냅샷 = 최소 보존; 코드 repo 히스토리에서 메타 히스토리 import 는 후속 옵션) → ③ 코드 repo 에서 `git rm --cached` 로 추적 제거 + `.gitignore` 관리 블록 주입 → ④ 검증(`git ls-files` 양쪽).
- **productune(T-362) 실행 = (a) 추적 제거 only 확정** (shawn, 2026-07-16). 히스토리 rewrite 안 함 — 기존 공개 origin 과거 메타 노출은 감수한다(곧 새 org 로 이관되므로).

#### 새 org 이관 패턴 — prdt 관리 repo 마이그레이션 표준 *(결정 확정)*

shawn 은 모든 prdt 관리 repo 를 새 private org(다른 계정)로 이관할 예정이며, 이 패턴이 **표준 마이그레이션 경로**가 된다.

1. 코드/메타 분리 적용 — 추적 제거(a) + `.prdt/meta.git` 구성 + `.gitignore` 관리 블록.
2. 분리 완료 상태로 기존 origin 에 **최종 1회 push**.
3. origin remote 를 **새 private org 의 새 repo 로 이전** — 이 시점부터 새 repo 에는 코드만 올라간다(메타는 처음부터 미추적).
4. 기존 공개 repo 의 과거 메타 히스토리는 그대로 남지만, 곧 폐기·비활성될 예정이라 노출을 감수한다.

이 패턴에서 히스토리 rewrite 가 불필요한 이유: 과거 메타가 남은 **옛 repo 는 버려지고**, 이관 대상 **새 repo 는 첫 커밋부터 메타가 없다**. rewrite 의 파괴적 비용 없이 "새 origin 에 메타 0" 목표를 달성한다.

### CLI · GUI parity *(결정 확정)*

메타 git 로직은 전부 `packages/core`(git-workflow)에 두고 CLI·GUI 가 같은 모듈을 호출한다 — 구성상 parity 가 보장된다.

- 메타 커밋 생성 = core autosave 확장 → 두 surface 공유.
- 메타 히스토리 열람 = GUI Version History 에 메타 트랙 추가 + CLI 명령(예: `prdt meta log`).
- 원격 백업(opt-in) 설정 = core 의 메타 remote add API → 양쪽 노출.

### What — 범위 (in / out)

#### 신규 프로젝트 (init 기본 적용)
- **In**: init 시 코드 repo `.git` + 메타 repo `.prdt/meta.git` 를 함께 구성 · `.gitignore` 관리 블록 주입 · 메타 allowlist config 기록.
- **Out**: init 이전 이미 존재하던 프로젝트의 자동 감지(그건 마이그레이션 경로).

#### 기존 프로젝트 마이그레이션
- **In**: `prdt` 마이그레이션 명령 / GUI 버튼 — 스냅샷 이관 + 추적 제거(a) + `.gitignore` 주입 + 검증. productune 자신을 dogfood(T-362).
- **Out**: 자동 히스토리 rewrite(명시적 opt-in 만) · git 이 없는 프로젝트 · 이미 분리된 프로젝트 재실행.

#### 메타 원격 백업 (opt-in)
- **In**: 사용자가 원할 때 메타 repo 에 remote 를 붙일 수 있는 최소 경로(설정 API + 수동 push).
- **Out**: 자동 push·양방향 sync·다중 사용자 메타 병합·충돌 해소 UI(모두 이후 버전).

### Non-goals (v1.2)

- 메타 원격 자동 sync / 다중 사용자 메타 협업 / 충돌 해소 (원격은 opt-in 수동만).
- 이미 push 된 origin 의 자동 히스토리 rewrite (명시적·수동·opt-in — 절대 자동 아님).
- 메타 암호화 / 접근 제어.
- git 이 없는 프로젝트 지원.
- top-level `docs/` 전체를 무조건 메타로 삼는 것(allowlist 방식으로 대체).

### Risk & assumptions

- **두 repo 가 한 work-tree 를 공유** → 잘못된 repo 에 `git add` 될 혼동 위험. 완화: prdt 가 양쪽 커밋을 전담 · 코드 `.gitignore` 가 메타 제외 · 사용자는 git 을 직접 만지지 않음(§10).
- **추적 제거 only 는 과거 origin 히스토리에 메타를 남긴다** → 이미 push 된 프로젝트(productune)엔 잔여 노출 위험. 이것이 경계 결정 4 의 productune 실행 결정을 needs_info 로 남긴 이유.
- **`.gitignore` 관리 블록이 사용자 편집과 충돌** → marker 구분 영역으로 격리, 마커 밖은 불가침.
- **메타 git-dir 을 프로젝트 안(`.prdt/meta.git`)에 두면** 폴더 이동 시 히스토리가 함께 따라오는 이점이 있으나, 코드 repo 재-clone 시엔 딸려오지 않는다(메타는 로컬 자산이라는 전제 — 원격 백업 opt-in 이 이 gap 을 메운다).
- **가정**: 메타 히스토리 "보존"의 최소 합격선은 이관 시점 스냅샷 + 이후 전체 이력. 코드 repo 과거 커밋에서 메타 히스토리를 메타 repo 로 import 하는 것은 nice-to-have(후속).

### Success metrics → version_outcome

- **North star**: prdt 관리 프로젝트의 origin `git ls-files` 가 **메타 0건**을 반환하면서, 전체 메타 이력이 별도 메타 git 에서 열람 가능한 상태 — productune 자신(T-362)을 이 방식으로 마이그레이션하고 CLI·GUI 둘 다 정상 동작함으로 증명.
- **Input metrics** (모두 v1.2 내 측정 가능):
  1. 신규 init 결과 코드 repo tracked set 에 메타 allowlist 경로가 **0건**, 메타 repo 에는 메타가 채워져 있다(`git ls-files` 양쪽).
  2. 메타 변경(티켓 편집·PRD write) 1건이 메타 git 에 커밋 1건을 만들고 코드 `git status` 에는 **나타나지 않는다**.
  3. productune 마이그레이션 후 origin `git ls-files` 메타 0건(코드 461 계열만) · 메타 git 이 604+ 메타를 이력과 함께 보유.
  4. CLI·GUI 둘 다에서 메타 커밋 생성·메타 히스토리 열람·마이그레이션 후 정상 동작(parity check).
- **Validation method**: 자동 `git ls-files` 어서션(코드·메타 양쪽) + 메타 git `log` 이력 확인 + productune 대상 CLI·GUI 각각의 dogfood 패스(T-362).

### Open Questions (v1.2)

- 없음 — 경계 4문 모두 결정 확정(2026-07-16). 경계 결정 4 는 (a) 추적 제거 only + 새 org 이관 패턴으로 종결.

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
