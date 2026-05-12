---
doc: design-plan
slug: T-P4-022-deploy-po-trigger-vercel
owner: pdt-designer
status: draft
phase: 4
round: phase4-r2
ticket_ref: docs/tickets/phase4/T-P4-022.md
date: 2026-05-11
prd_ref: docs/prd/productune.md §10 [배포 준비] / [배포하기] (PRD L143–151, L169 reversal land)
applies_to: T-P4-022 (deploy gate — PO trigger + 사용자 confirm + Vercel REST API + CLI logs 보조 + conflict hybrid)
inherits_from:
  - docs/design/R2-git-abstraction-architecture.md (OQ-1/3/4/5 resolved 2026-05-11)
  - docs/design/T-P4-024-git-rules-json-foundation.md (schema source — useStagingEnv / protectedBranches)
  - docs/design/T-P4-020-ticket-worktree-base-branch-protection.md (worktree path / branch namer source)
  - docs/design/T-P4-021-autosave-ticket-status-change.md (deploy 직전 frontmatter 변경 시 autosave 정합)
deliverable: deploy-gate-spec (PO trigger 판단 로직 + DeployConfirmModal + ConflictResolveModal + deploy tab type 11 + Vercel REST client + CLI logs stream + PR mechanism)
related_docs:
  - docs/design/R2-git-abstraction-architecture.md
  - docs/design/design-system.md
  - docs/design/T-P4-024-git-rules-json-foundation.md
  - docs/design/T-P4-020-ticket-worktree-base-branch-protection.md
  - docs/design/T-P4-021-autosave-ticket-status-change.md
  - docs/tickets/phase4/T-P4-022.md
  - docs/tickets/phase4/T-P4-046.md  # dispatcher 11번째 type
  - docs/tickets/phase4/T-P4-048.md  # Settings — Vercel token 입력 영역
  - docs/tickets/phase4/T-P4-067.md  # modal + inline trace 패턴
  - docs/tickets/phase4/T-P4-079.md  # multi-bubble chat (progress trace 분리)
  - docs/tickets/phase4/T-P4-080.md  # PresenceBar (deploy background task)
  - docs/tickets/phase4/T-P4-081.md
  - docs/tickets/phase4/T-P4-084.md  # dev/planner mode 어휘 split
out_of_scope:
  - [배포 취소] / rollback automatic 정책 본 plan §13 OQ-T022-3 결정 후 별 ticket
  - non-Vercel deploy provider (Round 8 T-P4-081)
  - multi ticket 동시 [배포하기] (Phase 5)
  - Vercel API token 입력 onboarding UI 의 구체 UX (T-P4-048 Settings 영역, 본 plan §8.3 reference 만)
  - staging env (`useStagingEnv=true`) Vercel preview env 매핑의 deploy 후 검증 flow (Phase 5)
  - 외부 IDE / 외부 git 직접 변경 감지 정밀 처리 (R2 architecture §4.4 OQ-5 = MVP 알림 only)
  - autosave 와의 race condition 정밀 처리 (T-P4-021 §11 OQ-T021-3 결정 후 본 plan inline stamp)
---

# T-P4-022 design plan — [배포 준비] / [배포하기] 2단계 게이트 (PO trigger + 사용자 confirm + Vercel REST + CLI logs 보조)

> **이 plan 의 범위**. R2 묶음의 **네 번째** dependency (T-P4-024 / T-P4-020 /
> T-P4-021 land 후 진입). 사용자가 git 어휘 0 회 노출 상태에서 한 번의 confirm
> 모달로 ticket 결과를 production 까지 배포 가능. PO 가 규칙 (ticket done +
> qa pass + dependency 충족) 만족 시 자동 trigger 로 DeployConfirmModal 띄우고,
> 사용자 OK 시 [배포 준비] → [배포하기] 2 stage state machine 으로 진행. Vercel
> REST API 가 deploy 1차 + `vercel logs --follow` CLI 가 progress stream 보조.
>
> **결정 source**. R2 architecture plan §4.1.1 (OQ-1 hybrid) / §4.3 (OQ-3 PO
> trigger + confirm) / §4.5 (OQ-4 Vercel REST + CLI 보조) / §4.4 (OQ-5 외부 IDE
> 알림 only) 모두 2026-05-11 land 된 결정을 그대로 inherit. ROADMAP line 147 의
> reversal (별 [배포 준비] / [배포하기] 버튼 X) 도 본 plan 의 GUI surface §5 의
> baseline.
>
> **편집 정책**. 본 문서 = design only. 코드 / ticket frontmatter / ROADMAP 변경
> 0. ticket md acceptance 보강은 dev 임플 시점에 별 (PO 또는 dev 가 본 plan §3 /
> §4 / §5 / §6 / §8 / §9 / §14 기반으로 정밀화). 사용자 OQ-T022-1 ~ 5 (§13) 결정
> 후 본 §4 / §6 / §7 / §8 인라인 stamp 격상.

---

## §1 Goal

R2 묶음의 **네 번째** ticket + L5 (가장 복잡). PRD 의 단일 원칙 — **사용자가 git
개념을 한 번도 보지 않고 작업 ↔ 배포 사이클을 진행** — 의 가장 critical
choke-point. ticket 단위 worktree (T-P4-020) 안에서 자동저장된 작업 (T-P4-021) 이
설정 규칙 (T-P4-024) 에 따라 적절한 환경으로 흘러가도록 하는 2 stage gate.

### 1.1 두 stage 의 의미 (PRD 확정 어휘)

| stage | 사용자 어휘 | 백엔드 | trigger |
|---|---|---|---|
| 1 | **[배포 준비]** | ticket worktree branch push (origin) + (`useStagingEnv=true` 시) Vercel preview env 매핑 | PO 자동 + 사용자 confirm |
| 2 | **[배포하기]** | production branch (`main`) PR 자동 생성 → squash merge → Vercel production deploy | stage 1 ok + 사용자 confirm |

> 두 stage 모두 **사용자 OK 만 진행**. PO 자율 X (R2 architecture §4.3 OQ-3 결정).
> 단 R2 plan 의 reversal 정합 — **별 [배포 준비] / [배포하기] 버튼 X**. 대신 PO 가
> 규칙 만족 시 **DeployConfirmModal** 띄우고 사용자가 OK 한 순간 stage 1 + 2 가
> 한 흐름으로 진행 (사용자 cog load ↓, § 1.5.1 Few Things 정합).

### 1.2 사용자 가시 어휘 (한정)

| 표시 | 의미 |
|---|---|
| "다음 작업들 준비됐어요. 배포 시작할까요?" | DeployConfirmModal title |
| "{N}개 작업을 배포 준비 중..." | stage 1 진행 trace |
| "배포 시작" | stage 2 시작 trace |
| "배포 완료 — {minutes}분 {seconds}초 소요" | success trace |
| "배포 실패 — {reason 자연어}" | error trace |
| "두 작업이 같은 위치를 변경했어요. 어느 버전을 살릴까요?" | conflict (semantic) 모달 |
| "지금 Vercel 응답이 없어요. 잠시 후 다시 시도해주세요." | Vercel 5xx / down |
| "Vercel 연결이 끊겼어요. [다시 연결]" | token 401 |

### 1.3 노출 금지 어휘 (R2 §1.2 숨김어 enum 정합)

`branch` / `commit` / `merge` / `worktree` / `push` / `pull` / `staging` /
`production` / `rebase` / `cherry-pick` / `squash` — UI 텍스트 (한/영) 어디서도
노출 X. 예외 — `conflict` 는 dev mode 에서 영문 hint OK (R2 §4.1.1 정합, 한글
모드는 "두 작업이 같은 위치를 변경했어요" 대화체).

### 1.4 R2 묶음에서의 위치 (재인용)

