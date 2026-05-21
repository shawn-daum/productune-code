---
doc: design-plan
slug: R2-git-abstraction-architecture
owner: pdt-designer
status: decided
phase: 4
version: R2
date: 2026-05-11
oq_resolved_at: 2026-05-11
prd_ref: docs/prd/productune.md (Round 2 line 139–151)
applies_to: T-P4-020 / T-P4-021 / T-P4-022 / T-P4-023 / T-P4-024
deliverable: architecture-overview-only
follow_up: T-P4-024 design plan dispatch (next) → T-P4-020 → 021 → 022 → 023
related_docs:
  - docs/designer/design-system.md
  - docs/artifacts/v0.4/T-P4-024-git-rules-json-foundation.md
  - docs/tickets/v0.4/ROADMAP.md (Round 2)
out_of_scope:
  - 개별 ticket 컴포넌트 spec (별도 dispatch)
  - multi-base branch (Phase 5 lock)
  - 외부 IDE 변경 감지 정책 (Phase 5 candidate)
  - autosaveTriggers 동적 config (Phase 5 lock)
---

# R2 — Git 추상화 layer 통합 architecture design plan

> **이 plan 의 범위**. Round 2 의 5 ticket (T-P4-020 ~ T-P4-024) 를 한 묶음으로 보고
> **상호 의존 / 데이터 모델 / 핵심 UX 결정 / 사용자 OQ** 를 정리한 architecture
> 오버뷰. 개별 ticket 의 컴포넌트 spec / 컴포넌트 wiring 은 ticket 별 design plan
> 에서 다룬다.
>
> **편집 정책**. 본 문서 = design only. 코드 / ticket frontmatter / ROADMAP 변경
> 0. ticket 발행 0. 사용자 OQ 5 개에 답이 모이면 그 결정만 본 문서 §4 / §9 에
> 인라인 반영하고 그 후 ticket 별 dispatch.
>
> **2026-05-11 OQ resolved**. §9 의 5 OQ 모두 사용자 결정 land. §4 의 잠정 권고
> 표시들은 본 update 에서 final stamp 로 격상. PRD line 145 "사용자 명시 클릭만
> 트리거" 정책 부분 reversal 은 별 PO task (본 plan 영역 X — §4.3 안 inline note 만).

---

## §1 Goal

PRD Round 2 의 단일 원칙 — **사용자가 git 개념을 한 번도 보지 않고 작업 ↔ 배포
사이클을 진행** — 을 R2 layer 에서 코드로 구현 가능한 형태로 분해. 5 ticket 이
이 원칙의 5 개 측면 (foundation / 격리 / 자동저장 / 게이트 / 가시화) 을 각자
담당한다.

### 1.1 사용자 가시 어휘 (4 개, PRD 확정)

| 사용자가 보는 어휘 | 백엔드 (사용자에게 노출 X) |
|---|---|
| [자동저장] | ticket worktree 안 자동 commit |
| [배포 준비] | remote push + (옵션) staging env 매핑 |
| [배포하기] | production PR 생성 → squash merge → Vercel deploy |
| [버전 히스토리] | `git log` + ticket-id 그룹핑 + 페르소나 trace |

### 1.2 노출 금지 어휘 (PRD 정책)

`branch` / `commit` / `merge` / `worktree` / `push` / `pull` / `staging` /
`production` / `rebase` / `cherry-pick` / `conflict` / `squash` — 사용자 UI 텍스트
에 직접 노출 금지. 한국어 본문에서도 동일. 보호어 enum (§10 i18n) 의 영문 보존
정책과 충돌 X — 본 어휘들은 보호어가 아니라 **숨김어** 다.

### 1.3 비목표

- 1 ticket = 1 PR 이외의 워크플로 (병합 우선 PR 묶음, stacked PR 등) — Phase 5
- 외부 IDE / `git` 명령으로 사용자가 직접 만든 변경 감지 — Phase 5 candidate
- multi-base 환경 (production 외에 staging/canary 분기) — Phase 5

---

## §2 5 ticket scope 요약

| Ticket | 영역 | 복잡도 | 핵심 산출물 |
|---|---|---|---|
| **T-P4-024** | `git-rules.json` schema + r/w foundation + Settings 패널 backend wire | L3 | json schema + IPC + Settings sub-tab content |
| **T-P4-020** | Ticket worktree 자동 생성 + base 보호 + branch 명명 | L4 | worktree manager + pre-push hook + branch namer |
| **T-P4-021** | [자동저장] = ticket worktree 안 자동 commit | L3 | `post-delegate-autosave` hook + commit msg generator |
| **T-P4-022** | [배포 준비] / [배포하기] 2단계 게이트 + Vercel + PR/merge | L5 | deploy CTA + 2 stage state + Vercel adapter + conflict UX |
| **T-P4-023** | [버전 히스토리] 카드 UI (git log → ticket 그룹핑) | L3 | history card + ticket-id grouping + 페르소나 trace |

