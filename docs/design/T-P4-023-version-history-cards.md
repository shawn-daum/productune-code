---
doc: design-plan
slug: T-P4-023-version-history-cards
owner: pdt-designer
status: draft
phase: 4
round: phase4-r2
ticket_ref: docs/tickets/phase4/T-P4-023.md
date: 2026-05-12
prd_ref: docs/prd/productune.md §10 [버전 히스토리]
applies_to: T-P4-023 (version history cards — ticket-id grouping + persona trace inline + natural language card UI, no git vocab)
inherits_from:
  - docs/design/R2-git-abstraction-architecture.md (OQ-1~5 resolved 2026-05-11)
  - docs/design/T-P4-020-ticket-worktree-base-branch-protection.md (worktree path = git log source per ticket)
  - docs/design/T-P4-021-autosave-ticket-status-change.md (commit msg format `T-P4-<id> [<reason>: <before>→<after>] <summary>` — card 자연어 변환 source)
  - docs/design/T-P4-022-deploy-po-trigger-vercel.md (deploy 진입 시점 = deploy 카드 source)
  - docs/design/T-P4-024-settings-workflow-rules.md (round / protectedBranches schema reference)
deliverable: version-history-cards-spec (HistoryCard data model + ticket card + deploy card + GUI surface + IPC + 자연어 변환 + filter + §1.5 self-check)
related_docs:
  - docs/design/service-flow-and-screens.md §3.2 어휘 매핑 + §4 K2 (버전 히스토리 카드)
  - docs/design/design-system.md §1.5 (5 sub-rule) + §2.8 health tokens + §8 component recipes
  - docs/design/R2-git-abstraction-architecture.md §7 외부 어휘 정책
  - docs/design/T-P4-020-ticket-worktree-base-branch-protection.md
  - docs/design/T-P4-021-autosave-ticket-status-change.md (§3 commit msg format = parser source)
  - docs/design/T-P4-022-deploy-po-trigger-vercel.md (§6 deploy progress = card detail source)
  - docs/design/T-P4-024-settings-workflow-rules.md
  - docs/tickets/phase4/T-P4-023.md
  - docs/tickets/phase4/T-P4-043.md  # ticket-review tab open (card click target)
  - docs/tickets/phase4/T-P4-046.md  # dispatcher 12번째 type = `version-history`
  - docs/tickets/phase4/T-P4-065.md  # useTicketScan (frontmatter source — past_tickets 제거 후 SoT)
  - docs/tickets/phase4/T-P4-079.md  # multi-bubble chat (history card 별 노출 surface)
  - docs/tickets/phase4/T-P4-084.md  # dev/planner mode 어휘 split
  - docs/tickets/phase4/T-P4-085.md  # version 단위 grouping (Version frontmatter)
out_of_scope:
  - commit revert / rollback UI (Phase 5)
  - 페르소나 turn 별 산출물 diff 보기 (Phase 5, Round 7 메모리 편집기와 통합)
  - 라운드 간 비교 view (Phase 5)
  - export to markdown / PDF (Phase 5)
  - 라이트 테마 전용 token (Phase 5 — base theme 정합으로 OK)
  - 검색 (filter MVP 는 persona + date range, 검색 어휘 부분 일치는 Phase 5)
  - history 카드에서 deploy 취소 (Phase 5)
  - "외부 IDE 직접 변경" 카드 표기 (R2 §4.4 OQ-5 = MVP 알림 only — history 영역 X)
---

# T-P4-023 design plan — [버전 히스토리] 카드 UI (ticket 단위 그룹 + 페르소나 trace inline + 자연어 카드)

> **이 plan 의 범위**. R2 architecture plan §3 진입 순서의 **5번째 = 마지막**
> ticket. T-P4-024 / T-P4-020 / T-P4-021 / T-P4-022 land 후 진입. 사용자가 git
> 어휘 0 회 노출 상태에서 ticket 단위 작업 흐름 (자동저장 → 배포) 의 결과를
> 자연어 카드로 회고 가능. PRD §10 [버전 히스토리] 약속의 본격 surface.
>
> **결정 source**. R2 architecture plan §7 외부 어휘 정책 + T-P4-021 §3 commit
> message 포맷 + T-P4-022 §6 deploy progress + T-P4-024 schema (round /
> protectedBranches) 4 가지 land 된 결정을 그대로 inherit. 신규 외부 어휘 도입 0.
>
> **편집 정책**. 본 문서 = design only. 코드 / ticket frontmatter / ROADMAP
> 변경 0. ticket md acceptance 보강은 dev 임플 시점에 별 (PO 또는 dev 가 본 plan
> §3 / §5 / §6 / §9 / §13 기반으로 정밀화). 사용자 OQ-T023-1 ~ 5 (§11) 결정 후
> 본 §3 / §5 / §6 인라인 stamp 격상.

---

## §1 Goal

R2 묶음의 **5번째 = 마지막** ticket. PRD §10 의 단일 원칙 — **사용자가 git
개념 (commit / branch / merge / worktree / push) 한 번도 보지 않고 작업 ↔ 배포
사이클 회고** — 의 마지막 puzzle piece. T-P4-020 ~ T-P4-022 가 작업 ↔ 배포의
**진행** 을 가시 0 으로 흐르게 했다면, 본 ticket 은 그 흐름의 **회고** 를 동일
어휘 정책 하에 가시화한다.

### 1.1 사용자 시야의 의미

> "어제 어떤 작업이 있었지?" 한 줄에 답이 보이는 timeline.

- ticket 단위 카드 = 한 ticket 의 시작 → 진행 → 완료 (또는 abandoned) 전체.
- deploy 카드 = 별도 (ticket 카드와 통합 X — designer 권고, §11 OQ-T023-2).
- 페르소나 trace = ticket 카드 inline (turn 별 1줄 summary).
- "이번 작업" / "이전 작업" 자연어 = version 기반 grouping (T-P4-085 정합).

### 1.2 사용자 가시 어휘 (한정)

| 표시 | 의미 |
|---|---|
| "버전 히스토리" | tab title |
| "이번 작업" | active version group header |
| "이전 작업" | older version group header (version 별 collapse) |
| "{ticketId} 시작" | status: todo → in-progress |
| "{ticketId} 완료" | status: in-progress → done |
| "{ticketId} 보류" | status: ? → blocked |
| "{ticketId} 중단" | status: ? → abandoned |
| "{ticketId} 품질 확인 통과" | qa_status: pending → passed |
| "{ticketId} 품질 확인 실패" | qa_status: pending → failed |
| "{ticketId} 정적 통과" | qa_status: pending → static-pass |
| "{ticketId} 재시도 {N}회" | qa_loops: N-1 → N |
| "배포 시작" | deploy stage 2 start |
| "배포 완료 — {duration}" | deploy state = READY |
| "배포 실패 — {reason}" | deploy state = ERROR |
| "오늘 / 어제 / {N}일 전" | relative timestamp (group header) |
| "{N}개 작업" | round / version group summary count |

### 1.3 노출 금지 어휘 (R2 §1.2 + T-P4-022 §1.3 정합)