```
T-P4-024 (json schema) ← land 됨
   │
   ▼
T-P4-020 (worktree)  ← land 됨
   │
   ▼
T-P4-021 (autosave) ← land 됨
   │
   ▼
T-P4-022 (deploy gate) ← 본 plan (R2 진입 순서 4번째, L5)
   │
   ▼
T-P4-023 (history)
```

---

## §2 PO trigger 판단 규칙 (OQ-3 정합)

### §2.1 trigger 조건

PO 가 turn 종료 시 다음 조건 **모두** 만족 시 DeployConfirmModal trigger:

| 조건 | 출처 | 판정 source |
|---|---|---|
| `versions[active].tickets[]` 중 `status === "done"` + `qa_status === "passed"` ≥ 1 | T-P4-065 sub-f / T-P4-086 frontmatter | ticket md scan |
| 모든 dependency ticket land 완료 (frontmatter `status === "done"` + `qa_status === "passed"`) | ticket frontmatter `deps:` (현재 미정형 — §13 OQ-T022-? 후속) | (MVP) 사용자가 dependency 누락 시점에 chat 으로 알림. 자동 검사 X |
| 현재 모달 / 다른 deploy 진행 X | `useBackgroundTasks` 의 `deploy` slice empty | renderer store |
| GitHub OAuth + remote 설정 완료 (T-P4-014) | `project:health` IPC | electron main |
| Vercel API token 존재 (Settings) | `settings:getVercelToken` | electron main |

### §2.2 trigger 시점

- PO turn 결과 streaming 종료 직후 (T-P4-079 의 bubble auto-done 정합).
- `tickets:changed` event (T-P4-065 watcher) 후 200ms debounce.
- 사용자 직접 ticket status 수정 시 동일 path.
- 단 사용자가 이미 chat 에 메시지 입력 중이면 (textarea non-empty) 모달 trigger
  X — 사용자 입력 흐름 우선 (§ 1.5.5 Escape 정합, 사용자 행위 가로채기 X).

### §2.3 모달 dismiss 후 재 trigger

- 사용자가 "나중에" 선택 → 현재 active version 의 동일 ticket set 으로 30 분간
  재 trigger X. 30 분 후 다시 PO turn 시점에 trigger.
- 새 ticket 이 done + qa pass 로 추가되면 즉시 재 trigger (sets 가 다른 set).
- 사용자가 modal backdrop click / Esc → "나중에" 와 동등.

### §2.4 dev mode / planner mode 어휘 split (T-P4-084 정합)

- **planner mode** (default):
  - title: "다음 작업들 준비됐어요. 배포 시작할까요?"
  - body intro: "지금 ticket {N}개가 마무리됐어요. 배포해두면 다른 사람이
    바로 사용할 수 있어요."
- **dev mode**:
  - title: "Deploy now? ({N} tickets ready)"
  - body intro: "Tickets ready: {ticket-ids}. Push + PR + Vercel deploy."
  - dev mode 만 ticket-id (T-P4-NNN) 가시.

---

## §3 [배포 준비] step (stage 1)

### §3.1 backend 동작

1. ticket worktree (T-P4-020 의 `<projectDir>/.productune/worktrees/<ticket-id>/`)
   안 자동저장 commit 들이 이미 존재. 본 step 은 그 worktree branch (`feature/T-NNN-<slug>`
   또는 `fix/T-NNN-<slug>`) 를 **origin 에 push**.
2. push 실패 시 (network / auth) → ConflictResolveModal X. **친절 에러 toast +
   [다시 시도] CTA** (§ 1.5.4 Feedback 정합).
3. `useStagingEnv === true` (T-P4-024 schema, MVP default false) → Vercel
   preview deployment 매핑. MVP 는 schema 만 검사 + 실제 매핑 동작은 §3.4
   참조.
4. push success → stage 2 자동 진행 (사용자 추가 confirm X — DeployConfirmModal
   의 [지금 배포] 클릭이 두 stage 모두 cover).

### §3.2 사용자 가시 trace

- 시작 시점: chat inline "{N}개 작업을 배포 준비 중..." (T-P4-079 multi-bubble 의
  `[system]` bubble).
- 성공 시점: chat inline "준비 완료" (이전 bubble auto-done + 새 bubble).
- 실패 시점: chat inline "준비 실패 — {reason 자연어}". 동시에 deploy tab 의
  status badge 가 ERROR.

### §3.3 외부 어휘 노출 X

- `push` / `origin` / `remote` / `branch` 모두 노출 X.
- dev mode 에서도 trace 한글 / 영문 어느 쪽도 위 어휘 미노출. 단 deploy tab 의
  logs section (CLI raw output) 은 영문 그대로 — 사용자가 진단 의도로 펼친 영역
  이므로 hidden 어휘 정책의 예외 (R2 §1.2 와 동일 — terminal raw 는 별개).

### §3.4 `useStagingEnv` 매핑 (MVP scope)

- T-P4-024 schema 의 `useStagingEnv` 는 MVP default `false`. 본 plan 의 MVP =
  schema 검사만 + Vercel preview deployment 매핑 자체는 stage 2 의 Vercel REST
  API `target: "staging"` 옵션 노출 영역 (구체 매핑은 Phase 5 candidate).
- MVP 동작 = `useStagingEnv === true` 이어도 stage 1 의 actual side effect 는
  push 만. Vercel preview deployment 는 T-P4-014 의 GitHub webhook 으로 자동
  생성 (Vercel 측 설정에 의존). MVP scope 안에 별도 매핑 X.
- Phase 5 candidate — `useStagingEnv === true` 시 stage 1 끝에 Vercel preview
  URL 명시 노출 + 사용자 검토 후 stage 2 진입.

---

## §4 [배포하기] step (stage 2)

### §4.1 backend 동작 — 순차

1. **PR 자동 생성** (GitHub REST API `POST /repos/{owner}/{repo}/pulls`).
   - source = stage 1 의 push 된 ticket branch.
   - target = `main` (T-P4-024 schema 의 `protectedBranches` 첫 원소).
   - title = ticket frontmatter `title` 또는 `summary`. multi-ticket 시
     `"{N} tickets: {first-ticket-title} 외 {N-1}건"`.
   - body = ticket Acceptance 표 + Persona Activity 표 요약 (T-P4-022 ticket md
     line 49 정합).
2. **Squash merge** (`PUT /repos/{owner}/{repo}/pulls/{n}/merge` `merge_method: "squash"`).
   - 자동저장 N개 commit → production 에 ticket-id summary 1줄.
   - sha 보존 X (T-P4-023 history 가 PR number + ticket-id 로 reconcile).
3. **Vercel production deploy** (`POST https://api.vercel.com/v13/deployments`).
   - body: `{ name, gitSource: { type: 'github', ref: 'main' }, target: 'production', projectSettings }`.
   - bearer token = Settings 의 Vercel token (T-P4-048).
   - response = `{ id, url, readyState }`.
4. **status poll** — 5 초 interval, max 5 분.
5. **READY 상태 도달 시 deploy 완료**. URL 노출 (deploy tab + chat inline).

### §4.2 사용자 가시 trace (T-P4-079 multi-bubble 분리)

순차 chat inline bubble (각 envelope 단위 새 bubble):

1. "배포 시작" — stage 2 시작.
2. "변경사항 정리 중..." — PR 생성 + squash merge.
3. "Vercel 빌드 중..." — Vercel deploy 시작 (state = BUILDING).
4. "배포 완료 — {minutes}분 {seconds}초 소요" — state = READY.
   - + URL 카드: "이 주소에서 확인할 수 있어요: https://..."

### §4.3 실패 분기