복잡도 합산 L18 = R2 = 약 mid-Phase-4 의 한 묶음. T-P4-046 (L5) 와 동급 무게.

---

## §3 진입 순서 (직렬)

```
T-P4-024 (foundation)
   │  git-rules.json schema 결정 + IPC ready
   ▼
T-P4-020 (worktree)
   │  ticket 발행 = worktree 자동 + base 보호
   ▼
T-P4-021 (자동저장)
   │  persona turn 종료 hook + commit msg
   ▼
T-P4-022 (배포 게이트)
   │  push + PR + merge + Vercel adapter
   ▼
T-P4-023 (히스토리)
      git log 파서 + 카드 UI
```

병렬화 가능 슬롯 = 0. T-P4-024 의 `git-rules.json` 이 다른 4 ticket 의 동작
파라미터 (prefix / base 목록 / staging 매핑) 를 결정하기 때문에 직렬화 강제.

---

## §4 핵심 UX 결정 (사용자 OQ 결과 stamp)

### §4.1 외부 어휘 정책

§1.2 의 숨김어 12 개는 UI 텍스트 (한/영) 어디서도 노출 X. 단 **conflict** 는
실제 발생 가능 + 사용자 결정 필요 → 자연어 번역이 필수.

#### dev mode vs planner mode 매핑 (T-P4-084 정합)

| 어휘 | planner mode (default) | dev mode |
|---|---|---|
| commit | "저장된 시점" / "자동저장" | "commit" 영문 OK |
| branch | "작업 공간" / "이 작업" | "branch" 영문 OK |
| merge | "합치기" | "merge" 영문 OK |
| conflict | "두 작업이 같은 위치 변경" (대화체) | "conflict" 영문 OK |
| push / pull | "올리기" / "받기" | "push/pull" 영문 OK |
| worktree | (사용자에게 노출 X — 항상 "이 작업의 작업 공간") | (dev mode 도 노출 X 권고) |

T-P4-084 에서 dev mode 는 **기술 어휘 그대로** 로 결정됨. 단 worktree 는 dev
모드에서도 노출 가치 낮음 → 두 모드 모두 숨김 권고 (designer 권고, dev impl
fallback 자유).

#### §4.1.1 conflict 모달 톤 — **Decided (OQ-1, 2026-05-11): hybrid**

**Trivial conflict 는 PO 자율 / semantic conflict 는 대화체 모달.**

- **Trivial 판정** (PO 자율, 사용자 무노출):
  - whitespace only diff
  - 한 측만 라인 추가 / 삭제 (양측 동시 변경 없음)
  - 자동 처리 시 [버전 히스토리] 에 흔적 + "PO 가 자동 통합" badge

- **Semantic 판정** (대화체 모달, 사용자 결정):
  - 같은 라인 양측 수정 (touched line set 교집합 ≥ 1)
  - 함수 시그니처 변경
  - 모달 카피: "두 작업이 같은 위치를 변경했어요. 어느 버전을 살릴까요?"
  - CTA 3 옵션 cap (§1.5.1 정합): [이번 작업 버전] / [이전 작업 버전] / [둘 다 보기]
  - dev mode 도 동일 카피 (conflict 어휘는 dev mode 만 영문, 모달 본문은 대화체 유지)
  - Esc / backdrop click → "결정 안 함, 나중에" toast (§1.5.5 escape)

판정 heuristic 의 fallback (애매한 경우) = **safe-side semantic 모달** — 즉
의심 시 사용자에게 묻기.

후속 ticket trigger — **conflict resolver modal** 별 컴포넌트 ticket = T-P4-022
안에 sub-component 로 흡수 (별 ticket 발행 X, T-P4-022 spec 에 포함).

---

### §4.2 자동저장 trigger 시점 — **Decided (OQ-2, 2026-05-11): ticket 상태 변경만**

**Designer 권고 (turn done + dedupe) 채택 X — 더 보수적 정책 채택.**

`<project>/docs/tickets/**/T-*.md` 의 frontmatter 변경 시점에만 autosave commit
trigger. 구체 trigger 필드:

- `status` 변경 (e.g. `todo` → `in-progress` → `done`)
- `qa_status` 변경 (e.g. `pending` → `failed` → `passed`)
- `qa_loops` 증가 (정수 증분)

다른 필드 (`started_at`, `completed_at`, `duration_min`, `assignee` 등) 변경은
trigger X — 시간/메타 필드는 noise.

#### Trade-off 재정리 (decided 시점)