`commit` / `sha` / `hash` / `log` / `branch` / `merge` / `push` / `pull` /
`squash` / `rebase` / `cherry-pick` / `worktree` / `staging` / `production` —
모든 카드 UI 텍스트에서 노출 X.

예외 — dev mode (`mode === "developer"`, T-P4-084 정합) 에서만 ticket-id
inline 가시 + 카드 footer 의 raw metadata (carrier sha — copy 용) 펼침 OK.
planner mode 는 ticket-id 도 가시 X (title 만).

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
T-P4-022 (deploy gate) ← 진행 중 (1차 PR 진입 단계)
   │
   ▼
T-P4-023 (history) ← 본 plan (R2 진입 순서 5번째 = 마지막)
   │
   ▼
R2 묶음 close
```

---

## §2 데이터 소스 — SoT 명시

### 2.1 두 소스 결합 (timeline + detail)

| 소스 | 역할 | 정합 |
|---|---|---|
| **`useTicketScan` (T-P4-065)** = ticket md frontmatter | **timeline SoT** (ticket 카드 발생 시점, status / qa_status / qa_loops 변경 mile-stone) | T-P4-065 sub-f 의 `past_tickets[]` 제거 정합 — ticket md 가 단일 SoT |
| **ticket worktree 의 `git log`** (T-P4-020 의 worktree path) | **detail source** (ticket 카드 expand 시 turn 별 1 줄 summary 리스트) | T-P4-021 §3 commit 메시지 포맷 parse — 자연어 변환은 §4 |

> **lifecycle 원칙 유지**. timeline 자체는 ticket md frontmatter 에서 derive
> (`past_tickets[]` 의존 X). git log 는 **ticket 카드 expand 시점에만** 인용 —
> default view 는 frontmatter 기반 ("시작 / 완료" 등 mile-stone) + persona
> activity 표 row 만.

### 2.2 deploy 카드의 소스

- T-P4-022 의 `useDeploy` store + (옵션) 영구화된 deploy history (Phase 5
  candidate — MVP 는 현재 session 안 store + 마지막 N 회만 영속).
- MVP scope = active session 진행 중인 deploy + 직전 deploy N=20 회까지만
  메모리. 영속화는 §11 OQ-T023-? 영역에서 결정.

### 2.3 round 필드 활용 (T-P4-024 schema 와 무관)

- ticket md frontmatter 의 `round` (예: `phase4-r2`) = round 그룹 헤더 source.
- "이번 라운드 N개 작업" = active round 의 ticket 카드 count.
- 사용자 가시 어휘 = round 명 그대로 보이는 게 아니라 "이번 작업" / "이전 작업"
  (version 기반, §11 OQ-T023-5 designer 권고). dev mode 에서만 round 명
  (`phase4-r2`) inline 가시.

### 2.4 외부 IDE 직접 변경의 처리

- R2 §4.4 OQ-5 = MVP 알림 only. 본 plan = history 카드에 별도 entry X.
- 즉 외부 IDE 가 ticket 외부에서 commit 한 결과 = 본 plan parser 가 매칭 실패
  (commit message 포맷 미준수) → carrier silent skip. dev mode 만 raw row 영역
  (§5.4) 에 노출.

---

## §3 카드 layout

### 3.1 카드 종류 2

| 종류 | trigger | 헤더 | body | footer |
|---|---|---|---|---|
| **ticket 카드** | ticket md frontmatter 의 mile-stone 변경 (status / qa_status / qa_loops) | ticket title + persona chip + status badge | 자연어 trace (mile-stone N줄) + 마지막 trace 시점 (relative time) | total duration + persona turn count (collapsed default) |
| **deploy 카드** | deploy 진입 (T-P4-022 §2 PO trigger) | "배포 — {relative time}" + state badge | 포함된 ticket list (title only) + Vercel URL (state READY) | duration + (실패 시) [다시 시도] CTA |

### 3.2 ticket 카드 layout (collapsed default)

```
┌─ {ticket title}                                  [완료] ─┐
│  pdt-developer  pdt-qa                                   │  ← persona chips (max 4)
│                                                          │
│  {ticketId} 완료 · 2 시간 전                             │  ← latest trace + relative time
│  ✓ 3 단계 진행 (1 단계 더 보기)                          │  ← collapsed summary line
└──────────────────────────────────────────────────────────┘
```

- 클릭 시 expand (§ 3.3).
- 헤더 status badge = T-P4-024 design system §2.8 health token (`--health-success`
  / `--health-progress` / `--health-warning` / `--health-error`).
- planner mode = ticket-id 미노출. dev mode = title 옆 `[T-P4-023]` chip 노출.

### 3.3 ticket 카드 layout (expanded)

```
┌─ {ticket title}                                  [완료] ─┐
│  pdt-developer  pdt-qa                                   │
│                                                          │
│  ─── 진행 흐름 ────────────────────────────────────────  │
│  ◯ {ticketId} 시작 · 5 시간 전                           │  ← status: todo → in-progress
│  ◯ {ticketId} 재시도 1 회 · 4 시간 전                    │  ← qa_loops: 0 → 1
│  ◯ {ticketId} 품질 확인 통과 · 2 시간 전                 │  ← qa_status: pending → passed
│  ✓ {ticketId} 완료 · 2 시간 전                           │  ← status: in-progress → done
│                                                          │
│  ─── 페르소나 활동 ────────────────────────────────────  │
│  pdt-developer · turn 1 · 5 시간 전                      │  ← persona activity row 1
│    {Result 컬럼 80 chars 그대로}                         │
│  pdt-qa · turn 1 · 3 시간 전                             │  ← persona activity row 2
│    {Result 컬럼 80 chars 그대로}                         │
│  pdt-developer · turn 2 · 2 시간 전                      │
│    {Result 컬럼 80 chars 그대로}                         │
│                                                          │
│  ─── 상세 ────────────────────────────────────────────  │
│  총 소요 시간 5 시간 12 분 · 3 페르소나 턴                │  ← footer summary
│  [ticket 상세 보기]                                      │  ← T-P4-043 ticket-review tab open
└──────────────────────────────────────────────────────────┘
```

- 진행 흐름 section = §2.1 frontmatter mile-stone 변경에서 derive.
- 페르소나 활동 section = ticket md 의 `## Persona Activity` 표 row reuse (신규
  trace 생성 X, T-P4-023 ticket md line 63 정합).
- 상세 footer = ticket 전체 duration_min + persona turn count.
- [ticket 상세 보기] = T-P4-043 ticket-review tab open (router action).

### 3.4 deploy 카드 layout (collapsed default)

```
┌─ 배포 — 1 시간 전                              [완료] ─┐
│  3 개 작업 포함                                          │  ← ticket count
│  소요 시간 4 분 12 초                                    │
│  https://....vercel.app  →  열기                         │  ← URL inline link (state = READY)
└──────────────────────────────────────────────────────────┘
```

- state badge = T-P4-022 §6 progress 4 step 의 결과 (READY / BUILDING / ERROR).
- 진행 중 deploy = badge `--health-progress` + "{step} 중" inline (e.g. "Vercel 빌드 중").
- 실패 deploy = badge `--health-error` + [다시 시도] CTA (T-P4-022 §6.6 정합).

### 3.5 deploy 카드 layout (expanded)