| 시점 | 원인 | trace | 대응 CTA |
|---|---|---|---|
| PR 생성 | GitHub API 4xx / 5xx | "변경사항 정리 중 문제가 생겼어요" | [다시 시도] / [Settings 열기] / [도움말] |
| Squash merge | conflict (= semantic) | (별 모달) ConflictResolveModal | §4.5 참조 |
| Squash merge | conflict (= trivial) | PO 자율 처리 (3-way merge) → 사용자에게는 silent | trace 1줄 "자동으로 합쳤어요" |
| Vercel deploy | Vercel REST 4xx (token) | "Vercel 연결이 끊겼어요" | [다시 연결] (Settings 진입) |
| Vercel deploy | Vercel REST 5xx | "지금 Vercel 응답이 없어요. 잠시 후 다시 시도해주세요." | [다시 시도] (지수 backoff 3회) |
| Vercel deploy | state = ERROR | "배포 실패 — {Vercel error message 자연어 wrap}" | [logs 보기] (deploy tab) / [다시 시도] |
| Vercel deploy | 5 분 timeout | "배포가 예상보다 오래 걸려요. Vercel 에서 확인해주세요." | [Vercel 에서 보기] (URL 외부 open) / [계속 기다리기] |

### §4.4 squash merge 정책 (T-P4-022 ticket md line 41 close 정합)

- ROADMAP open question close — squash (사용자 화면 누적 메시지 1개 표시와 정합).
- squash commit message = `"T-NNN: <ticket title>"` + body 에 자동저장 N개 1줄
  summary.
- multi-ticket squash = ticket-id 별 별도 squash commit (= N PR 1줄 squash N 개
  history entry). 단 deploy 자체는 1회 (마지막 squash 후).

### §4.5 conflict hybrid (OQ-1 정합)

#### §4.5.1 trivial conflict — PO 자율 처리

- 정의: 3-way merge 가 git 명령 단독으로 해결 가능. 동일 line 변경 X.
- 동작: PO 가 `git merge --strategy=recursive` 로 자동 해결 + chat trace 1줄
  "자동으로 합쳤어요". 사용자 act 0.
- 실패 시 → semantic conflict 로 escalate (§4.5.2).

#### §4.5.2 semantic conflict — ConflictResolveModal

- 정의: 동일 line 변경 + 자동 해결 불가.
- 모달 컴포넌트 — `ConflictResolveModal` (T-P4-067 modal 패턴 정합):
  - title: "두 작업이 같은 위치를 변경했어요"
  - body: "어느 버전을 살릴까요?"
  - file 별 행 (max 5; 5+ 면 "그리고 N개 더..." truncate):
    - 파일명 (자연어 path basename — 외부 어휘 X)
    - 두 버전 preview (max 3 line, monospace, syntax highlight)
    - radio: [A 버전 살리기] / [B 버전 살리기] / [둘 다 살리기 (수동 편집 필요)]
  - footer CTA: [선택한 대로 진행] (primary, disabled until 모든 행 선택) /
    [배포 취소] (secondary, destructive 톤 X)
  - Esc / backdrop click → "배포 취소" 와 동등 (§13 OQ-T022-5 결정 필요 — 잠정
    designer 권고: deploy abort + state 보존, 다음 trigger 시 동일 ticket set
    재시도 OK)
- dev mode 시 영문 hint OK (모달 본문 그대로 한글, 단 dev mode 만 `conflict` 어휘
  inline 표기 OK — R2 §4.1.1 정합).

### §4.6 trace 와 Persona Activity 표 정합

- 본 ticket impl 의 trace 는 chat 의 system bubble (T-P4-079 정합) — Persona
  Activity 표에는 추가 X (Activity = persona delegate 의 mile-stone, 본 trace 는
  system action).
- 단 deploy 시작 / 완료 / 실패 3 mile-stone 은 ticket md 의 별도 section "Deploy
  Activity" 에 (보강 권고, ticket md scope 영역 — 본 plan §10 후속).

---

## §5 GUI surface — 어디 / 무엇 / 왜

### §5.1 별 [배포 준비] / [배포하기] 버튼 X (OQ-3 reversal 정합)

- ROADMAP line 147 의 이전 spec ("사용자 명시 클릭만 트리거 + 별 버튼") = land
  된 reversal 로 폐기. 본 plan baseline.
- 사용자 시야에서 deploy 진입점 = (a) PO 가 trigger 하는 DeployConfirmModal 만
  + (b) deploy tab 의 [다시 시도] CTA (실패 후) + (c) Project 탭 Versions
  카드의 deploy status badge (가시화 only, 클릭 X — designer 권고 a hybrid).
- 사용자가 직접 "지금 배포해" 라고 chat 에 쓸 수도 있음 (자연어 trigger) — PO 가
  본 plan §2 의 조건 검사 후 동일 모달 띄움. **사용자 의도 100% 명시**.

### §5.2 DeployConfirmModal (신규 컴포넌트)

#### §5.2.1 위치 / trigger

- 위치: WorkspaceShell modal slot (T-P4-067 modal 패턴 정합).
- trigger: PO 가 `state:openDeployModal` IPC 발사 (electron main → renderer).
- close: 사용자 선택 ([지금 배포] / [나중에]) 또는 Esc / backdrop click ("나중에"
  와 동등).

#### §5.2.2 layout

```
┌─ 다음 작업들 준비됐어요. 배포 시작할까요? ────────────┐
│                                                       │
│  • {ticket1 title}                                    │  ← list (max 5; 5+ 면 truncate)
│  • {ticket2 title}                                    │
│  • {ticket3 title}                                    │
│  ... 그리고 {N-3}개 더                                │  (5+ 시)
│                                                       │
│  예상 시간 약 {minutes}분                             │  ← Vercel 평균 빌드 시간 (initial guess = 3분)
│                                                       │
│  ┌──────────────┐  ┌────────────┐                    │
│  │ 지금 배포    │  │ 나중에     │                    │  ← primary / secondary
│  └──────────────┘  └────────────┘                    │
│                                                       │
└───────────────────────────────────────────────────────┘
```

- §1.5.1 Few Things — primary 2개 (지금 배포 / 나중에). 부가 CTA X.
- §1.5.5 Escape — Esc + backdrop click 으로 "나중에" 동등.
- §1.5.4 Feedback — [지금 배포] 클릭 후 즉시 `pdt-spin` 인디케이터 + 모달 자동
  닫힘 + deploy tab open + chat inline trace.

#### §5.2.3 카피 — planner / dev mode

| 영역 | planner | dev |
|---|---|---|
| title | "다음 작업들 준비됐어요. 배포 시작할까요?" | "Deploy now? ({N} tickets ready)" |
| ticket list 행 | `• {title}` | `• [T-NNN] {title}` |
| 예상 시간 | "예상 시간 약 {minutes}분" | "Est. {minutes} min (Vercel avg)" |
| primary | "지금 배포" | "Deploy now" |
| secondary | "나중에" | "Later" |

### §5.3 deploy tab type — T-P4-046 dispatcher 11번째 (신규)

- Main pane split-pane dispatcher (T-P4-046) 에 11번째 type 추가 = `deploy`.
- 진입점:
  - DeployConfirmModal 의 [지금 배포] 클릭 → 자동 open.
  - Project 탭 Versions 카드 deploy status badge 클릭 (배포 진행 중 / 실패
    상태에서) → 동일 deploy tab 으로 focus.
  - Quick Open palette (T-P4-047) 의 `> Deploy` 명령.
- singleton vs multi-instance — §13 OQ-T022-2 결정. designer 권고 — **singleton**.
  동시 여러 deploy = 사용자 부담 ↑ + 실제 use case 거의 0 + Phase 5 candidate.

### §5.4 deploy tab content — §6 참조

### §5.5 ChatPanel inline trace — multi-bubble (T-P4-079 정합)

- 모든 trace 가 system bubble 로 분리. envelope 단위 새 msgId — 이전 bubble 의
  auto-done 처리.
- bubble icon = lucide-react `Rocket` (deploy semantic). idle / progress / success
  / error 4 색 (design system §1 token).