| 옵션 | commit 빈도 | 누락 위험 | git log 가독성 | impl 복잡도 |
|---|---|---|---|---|
| ~~a) turn done~~ | high | low | low | low |
| **b) ticket 상태 변경만 (decided)** | low | medium | **high** | medium |
| ~~c) 합집합~~ | highest | lowest | medium | high |
| ~~d) turn done + dedupe (designer 권고)~~ | medium-high | low | low-medium | medium |

#### 누락 위험 대응

- turn 안 산출물 변경 (코드 / docs 편집) 만 발생하고 ticket frontmatter 가 안
  바뀌는 case → 자동저장 trigger X.
- **보강 정책**: ticket 작업 종료 시점 (PO 가 turn close 결정) 에 frontmatter
  의 `qa_status` 또는 `status` 를 명시 update 하도록 강제 — 이미 PO 워크플로
  표준이므로 추가 강제 X (자연 발생).
- **사용자 가시 보강**: ticket-review tab footer 에 "최근 자동저장: N분 전" +
  "저장되지 않은 변경: M 파일" inline label. M > 0 이면 [지금 저장] CTA 활성.

#### commit msg 포맷 (§5.4 와 정합)

`T-NNN [<persona>/turn N] <status 변경 요약>` — 예 `T-P4-020 [pdt-developer/turn 3]
status: in-progress → done`. 페르소나 trace 유지.

---

### §4.3 배포 게이트 트리거 — **Decided (OQ-3, 2026-05-11): PO trigger + 사용자 confirm**

**Designer 권고 (ticket-review footer + deploy tab hybrid) 부분 reversal.**

PRD line 145 의 "사용자 명시 클릭만 트리거, PO 자동 결정 X" 정책은 **부분 reversal**
— PO 가 배포 조건 충족 감지 시 사용자에게 묻고, 사용자 confirm 시 배포 진행.
**별 [배포 준비] / [배포하기] 버튼 X.**

> **PRD patch task** (본 plan 영역 X — PO 가 별 task 로 처리):
> PRD line 145 "사용자 명시 클릭만 트리거, PO 자동 결정 X" → "PO 가 조건 충족
> 감지 시 사용자 confirm 모달. 사용자 명시 OK 시만 트리거." 로 patch.

#### PO 배포 조건 (default rule, `git-rules.json` 확장 영역 — Phase 5 사용자 편집 가능)

```
trigger condition (all of):
  - 1 개 이상의 ticket status === 'done'
  - 해당 ticket(s) qa_status === 'passed'
  - 의존성 ticket 이 있다면 모두 done
  - 마지막 deploy 이후 새 commit ≥ 1
```

조건 충족 시 PO 가 다음 turn 종료 시점에 **확인 모달 자동 노출**:

> "다음 작업들이 배포 준비됐어요.
> - T-P4-020 worktree 자동화
> - T-P4-024 작업 흐름 규칙 패널
>
> 지금 배포 시작할까요?
>
> [지금 배포] / [나중에] / [건너뛰기 (이 묶음 안 배포)]"

#### 모달 UX 결정

- **위치**: main pane 위 dialog overlay — sidebar/footer 분산 X (사용자 act 강제).
- **3 CTA cap** (§1.5.1): primary [지금 배포] / secondary [나중에] / tertiary [건너뛰기].
- **나중에**: dismiss + 60 분 cool-down. 다음 turn close 시 같은 조건이면 재제안.
- **건너뛰기**: 해당 ticket 묶음 별 deploy candidate 에서 영구 제외 (수동 deploy
  로만 cover). [버전 히스토리] 에 "skipped" badge.
- **Esc / backdrop**: [나중에] 와 동일.
- **모달 안 deploy 진행 X** — 사용자 [지금 배포] 클릭 = 별 deploy tab 으로 전환
  (모니터링 화면). 2 stage progress (배포 준비 → 배포하기) 가 deploy tab 안에서
  순차 진행.

#### Versions 카드 / ticket-review tab 위치

- Versions 카드: deploy status badge 만 (CTA 없음 — Designer 잠정 권고 c hybrid 의
  Versions 부분만 유지).
- ticket-review tab footer: deploy CTA 없음 — ticket 자체로는 배포 trigger X
  (PO 가 묶음으로 결정).
- deploy tab: 진행 중 / 실패 / 재시도 모니터링 전용. 사용자 직접 진입 시 "현재
  배포 후보가 없습니다. [최근 배포 보기]" empty state.

#### dispatcher tab type 추가

T-P4-046 dispatcher 의 11 번째 type `deploy` 추가 필요 (이전 §4.3 의 hybrid b
부분 그대로 유지). T-P4-046 land 후 add ticket 1 개 발행 — 후속 ticket trigger
list 에 명시.

---

### §4.4 base branch 보호 정책

PRD 확정 — **production (= 내부 `main`) only base 보호 (default)**. `useDevBranch=true`
시 dev branch (= 내부 staging/검증용 중간 환경) 도 보호.