```
┌─ 배포 — 1 시간 전                              [완료] ─┐
│                                                          │
│  ─── 포함된 작업 ──────────────────────────────────────  │
│  • {ticket1 title}                                       │  ← T-P4-022 §6.4 정합
│  • {ticket2 title}                                       │
│  • {ticket3 title}                                       │
│                                                          │
│  ─── 진행 ────────────────────────────────────────────  │
│  ✓ 변경사항 정리 · 50 초                                 │  ← T-P4-022 §6.2 progress step
│  ✓ Vercel 빌드 · 3 분 22 초                              │
│  ✓ 배포 완료 · 12 초                                     │
│                                                          │
│  ─── 결과 ────────────────────────────────────────────  │
│  https://....vercel.app  →  열기                         │
│  [다시 배포]  [로그 보기]                                │  ← retry + logs (T-P4-022 §6.3)
└──────────────────────────────────────────────────────────┘
```

- [로그 보기] = T-P4-022 §6.3 logs section open (deploy tab open + logs auto-expand).
- [다시 배포] = T-P4-022 §6.6 의 [다시 시도] CTA path (singleton enforced — 다른
  deploy 진행 중이면 "이미 배포 중이에요" 모달).

### 3.6 카드 visual token (design-system §2.8 + §8)

- ticket 카드 = `--surface-card` + `--radius-md` + `--shadow-sm`.
- deploy 카드 = ticket 카드 + 좌측 border `--color-accent` (구분).
- expanded section divider = `--border-subtle`.
- relative time = `--text-muted` + `--text-xs`.
- mile-stone bullet = `--icon-sm` + lucide `Circle` (idle) / `CheckCircle2` (done)
  / `AlertCircle` (warning) / `XCircle` (error). 컬러 이모지 금지 (memory rule).

---

## §4 자연어 변환 — commit msg / frontmatter → 한 줄

### 4.1 source A — frontmatter mile-stone

| change | 자연어 (KR) | 자연어 (EN) |
|---|---|---|
| `status: todo → in-progress` | "{ticketTitle} 시작" | "{ticketTitle} started" |
| `status: in-progress → done` | "{ticketTitle} 완료" | "{ticketTitle} completed" |
| `status: ? → blocked` | "{ticketTitle} 보류" | "{ticketTitle} blocked" |
| `status: ? → abandoned` | "{ticketTitle} 중단" | "{ticketTitle} abandoned" |
| `qa_status: pending → passed` | "{ticketTitle} 품질 확인 통과" | "{ticketTitle} QA passed" |
| `qa_status: pending → failed` | "{ticketTitle} 품질 확인 실패" | "{ticketTitle} QA failed" |
| `qa_status: pending → static-pass` | "{ticketTitle} 정적 통과" | "{ticketTitle} static QA passed" |
| `qa_loops: N → N+1` | "{ticketTitle} 재시도 {N+1}회" | "{ticketTitle} retry {N+1}" |

- planner mode = `{ticketTitle}` 만. dev mode = `[{ticketId}] {ticketTitle}`.
- 한국어 자연어 wrap (조사 처리 = T-P4-057 i18n linter 의 ko helper 재사용
  권장).

### 4.2 source B — commit msg parser (T-P4-021 §3 포맷)

- 파싱 패턴 정규식:
  ```
  ^T-P4-(\d+)\s+\[(status|qa_status|qa_loops):\s+([^→]+)→\s*([^\]]+)\]\s+(.+)$
  ```
- 파싱 결과 = `{ ticketId, changeReason, before, after, summary }`.
- 자연어 변환 = §4.1 표 적용 (frontmatter change 와 동일 매핑).
- 매칭 실패 = MVP silent skip (외부 IDE 변경 / legacy commit). dev mode 의 raw
  영역에만 노출.

### 4.3 source C — deploy progress (T-P4-022 §6.2)

| state | 자연어 |
|---|---|
| QUEUED | "배포 시작" |
| BUILDING | "Vercel 빌드 중" |
| READY | "배포 완료 — {duration}" |
| ERROR | "배포 실패 — {Vercel error message 자연어 wrap}" |
| CANCELED | "배포 취소됨" |

- duration 포맷 = `{minutes}분 {seconds}초` (60 초 미만은 `{seconds}초`).
- Vercel error message wrap = T-P4-022 §4.3 의 실패 분기 표 정합 (한국어 자연어).

### 4.4 source D — Persona Activity 표 (ticket md)

- ticket md 의 `## Persona Activity` 표 row 그대로 inline. **신규 trace 생성
  X** (T-P4-023 ticket md line 63 정합).
- 표시 형식: `{persona} · turn {N} · {relative time}` 헤더 + Result 컬럼 80
  chars 그대로 body.
- Result 컬럼이 빈 (`—`) row = skip.

---

## §5 GUI surface — 어디 / 무엇 / 왜

### 5.1 진입점 = Main pane tab type `version-history` (§11 OQ-T023-1 designer 권고)

- ROADMAP line 148 + ticket md line 41 의 "탭" 약속 정합.
- T-P4-046 dispatcher 의 **12번째 type** = `version-history` (T-P4-022 의 deploy
  type 11번째 다음).
- singleton tab. 사용자 한 번에 한 history view 만.
- 진입 path:
  - Quick Open palette (T-P4-047) 의 `> 버전 히스토리` 명령.
  - Side Panel Project tab 의 "버전 히스토리" 링크 (보조 진입).
  - 사용자가 chat 에 "어제 뭐 했지?" / "지난 작업 보기" 자연어 → PO 가 본 tab
    open route 호출 (별 OQ 영역 X — PO 자율).

### 5.2 layout (Main pane tab)

```
┌─ 버전 히스토리 ─────────────────────────────────────────┐
│                                                          │
│  ┌─ 필터 ─────────────────────────────────────────────┐ │  ← filter bar (max 2 type — §11 OQ-T023-4)
│  │ 페르소나: [전체] [pdt-developer] [pdt-qa] [...]     │ │
│  │ 기간: [오늘] [이번 주] [이번 작업] [지난 작업]      │ │  ← version 기반 quick filter
│  └────────────────────────────────────────────────────┘ │
│                                                          │
│  이번 작업 (3 개)                                        │  ← version group header
│  ┌──────────────────────────────────────────────────┐   │
│  │ ticket 카드 1 (latest)                            │   │  ← collapsed default
│  └──────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────┐   │
│  │ deploy 카드 (3 개 작업 포함)                      │   │
│  └──────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────┐   │
│  │ ticket 카드 2                                     │   │
│  └──────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────┐   │
│  │ ticket 카드 3                                     │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  지난 작업 (12 개)  [펼치기]                            │  ← older version (collapsed by default)
│                                                          │
└──────────────────────────────────────────────────────────┘
```

- 시간순 default = **최신 위** (§11 OQ-T023-3 designer 권고).
- version group = active version 펼침 + 이전 version 접힘 default.
- "이번 작업" 카운트 = active version 의 ticket 카드 + deploy 카드 합산.

### 5.3 empty state (ticket md line 47 정합)