### §5.6 PresenceBar / BackgroundTaskSegment 정합 (T-P4-080 / T-P4-081)

- deploy 진행 중 = useBackgroundTasks store 의 별 slice (`deploy`) 에 task 추가.
- PresenceBar 의 한 칩 ("배포") 가 deploy 진행 동안 working 상태 표시.
- BackgroundTaskSegment hover popup row 표시 — `persona: "deploy"` /
  `description: "{ticket title}..."` / `duration: "..."` / `status: "BUILDING"
  / "READY" / "ERROR"`.
- session restart → deploy task 도 reset (T-P4-076 정합).

---

## §6 deploy tab type 컨텐츠

deploy tab (= T-P4-046 dispatcher 11번째 type) 의 화면 구성. singleton (§5.3
designer 권고).

### §6.1 layout

```
┌─ 배포 진행 상황 ────────────────────────────────────┐
│                                                     │
│  배포 시작 — 2 분 전                                │  ← title + time elapsed
│                                                     │
│  ✓ 변경사항 정리                                    │  ← stage progress (4 step)
│  ◐ Vercel 빌드 중                                   │
│  ◯ 배포 완료                                        │
│                                                     │
│  ────────────────────────────────────────────────  │
│                                                     │
│  ▸ 자세한 로그 보기                                 │  ← collapsed by default
│                                                     │
│                                                     │
│  포함된 작업                                        │  ← ticket list
│    • {ticket1 title}                                │
│    • {ticket2 title}                                │
│                                                     │
│  ────────────────────────────────────────────────  │
│                                                     │
│  환경 변수 (현재 적용)                              │  ← env summary (T-P4-030/031 link)
│    • VITE_API_BASE = 프로덕션                       │
│    • STRIPE_SECRET = (보안)                         │
│    [환경 변수 열기]                                 │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### §6.2 progress (4 step state machine)

| step | label | trigger | icon |
|---|---|---|---|
| 1 | 변경사항 정리 | PR 생성 + squash merge | ✓ done / ◐ progress / ◯ idle |
| 2 | Vercel 빌드 시작 | Vercel deploy POST 응답 + state = QUEUED | 동일 |
| 3 | Vercel 빌드 중 | state = BUILDING | 동일 |
| 4 | 배포 완료 | state = READY | 동일. 완료 시 URL 카드 inline |

state polling = 5초 interval. 실패 (4xx/5xx) / timeout / ERROR / CANCELED 모두
state 표시 + CTA (§4.3 참조).

### §6.3 logs section (collapsed by default)

- 클릭 시 expand → CLI logs stream (§9 참조).
- raw output (ANSI color preserved, monospace).
- max 1000 line buffer (renderer 메모리 부담 줄임). 1000 line 초과 시 oldest
  truncate + "이전 로그 N줄 생략" 표시.
- copy button — 전체 logs to clipboard.

### §6.4 ticket list

- DeployConfirmModal 에서 보여준 ticket set 그대로 (deploy 시작 시점에 snapshot).
- 클릭 시 ticket-review tab open (T-P4-043).
- max 10 표시; 10+ 면 truncate.

### §6.5 환경 변수 view (Settings link)

- 현재 deploy 에 적용된 env 의 요약 (T-P4-030 / T-P4-031 의 env table 의 축약
  card).
- secret 은 항상 `(보안)` masked.
- [환경 변수 열기] 클릭 → Settings Environment sub-tab open (T-P4-048 ticket
  영역).

### §6.6 실패 시 CTA

- progress step 의 실패 step 옆 빨강 dot + 그 행 자체에 [다시 시도] inline CTA.
- footer 에 [배포 취소] (deploy 중) / [rollback] (Phase 5 lock, MVP 는 disable +
  tooltip "추후 지원 예정").
- [logs 보기] / [Vercel 에서 보기] / [도움말] secondary CTA.

### §6.7 완료 시 view

- progress 4 step 모두 ✓.
- URL 카드 (primary) — 클릭 시 외부 브라우저 open.
- 소요 시간 표시 ("{minutes}분 {seconds}초 소요").
- 다음 deploy 진입 전까지 tab 유지. 사용자가 tab close 시점에 해당 deploy 의
  cache flush + 다음 deploy 시 새 tab 자동 open.

---

## §7 PR mechanism

### §7.1 GitHub REST API + OAuth (T-P4-014 재사용)

- 기존 `packages/core/src/github.ts` 의 OAuth + REST client 재사용.
- PR 생성:
  ```ts
  await github.pulls.create({
    owner, repo,
    head: featureBranchName,   // T-P4-020 namer 결과
    base: protectedBranches[0], // T-P4-024 의 derive 결과 (default = "main")
    title: prTitle,             // §4.1 spec
    body: prBody,               // ticket Acceptance + Persona Activity
  });
  ```
- Squash merge:
  ```ts
  await github.pulls.merge({
    owner, repo,
    pull_number: prNumber,
    merge_method: "squash",
    commit_title: `T-NNN: <ticket title>`,
    commit_message: autosaveSummary,
  });
  ```

### §7.2 자동 PR title / body 합성

- title = ticket frontmatter `title`. 단 multi-ticket 시 `"{N} tickets: {first} 외 {N-1}건"`.
- body =
  ```
  ## Tickets
  - T-NNN: {title1}
  - T-NNN+1: {title2}

  ## Acceptance (from tickets)
  - [x] {ticket1 acceptance 1}
  - [x] {ticket1 acceptance 2}
  - [x] {ticket2 acceptance 1}

  ## Persona Activity
  | When | Persona | Result |
  |---|---|---|
  | ... | ... | ... |

  ---
  *Auto-generated by productune. Tickets: {ticket-ids}.*
  ```

### §7.3 PR auto-merge — OQ-T022-4 영역

- §13 OQ-T022-4 — auto-merge (사용자 confirm 후) vs draft PR (사용자가 GitHub UI
  에서 merge).
- designer 권고 — **auto-merge**. draft PR 옵션 = 사용자가 GitHub UI 노출 = git
  무노출 정책 위반. squash merge 정책 (T-P4-022 ticket md line 41 close) 도
  auto-merge 의 결과.
- single PR 의 race condition (사용자 OK 와 동시에 다른 user 가 main 에 push) →
  GitHub API 의 conflict response = "변경사항 정리" 실패 trace + ConflictResolveModal
  (§4.5).

### §7.4 PR body 의 어휘 정책

- PR body 는 GitHub UI 에서만 보이는 외부 surface — 본 plan §1.3 의 숨김어 enum
  적용 대상 X. 영문 어휘 (PR / merge / squash / commit) 자유.
- 단 ticket title / Acceptance 본문 = 사용자 작성 한글이 그대로 PR body 에 들어감
  — 별도 변환 X.

---

## §8 Vercel REST API 통합

### §8.1 module 위치

- `packages/core/src/deploy/vercel.ts` (신규) — REST API client + state machine.
- IPC handler: `packages/gui/electron/ipc/deploy.ts` (신규).
- renderer store: `packages/gui/src/store/useDeploy.ts` (신규).
- 본 module 은 R8 의 `DeployProvider` 인터페이스 prototype — Round 8 에서 본
  module 을 abstract base 로 refactor (T-P4-080/081 R8).

### §8.2 API 시그니처

```ts
// packages/core/src/deploy/vercel.ts
export interface VercelDeployOptions {
  projectId: string;       // Vercel project ID (Settings 에서 link)
  gitRef: string;          // PR merge 후 main HEAD sha
  target: 'production' | 'preview';
  token: string;           // Settings 의 Vercel API token
}

export interface VercelDeployment {
  id: string;
  url: string;
  state: 'QUEUED' | 'BUILDING' | 'READY' | 'ERROR' | 'CANCELED';
  createdAt: number;
  readyAt?: number;
  errorMessage?: string;
}

