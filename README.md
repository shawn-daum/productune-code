# productune

> 오케스트라처럼 — 들으면서 곡 (제품) 을 tune 해 나가는 컨셉.
> **개발에 대해 잘 알지 못하는 기획자가 프로덕트를 성공적으로 만들 수 있는 툴**.

CLI 한 줄 (`productune`) 로 시작해서 **PRD → Design → Build → Deploy → Close** 5-Phase 를 4 명의 전문가 페르소나 + Skill 시스템이 함께 돌리는 로컬 dev-workflow 도구.

```
사용자 ─한 문장─▶ productune (PO orchestrator, sonnet/opus)
                   │
                   ├── claude --agent pdt-designer   → PRD 작성 / UX / Design System / Tickets
                   ├── claude --agent pdt-developer  → 구현 (default sonnet)
                   └── claude --agent pdt-qa         → 검증 (default haiku)
                                                  │
                                                  └─ 모든 페르소나는 4-tier doctrine
                                                     (common / persona / project / personal)
                                                     을 session entry 에서 읽음.
```

> **planner 역할은 Designer, PO가 담당**

## 누구를 위한 도구인가

- 기획자 / 1인 PM / 제품 오너 — 코드는 직접 짜지 않지만 무엇을 만들지 정의할 수 있는 사람
- 스펙 / 구현 난이도 추정은 가능, 단 CLI 익숙치 않고 복잡한 개발 지식은 없음
- 실제 풀스택 개발자에게는 productune 이 IDE 보조가 아니라 **위임 + 검증** 도구라 적합도가 다름

## 3-phase 롤아웃

| Phase | 목표 | 인터페이스 | 상태 |
|---|---|---|---|
| **Phase 1 (v0.1–v0.4)** | CLI 기반 핵심 + dogfood-ready | terminal `productune` | **✅ 완료 (v0.4 close 2026-05-21)** |
| **Phase 2 (v0.5~)** | 사용자가 실제 프로젝트 1 개로 dogfood 완주 | 동일 (CLI) | 진행 중 |
| Phase 3 | UI 화 (onboarding + 일반 사용 모두 GUI) | web/desktop | Phase 2 합격 후 |

자체 PRD 는 [`docs/prd/productune.md`](./docs/prd/productune.md) — round 단위 누적.

## 페르소나 매트릭스 (Why / How / What — Golden Circle)

5-tier effort: `low` → `medium` → `high` → `xhigh` → `max` (deepest).

| 페르소나 | 역할 | Default 모델 | Why mode | How mode | What mode |
|---|---|---|---|---|---|
| **productune** (PO) | 오케스트레이터 (저자 X) | **opus/xhigh** | — | opus/xhigh — 인터뷰 / 라우팅 / 합산 / brief append (default). 위험 plan review = opus/xhigh 유지 | — |
| **pdt-designer** | PRD 작성 + Plan + Design + Tickets | opus | **opus + ⚡max** — Round 1 MVP PRD (clarity loop A ≤ 0.05) / net-new 시스템 디자인. Round 2+ PRD: opus + ⚡xhigh | opus + ⚡xhigh — design docs (single screen / 컴포넌트 spec). sonnet/medium — token/DS compliance, haiku/low — 단일 컴포넌트 compliance | sonnet/medium — ticket 파일 emission |
| **pdt-developer** | 구현 | sonnet | — | **L4+ plan phase: opus + ⚡xhigh** (PLAN ONLY). **System-level: opus + ⚡max** | **baseline sonnet/medium** (L1–L3 trivial). **L4+ impl phase: sonnet/high** (plan 후) |
| **pdt-qa** | 검증 | haiku | — | sonnet/high — stress / e2e / 반복 QA issue. **Plan testability cross-review (옵트인)**: sonnet/high | **baseline haiku/low** — npm test, lint/build, 단일 페이지 nav |