```
┌─────────────────────────────────────────────────────────┐
│                                                          │
│            아직 작업 기록이 없습니다.                    │  ← title
│                                                          │
│         [새 작업 시작] 으로 첫 작업을 발행하세요.        │  ← body
│                                                          │
│              ┌─────────────────────┐                     │
│              │  새 작업 시작        │                    │  ← primary CTA → T-P4-013 home
│              └─────────────────────┘                     │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

- design-system §1.5.3 Predictability — empty 컴포넌트 정합.
- icon = lucide `Clock` (`--icon-lg`, `--text-muted`).

### 5.4 fallback state (ticket md line 48 정합)

- git log parse 실패 / worktree 없음 / disk read error:
  - title: "작업 기록을 불러올 수 없습니다."
  - body: "잠시 후 다시 시도해주세요." + (옵션) dev mode "에러: {message}".
  - primary CTA: [다시 시도] (force refresh).
  - dev mode 만 raw error message + carrier "도움말 보기" link.

### 5.5 ChatPanel 내 history 노출 — 별 영역 (T-P4-079 정합)

- chat 에 history 카드 inline 노출 = 본 plan scope X. 사용자가 chat 에 "지난
  작업 보기" 발화 시 PO 가 본 tab open route 호출 + chat inline trace "버전
  히스토리 탭을 열었어요" 1줄.
- 후속 promote 후보 — chat 의 system bubble 에 latest 1 card preview + "더 보기"
  CTA (Phase 5).

### 5.6 PresenceBar / BackgroundTaskSegment 정합 (T-P4-080 / T-P4-081)

- history 자체는 background task X. PresenceBar 칩 X.
- 단 history 가 보여주는 **deploy 진행 중** 카드 = T-P4-022 §5.6 의 useDeploy
  store 의 별 slice 와 직접 subscribe. live update (state polling 결과 즉시
  카드 state badge 갱신).

### 5.7 dev / planner mode 어휘 split (T-P4-084 정합)

| 영역 | planner | dev |
|---|---|---|
| ticket 카드 헤더 title | `{ticketTitle}` | `[T-P4-NNN] {ticketTitle}` |
| mile-stone trace | "{ticketTitle} 시작" | "[T-P4-NNN] started · {timestamp}" |
| deploy 카드 헤더 | "배포 — 1 시간 전" | "Deploy [#{deployId}] — 1h ago" |
| relative time | "오늘 / 어제 / N일 전" | ISO timestamp inline + relative wrapper |
| raw metadata 펼침 | X | ticket 카드 footer "원본 보기" → carrier sha / branch name / merge sha 등 raw (모달) |
| filter chip | "이번 작업" | "Version {versionId} (phase4-r2)" |

- dev mode 의 raw metadata 모달 = 사용자 진단 의도로 펼친 영역 = hidden 어휘
  정책 예외 (T-P4-022 §10.3 정합).

---

## §6 IPC API

### 6.1 main → renderer (event)

```ts
// preload bridge
onHistoryUpdated(cb: (ev: HistoryUpdated) => void): Unsubscribe

interface HistoryUpdated {
  projectDir: string
  source: 'ticket-frontmatter' | 'deploy-state' | 'manual-refresh'
  cardId?: string  // 특정 card 만 변경 시
}
```

- T-P4-065 의 `tickets:changed` event subscribe + T-P4-022 의 `useDeploy` store
  변경 watch → renderer 에 `history:updated` 통합 event 발사.
- debounce 500ms (T-P4-065 패턴 정합).

### 6.2 renderer → main (command)

```ts
api.historyList(projectDir: string, opts?: {
  versionId?: string
  persona?: string
  dateFrom?: string  // ISO
  dateTo?: string    // ISO
}): Promise<HistoryCard[]>

interface HistoryCard {
  cardId: string         // 'ticket:T-P4-023' or 'deploy:<deployId>'
  type: 'ticket' | 'deploy'
  ticketId?: string      // ticket type only
  deployId?: string      // deploy type only
  title: string          // ticket title 또는 deploy 한 줄 summary
  status: 'in-progress' | 'completed' | 'failed' | 'blocked' | 'abandoned'
  versionId: string      // T-P4-085 grouping key
  round: string          // T-P4-024 schema reference
  startedAt: string      // ISO
  completedAt?: string   // ISO
  durationMin?: number
  personas: string[]     // dedupe
  mileStones: HistoryMileStone[]   // ticket 카드 expand 시 body
  personaActivity?: HistoryActivity[]  // ticket md 의 Persona Activity 표 row
  deployTickets?: string[]    // deploy 카드의 포함 ticket title 리스트
  deployUrl?: string          // deploy 카드 (state = READY)
  rawMeta?: object            // dev mode raw 펼침 (planner mode 무시)
}

interface HistoryMileStone {
  changeReason: 'status' | 'qa_status' | 'qa_loops' | 'deploy-step'
  before: string
  after: string
  summary: string        // 80 chars cap
  timestamp: string      // ISO
  personaHint?: string   // Persona Activity 표 row 와 매칭 시 채움
}