export async function createDeployment(opts: VercelDeployOptions): Promise<VercelDeployment>;
export async function getDeploymentState(id: string, token: string): Promise<VercelDeployment>;
// cancelDeployment 는 Phase 5 lock — MVP scope X (§6.6 의 [배포 취소] CTA 도 MVP disable).
```

### §8.3 Vercel API token 입력 위치 (§13 OQ-T022-1 영역)

- §13 OQ-T022-1 — Settings Environment sub-tab vs 별 Vercel sub-tab.
- designer 권고 — **별 Settings sub-tab "외부 연결" (또는 "Integrations")**.
  Environment sub-tab 은 project env (T-P4-030) 의 영역. Vercel / GitHub /
  Supabase 등 외부 서비스 token 은 단일 sub-tab "외부 연결" 에 모음 (§1.5.3
  Predictability — 동일 패턴 그룹 위치).
- T-P4-048 의 sub-tab list 에 "외부 연결" 추가 — 본 plan land 후 별 PO task.
- Vercel token field — masked input + [테스트 연결] CTA + 마지막 검증 시각 표시.

### §8.4 인증 실패 처리

- 401 (token 만료 / 무효) → "Vercel 연결이 끊겼어요. [다시 연결]" inline banner
  + Settings 진입 link.
- 403 (권한 부족) → "이 Vercel 계정에 배포 권한이 없어요. [Vercel 에서 확인]"
  외부 link.
- 사용자 token 미입력 상태에서 deploy trigger → DeployConfirmModal 띄우기 전
  PO 가 사전 검사 (§2.1) — 사전 차단 + 사용자에게 "Vercel 연결이 필요해요.
  [지금 연결]" 모달.

### §8.5 network 실패 retry

- 3xx redirect 자동 follow (axios / fetch default).
- 4xx (auth 제외) → 즉시 사용자 trace + 재시도 X.
- 5xx → 지수 backoff (1s / 2s / 4s) 3회. 모두 실패 시 사용자 trace.
- network down (offline) → "지금 인터넷 연결이 끊긴 것 같아요. 다시 시도해주세요."

### §8.6 status polling timeout

- 5초 interval, 5분 max (60 polls).
- 5분 timeout → "배포가 예상보다 오래 걸려요. Vercel 에서 확인해주세요."
- [Vercel 에서 보기] (외부 link) / [계속 기다리기] (10분으로 extend) / [배포
  포기] (state = CANCELED → 이후 CleanUp).

---

## §9 CLI logs 통합

### §9.1 spawn 정책

- `vercel logs <deployment-url> --follow` spawn (`child_process.spawn`).
- node-pty 의존 X — log 는 단방향 stream, PTY (interactive) 불필요. 단 ANSI
  color 보존 필요 → `child_process` 의 stdout pipe 로 충분.
- spawn 실패 (vercel CLI 미설치) → silent fallback. deploy tab logs section 에
  "자세한 로그 보기 (CLI 미설치)" 표시 + [설치 안내] CTA (Vercel docs link).
- vercel CLI 미설치 = MVP 의 graceful path. 사용자 가시 어휘 — "자세한 로그".
  CLI 어휘 X.

### §9.2 stream IPC

- main → renderer chunked push (250ms throttle 또는 1KB chunk).
- renderer store (`useDeploy`) 의 `logs` slice 에 append.
- deploy tab 의 logs section 이 store subscribe.

### §9.3 ANSI color 처리

- T-P4-067 패턴 정합 — `ansi-to-html` 또는 `@xterm/headless` 의 ANSI parser 재사용.
- monospace font (design-system §2.3).

### §9.4 cleanup

- deploy 완료 (state = READY) 또는 실패 (state = ERROR) 시 spawn 종료.
- deploy tab close 시점에 spawn 강제 종료 (`SIGTERM` 후 1s 뒤 `SIGKILL`).
- 앱 종료 시 모든 spawn cleanup (Electron `before-quit` event).

### §9.5 외부 어휘 정책

- raw logs = 사용자가 진단 의도로 펼친 영역 — hidden 어휘 정책 예외 (§3.3 정합).
- logs 헤더 UI 만 한글 ("자세한 로그", "복사", "전체 보기").

---

## §10 외부 어휘 정책 (R2 §1.2 정합 재확인)

### §10.1 사용자 노출 어휘 enum (본 plan 한정)

```ts
// packages/gui/src/locales/ko.json 의 deploy section
const deployVocab = {
  modal: {
    title: "다음 작업들 준비됐어요. 배포 시작할까요?",
    body: "지금 ticket {count}개가 마무리됐어요. 배포해두면 다른 사람이 바로 사용할 수 있어요.",
    primary: "지금 배포",
    secondary: "나중에",
  },
  stage1: {
    progress: "{count}개 작업을 배포 준비 중...",
    success: "준비 완료",
    failure: "준비 실패 — {reason}",
  },
  stage2: {
    start: "배포 시작",
    pr: "변경사항 정리 중...",
    build: "Vercel 빌드 중...",
    ready: "배포 완료 — {minutes}분 {seconds}초 소요",
    urlIntro: "이 주소에서 확인할 수 있어요",
  },
  failure: {
    prError: "변경사항 정리 중 문제가 생겼어요",
    vercelToken: "Vercel 연결이 끊겼어요",
    vercelDown: "지금 Vercel 응답이 없어요. 잠시 후 다시 시도해주세요.",
    vercelError: "배포 실패 — {message}",
    timeout: "배포가 예상보다 오래 걸려요. Vercel 에서 확인해주세요.",
  },
  conflict: {
    title: "두 작업이 같은 위치를 변경했어요",
    body: "어느 버전을 살릴까요?",
    optionA: "A 버전 살리기",
    optionB: "B 버전 살리기",
    optionBoth: "둘 다 살리기 (수동 편집 필요)",
    cta: "선택한 대로 진행",
    abort: "배포 취소",
  },
};
```

### §10.2 노출 금지 (재확인)

`push` / `pull` / `merge` / `squash` / `commit` / `branch` / `worktree` /
`production` / `staging` / `rebase` / `cherry-pick` — 모든 UI 텍스트에서 미노출.

### §10.3 dev mode 어휘 (T-P4-084 정합)

- dev mode = `~/.productune/settings.json` 의 `mode === "developer"`.
- dev mode 만 hidden 어휘 영문 inline hint OK.
- 예시:
  - planner: "변경사항 정리 중..."
  - dev: "Creating PR + squash merge..."
- 단 modal 본문 (DeployConfirmModal title / ConflictResolveModal title) 은
  대화체 유지 — dev mode 도 한글 본문. dev mode 차이 = inline trace + ticket-id
  가시 + raw log 항상 펼침 default.

### §10.4 lint 정합 (T-P4-057 후속)

- 본 plan 의 i18n key (`deployVocab`) baseline.
- R2 architecture plan §7.1 의 follow-up — T-P4-057 linter 의 dictionary 에
  숨김어 enum 추가 (별 ticket 후보, 본 plan 영역 X).

---

## §11 회귀 / 정합

### §11.1 T-P4-020 worktree 정합

- ticket worktree 가 stage 1 의 push source. 본 plan 의 worktree path 가정 =
  T-P4-020 의 `<projectDir>/.productune/worktrees/<ticket-id>/` 정합.
- branch namer = T-P4-024 schema 의 `featureBranchPrefix` / `fixBranchPrefix` 로
  자동 결정. 본 plan 안 별도 namer 로직 X — T-P4-020 spec 그대로 inherit.

### §11.2 T-P4-021 autosave 정합

- deploy 직전 (stage 1 push 전) 에 ticket frontmatter `status` / `qa_status` 가
  바뀐 상태 — 본 plan 시점에는 이미 T-P4-021 의 autosave 가 commit 완료. 추가
  autosave trigger X.
- race condition — autosave 진행 중 deploy trigger 시 deploy 가 200ms wait +
  autosave 완료 후 push 시작. (구체 race 처리는 §13 OQ-T022-? 영역 — 현재
  designer 권고: T-P4-021 의 watcher 가 settle 한 후 deploy 진입.)
- 본 plan 의 stage 1 push 가 자동저장 commit N 개를 origin 으로 보냄 — 본 plan
  안에서 새 commit 생성 X.

### §11.3 T-P4-024 git-rules 정합

- `protectedBranches[0]` = stage 2 PR base.
- `useStagingEnv` = stage 1 의 Vercel preview mapping toggle (§3.4 — MVP scope
  schema 검사 only).
- `featureBranchPrefix` / `fixBranchPrefix` = stage 1 의 head branch namer
  source.
- T-P4-024 의 `git-rules:changed` broadcast event subscribe — deploy 진행 중에
  사용자가 rule 변경 시 다음 deploy 부터 반영 (현재 deploy 는 snapshot 정책).

### §11.4 T-P4-046 dispatcher 정합

- deploy tab type 신규 추가 — dispatcher 의 11번째 type.
- T-P4-088 의 listener wire 패턴 그대로 (Settings env / models 와 동일).
- WorkspaceShell useEffect 의 dispatcher case 에 `deploy` 추가.

### §11.5 T-P4-067 modal + inline trace 정합

- DeployConfirmModal + ConflictResolveModal 모두 T-P4-067 의 modal 패턴 사용 —
  Esc 닫기 + busy spinner + backdrop click + non-destructive 분류.
- chat inline trace = T-P4-067 의 trace 패턴 그대로.

### §11.6 T-P4-079 multi-bubble 정합

- 모든 deploy trace 가 system bubble 로 분리 — envelope 단위 새 msgId.
- 이전 bubble auto-done.

### §11.7 T-P4-080 / T-P4-081 PresenceBar 정합

- deploy 도 background task — useBackgroundTasks store 의 별 slice (`deploy`).
- PresenceBar 의 한 칩 ("배포") 가 deploy 진행 중 working.
- BackgroundTaskSegment hover popup row.

### §11.8 회귀 risk

| 영역 | risk | 대응 |
|---|---|---|
| GitHub OAuth 미완료 | T-P4-014 미완료 사용자 → PR 생성 실패 | §2.1 PO 사전 검사 + 모달 띄우기 전 "먼저 GitHub 에 연결하기" CTA |
| Vercel API token 미입력 | 사용자가 Settings 에서 token 미입력 → deploy 실패 | §8.4 사전 차단 + Settings 진입 모달 |
| vercel CLI 미설치 | spawn 실패 | §9.1 graceful fallback — logs section "CLI 미설치" + 설치 안내 |
| 동시 multi deploy | singleton 정책 위반 | §5.3 singleton enforce + 사용자 trigger 시 "이미 배포 중이에요" 모달 |
| Vercel rate-limit | API 429 | §8.5 backoff retry + 사용자 trace |
| network down | offline 상태 | §8.5 network 검사 + 사용자 trace |
| 사용자 token 누출 | Settings raw 노출 | §8.3 masked input + log 출력 시 token 자동 redact |
| race autosave ↔ deploy | autosave 진행 중 deploy trigger | §11.2 — 200ms wait + autosave settle |
| 외부 IDE 직접 push | 사용자가 외부에서 main 직접 push | R2 §4.4 OQ-5 = MVP 알림 only. deploy tab 의 status badge "외부 변경 감지" + 사용자 안내 |
| logs 메모리 누수 | spawn 정리 누락 | §9.4 cleanup hook |

---

## §12 design-system §1.5 self-check

### §12.1 §1.5.1 Few Things Per Page

- DeployConfirmModal = primary 2개 ([지금 배포] / [나중에]). ✅
- ConflictResolveModal = primary 1개 ([선택한 대로 진행]) + secondary 1개 ([배포
  취소]). ✅
- deploy tab = 4 progress step + collapsed logs + ticket list + env summary.
  primary CTA = max 1 (실패 시 [다시 시도]). ✅
- 별 [배포 준비] / [배포하기] 버튼 X = ROADMAP reversal 결과로 사용자 시야 깔끔.
  ✅

### §12.2 §1.5.2 Familiar + 점진적 정보

- Modal / progress step / logs collapse / inline trace = 표준 패턴 4종. 친숙. ✅
- 사용자 첫 deploy = onboarding 안내 1회 + 이후 자동 trigger. progressive
  disclosure. ✅
- conflict 모달은 발생 시점에만 노출 (숨김). ✅
- logs collapsed by default — 사용자가 펼친 의도일 때만 raw 표시. ✅

### §12.3 §1.5.3 Predictability

- 모든 trace = 같은 chat inline location + 같은 token (system bubble + Rocket
  icon). ✅
- 모든 실패 = 같은 위치 (deploy tab + chat) + 같은 CTA pattern ([다시 시도] /
  [logs] / [도움말]). ✅
- 진행 중 / 완료 / 실패 = `--health-progress` / `--health-success` /
  `--health-error` 토큰 일관. ✅
- DeployConfirmModal 의 "나중에" 와 Esc / backdrop click 동등 — 사용자 학습
  비용 ↓. ✅

### §12.4 §1.5.4 Feedback

- [지금 배포] 클릭 = 즉시 `pdt-spin` + modal 자동 닫힘 + deploy tab open. ✅
- stage 1 / stage 2 / 각 sub-step = chat bubble 분리 + deploy tab progress 동기.
  ✅
- 실패 = inline trace + deploy tab badge + sound (선택 — §13 OQ-T022-? 영역,
  사용자 호불호 가능). designer 권고: sound X (visual only) — 작업 중 방해 ↓.
- conflict 모달 = 사용자 결정 즉시 trace 진행. ✅
- 완료 = URL 카드 + 소요 시간 명시. ✅

### §12.5 §1.5.5 Escape

- DeployConfirmModal Esc / backdrop = "나중에" 동등 (non-destructive). ✅
- ConflictResolveModal Esc / backdrop = "배포 취소" 동등 (deploy abort + state
  보존, 재시도 가능 — §13 OQ-T022-5 결정 필요).
- deploy 진행 중 = [배포 취소] CTA (Vercel deploy 취소 API). 단 squash merge
  이후는 사용자 불가 (사용자에게 명시: "이미 합쳐졌어요. 되돌리려면 새 작업이
  필요해요"). ✅
- 사용자가 deploy tab close = spawn cleanup + 다음 trigger 시 새 tab. ✅
- Vercel timeout 시 [계속 기다리기] / [배포 포기] 선택권. ✅

### §12.6 종합

5 sub-rule violation 없음. 가장 부담스러운 부분 = ConflictResolveModal 의
"배포 취소" 후 재시도 path — §13 OQ-T022-5 결정 후 inline stamp 필요. 현재
designer 잠정 권고 = deploy abort + state 보존 + 다음 trigger 시 동일 ticket
set 재시도 가능 (사용자에게 deploy tab 의 "지난 시도" badge 노출).

---

## §13 Open Questions (T-P4-022 별 — 사용자 결정 받기)

본 plan land 후 사용자 결정 받아 §4 / §5 / §6 / §8 / §11 / §12 에 인라인 stamp.

### OQ-T022-1. Vercel API token 저장 위치

- **(a)** Settings Environment sub-tab 안 (project env 와 동일 group)
- **(b)** 별 Settings sub-tab "외부 연결" / "Integrations" — Vercel / GitHub /
  Supabase 등 외부 서비스 token 모음
- **(c) designer 권고** — **(b) 별 sub-tab "외부 연결"**. Environment sub-tab
  = project env (T-P4-030) 영역. 외부 service token 은 별도 그룹 = §1.5.3
  Predictability 정합 (동일 패턴 그룹 위치). T-P4-048 sub-tab list 에 "외부
  연결" 추가 (별 PO task).

### OQ-T022-2. deploy tab type singleton vs multi-instance

- **(a) singleton** — 한 번에 하나의 deploy 만. 진행 중 추가 trigger = 모달
  "이미 배포 중이에요" + 현재 deploy 완료 대기 안내.
- **(b) multi-instance** — 동시 여러 deploy tab. ticket set 별 분리.
- **(c) designer 권고** — **(a) singleton**. 사용자 부담 ↓ + 실제 use case (동시
  여러 deploy) 거의 0 + Phase 5 candidate. multi-instance 는 회복 시점 사용자
  결정 복잡 (어느 deploy 가 우선? rollback 시 다른 deploy 영향?).

### OQ-T022-3. 실패 시 rollback 정책

- **(a) automatic** — 가장 최근 READY 상태 deployment 로 즉시 promote (Vercel
  REST API `POST /v13/aliases`). 사용자 silent.
- **(b) 사용자 명시** — 실패 시 [rollback] CTA 노출 + 사용자 confirm.
- **(c) MVP X — Phase 5 lock** — rollback 자체 MVP scope 외. 실패 시 사용자에게
  "이전 버전이 계속 동작 중이에요" 안내 + 새 작업 ticket 으로 재배포 안내.
- **(d) designer 권고** — **(c) MVP X**. Vercel 의 자동 promote 정책 = 빌드
  실패 시 새 deployment 가 production alias 잡지 못함 = 이전 READY 가 계속
  운영. 추가 rollback 불필요. Phase 5 에서 "특정 시점으로 되돌리기" 별 ticket.

### OQ-T022-4. PR mechanism — auto-merge vs draft

- **(a) auto-merge** — 사용자 confirm 후 자동 squash merge. GitHub UI 진입 X.
- **(b) draft PR** — PR 만 생성, 사용자가 GitHub UI 에서 merge.
- **(c) designer 권고** — **(a) auto-merge**. draft = 사용자가 GitHub UI 진입
  = git 무노출 정책 위반. squash merge 자동화는 ROADMAP open question close
  결정 (T-P4-022 ticket md line 41). draft PR 옵션은 Phase 5 candidate
  (advanced user 의 코드 리뷰 의무화 use case).

### OQ-T022-5. ConflictResolveModal 의 fallback — 사용자 선택 X 시

- **(a) deploy abort** — 사용자가 Esc / backdrop / [배포 취소] 시 deploy 전체
  abort + state 보존 + 다음 trigger 시 재시도 가능. 자동 conflict 해결 X.
- **(b) timeout 후 자동 한쪽 선택** — 5분 timeout 후 base (main) 쪽 자동 선택
  + 사용자 trace 알림.
- **(c) designer 권고** — **(a) deploy abort + state 보존**. 사용자 결정 회피
  X (§1.5.4 Feedback — 사용자 결정 강제). 자동 한쪽 선택 = 사용자 의도 무시
  + 코드 누락 risk. abort 후 사용자가 chat 으로 "다시 배포해" trigger 시 동일
  ticket set 으로 재시도. 이전 시도의 conflict state 는 deploy tab "지난 시도"
  badge 로 가시화.

### Open question resolution flow

- 본 plan land + ticket md acceptance 보강 시 사용자 결정 받기.
- 결정 후 본 §13 inline stamp + status `draft` → `decided`.
- 결정 영향 영역 (§4 / §5 / §6 / §8 / §11 / §12) 인라인 update.

---

## §14 Implementation 분해 (dev 임플 분할 권고)

본 ticket = L5 (가장 복잡). dev 임플 분할 권고. 단일 PR 보다 3 단계 PR sequence
권장.

### §14.1 sub-component 매핑

| sub | 영역 | 산출물 | 의존 | 권장 PR phase |
|---|---|---|---|---|
| sub-a | `packages/core/src/deploy/vercel.ts` REST API client | `createDeployment` / `getDeploymentState` + retry / timeout | T-P4-024 schema | 1차 |
| sub-b | `packages/core/src/deploy/po-trigger.ts` PO 자동 trigger 판단 | §2 의 조건 검사 + debounce | T-P4-065 watcher, T-P4-086 frontmatter | 2차 |
| sub-c | IPC + preload bridge | `state:openDeployModal` / `deploy:start` / `deploy:status` / `deploy:logs` / `deploy:cancel` | sub-a | 1차 |
| sub-d | DeployConfirmModal | §5.2 layout + i18n + dev/planner mode 분기 | sub-c | 1차 |
| sub-e | deploy tab type (T-P4-046 dispatcher 11번째) | §6 layout + state machine + listener wire | T-P4-046, T-P4-088 패턴 | 2차 |
| sub-f | CLI logs stream | §9 spawn / IPC / cleanup | sub-e | 2차 |
| sub-g | ConflictResolveModal (semantic) | §4.5.2 layout + i18n | sub-c | 3차 |
| sub-h | PR auto-merge mechanism | §7 GitHub REST API + squash 정책 | T-P4-014 OAuth | 3차 |
| sub-i | useDeploy store + PresenceBar / BackgroundTaskSegment slice | §5.6 정합 | T-P4-080 / T-P4-081 | 2차 |

### §14.2 PR phase 별 land 가능 범위

- **1차 PR (sub-a / sub-c / sub-d)**: DeployConfirmModal 띄우기 가능. [지금
  배포] 클릭 시 stage 1 push (T-P4-020 의 push API 호출) + stage 2 의 Vercel
  REST API call 직접 진행. deploy tab 없음 — chat inline trace 만. minimum
  viable.
- **2차 PR (sub-b / sub-e / sub-f / sub-i)**: PO 자동 trigger + deploy tab 본격
  화면 + CLI logs + background task 통합. dogfood 가능한 1차 형태.
- **3차 PR (sub-g / sub-h)**: conflict 해결 + PR auto-merge 완전체. 본 ticket
  acceptance 완전 충족.

### §14.3 분할 land 시 ticket md frontmatter

- 본 ticket = 단일 ticket id (T-P4-022). 분할 = git PR 분할 / land 분할.
- ticket md frontmatter 의 `status` = 모든 sub land 후 `done`. 1/2/3차 PR
  진행 중에는 `in-progress`.
- ticket md frontmatter 의 `qa_status` = 3차 PR land 후 QA pass 시 `passed`.
- 1/2/3차 PR sequence = T-P4-022 의 sub 분할 — sub-ticket 발행 X (단일 ticket
  유지). git PR description 에 `Part 1/3 of T-P4-022` 표기.

### §14.4 분할 land 의 정합 risk

- 1차만 land + 2/3차 미land 상태에서 사용자 dogfood = 깨진 상태 (deploy tab 없음
  → 사용자가 deploy 진행 가시화 안 됨). 2/3차 land 까지는 사용자 dogfood X 권고.
- 단 사용자 + 개발자 dogfood (paepyeong) 는 1차 land 직후부터 가능 — 메타
  dogfood 의 첫 deploy 진행 = 1차 PR 후.

---

## §15 Acceptance (ticket md 보강 source)

본 plan 의 §2 / §3 / §4 / §5 / §6 / §7 / §8 / §9 / §10 / §11 / §14 가 T-P4-022
ticket md (`docs/tickets/phase4/T-P4-022.md`) 의 acceptance 보강 source. 별
ticket md 변경은 dev 임플 시점에 (PO 또는 dev 가 acceptance 정밀화) — 본 plan
영역 X.

### §15.1 보강 권고 사항 (ticket md 현재 acceptance vs 본 plan delta)

| ticket md 현재 acceptance | 본 plan 정밀화 |
|---|---|
| "[배포 준비] 버튼 (Option B 활성 시만 노출)" | **deprecated** — §5.1 별 버튼 X. DeployConfirmModal 단일 진입점 |
| "[배포하기] 버튼 (항상 노출)" | **deprecated** — 동일 |
| "PR title = ticket title, body = ticket Acceptance + Persona Activity 표 요약" | §7.2 spec 그대로 + multi-ticket 시 title 합성 정밀화 |
| "사용자 명시 클릭만 트리거. PO turn 안에서 자동 [배포하기] 호출 금지" | **partial reversal** — §2 PO trigger 자동 판단 + 사용자 confirm 으로 OK 만 진행. PO 가 자율 deploy 진행 X (사용자 confirm 필수) — 정책 본질 유지 |
| "Option A (default, `useDevBranch=false`): [배포 준비] hidden" | §3.4 + §11.3 — `useDevBranch` 와 별개로 `useStagingEnv` 가 stage 1 의 Vercel preview 매핑 toggle. MVP 는 schema 검사 only |
| "Option B (`useDevBranch=true`): [배포 준비] visible" | 동일 deprecated — 별 [배포 준비] 버튼 X |
| "conflict / API 실패 / Vercel 빌드 실패 → 사용자 친화 메시지 + 다음 액션 (3개 이하)" | §4.3 + §4.5 + §6.6 — 실패 분기 표 + ConflictResolveModal + deploy tab CTA |
| "사용자 화면에서 PR / branch / merge / squash 어휘 노출 0 (lint 통과)" | §1.3 + §10 어휘 enum + T-P4-057 lint follow-up |

### §15.2 추가 acceptance (ticket md 에 없는 항목)

- [ ] DeployConfirmModal — PO 자동 trigger + 사용자 confirm 으로만 진입. backdrop
  / Esc 동등 "나중에".
- [ ] deploy tab type 신규 (T-P4-046 dispatcher 11번째) — singleton.
- [ ] ConflictResolveModal — semantic conflict 시점에만 노출. dev mode 영문 hint
  OK.
- [ ] Vercel REST API client (`packages/core/src/deploy/vercel.ts`) — token Settings
  연동 + 401 / 5xx / timeout 처리.
- [ ] CLI logs stream — `vercel logs --follow` spawn + IPC + cleanup. CLI 미설치
  시 graceful fallback.
- [ ] PresenceBar / BackgroundTaskSegment slice — deploy 진행 중 가시화.
- [ ] chat inline trace multi-bubble — T-P4-079 정합.
- [ ] PR auto-merge (squash) — GitHub UI 진입 X.
- [ ] rollback CTA = Phase 5 lock — MVP disable + tooltip "추후 지원 예정".

---

## §16 후속

### §16.1 본 plan land 후

1. 사용자 OQ-T022-1 ~ OQ-T022-5 결정 받기 (5 개).
2. 결정 inline stamp + status `draft` → `decided`.
3. ticket md (`docs/tickets/phase4/T-P4-022.md`) acceptance 보강 — 본 plan §15
   delta 기준 (PO 또는 dev 가 정밀화). 또는 dev 임플 시점에 본 plan 을 직접 spec
   으로 사용 (ticket md 보강 skip).
4. dev 위임 — T-P4-022 impl. 1차 PR (sub-a / c / d) → 2차 PR (sub-b / e / f /
   i) → 3차 PR (sub-g / h) sequence.
5. impl 완료 + QA pass 후 R2 마지막 ticket plan (T-P4-023 history) dispatch.

### §16.2 R2 묶음 진행

```
T-P4-024 design plan + impl + QA → land 됨
T-P4-020 design plan + impl + QA → land 됨
T-P4-021 design plan + impl + QA → land 됨
T-P4-022 design plan (본 plan, draft)
   │  사용자 OQ-T022-1~5 confirm + dev impl 1차/2차/3차 + QA
   ▼