> **PO 는 산출물을 직접 작성하지 않습니다.** 인터뷰 brief 만 자기 손으로 채우고, PRD/티켓/디자인/코드는 모두 sub-agent 위임.
> **모든 페르소나 출력 = JSON-only** (`stdout` 첫 글자 `{`). `summary` ≤200자 + `user_surface` ≤500자로 PO 가 표면에 번역. ~80% output-token 절감.
> **세션 라이프사이클**: 티켓 1개 = fresh session 1개. 동일 티켓 내 multi-turn 만 resume. 티켓 close 시 session drop.
> Effort `xhigh` / `max` 는 **opus 전용** (다른 model 은 자동 승격).
> **PRD 는 clarity loop** — Designer 가 ambiguity score `A = 1 − Σ(clarityᵢ × weightᵢ)` 를 0.05 까지 낮춤. 5 라운드 cap.

### Skill 시스템

각 페르소나는 `~/.claude/skills/` 의 OSS + 자체 skill 을 장착합니다.

| Skill | 장착 페르소나 | 발동 조건 |
|---|---|---|
| `anthropic/frontend-design` | pdt-designer | Phase 2 T4 (hi-fi mockup, interactive component 코드 생성) |
| `mattpocock/*` (23개) | pdt-developer | plan/tdd/refactor 등 개발 flow |
| `phuryn/pm-skills` (65개) | PO, pdt-designer | PRD / 인터뷰 / 이슈 추출 |

`bash packages/core/scripts/setup-skills.sh` 로 한 번에 설치.

## 5-Phase Lifecycle

모든 버전이 이 5단을 순서대로 통과합니다.

```
Phase 1: PRD          Phase 2: Design               Phase 3: Build
  │                     │                              │
  ├─ Designer:          ├─ 4 design tickets emit:      ├─ Developer: impl
  │   clarity loop      │   ① Design System            │
  │   A ≤ 0.05          │   ② UX Flow (Mermaid)        ├─ QA: 검증
  │                     │   ③ Wireframe                │
  ├─ 자동 ticket        │   ④ Hi-fi mockup (HTML)      └─ [Close Gate ×3]
  │  emit (type:design, │                                  ① 디자인 요소 검토
  │  PRD 작성)          ├─ Skip 조건: L1–L3 +              ② 보안 6-prompt
  │                     │  not user-facing +                ③ PRD AC 확인
  └─ version: v<숫자>   │  no risk_flags
      only              │  (trace: → Phase 2 skipped
                        │   — L<n> trivial)
                        │
                        └─ Gate: 사용자 4 artifacts OK
                           (L4+ user-facing + risk_flags 필수)

Phase 4: Deploy                            Phase 5: Close
  │                                          │
  ├─ pdt-po + 사용자 협업                    ├─ type:close × 3:
  │  type:deploy 티켓 1개                    │   5a Retrospective (Designer)
  │  body "## Steps" =                       │   5b Test coverage retro (QA)
  │    [PO] allowlisted command              │   5c feature-history (Designer)
  │    [user] action                         │
  ├─ PO 한 단계씩 진행 →                     └─ 5d PO mechanical
  │  사용자 회신 → next                          (calibration log +
  └─ 모든 step done → ticket close                po-state mirror)
     (자동 smoke gate 없음 —
      검증은 step 결과 안에서)
```

### Phase gate 상세

| Phase | Auto-emit | Gate | 완료 조건 |
|---|---|---|---|
| **1 PRD** | type:design ticket 1개 (PRD 작성 vehicle) | A ≤ 0.05 or PO "finalize" | PRD `state:"ready"` |
| **2 Design** | type:design × 4 (system / flow / wireframe / hi-fi mockup) | 사용자 4 artifacts OK | 4 design tickets merged + user gate |
| **3 Build** | — | Close Gate 3항목 모두 ✓ (no open ✗) | 3-item checklist clear |
| **4 Deploy** | type:deploy 1개 (PO+user collaborative steps) — N/A skip 시 type:deploy 미생성 | 모든 [PO]/[user] step done; N/A skip 시 자동 통과 | ticket close 또는 N/A skip 표시 (productune-internal / library / docs-only / Electron desktop 등 배포 단계 없는 프로젝트) |
| **5 Close** | type:close × 3 (5a/5b/5c) | 3 close tickets done + 5d PO mechanical | `docs/retrospectives/<version>.md` + `feature-history.md` 갱신 |