interface HistoryActivity {
  persona: string        // 'pdt-developer' etc.
  turn: number
  timestamp: string
  resultLine: string     // 80 chars
}
```

- `historyList` = sync read (frontmatter scan + worktree git log lazy). cache
  500ms TTL (필터만 다시 호출 시 동일 cache hit).
- main 측 git log spawn = ticket 카드 expand 시점에 별 IPC (`history:loadTicketDetail`)
  로 lazy load — initial list response 는 frontmatter mile-stone 만.

### 6.3 lazy detail load

```ts
api.historyLoadTicketDetail(projectDir: string, ticketId: string): Promise<{
  mileStones: HistoryMileStone[]   // git log parse 결과 머지
  personaActivity: HistoryActivity[]  // ticket md 의 Persona Activity 표
  rawCommits?: { sha: string; message: string; date: string }[]  // dev mode only
}>
```

### 6.4 IPC 어휘 정책

- IPC 채널명 / event payload field 는 영문 보호어 (`commit`, `sha`, `branch`)
  그대로. **사용자 화면 노출 path 에서만 한국어 자연어로 변환**.
- 변환 위치 = renderer 측 `VersionHistoryTab.tsx` + `cards.ts`.
- T-P4-021 §6.3 정합.

### 6.5 lint 정합

- `packages/core/src/lint/vocabulary.ts` (T-P4-023 ticket md line 64 권고) 가
  렌더링된 카드 HTML 에 hidden 어휘 enum 검사. CI 통과 의무. (별 ticket 또는 본
  ticket 안 작은 sub.)

---

## §7 외부 어휘 정책 (R2 §1.2 + T-P4-022 §10 정합 재확인)

### 7.1 사용자 노출 어휘 enum (본 plan 한정)

```ts
// packages/gui/src/locales/ko.json 의 history section
const historyVocab = {
  tabTitle: "버전 히스토리",
  filter: {
    persona: "페르소나",
    period: "기간",
    periodToday: "오늘",
    periodWeek: "이번 주",
    periodThisVersion: "이번 작업",
    periodLastVersion: "지난 작업",
  },
  group: {
    thisVersion: "이번 작업",
    lastVersion: "지난 작업",
    versionPrefix: "지난 작업 ({count})",  // version count
  },
  ticketCard: {
    started: "{title} 시작",
    completed: "{title} 완료",
    blocked: "{title} 보류",
    abandoned: "{title} 중단",
    qaPassed: "{title} 품질 확인 통과",
    qaFailed: "{title} 품질 확인 실패",
    qaStaticPass: "{title} 정적 통과",
    qaRetry: "{title} 재시도 {count}회",
    totalDuration: "총 소요 시간 {duration} · {turnCount} 페르소나 턴",
    seeDetail: "ticket 상세 보기",
    flowSection: "진행 흐름",
    activitySection: "페르소나 활동",
    detailSection: "상세",
  },
  deployCard: {
    headerCompleted: "배포 — {relativeTime}",
    headerInProgress: "배포 진행 중 — {relativeTime}",
    headerFailed: "배포 실패 — {relativeTime}",
    ticketCount: "{count}개 작업 포함",
    duration: "소요 시간 {duration}",
    urlIntro: "이 주소에서 확인할 수 있어요",
    urlOpen: "열기",
    progressSection: "진행",
    resultSection: "결과",
    includedSection: "포함된 작업",
    retryDeploy: "다시 배포",
    viewLogs: "로그 보기",
  },
  emptyTitle: "아직 작업 기록이 없습니다.",
  emptyBody: "[새 작업 시작] 으로 첫 작업을 발행하세요.",
  emptyCta: "새 작업 시작",
  fallbackTitle: "작업 기록을 불러올 수 없습니다.",
  fallbackBody: "잠시 후 다시 시도해주세요.",
  fallbackCta: "다시 시도",
  relTime: {
    today: "오늘",
    yesterday: "어제",
    daysAgo: "{count}일 전",
    hoursAgo: "{count}시간 전",
    minutesAgo: "{count}분 전",
    justNow: "방금",
  },
}
```

### 7.2 노출 금지 (재확인)

`commit` / `sha` / `hash` / `log` / `branch` / `merge` / `push` / `pull` /
`squash` / `rebase` / `cherry-pick` / `worktree` / `staging` / `production` —
모든 카드 UI 텍스트에서 미노출.

### 7.3 dev mode 어휘 (T-P4-084 정합)

- dev mode = `~/.productune/settings.json` 의 `mode === "developer"`.
- dev mode 만 raw metadata 모달 노출. ticket-id / version-id / round 명
  inline. ISO timestamp inline.
- planner mode 는 §7.1 의 어휘만 노출. raw metadata 모달 자체가 없음 (UI 진입점
  hidden).

### 7.4 lint 정합 (T-P4-057 후속)

- 본 plan 의 i18n key (`historyVocab`) baseline.
- T-P4-057 linter dictionary 에 §7.2 숨김어 enum 추가 (별 ticket 후보, 본 plan
  영역 X).
- planner mode 라우팅 한정 lint — dev mode 의 raw 모달은 예외.

---

## §8 round 필드 활용 — version 기반 grouping (designer 권고)

### 8.1 ROADMAP 원문과의 정합

- ROADMAP line 148: "round 필드 활용해 '이번 라운드 N개 작업' 표시"
- ticket md line 42: "round 필드 활용 — '이번 라운드 배포 작업 N개' 그룹 헤더 표시"
- 본 plan = **version 기반** grouping + round 는 dev mode 라벨에만 (designer
  권고 §11 OQ-T023-5). 이유:
  1. 사용자 가시 어휘 "이번 라운드" 보다 "이번 작업" 이 daily 사용 빈도 ↑.
  2. version = `versions[].id` (T-P4-085) = 사용자 가시 단위 (PRD §10 정합).
  3. round = `phase4-r2` 같은 영문 어휘 = dev mode 가시 더 자연.

### 8.2 두 grouping 의 join

- 한 version 안에 여러 round 가 들어가는 케이스 (예: `v0.4-meta-dogfood` 안에
  `phase4-r1` / `phase4-r2` / `phase4-r3` 동시 진행) — version grouping 이
  outer, round 가 inner (dev mode 만 inner sub-header 가시).
- planner mode = version grouping 만. inner round 없음.

### 8.3 "이번 작업" 라벨 derive

- active version = `po-state.json` 의 `activeVersionId`.
- active version 의 ticket count = active version 의 ticket 카드 + deploy
  카드 합산.
- 이전 version = 같은 project 의 다른 `versions[].id`. 각각 collapse default.

---

## §9 회귀 / 정합

### 9.1 T-P4-020 worktree 정합

- ticket 카드 expand 시 git log source = T-P4-020 의 worktree path
  (`<projectDir>/.productune/worktrees/<ticketId>/`).
- ticket worktree 가 archive / cleanup (T-P4-020 후속) 된 ticket = git log 접근
  불가 → frontmatter mile-stone 만 노출 + footer "더 자세한 로그 X" 자연어
  표시. base worktree (`<projectDir>` 자체) 의 git log 폴백 X — base 는 production
  branch (`main`) 이라 ticket 단위 매핑 의미 없음.

### 9.2 T-P4-021 autosave 정합

- commit message parser = T-P4-021 §3 의 `T-P4-<id> [<reason>: <before>→<after>] <summary>`
  포맷 정합. parser 미스 = silent skip (legacy commit / 외부 IDE).
- T-P4-021 의 `manager-error` / `worktree-missing` reason 으로 인한 noop 시점은
  본 plan 의 ticket 카드 mile-stone 에 별 entry X (사용자 noise).

### 9.3 T-P4-022 deploy 정합

- deploy 카드 = T-P4-022 의 `useDeploy` store + 마지막 N=20 회 영속 (메모리).
- deploy state polling live = §5.6 정합 (state badge 즉시 갱신).
- T-P4-022 §6.4 의 ticket list = 본 plan deploy 카드 expand 의 "포함된 작업"
  section.

### 9.4 T-P4-024 git-rules 정합

- `protectedBranches` = deploy 카드의 target 라벨 derive 에만 사용 (planner
  mode 미노출, dev mode raw 모달에만).
- `featureBranchPrefix` / `fixBranchPrefix` = parser 결과 (commit msg 의 branch
  반영) 의 dev mode 표기에만.

### 9.5 T-P4-046 dispatcher 정합

- `version-history` tab type 신규 = T-P4-046 dispatcher 12번째.
- T-P4-088 listener wire 패턴 그대로 (Settings env / models / deploy 와 동일).
- WorkspaceShell useEffect dispatcher case 에 `version-history` 추가.

### 9.6 T-P4-043 ticket-review 정합

- ticket 카드 expand 의 [ticket 상세 보기] = T-P4-043 ticket-review tab open
  router action. card → review tab 1-step.
- review tab 닫고 history tab 으로 돌아오면 expand 상태 보존 (renderer store
  per-tab state).

### 9.7 T-P4-065 useTicketScan 정합

- timeline SoT = useTicketScan 의 ticket list. `past_tickets[]` 의존 X
  (T-P4-065 sub-f 정합).
- `tickets:changed` event subscribe → history `cards` slice live update.

### 9.8 T-P4-079 multi-bubble 정합

- chat inline history 카드 노출 = 본 plan scope X (§5.5). 후속 promote.
- 단 PO 가 "버전 히스토리 열었어요" trace 발화 시 별 multi-bubble 1줄.

### 9.9 T-P4-084 dev / planner mode 정합

- §5.7 / §7.3 의 mode split 표 정합. setting 변경 시 즉시 카드 re-render.

### 9.10 T-P4-085 version frontmatter 정합

- grouping key = `versionId`. T-P4-085 의 frontmatter `versions[].id` 정합.
- "이번 작업" / "지난 작업" 어휘 = versionId 변환.

### 9.11 회귀 risk

| 영역 | risk | 대응 |
|---|---|---|
| 외부 IDE 의 ticket worktree 직접 push | parser 미스 commit | silent skip + dev mode raw 영역만 노출 (§2.4) |
| ticket worktree archive 후 expand | git log 접근 X | frontmatter mile-stone fallback (§9.1) + 자연어 "더 자세한 로그 없음" |
| 동시 deploy 진행 시 deploy 카드 state polling | 메모리 누수 | T-P4-022 §9.4 cleanup 정합 |
| 다수 ticket (50+) 시 렌더 부담 | virtual list 필요 | MVP = 50 cap + "더 보기" infinite scroll (Phase 5 promote) |
| ticket title 한국어 조사 | "ticket1 시작" / "ticket2 시작" 자연스러움 | T-P4-057 i18n linter 의 ko helper 재사용 (§4.1) |
| version 단위 grouping 의 active version 판정 | `po-state.json` 의 `activeVersionId` null | fallback = "이번 작업" 라벨로 단일 group 노출 + dev mode 경고 |
| filter 와 grouping 의 race | persona filter 후 version group 가 0 ticket | empty subgroup 헤더 hide + "선택한 페르소나 작업이 없어요" 안내 |
| relative time 사용자 timezone | UTC 저장 + local tz 표시 정합 | Intl.RelativeTimeFormat 사용 — 사용자 OS locale |

---

## §10 §1.5 UX self-check (5 sub-rule)

| # | sub-rule | 본 design 정합 |
|---|---|---|
| 2-1 | Few Things Per Page | history tab = primary CTA 0 (read-only) + filter chip 2 group (페르소나 / 기간). 카드 expand 시 [ticket 상세 보기] / [다시 배포] / [로그 보기] max 2 CTA. ✅ |
| 2-2 | 익숙한 경험 | timeline + card + expand 패턴 = GitHub / Linear / Notion 익숙. relative time = Twitter / Slack 익숙. ✅ |
| 3-1 | Predictability | 카드 visual token 일관 (`--surface-card` + `--radius-md`). status badge color = §2.8 health token 동일. mile-stone bullet 위치 일관. ✅ |
| 3-2 | Feedback | filter chip click = 즉시 카드 재정렬 (200ms transition). expand = `pdt-spin` lazy load. deploy state live update. ✅ |
| 3-3 | Escape | tab close = `Cmd+W` (T-P4-046 dispatcher 정합). filter reset = [전체] 클릭. expand undo = 카드 헤더 재클릭. ✅ |

위반 0. 가장 부담스러운 부분 = 다수 ticket (50+) 시 virtual list. MVP cap 50 +
"더 보기" infinite scroll = §1.5.1 의 점진적 정보 disclosure 정합.

---

## §11 Open Questions (T-P4-023 별 — 사용자 결정 받기)

본 plan land 후 사용자 결정 받아 §3 / §5 / §7 / §8 인라인 stamp.

### OQ-T023-1. 카드 UI 위치

- **(a)** Side Panel Project tab 의 "버전 히스토리" 섹션 (compact)
- **(b)** Main pane tab type `version-history` (T-P4-046 dispatcher 12번째)
- **(c)** 두 위치 모두 — Side Panel 은 latest 3 카드 preview + "더 보기" → Main
  pane tab 풀 view
- **(d) designer 권고** — **(b) Main pane tab**. 풍부한 정보 (filter / expand /
  detail) + virtual list / infinite scroll 필요 = Main pane fit. Side Panel
  은 정보량 cap 으로 일부만 노출 시 사용자 회고 의도 불만족. (c) 는 Phase 5
  promote 후보.

### OQ-T023-2. deploy entry — 별 카드 vs ticket 카드 안 통합

- **(a) 별 카드** — ticket 카드 옆에 별 deploy 카드 row. visual 다름 (좌측
  border `--color-accent`).
- **(b) ticket 카드 footer 안 inline** — 해당 ticket 의 ticket 카드 안에 "배포
  완료" footer 행으로 통합.
- **(c) designer 권고** — **(a) 별 카드**. 1 deploy 는 N tickets squash —
  multi-ticket deploy 시 어느 ticket 카드 안에 inline 할지 ambiguity (§1.5.3
  Predictability 위반 risk). 별 카드 = 1 deploy = 1 entry = 명확. ticket 카드의
  "완료" mile-stone 과 deploy 카드의 "포함된 작업" section 이 자연스럽게 묶임.

### OQ-T023-3. 시간순 정렬 default

- **(a) 최신 위** (timeline 표준)
- **(b) 가장 오래 위** (chronological)
- **(c) designer 권고** — **(a) 최신 위**. 사용자 의도 = "어제 / 방금 뭐 했지?"
  최근 회고 위주. Twitter / Slack / GitHub 등 익숙한 패턴. (b) 는 "이번 작업
  전체 흐름" 의도 시 가치 — 후속 promote 후보 (toggle).

### OQ-T023-4. filter — persona / type / date range 중 MVP 필수

- **(a) persona + date range** (designer 권고)
- **(b) persona + type (ticket / deploy)**
- **(c) persona + date range + type** (셋 다)
- **(d) date range 만**
- **(e) designer 권고** — **(a) persona + date range MVP, type 후속**. persona
  filter = "내가 (designer) 어제 뭐 했지?" 자연 의도. date range = "이번 주
  / 지난 주" 자연 의도. type filter (ticket vs deploy) = §1.5.1 Few Things 위반
  risk (2 type 만 = filter 불필요). type filter 는 Phase 5 promote 후보 (필요
  시).

### OQ-T023-5. "이번 작업" / "이전 작업" 어휘 — round 기반 vs version 기반

- **(a) round 기반** — `phase4-r2` / `phase4-r3` 등 round 별 grouping.
- **(b) version 기반** — `v0.4-meta-dogfood` 등 version 별 grouping (T-P4-085
  정합).
- **(c) designer 권고** — **(b) version 기반**. version = 사용자 가시 단위
  (PRD §10 정합). round = 내부 phase 단위 = dev / PO 어휘. planner mode 사용자에게
  "이번 라운드" 어휘는 학습 비용 ↑. version 기반 grouping + dev mode 에서만 round
  inner sub-header 노출 (§8.2 정합).

### OQ-T023-6. deploy 카드 영속화 범위 (MVP)

- **(a) active session 만** (앱 재시작 시 cleared)
- **(b) 마지막 N=20 회 영속** (예: `~/.productune/state/deploy-history/<projectDir-hash>.json`)
- **(c) deploy 시작/완료 시점만 ticket md 의 Deploy Activity section 에 mirror**
  (T-P4-022 §4.6 land 후 추가)
- **(d) designer 권고** — **(b) 마지막 20 회 영속**. session 종속이면 사용자
  회고 의도 불만족 (어제 deploy 가 오늘 보이지 않음). (c) 는 본 plan 의
  out-of-scope (T-P4-022 §10 후속 영역). (b) 는 T-P4-021 §7.3 의 autosave-snapshots
  와 동일 패턴 — atomic write + 손상 시 자동 reset.

### Open question resolution flow

- 본 plan land + ticket md acceptance 보강 시 사용자 결정 받기.
- 결정 후 본 §11 inline stamp + status `draft` → `decided`.
- 결정 영향 영역 (§3 / §5 / §7 / §8) 인라인 update.

---

## §12 Implementation 분해 (dev 임플 분할 권고)

### 12.1 sub-component 매핑

| sub | 영역 | 산출물 | 의존 | 권장 PR phase |
|---|---|---|---|---|
| sub-a | `packages/core/src/history/cards.ts` HistoryCard builder | frontmatter scan + git log parse + 카드 자료 구조 합성 | T-P4-021 commit msg format, T-P4-022 deploy state, T-P4-065 useTicketScan | 1차 |
| sub-b | IPC handler + preload bridge | `history:list` / `history:loadTicketDetail` / `history:updated` event | sub-a | 1차 |
| sub-c | Main pane tab type `version-history` 등록 | T-P4-046 dispatcher 12번째 + listener wire (T-P4-088 패턴) | T-P4-046 | 1차 |
| sub-d | `VersionHistoryTab.tsx` UI | tab layout + filter bar + group header + 카드 list virtual | sub-b, sub-c | 1차 |
| sub-e | `HistoryTicketCard.tsx` + `HistoryDeployCard.tsx` | 카드 collapsed / expanded layout + tokens | sub-d | 1차 |
| sub-f | 자연어 변환 helper + i18n keys | `packages/core/src/history/format.ts` + ko/en JSON | sub-a | 1차 |
| sub-g | deploy 카드 영속화 (OQ-T023-6 b 권고 시) | `~/.productune/state/deploy-history/<hash>.json` atomic r/w | T-P4-022 useDeploy | 2차 |
| sub-h | filter logic + persona dedupe + date range | renderer 측 filter helper + URL state (선택) | sub-d | 2차 |
| sub-i | empty / fallback state | empty 컴포넌트 (design-system §3.4 정합) | sub-d | 2차 |
| sub-j | ticket 카드 expand 의 lazy detail (`history:loadTicketDetail`) | main 측 git log spawn + parse | sub-a, sub-b | 2차 |
| sub-k | live update — `tickets:changed` + `useDeploy` subscribe | renderer store integration | sub-d | 2차 |
| sub-l | dev mode raw metadata 모달 (Phase 5 candidate) | dev mode 만 진입점 노출 + raw sha / branch 등 노출 | T-P4-084 | 3차 |
| sub-m | vocabulary lint (`packages/core/src/lint/vocabulary.ts` 신규 권고) | rendering 결과 HTML 에 hidden 어휘 enum 검사 | T-P4-057 후속 | 3차 또는 별 ticket |
| sub-n | "더 보기" infinite scroll (50+ cap 경우) | virtual list 또는 paginated load | sub-d | 3차 또는 별 ticket |

### 12.2 PR phase 별 land 가능 범위

- **1차 PR (sub-a ~ sub-f)**: 기본 history tab open + ticket / deploy 카드
  collapsed + expand + 자연어 변환 + 1 version active grouping. filter 없음.
  empty state. 사용자 dogfood 가능 minimum.
- **2차 PR (sub-g ~ sub-k)**: deploy 영속화 + filter + lazy detail + live
  update. 본 ticket acceptance 충족.
- **3차 PR (sub-l ~ sub-n)**: dev mode raw + vocab lint + virtual list.
  Phase 5 promote 후보 영역 일부 포함.

### 12.3 분할 land 시 ticket md frontmatter

- 본 ticket = 단일 ticket id (T-P4-023). 분할 = git PR 분할 / land 분할.
- ticket md frontmatter 의 `status` = 모든 sub land 후 `done`. 1/2/3차 PR
  진행 중에는 `in-progress`.
- ticket md frontmatter 의 `qa_status` = 3차 PR 또는 별 ticket land 후 QA pass
  시 `passed`.
- 1/2/3차 PR sequence = T-P4-023 의 sub 분할 — sub-ticket 발행 X. git PR
  description 에 `Part N/3 of T-P4-023` 표기.

### 12.4 분할 land 의 정합 risk

- 1차만 land + 2/3차 미land 상태에서 사용자 dogfood = 깨진 상태 (filter / live
  update 없음 = 매 새로고침마다 stale). 2차 land 까지는 사용자 dogfood X 권고.
- 단 사용자 + 개발자 dogfood (paepyeong) 는 1차 land 직후부터 가능 — 메타
  dogfood 의 첫 회고 = 1차 PR 후.

---

## §13 Acceptance (ticket md 보강 source)

본 plan 의 §2 / §3 / §4 / §5 / §6 / §7 / §8 / §9 / §10 / §12 가 T-P4-023
ticket md (`docs/tickets/phase4/T-P4-023.md`) 의 acceptance 보강 source. 별
ticket md 변경은 dev 임플 시점에 정밀화 — 본 plan 영역 X.

### 13.1 보강 권고 사항 (ticket md 현재 acceptance vs 본 plan delta)

| ticket md 현재 acceptance | 본 plan 정밀화 |
|---|---|
| "[버전 히스토리] 탭 신설. 카드 UI — ticket-id 별 그룹 + 그 안 페르소나 trace inline (turn 별 1줄 summary)." | §3.3 expanded layout — 진행 흐름 section + 페르소나 활동 section + 상세 footer 의 3 영역 spec |
| "round 필드 활용 — '이번 라운드 배포 작업 N개' 그룹 헤더 표시" | §8 — version 기반 grouping (designer 권고 §11 OQ-T023-5) + dev mode 에서만 round inner sub-header |
| "카드 클릭 → expand → 해당 ticket 의 자동저장 commit 시퀀스 (페르소나 turn 별 1줄) 표시" | §3.3 + §6.3 — lazy detail load (git log spawn 시점) + 자연어 변환 |
| "timeline 정렬 = ticket created_at 내림차순. ticket 안 commit 정렬 = chronological." | §11 OQ-T023-3 designer 권고 = 최신 위 default + 카드 안 mile-stone 는 chronological (시작 → 완료 순) |
| "사용자 화면 어휘 lint — branch / commit / PR / merge / worktree / dev / staging 노출 0 검증" | §7.2 + §6.5 — i18n key baseline (`historyVocab`) + T-P4-057 후속 linter |
| "commit 메시지 (T-NNN [persona/turn N] <summary>) 의 <summary> 부분만 자연어 표시. prefix (T-NNN / persona / turn) 는 카드 메타 영역으로." | **format 변경 정합** — T-P4-021 §3 의 새 포맷 `T-P4-<id> [<reason>: <before>→<after>] <summary>` 정합. ticket md acceptance 보강 필요 |
| "empty state — '아직 작업 기록이 없습니다. [새 작업 시작] 으로 첫 ticket 을 발행하세요.'" | §5.3 — 동일. 단 "ticket" 어휘 사용자 노출 X (§1.3) — "첫 작업" 으로 wording 정밀화 |
| "git log parse 실패 / worktree 없음 → 친절 fallback ('작업 기록을 불러올 수 없습니다. 다시 시도하기')" | §5.4 — 동일. dev mode 만 raw error inline. fallback CTA = [다시 시도] |
| "pnpm -r build 통과" | 동일 |

### 13.2 추가 acceptance (ticket md 에 없는 항목)

- [ ] Main pane tab type `version-history` 신규 (T-P4-046 dispatcher 12번째).
- [ ] HistoryCard data model (§6.2) + IPC `history:list` / `history:loadTicketDetail`
  / `history:updated` event.
- [ ] 자연어 변환 helper (§4) + i18n keys (§7.1 historyVocab).
- [ ] filter — persona + date range MVP (§5.2 + §11 OQ-T023-4 designer 권고).
- [ ] deploy 카드 영속화 — 마지막 20 회 (§11 OQ-T023-6 designer 권고 b).
- [ ] version 기반 grouping (§8 + §11 OQ-T023-5 designer 권고 b).
- [ ] deploy state live update (§9.3 — useDeploy store subscribe).
- [ ] dev / planner mode 어휘 split (§5.7 + §7.3).
- [ ] 시간순 default = 최신 위 (§11 OQ-T023-3 designer 권고 a).
- [ ] 카드 expand 시 lazy detail (§6.3) — 50+ ticket 시 perf 부담 ↓.
- [ ] hidden 어휘 lint — §7.2 enum 미노출 (planner mode).
- [ ] ticket 카드 expand 의 [ticket 상세 보기] = T-P4-043 ticket-review tab
  open.
- [ ] empty / fallback state — §5.3 / §5.4.
- [ ] `pnpm -r build` 통과.

---

## §14 후속

### 14.1 본 plan land 후

1. 사용자 OQ-T023-1 ~ OQ-T023-6 결정 받기 (6 개).
2. 결정 inline stamp + status `draft` → `decided`.
3. ticket md (`docs/tickets/phase4/T-P4-023.md`) acceptance 보강 — 본 plan
   §13 delta 기준 (PO 또는 dev 가 정밀화). 또는 dev 임플 시점에 본 plan 을
   직접 spec 으로 사용 (ticket md 보강 skip).
4. dev 위임 — T-P4-023 impl. 1차 PR (sub-a ~ f) → 2차 PR (sub-g ~ k) → 3차
   PR (sub-l ~ n) sequence.
5. impl 완료 + QA pass 후 R2 묶음 close + ROADMAP Round 2 합격 기준 확인.

### 14.2 R2 묶음 진행 — 본 plan = 마지막

```
T-P4-024 design plan + impl + QA → land 됨
T-P4-020 design plan + impl + QA → land 됨
T-P4-021 design plan + impl + QA → land 됨
T-P4-022 design plan + impl 진행 중
T-P4-023 design plan (본 plan, draft) ← 마지막
   │  사용자 OQ-T023-1~6 confirm + dev impl 1차/2차/3차 + QA
   ▼