#### 구현 결정

- **pre-push hook 위치** — `<project>/.git/hooks/pre-push` (개인 컴퓨터 local).
  CI level 보호 X (Phase 5 candidate). T-P4-010 init 시점 자동 설치 → T-P4-058
  init hygiene 와 정합.
- **실패 시 사용자 메시지** (자연어):
  - "지금 작업은 [main] 위에서 직접 변경할 수 없어요. [이 작업의 작업 공간]
    으로 전환할게요."
  - 사용자 act 없이 자동 worktree 전환 = § 1.5.4 Feedback (toast 알림 + [열기]
    CTA) + § 1.5.5 Escape ([취소하기] 도 표시).
- **gitignore** — `.productune/worktrees/*` 추적 X. T-P4-058 의 `.gitignore`
  자동 추가 path 리스트에 합류.
- **branch 명명** — `<prefix><ticket-id>/<slug>` (prefix = `feature/` 또는 `fix/`,
  `git-rules.json.featureBranchPrefix` / `fixBranchPrefix` 가 source of truth).
  분류 기준: ticket frontmatter 의 `risk_flags` / `type` 자동 매핑 (T-P4-020 spec).

#### 명시적 dev branch 정책 (`useDevBranch=true`)

- dev branch 도 base = 직접 push 차단. 모든 변경은 worktree → dev → main 직렬.
- dev branch 명명 — 사용자 노출 X (PO 가 자체적으로 `dev` 또는 `staging` 이라는
  내부 이름 사용). 사용자에겐 "검증 환경" 으로만 노출.
- staging env (Vercel preview) 매핑은 §4.5 Vercel 통합 절 참조.

---

### §4.5 Vercel 통합 path — **Decided (OQ-4, 2026-05-11): REST API 1차 + CLI logs 보조**

**Designer 권고 그대로 채택.**

knowledge-update doctrine (`vercel.ts`, Fluid Compute default, Node 24 LTS, 300s
timeout) 반영.

#### 채택안

**(c) Vercel REST API** (`@vercel/sdk` 또는 fetch) 가 1차 — link / deploy / env
push / status poll / deploy cancel 모두 API 로. (b) Vercel CLI 는 **`vercel logs`
stream 한정** 보조 — REST API 의 log endpoint 가 풍부도 떨어지는 경우만 CLI
node-pty (T-P4-060) 위 호출. **(a) Marketplace integration 제외** — 사용자 git
무노출 정책과 거리 멀음.

#### 진입 path

- **인증**: T-P4-014 GitHub OAuth 와 별개로 Vercel API token 입력 onboarding —
  Settings 탭 안 "외부 연동" sub-section (T-P4-024 와 별 sub-tab, 본 plan 영역 X).
  Phase 4 안 별 ticket 후보.
- **link**: 첫 deploy 시 `POST /v1/projects` 자동 호출 + git remote 자동 연결.
- **deploy**: T-P4-022 안 deploy state machine 의 stage 2 (배포하기) 에서 `POST /v13/deployments`
  호출. response 의 `deployment.id` 로 status poll.
- **status poll**: 5 초 interval, max 5 분. 5 분 timeout 시 deploy tab 의 "Vercel
  응답 지연 - [재시도] / [건너뛰기]" UX.
- **logs**: 1차 `GET /v2/deployments/{id}/events` 시도, response 가 부족하면
  fallback `vercel logs <url> --follow` (node-pty). dev tab 에서 inline 4 line +
  [전체 로그 보기] CTA.

#### 토큰 만료 / 실패 fallback UX

- 토큰 만료 → "Vercel 연결이 끊겼어요. [다시 연결]" inline banner + retry CTA.
- deploy 실패 → toast `--health-error` + 로그 4 줄 inline + [전체 로그 보기]
  (deploy tab 라우팅). § 1.5.4 Feedback 정합.
- Vercel 자체 down → "지금 Vercel 응답이 없어요. 잠시 후 다시 시도해주세요."
  + [재시도] / [건너뛰기 (로컬만 저장)].

T-P4-014 GitHub OAuth 가 이미 remote 자동 설정하므로 push 는 native git → Vercel
은 deploy API 직접 trigger (webhook 의존 X — 명시 trigger 만).

---

## §5 데이터 모델

### §5.1 `git-rules.json` schema (T-P4-024 산출물)

#### project-level — `<project>/.productune/git-rules.json` (tracked)

```jsonc
{
  "schema_version": 1,
  "useDevBranch": false,        // 검증용 중간 환경 (내부 dev) 사용 여부
  "useStagingEnv": false,       // Vercel preview 매핑 여부
  "featureBranchPrefix": "feature/",
  "fixBranchPrefix": "fix/",
  "protectedBranches": ["main"], // display only — 실제 보호는 hook + useDevBranch
  "autosaveTriggers": {          // Phase 5 lock — schema 만 reserve
    "_locked": true,
    "_lockedReason": "Phase 5 lock",
    "_phase5_candidate": true,
    "events": ["ticket-status-change"]  // OQ-2 결정 — frontmatter status/qa_status/qa_loops 변경
  }
}
```