## Doctrine architecture (4-tier)

각 페르소나는 session entry 마다 4 tier 의 doctrine 을 순서대로 읽습니다. 상위 tier 가 base, 하위 tier 가 override / specialize.

| Tier | Scope | Path | Who writes |
|---|---|---|---|
| **0 common** | designer/developer/qa 공통 룰 (JSON-only, promotion emit, SoT, role boundary) | SoT: `packages/core/doctrine/common/{habit.md, bookshelf/}` → mirror: `~/.productune/doctrine/common/` | productune 메인테이너 (SoT) — install.sh 가 mirror |
| **0 persona** | 페르소나별 base habit + 참조 bookshelf | SoT: `packages/core/doctrine/persona/<role>/{habit.md, bookshelf/}` → mirror: `~/.productune/doctrine/persona/<role>/` | productune 메인테이너 (SoT) — install.sh 가 mirror |
| **1 project** | repo-specific 룰 / 학습 / 패턴 | `docs/<persona>/{habit.md, bookshelf/<file>.md}` (committed) | PO, 사용자 승인 후 mechanical write |
| **2 personal** | 사용자별 cross-project 선호 / promoted 패턴 | `~/.productune/<persona>/{habit.md, bookshelf/<file>.md}` | PO, promotion 승인 시 mechanical append |

- **habit.md** = curated 룰 (≤100 lines, source tag 없음).
- **bookshelf/<file>.md** = append-only patterns (source tag + 1줄 entry).
- Agent 파일 (`packages/core/agents/<persona>.md`) 은 ≤30 lines 의 thin pointer — 위 4 tier 를 읽어 들임.
- Designer master 파일 (`design-system.md`, `feature-history.md`) 은 Tier 1 에 함께 위치.

> Tier 0 은 SoT (repo) → mirror (`~/.productune/`) 1-way. 페르소나는 항상 mirror 를 읽음. 수정은 SoT 에서, `install.sh` / `onboard` 가 mirror 동기화.

## Why the 3-tier memory (legacy framing)

Doctrine 4-tier 와 별개로, 페르소나의 작업 기억은 단기/중기/장기로도 분리됩니다.

| Tier | Scope | Where | Who writes |
|---|---|---|---|
| **Session** | 한 ticket | Claude Code session (`--session-id`, per-ticket fresh) | Claude 자동 |
| **Project** | 한 repo | `docs/<persona>/*.md` (committed) — doctrine Tier 1 과 같은 경로 | PO, 사용자 승인 후 |
| **Personal** | 사용자별 cross-project | `~/.productune/<persona>/` — doctrine Tier 2 와 같은 경로 | PO, promotion 승인 후 |

핵심 제약: **pdt-designer 가 옛 프로젝트 색감을 새 프로젝트에서 즉시 떠올리지 않음** — Tier 1 project 가 디렉토리 격리, generalized 원칙만 Tier 2 personal 로 promote.

## Prerequisites

- **macOS** (Linux 도 가능, path 조정 필요)
- `claude` — Claude Code CLI. 미설치 / 미로그인이면 `install.sh` 가 자동으로 `npm install -g @anthropic-ai/claude-code` + `claude auth login` 처리.
- `jq` — JSON CLI (`brew install jq`)
- `node` >= 18 (Claude Code npm 설치용)

> codex 는 install 에서 완전히 분리됐습니다. 굳이 fallback engine 으로 쓰려면 본인이 직접 `npm i -g @openai/codex` 한 뒤 `<repo>/codex/config.toml` 을 `~/.codex/config.toml` 로 복사하세요.

## Install