T-P4-022 land (R2 deploy gate 완성)
   │
   ▼
T-P4-023 design plan dispatch ← R2 plan §11 의 5번째
   │
   ▼
R2 묶음 close + ROADMAP Round 2 합격 기준 확인
```

### §16.3 별 PO task (본 plan 영역 X)

- T-P4-048 sub-tab list 에 "외부 연결" (Vercel / GitHub token 모음) 추가 — §13
  OQ-T022-1 결정 반영.
- T-P4-046 dispatcher type 정의에 `deploy` 추가 — sub-e 의 dependency.
- T-P4-057 linter dictionary 에 §10.2 숨김어 enum 추가 (별 ticket 후보).
- ticket md (T-P4-022.md) acceptance 보강 — 본 plan §15 기반 + OQ-T022 결정 반영.
- ROADMAP Activity log 1줄 (본 plan land trace).

### §16.4 follow-up ticket 후보 (Phase 5)

- **rollback** — 특정 시점으로 되돌리기 UI. §13 OQ-T022-3 의 (c) 결정 후 Phase 5
  scope.
- **multi-instance deploy tab** — 동시 여러 deploy. §13 OQ-T022-2 의 (c) 결정 후
  Phase 5 scope.
- **외부 IDE 직접 변경 감지 정밀** — R2 §4.4 OQ-5 의 Phase 5 promote.
- **deploy 진행 중 [배포 취소]** — Vercel deploy 취소 API. 현재 §6.6 disable 상태.
- **draft PR option** — advanced user 의 코드 리뷰 의무화 use case. §13 OQ-T022-4
  의 (b) 옵션 promote.

---

## §17 발행 제약

- ticket 발행 X (T-P4-022 는 이미 발행됨).
- ticket md frontmatter 변경 X — 본 plan 안 acceptance 보강 권고는 §15 의 delta
  표로만, ticket md 직접 수정 X.
- ROADMAP append X. (단 land trace 1줄 — designer 가 처리.)
- 본 plan land trace 만 ROADMAP Activity log 1 줄 (designer 가 처리).

---

## §18 Promotion Candidates (annotation — top-level JSON 이 primary)

| tier | target | rationale |
|---|---|---|
| project | `docs/designer/decisions.md` | 본 plan 의 §2 PO trigger + 사용자 confirm 모달 패턴 (= 자동 판단 + 사용자 OK gate) 은 R3+ env push / R8 배포 플랫폼 추상화의 trigger 패턴에 재사용. 1 줄 dated decision 후보 |
| project | `docs/designer/decisions.md` | 본 plan 의 §8 Vercel REST API + §9 CLI logs 보조 hybrid 패턴 (REST 1차 + CLI 보조) 은 R6 외부 서비스 (Supabase / Stripe 등) 통합의 reference 패턴. 1 줄 dated decision 후보 |
| work-note | `docs/designer/R2-T-P4-022-deploy-gate-foundation.md` | 본 plan 자체 = work-note 후보 — OQ-T022-1~5 confirm 전 / 후 trace 보존 가치 + L5 ticket 의 3단 PR sequence 권고 |

wiki 후보 borderline — "PO 자동 trigger + 사용자 confirm 모달 패턴 (별 명시 버튼 X
가 §1.5.1 Few Things 정합)" 일반론 가능하나 productune-specific deploy gate
context 가 강함. 일반화 시 wiki 진입 기준 보더라인 → 보류.

---

## 변경 / 갱신 정책

- 사용자 OQ-T022-1 ~ OQ-T022-5 confirm 시 본 §13 인라인 stamp + status `draft`
  → `decided`.
- ticket md acceptance 보강 land 시 본 §15 의 delta 표 → "land 완료" 표시.
- dev impl 1차 / 2차 / 3차 PR land 시 본 plan §14 의 분할 표 update (sub-X land
  완료 표시).
- R2 다음 ticket plan (T-P4-023) dispatch 시 본 plan §16.2 의 흐름표 update.
- Phase 5 follow-up ticket 발행 시 §16.4 의 후보 → ticket id 매핑 stamp.