#### global default — `~/.productune/git-rules.default.json`

동일 schema. 신규 project init 시 project-level 파일을 이 default 로 시드.

#### 즉시 반영 정책

토글 변경 → 다음 ticket 발행부터 즉시 반영. 이미 발행된 ticket 의 worktree /
branch 이름은 변경 X (immutable). Settings 패널에서 토글 변경 시 "다음 ticket
부터 적용됩니다" inline note 노출 (§1.5.4 Feedback).

### §5.2 ticket worktree 위치

```
<project>/
  .productune/
    worktrees/
      T-P4-020/   ← `feature/T-P4-020/worktree-base-protection`
      T-P4-021/
      ...
    git-rules.json
    config.json
  .gitignore   ← `.productune/worktrees/*` 추가 (T-P4-058 hygiene)
```

worktree 내부의 `.git` 은 file (gitdir pointer) — 표준 git worktree. PO 가
worktree path 를 cwd 로 페르소나 호출.

### §5.3 branch 명명 규칙

`<prefix><ticket-id>/<slug>`

예:
- `feature/T-P4-020/worktree-base-protection`
- `fix/T-P4-067/chatpanel-restart-feedback`

slug 는 ticket frontmatter `slug` 또는 PR title 의 kebab-case. 25 char cap.

### §5.4 commit msg format (T-P4-021 산출물)

OQ-2 결정 반영 — turn 단위가 아니라 **ticket 상태 변경 단위** 의 commit:

```
T-P4-<id> [<persona>/turn <N>] status: <prev> → <next>

<산출물 path 들>
<페르소나 envelope summary>
```

예:
```
T-P4-020 [pdt-developer/turn 3] status: in-progress → done

packages/gui/electron/git/worktreeManager.ts
packages/gui/electron/ipc/git.ts
```

또는 qa_status 변경:
```
T-P4-020 [pdt-qa/turn 1] qa_status: pending → passed

(QA evidence path 들)
```

이 포맷이 T-P4-023 [버전 히스토리] 의 ticket-id 그룹핑 + 페르소나 trace 의
source of truth.

---

## §6 dependency 그래프

### §6.1 R2 내부

```
T-P4-024 (json schema) ─→ T-P4-020 (worktree, json load)
                              │
                              ▼
                          T-P4-021 (autosave hook)
                              │
                              ▼
                          T-P4-022 (deploy gate)
                              │
                              ▼
                          T-P4-023 (history)
```

### §6.2 외부 dep

| dep ticket | 영향 |
|---|---|
| T-P4-010 init | hook 설치 시점 + `.productune/` 디렉터리 부트스트랩 |
| T-P4-014 GitHub OAuth | remote 자동 설정 (T-P4-022 push 가능 전제) |
| T-P4-046 dispatcher | deploy tab type 추가 (§4.3 PO confirm 모달 → deploy tab 전환) + Versions 카드 status badge wire |
| T-P4-048 Settings 탭 | T-P4-024 의 sub-tab content 가 land 되어야 stub 해소 |
| T-P4-058 init hygiene | `.gitignore` 자동 추가 path 정합 (`.productune/worktrees/*`) |
| T-P4-084 user mode | dev / planner mode 분기 → §4.1 어휘 매핑 표 적용 |

### §6.3 후속 ticket trigger 후보

- **deploy tab type 추가** — T-P4-046 dispatcher 의 11 번째 type. §4.3 결정에 따라
  T-P4-022 spec 에 포함 + T-P4-046 land 후 add ticket 1 개 발행.
- **conflict resolver modal** — §4.1.1 hybrid 채택 → T-P4-022 안 sub-component
  로 흡수 (별 ticket X).
- **Vercel adapter ticket** — §4.5 REST API + CLI logs 결정 → T-P4-022 안 통합
  (별 ticket X). 단 Vercel API token 입력 onboarding 은 별 ticket 후보.
- **Phase 5 lock 해소 후보**: `autosaveTriggers.events` 사용자 편집 / 외부 IDE
  변경 감지 / 배포 후 [되돌리기] / multi-base — 모두 Phase 5.

---

## §7 회귀 / 정합 risk

### §7.1 정합 risk

| 영역 | risk | 대응 |
|---|---|---|
| `.productune/` 디렉터리 | T-P4-058 hygiene 이 `.productune/` 구조 정정 → R2 의 `worktrees/` `git-rules.json` 위치가 hygiene 규칙과 맞아야 함 | T-P4-058 의 `detectProductuneLayout` 분기에 `worktrees/` 도 self-current 의 일부로 추가 |
| GitHub OAuth | T-P4-014 미완료 사용자 → push 실패 | §4.3 PO 배포 confirm 모달 띄우기 전 OAuth 미완 감지 → "먼저 GitHub 에 연결하기" CTA |
| Settings 탭 | T-P4-048 이 T-P4-024 stub 해소를 약속 — sub-tab list 동기 | T-P4-024 land 시 T-P4-048 sub-tab list 갱신 약속 |
| i18n 보호어 | "branch / commit / merge" 가 보호어 아님 = T-P4-057 linter catch X → 노출 위험 | T-P4-057 linter 의 dictionary 에 **숨김어 12 개** 추가 — 새 enum (보호어 아닌 "금지어") 필요. 본 plan 의 follow-up 으로 T-P4-057 갱신 ticket 후보. |
| dispatcher tab | T-P4-046 의 10 type 에 deploy 미포함 → §4.3 결정에 따라 add ticket | T-P4-046 land 후 새 tab type ticket 발행 (T-P4-022 spec 안에 type 명시) |
| PRD 정합 | PRD line 145 "사용자 명시 클릭만 트리거" 와 §4.3 PO confirm 모달 정책 충돌 | **PRD patch 별 PO task** — 본 plan 영역 X. patch 결과 본 §4.3 의 인용 line 도 PO 가 정정 |

### §7.2 회귀 risk (사용자 데이터)

- **기존 project (Phase 4 land 전 사용자 dogfood)** — `.productune/worktrees/`
  존재 X. T-P4-020 first run 시 자동 생성, 기존 ticket (이미 closed) 은
  retroactive worktree 생성 X — 신규 ticket 부터만 적용.
- **이미 발행된 ticket** — branch / worktree 없는 채로 closed 된 ticket 은
  [버전 히스토리] 카드에서 "worktree 없음 (이전 ticket)" placeholder 노출.

---

## §8 Phase 5 lock 영역

본 R2 에서 schema 만 reserve, 동작 X:

- **`autosaveTriggers.events` 사용자 편집** — OQ-2 default `["ticket-status-change"]`
  외 mode 추가 (e.g. `"frontmatter-only"`, `"union"`, `"turn-done"`) — schema 에
  `_locked: true` stamp. Settings UI 에서 회색 처리.
- **multi-base branch** — `protectedBranches` 가 2 개 초과인 경우. 현재는
  display only, 실제 보호 = main + (옵션) dev 만.
- **외부 IDE 변경 감지** — OQ-5 결정 = **MVP 알림 only**. 사용자가 VS Code 등에서
  직접 git add / commit 한 경우 → PO 가 다음 turn 시작 시 dirty worktree 감지
  → "외부에서 수정된 변경이 있어요. [통합하기] / [버리기]" 모달. 자동 merge X.
  정밀 처리 (자동 stash / 사용자 의도 추론) 는 Phase 5.
- **dev branch 자동화 수준** — 현재 `useDevBranch=true` 시 dev branch 도 보호.
  dev → main 자동 promote / 검증 통과 시 자동 PR 등은 Phase 5.
- **배포 후 [되돌리기]** — 새 revert ticket 자동 발행 (Phase 5 candidate — MVP
  는 "GitHub 에서 직접 revert" 안내 + 새 fix ticket 수동 발행).

---

## §9 Open Questions (resolved 2026-05-11)

5 OQ 모두 사용자 결정 land. §4 / §5 / §8 에 인라인 stamp 반영 완료. 본 §9 는
trace 보존용 표.

| OQ | 영역 | 결정 | designer 권고 대비 |
|---|---|---|---|
| **OQ-1** | conflict 모달 톤 | **hybrid — trivial 자동 / semantic 대화체 모달** | 권고 그대로 채택 |
| **OQ-2** | 자동저장 trigger | **ticket frontmatter `status` / `qa_status` / `qa_loops` 변경 시점만** | 권고 (turn done + dedupe) X → 더 보수적 채택 |
| **OQ-3** | 배포 게이트 트리거 | **PO trigger + 사용자 confirm 모달. 별 버튼 X** | 권고 (ticket-review footer + deploy tab hybrid) 부분 reversal. PRD line 145 도 별 PO task 로 patch 필요 |
| **OQ-4** | Vercel 통합 path | **REST API 1차 + CLI `vercel logs` 보조. Marketplace 제외** | 권고 그대로 채택 |
| **OQ-5** | 외부 IDE 변경 감지 | **MVP 알림 only — Phase 5 에서 정밀 처리** | 권고 그대로 채택 |

### Trace — 결정 이유 요약

- **OQ-1 hybrid**. 사용자 부담 최소화 (trivial = silent) + 사용자 결정 필수 case
  는 대화체로 명시 (semantic). § 1.5.3 Predictability + § 1.5.4 Feedback + §
  1.5.5 Escape 모두 충족.
- **OQ-2 frontmatter 변경**. turn done 대비 commit 빈도 ↓ → git log 가독성 ↑.
  ticket lifecycle 자연 정합. 누락 risk 는 "PO 가 ticket 상태 명시 update" 표준
  워크플로로 자연 cover. 사용자 가시 보강 (ticket-review tab footer 의 "최근
  자동저장 N분 전" + "저장되지 않은 변경 M 파일") 로 escape hatch 제공.
- **OQ-3 PO trigger + 사용자 confirm**. **PRD line 145 부분 reversal**. 사용자
  명시 act 강제는 유지 (confirm 모달) 하되 진입 trigger 는 PO 가 책임 (사용자가
  배포 시점을 매번 판단하지 않아도 됨). 사용자 인지 부담 ↓ 동시에 명시 act
  유지. 별 [배포 준비] / [배포하기] 버튼 X 가 § 1.5.1 Few Things 정합 — UI 에
  상시 배포 CTA 가 없으면 사용자 시야가 작업 자체에 집중.
- **OQ-4 REST API 1차**. 사용자 git 무노출 정책 최대 정합. CLI 의존 최소화 +
  토큰 1 개 관리. 단 log stream 은 CLI 가 풍부 → 한정 보조.
- **OQ-5 MVP 알림 only**. Phase 4 안 외부 IDE 사용자는 dogfood 범위 좁음. Phase 5
  에 dogfood 데이터 기반 정밀 처리 결정.

---

## §10 design-system §1.5 self-check

본 R2 layer 의 5 sub-rule 정합 재점검 (OQ resolved 시점 기준).

### §1.5.1 Few Things Per Page

- [자동저장] = backend only, UI 노출 0 → 사용자 인지 부담 0. ✅
- 배포 게이트 = **상시 CTA 0**, PO confirm 모달 등장 시점에만 3 CTA (지금
  배포 / 나중에 / 건너뛰기). ✅ — OQ-3 결정으로 사용자 시야 깔끔.
- conflict 모달 = 옵션 3 개 cap (§4.1.1). ✅
- Settings 패널 = 4 토글 + 2 텍스트 = 6 control 한 sub-tab — § 1.5.1 cap 권고
  (5–7 control / sub-tab) 정합. ✅

### §1.5.2 Familiar + 점진적 정보

- 영문 어휘 (dev mode) + 자연어 (planner mode) 분기 → 두 사용자 부류 다 cover. ✅
- onboarding 즉시 배포 CTA 노출 X → 첫 ticket done + qa_status passed 후 PO
  confirm 모달 등장 (자연 progressive). ✅
- conflict 같은 고급 상황 = 발생 시점에만 모달 노출 (숨김). ✅
- 외부 IDE 변경 = 발생 시점에만 통합/버리기 모달 (숨김). ✅

### §1.5.3 Predictability

- [자동저장] 결과 visual = ticket-review tab footer "마지막 자동저장 N분 전" +
  "저장되지 않은 변경 M 파일" + [버전 히스토리] inline timestamp. 같은 token
  일관. ✅
- 배포 confirm 모달 = 항상 같은 형식 (3 CTA) / 같은 카피 패턴. ✅
- 실패 / 성공 token (`--health-error` / `--health-success`) 일관. ✅
- Empty state — 첫 ticket 없는 project 의 [버전 히스토리] = Empty 컴포넌트
  (icon + "아직 변경 없음" + 1 CTA "새 ticket 시작"). ✅
- deploy tab empty — "현재 배포 후보가 없습니다. [최근 배포 보기]" ✅

### §1.5.4 Feedback

- [자동저장] = silent + ticket-review tab footer inline label. on-demand 보고
  충분. ✅
- 배포 confirm 모달 = 사용자 act 즉시 deploy tab 전환 + 2 stage spinner / toast.
  ✅
- 실패 시 inline error + 대안 CTA (재시도 / 로그 보기 / 취소). ✅
- conflict 모달 = 발생 즉시 toast → 모달 → 결정 → toast 완료. ✅
- 외부 IDE 변경 감지 → 즉시 dirty worktree banner. ✅

### §1.5.5 Escape

- conflict 모달 = [취소] + Esc 닫기 + backdrop click 시 "결정 안 함, 나중에"
  toast (§4.1.1 결정). ✅
- 배포 confirm 모달 = [나중에] / [건너뛰기] / Esc 모두 escape. ✅ — 사용자
  act 강제 0.
- deploy 진행 중 = [취소] CTA (Vercel deploy 취소 API). 단 squash merge 이후는
  irreversible → "취소 불가, 새 fix ticket 발행 권고" 안내. ✅
- Settings 토글 변경 = 즉시 적용 X (다음 ticket 부터). 적용 전까지 [되돌리기]
  inline. ✅
- 배포 후 [되돌리기] = Phase 5 lock — MVP 는 "GitHub 에서 직접 revert + 새 fix
  ticket 발행" 안내. T-P4-022 spec 에 명시. ✅

### §1.5.6 종합

5 sub-rule violation 없음. OQ resolved 후에도 정합 유지. 가장 큰 변화 = OQ-3 의
PO trigger 채택으로 §1.5.1 Few Things 가 추가 강화 (상시 배포 CTA 가 사라짐).

---

## §11 후속 ticket plan

본 plan land (OQ resolved 반영) → ticket 별 design plan 분리 dispatch:

### Order

1. **T-P4-024 design plan** ← **다음 dispatch** — `git-rules.json` schema final +
   Settings sub-tab 컴포넌트 spec + IPC 시그니처. `docs/artifacts/v0.4/T-P4-024-git-rules-json-foundation.md`.
2. **T-P4-020 design plan** — worktree manager state machine + pre-push hook
   설치 위치 + branch namer 규칙 + base 차단 모달 spec.
3. **T-P4-021 design plan** — `post-delegate-autosave` hook + commit msg
   generator + frontmatter 변경 감지 정책 (OQ-2 반영) + ticket-review tab footer
   inline label spec.
4. **T-P4-022 design plan** — PO 배포 confirm 모달 (OQ-3) + deploy tab spec + 2
   stage state machine + Vercel adapter (OQ-4) + conflict 모달 (OQ-1 hybrid) +
   외부 IDE 변경 감지 모달 (OQ-5 MVP) + escape hatch.
5. **T-P4-023 design plan** — [버전 히스토리] 카드 컴포넌트 + git log parser +
   ticket-id grouping + 페르소나 trace inline + Version 카드 와의 관계.

### 각 ticket plan 안 reference

- 본 plan (`docs/artifacts/R2-git-abstraction-architecture.md`) 의 §4 / §9 결정 인용.
- 각 plan 의 § "decisions inherited from R2 overview" 절에 OQ 결과 5 개 명시.
- 본 plan 의 §10 self-check 결과를 각 ticket plan 에서 다시 sub-rule 별 catch.

### 발행 제약

- ticket 발행 (`docs/tickets/v0.4/T-P4-NNN.md`) X — T-P4-020/021/022/023/024 는
  이미 발행됨 (ROADMAP Round 2).
- ticket md frontmatter 변경 X (acceptance 보강은 dev 임플 시점에 — 본 plan
  land 후 PO 또는 dev 가 ticket md acceptance 정밀화).
- ROADMAP append X.
- 본 plan land trace 만 Activity log 1 줄.

### 별 PO task (본 plan 영역 X)

- **PRD patch**: line 145 "사용자 명시 클릭만 트리거, PO 자동 결정 X" → "PO
  trigger + 사용자 confirm 모달" 정책으로 patch. 별 PO task.

---

## §12 Promotion Candidates (annotation — top-level JSON 이 primary)

| tier | target | rationale |
|---|---|---|
| project | `docs/designer/decisions.md` | R2 git 추상화 묶음의 architecture 합의 (특히 §4.3 PO trigger + 사용자 confirm = PRD reversal 결정, §4.5 Vercel REST API 1차 + CLI 보조) 는 R3+ env / R8 배포 플랫폼 추상화에 재사용. 1 줄 dated decision 2 개. |
| work-note | `docs/designer/R2-git-abstraction-architecture.md` | 본 plan 자체가 work-note 후보 — OQ resolved 전 / 후 trace 보존 가치. |

wiki 후보 없음 — productune-specific 사용자 무노출 git layer 정책은 cross-project
재사용성 낮음. 일반론 ("non-engineer 대상 git abstraction 시 4 가시 어휘 +
숨김어 enum 패턴", "PO trigger + 사용자 confirm 가 상시 CTA 보다 § 1.5.1 정합")
은 가능하나 wiki 진입 기준 (cross-project style only) 에 충족 여부 borderline →
보류, 사용자 결정 시점에 재평가.

---

## 변경 / 갱신 정책

- ~~사용자 OQ-1 ~ OQ-5 confirm 시 본 문서 §4 / §5 / §10 인라인 stamp + status
  `draft` → `decided`.~~ → **2026-05-11 완료**.
- 후속 ticket plan dispatch 시 본 문서 §11 의 ticket 목록을 link 로 변경.
- Phase 5 lock 영역 변경 시 §8 갱신 + ROADMAP Round 2 합격 기준 재검토.
- PRD line 145 patch 완료 시 §7.1 의 정합 risk 표 + §4.3 inline 인용 정정.