> **Migration note**: core 파일이 `packages/core/` 로 이관됐습니다. 기존 설치 사용자는 `bash packages/core/scripts/install.sh` 재실행으로 symlink/hook/doctrine mirror 경로를 업데이트하세요.

```sh
git clone https://github.com/shawn-kim-axz/productune
bash productune/packages/core/scripts/install.sh
```

> Clone 위치는 어디든 OK — symlink target 이라 그대로 유지하면 됩니다 (`~/code/productune`, `~/productune` 등 자유). 단, `~/.productune/` (Tier 0 mirror + Tier 2 personal store) 와 겹치지 않게만 주의.

이후엔 어디서든 `productune onboard` 로 재실행 가능 (PATH 등록은 첫 install 마지막에 처리됨).

`install.sh` 가 인터랙티브하게 처리:

1. **Claude Code preflight** — CLI 미설치면 자동 설치, 미로그인이면 `claude auth login` 자동 실행.
2. **Agent 심볼릭 링크** — `packages/core/agents/{pdt-po,pdt-designer,pdt-developer,pdt-qa}.md` → `~/.claude/agents/*.md` (edit-in-place).
3. **Tier 0 doctrine mirror** — `packages/core/doctrine/` → `~/.productune/doctrine/{common,persona/<role>}/` (common + persona habit.md / bookshelf, idempotent rsync).
4. **Tier 2 personal scaffold** — `~/.productune/{po,designer,developer,qa}/{habit.md,bookshelf/}` seed-only (절대 overwrite X).
5. **PO engine 선택** — `[1] claude` (primary, hooks fire) / `[2] codex` (secondary, doctrine-only).
6. **Hook 등록** — `~/.claude/settings.json` 에 PreToolUse / PostToolUse / PostCompact / Stop / Pre-Chunking 자동 merge.
7. **OSS skill 설치** — mattpocock + phuryn + `anthropic/frontend-design` skill 을 `~/.claude/skills/` 에 복사.
8. **`~/.productune/productune.env`** — engine, repo path 기록.
9. **PATH 등록** — 현재 세션 즉시 적용.

> install 후에 엔진을 바꾸고 싶으면 `bash packages/core/scripts/install.sh` 재실행 또는 `~/.productune/productune.env` 의 `MY_PO_ENGINE=` 직접 편집.

## 신규 프로젝트 시작 (dogfood guide)

```sh
# 1. target project 로 이동
cd ~/my-awesome-product

# 2. productune 시작 (처음이면 project init 자동)
productune

# 3. PO 가 인터뷰. 한 문장으로 무엇을 만들지 말해주세요.
#    예: "비개발자가 AI 로 앱을 만들 수 있는 노코드 툴"

# 4. PO 가 Designer 를 호출 → PRD clarity loop 시작
#    A ≤ 0.05 되면 Phase 1 완료, Tickets 자동 emit

# 5. Phase 2: Designer 가 Design System + UX Flow + Mockup 생성
#    4 design tickets (system/flow/wireframe/hi-fi mockup) emit → user 일괄 승인

# 6. Phase 3: Developer 가 구현 → QA → Close Gate (3항목 체크)

# 7. Phase 4: Deploy (또는 auto-skip)

# 8. Phase 5: Close — Designer 회고 + QA 패턴 정리 + 다음 버전 후보 + PO calibration

# 버전 이름: v1, v2, v3 ... (v<숫자> 형식만 유효)
```

## Daily use

```sh
cd ~/path/to/target-project

# Full PO flow (권장)
productune                          # default = claude (hooks 발동)
productune --engine claude          # 100% Anthropic stack (default)
productune --engine codex           # Codex CLI (hook 미발동 → doctrine-only)

# 도움말
productune --help                   # 현재 설정 포함 커맨드 레퍼런스

# 유지보수
productune onboard                  # 재설치 (페르소나 재연결 / 설정 변경)
productune uninstall                # 설치된 모든 artifact 제거
productune gc                       # productune/* worktree audit (dry-run)
productune gc -y                    # 안전한 worktree 자동 정리

# 직접 호출 (worktree split / parallel-safety 없음)
claude --agent pdt-po
claude --agent pdt-designer         # 단일 페르소나
```