T-P4-023 land
   │
   ▼
R2 묶음 close + ROADMAP Round 2 합격 기준 확인 ← R2 finale
   │
   ▼
Phase 5 follow-up backlog
```

### 14.3 별 PO task (본 plan 영역 X)

- T-P4-046 dispatcher type 정의에 `version-history` 추가 — sub-c 의 dependency.
- T-P4-057 linter dictionary 에 §7.2 숨김어 enum 추가 (별 ticket 후보).
- ticket md (T-P4-023.md) acceptance 보강 — 본 plan §13 기반 + OQ-T023 결정
  반영.
- ROADMAP Activity log 1줄 (본 plan land trace) — Edit tool 만 사용.
- `packages/core/src/lint/vocabulary.ts` 신규 (sub-m 또는 별 ticket).

### 14.4 follow-up ticket 후보 (Phase 5)

- **chat inline history 카드** — chat 의 system bubble 에 latest 1 card preview
  + "더 보기" CTA. §5.5 의 future promote 후보.
- **export to markdown / PDF** — ticket md line 56 정합. 라운드 회고 / 발표용.
- **commit revert / rollback UI** — ticket md line 53 정합.
- **페르소나 turn 별 산출물 diff 보기** — Round 7 메모리 편집기 통합.
- **라운드 간 비교 view** — round 별 ticket count / duration / fail rate.
- **search 부분 일치** — filter 의 ticket title / persona / mile-stone summary
  text 부분 일치.
- **virtual list / infinite scroll** — 50+ ticket 시 perf. sub-n promote.
- **deploy 카드의 dev mode 외 raw 노출** — Phase 5 candidate (현재 dev mode
  only).
- **light theme 전용 token** — design-system §2 token base 정합 위 추가 token
  (현재 base theme 에 의존).
- **외부 IDE 직접 변경 entry 카드** — R2 §4.4 OQ-5 의 Phase 5 promote.

---

## §15 발행 제약

- ticket 발행 X (T-P4-023 은 이미 발행됨).
- ticket md frontmatter 변경 X — 본 plan 안 acceptance 보강 권고는 §13 의
  delta 표로만, ticket md 직접 수정 X.
- ROADMAP append X. (단 land trace 1줄 — designer 가 Edit tool 로 처리, Write
  X.)
- 본 plan land trace 만 ROADMAP Activity log 1 줄 (Edit tool).

---

## §16 Promotion Candidates (annotation — top-level JSON 이 primary)

| tier | target | rationale |
|---|---|---|
| project | `docs/designer/decisions.md` | 본 plan 의 §8 version 기반 grouping + round dev-mode-only inner sub-header 패턴 = R3+ env management view / R8 deploy provider 별 view 의 grouping reference. 1 줄 dated decision 후보 |
| project | `docs/designer/decisions.md` | 본 plan 의 §4 자연어 변환 helper (frontmatter mile-stone + commit msg parser 통합) 패턴 = 사용자 가시 timeline UI 의 표준 변환 layer. R7 메모리 편집기에도 재사용 가능. 1 줄 dated decision 후보 |
| work-note | `docs/designer/R2-T-P4-023-version-history-foundation.md` | 본 plan 자체 = work-note 후보 — OQ-T023-1~6 confirm 전 / 후 trace 보존 가치 + R2 finale 의 design intent log |

wiki 후보 borderline — "ticket 단위 grouping + 자연어 변환 + 외부 어휘 0 의
history UI 패턴" 일반론 가능하나 productune-specific timeline 의도가 강함.
일반화 시 wiki 진입 기준 보더라인 → 보류.

---

## 변경 / 갱신 정책

- 사용자 OQ-T023-1 ~ OQ-T023-6 confirm 시 본 §11 인라인 stamp + status `draft`
  → `decided`.
- ticket md acceptance 보강 land 시 본 §13 의 delta 표 → "land 완료" 표시.
- dev impl 1차 / 2차 / 3차 PR land 시 본 plan §12 의 분할 표 update (sub-X land
  완료 표시).
- R2 묶음 close 시 본 plan §14.2 의 흐름표 update + ROADMAP Round 2 합격 기준
  확인 결과 inline stamp.
- Phase 5 follow-up ticket 발행 시 §14.4 의 후보 → ticket id 매핑 stamp.