### 사용자 prefix override (PO turn 안에서)

| Prefix | 동작 |
|---|---|
| `/new <slug?>` | 강제 새 task |
| `/continue` | 강제 current_task 후속 |
| `/resume <slug>` | 강제 past_task 부활 |
| `/model <tier>` | 다음 호출 model 강제 (haiku/sonnet/opus) |
| `/effort <level>` | 다음 호출 effort 강제 (low/medium/high/xhigh) |
| `/dev:opus/xhigh` | persona-specific (`<persona>:<tier>[/<effort>]`) |
| `/skill <query?>` | Path 2 강제 (skill 검색) |
| `/retry` | Path 1 강제 (직전 호출 재시도, tier ↑) |

## Picking a PO engine

| | `--engine claude` (**default**) | `--engine codex` |
|---|---|---|
| Top-level reasoning | Anthropic (Claude Code) | OpenAI (Codex CLI) |
| Subscription | Claude Pro / Max | ChatGPT Plus / Pro |
| Persona subscription | Claude | Claude |
| **Hook firm rules** | ✓ deterministic | ✗ doctrine-only |
| Cost-split | ✗ all on Anthropic | ✓ |

Default = **claude** — hook-based firm rules 는 Claude Code 세션 안에서만 발동.

Switch: `MY_PO_ENGINE=codex` in `~/.productune/productune.env` or `productune --engine codex` per-session.

## Quality-based escalation

페르소나가 confidence=low 또는 unresolved 항목 보고 → PO 가 3-option 메뉴 surface:

```
[PO] pdt-developer 결과 confidence=low (unresolved: ["Next 16 middleware..."]).
     [1] retry — 모델 sonnet → opus, effort medium → high (같은 session resume)
     [2] skill 검색 — keyword 로 9 registry 조회 (mattpocock + phuryn + skill-fetch)
     [3] 그냥 진행 (Follow-ups 로 surface)
     선택? [1/2/3/Enter=1]
```

## 병렬 작업 (자동 worktree split)

같은 프로젝트에서 두 번째 `productune` 호출:
```
[productune] another PO is running on /Users/.../my-project (pid 12345)
[productune] creating worktree at .../my-project-productune-<ts> on branch productune/<ts>
```

Cleanup: `productune gc` (dry-run) / `productune gc -y` (자동 정리).

## Ticket system

PO 가 작업을 ticket 단위로 영속화:
- `<project>/.productune/po-state.json` 에 `current_version`, `current_task` (with `ticket_id`, `stage`, `assignee_persona`, deps, linked_tickets)
- Ticket 파일 = SoT → `<project>/docs/tickets/<version>/T-NNN.md`
- **Version naming**: `v<숫자>` 형식만 유효 (예: `v1`, `v2`, `v0.5`). 숫자 외 suffix 불가.
- **po-state hygiene** — 매 turn 시작 시 자동 staleness sweep (5 field):
  - H1: past_tickets 완전 제거 (ticket md = SoT)
  - H2: recent_turns cap = 5
  - H3: pending_gate staleness (7일 이상 → drop)
  - H4: current_task stage mismatch
  - H5: persona_sessions stale key cleanup

## Artifact + Doc 경로 규칙

```
docs/
├── prd/<version>.md                          # PRD (Designer 작성, English)
├── artifacts/<version>/                      # Version bucket (flat, 3 category)
│   ├── T-NNN-<slug>.<ext>                    # ticket artifact
│   ├── <slug>.<ext>                          # version-loose artifact
│   └── design-system-snapshot.md            # PO 가 version close 시 snapshot
├── tickets/<version>/                        # Ticket 파일 SoT
│   └── T-NNN.md
├── designer/                                 # Tier 1 designer doctrine + masters
│   ├── habit.md                              # ← project-level curated rules
│   ├── bookshelf/                            # ← append-with-source patterns
│   ├── design-system.md                      # ← 단일 global instance (per-feature copy X)
│   ├── feature-history.md                    # Version 결정 log (Phase 1 read / Phase 5 write)
│   └── R<n>-<slug>.md                        # Work notes
├── developer/                                # Tier 1 developer doctrine
│   ├── habit.md
│   └── bookshelf/                            # project-notes.md, self-check.md, ...
├── qa/                                       # Tier 1 qa doctrine + masters
│   ├── habit.md
│   ├── bookshelf/fail-patterns.md            # QA 누적 실패 패턴 (Phase 1 read)
│   └── version-summaries/<version>.md
├── po/                                       # PO project notes
└── retrospectives/<version>.md               # Phase 5 5c 회고 산출물 (Designer)
```

글로벌 singleton: `docs/designer/design-system.md` — 개발 중 per-feature copy 절대 금지. Version close 시 PO 가 `docs/artifacts/<version>/design-system-snapshot.md` 로 snapshot.

## Memory promotion

각 페르소나는 `promotion_candidates` 만 리턴 (자동 write 안 함). 절차:
- Persona 가 `promotion_candidates[]` 배열로 제안 (scope: `project-habit` / `project-bookshelf` / `global-bookshelf`)
- PO 가 사용자에 한 줄 propose
- 사용자 `y` → PO 가 mechanical write
  - Tier 1 (project): `docs/<persona>/habit.md` curated rule append, 또는 `docs/<persona>/bookshelf/<file>.md` source-tagged 1-line append
  - Tier 2 (personal): `~/.productune/<persona>/habit.md` or `~/.productune/<persona>/bookshelf/<file>.md` append

## Files

```
productune/
├── packages/
│   └── core/                            # CLI core
│       ├── agents/                      # ≤30-line thin pointers, symlinked to ~/.claude/agents/
│       │   ├── pdt-po.md
│       │   ├── pdt-designer.md
│       │   ├── pdt-developer.md
│       │   └── pdt-qa.md
│       ├── doctrine/                    # Tier 0 SoT (install.sh mirrors to ~/.productune/doctrine/)
│       │   ├── common/                  # 공통 룰
│       │   │   ├── habit.md             # ≤50 lines — JSON-only · promotion · SoT · role boundary
│       │   │   └── bookshelf/           # json-output-schema, promotion-candidate-schema, sot-paths, ticket-schema, phase-definitions
│       │   └── persona/                 # 페르소나별 base
│       │       ├── po/{habit.md, bookshelf/}        # routing, delegation, escalation, calibration, lifecycle-mechanics, po-state-hygiene, promotion-process
│       │       ├── designer/{habit.md, bookshelf/}  # prd-clarity-loop, phase3-close-gate
│       │       ├── developer/{habit.md, bookshelf/}
│       │       └── qa/{habit.md, bookshelf/}
│       ├── po/                          # legacy PO doctrine (sections/, _formats/, _details/) — migrating to doctrine/persona/po/
│       ├── config/
│       │   └── model-catalog.json
│       └── scripts/
│           ├── install.sh               # mirror doctrine + scaffold Tier 2 + symlink agents + merge hooks + install skills + PATH
│           ├── uninstall.sh
│           ├── productune               # daily entrypoint
│           ├── setup-skills.sh
│           └── hooks/
│               ├── pre-delegate-task-check.sh   # PreToolUse(Bash) — firm rule blocks
│               ├── pre-chunking-warn.sh         # PreToolUse — chunk size warning
│               ├── post-delegate-state-write.sh # PostToolUse(Bash) — session_id, turns
│               ├── post-edit-format.sh          # PostToolUse(Write|Edit) — formatter
│               ├── post-bash-strip-cost.sh      # PostToolUse(Bash) — strip cost lines
│               ├── post-compact-doctrine.sh     # PostCompact — hard rules re-inject
│               └── stop-verify.sh               # Stop(pdt-developer) — typecheck/build gate
├── docs/
│   ├── prd/                            # PRD (English, Designer 작성)
│   ├── tickets/<version>/T-NNN.md      # Ticket SoT
│   ├── artifacts/<version>/            # Design + QA artifacts (flat per version)
│   ├── designer/                       # Tier 1 designer doctrine + masters (habit.md, bookshelf/, design-system.md, feature-history.md)
│   ├── developer/                      # Tier 1 developer doctrine (habit.md, bookshelf/)
│   ├── qa/                             # Tier 1 qa doctrine (habit.md, bookshelf/fail-patterns.md, version-summaries/)
│   ├── po/                             # PO project notes
│   └── retrospectives/                 # Phase 5 close reviews
└── README.md
```

## Troubleshooting

- **"claude doesn't list my personas"** → `productune onboard` 재실행 (symlink 재생성 + dangling sweep)
- **"hooks didn't fire / boundary keeps drifting"** → 엔진이 `codex` 일 가능성. `productune --engine claude` 또는 `~/.productune/productune.env` 의 `MY_PO_ENGINE=claude` 변경
- **"hook 등록 누락"** → `jq '.hooks' ~/.claude/settings.json` 으로 PreToolUse / PostToolUse / PostCompact / Stop 확인. 빠지면 `productune onboard` 재실행
- **"persona output 이 JSON 이 아니다"** → 페르소나 md 버전 낡은 것, 또는 Tier 0 mirror 가 오래된 것. `productune onboard` 재실행 (agent 재링크 + doctrine 재mirror)
- **"Tier 0 doctrine 수정이 반영 안 됨"** → SoT (`packages/core/doctrine/`) 만 수정하고 `~/.productune/doctrine/` 는 read-only mirror. `productune onboard` 가 동기화
- **"po-state.json 이 너무 크다"** → hygiene 자동 sweep (H1–H5) 이 미동작한 것. `productune` 재시작하면 turn-start 에 자동 정리
- **"version naming 오류"** → `v<숫자>` 형식만 유효 (예: `v1`, `v2`, `v0.5`). 다른 형식이면 validator 가 차단
- **legacy state.json schema** — 옛 schema 면 `rm <project>/.productune/po-state.json` 후 PO 다시 시작

## Updating

```sh
cd <clone-dir>           # install 시 clone 한 위치 (예: ~/code/productune)
git pull
productune onboard       # Tier 0 mirror + agent symlink + hooks 재동기화
```

`packages/core/agents/*.md` + `packages/core/scripts/hooks/*.sh` 는 repo 그대로 사용 — 수정 즉시 반영. `packages/core/doctrine/` 는 `~/.productune/doctrine/` 로 mirror 되는 SoT 라 `productune onboard` 재실행 필요.

## Non-goals / future

- UI 는 Phase 3 — 지금은 OOS (v0.5 dogfood 완주 후)
- Codex 페르소나 (sub-agent 런타임으로) 통합 — Codex agent 의 권한 / MCP 격리 모델이 1:1 매칭 안 됨, 별도 plan
- Multi-user / 팀 공유 — 현 single-user 가정
- Phase 5 deferral unlock (MCP 추가 / autosave triggers / persona spec 편집) — v1.0 carry

## Uninstall

```sh
productune uninstall
```

또는 수동으로:

```sh
rm -rf ~/.claude/agents/{pdt-po,pdt-designer,pdt-developer,pdt-qa}.md
jq 'del(.hooks.PreToolUse, .hooks.PostToolUse, .hooks.PostCompact, .hooks.Stop)' \
  ~/.claude/settings.json | sponge ~/.claude/settings.json
rm -rf ~/.productune                             # doctrine mirror, productune.env, Tier 2 personal store
rm -rf ~/.claude/skills/{mattpocock,phuryn,anthropic}
rm -rf <clone-dir>
```

> `productune uninstall` 이 hook 등록 + statusLine 까지 자동 strip 합니다. 수동 정리는 fallback 용.
