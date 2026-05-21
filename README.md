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
                                                  └─ 각 페르소나 3-tier 메모리:
                                                     1. session  — per-ticket fresh session
                                                     2. project  — docs/<persona>/*.md
                                                     3. wiki     — Graphiti KG (graphiti backend)
                                                                   또는 filesystem (keeper backend)
```

> **planner 역할은 PO 안으로 흡수** — 별도 my-planner 페르소나 없음.

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
| **productune** (PO) | 오케스트레이터 (저자 X) | **sonnet/medium** | — | sonnet/medium — 인터뷰 / 라우팅 / 합산. 위험 plan review 만 opus + ⚡xhigh | — |
| **pdt-designer** | PRD 작성 + Plan + Design + Tickets | opus | **opus + ⚡max** — Round 1 MVP PRD (clarity loop A ≤ 0.05) / net-new 시스템 디자인. Round 2+ PRD: opus + ⚡xhigh | sonnet/medium — token 매핑, haiku/low — 단일 컴포넌트 compliance | sonnet/medium — ticket 파일 emission |
| **pdt-developer** | 구현 | sonnet | — | **L4+ plan phase: opus + ⚡xhigh** (PLAN ONLY). **System-level: opus + ⚡max** | **L1–L3 trivial: sonnet/medium**. **L4+ impl phase: sonnet/high** (plan 후) |
| **pdt-qa** | 검증 | haiku | — | sonnet/high — 복잡 UX flow, stress, e2e, 반복 QA issue. **Plan testability cross-review (옵트인)**: sonnet/high | haiku/low — npm test, lint/build, 단일 페이지 nav |

> **PO 는 산출물을 직접 작성하지 않습니다.** 인터뷰 brief 만 자기 손으로 채우고, PRD/티켓/디자인/코드는 모두 sub-agent 위임.
> **모든 페르소나 출력 = JSON-only** (`stdout` 첫 글자 `{`). `summary` ≤200자 + `user_surface` ≤500자로 PO 가 표면에 번역. ~80% output-token 절감.
> **세션 라이프사이클**: 티켓 1개 = fresh session 1개. 동일 티켓 내 multi-turn 만 resume. 티켓 close 시 session drop.
> Effort `xhigh` / `max` 는 **opus 전용** (다른 model 은 자동 승격).
> **PRD 는 clarity loop** — Designer 가 ambiguity score `A = 1 − Σ(clarityᵢ × weightᵢ)` 를 0.05 까지 낮춤. 5 라운드 cap.

### Skill 시스템

각 페르소나는 `~/.claude/skills/` 의 OSS + 자체 skill 을 장착합니다.

| Skill | 장착 페르소나 | 발동 조건 |
|---|---|---|
| `anthropic/frontend-design` | pdt-designer | Phase 2 Gate A 승인 후 (interactive component 코드 생성) |
| `mattpocock/*` (23개) | pdt-developer | plan/tdd/refactor 등 개발 flow |
| `phuryn/pm-skills` (65개) | PO, pdt-designer | PRD / 인터뷰 / 이슈 추출 |

`bash packages/core/scripts/setup-skills.sh` 로 한 번에 설치.

## 5-Phase Lifecycle

모든 버전이 이 5단을 순서대로 통과합니다.

```
Phase 1: PRD          Phase 2: Design         Phase 3: Build
  │                     │                         │
  ├─ Designer:          ├─ Ticket 1:              ├─ Developer: impl
  │   clarity loop        Design System           │
  │   A ≤ 0.05            UX Flow (Mermaid)       ├─ QA: 검증
  │                       Wireframe               │
  ├─ 자동 ticket          Hi-fi mockup (HTML)     └─ [Close Gate ×3]
  │  emit (type:design,    │                          ① 디자인 요소 검토
  │  PRD 작성)             ▼ Gate A (user OK)          ② 보안 6-prompt
  │                     Ticket 2:                      ③ PRD AC 확인
  └─ version: v<숫자>    frontend-design skill
      only               → interactive TSX/HTML
                          │
                          ▼ Gate B (user OK)

Phase 4: Deploy       Phase 5: Close
  │                     │
  ├─ 자동 skip           ├─ Retrospective 작성
  │  (조건: no          ├─ feature-history.md 갱신
  │  deploy changes)    └─ 다음 버전 backlog 제안
  └─ Vercel / 수동
```

### Phase gate 상세

| Phase | Auto-emit | Gate | 완료 조건 |
|---|---|---|---|
| **1 PRD** | type:design ticket 1개 (PRD 작성 vehicle) | A ≤ 0.05 or PO "finalize" | PRD `state:"ready"` |
| **2 Design** | type:design × 2 (static → Gate A → interactive → Gate B) | Gate A = 사용자 static artifacts OK · Gate B = 사용자 interactive code OK | Ticket 2 merged |
| **3 Build** | — | Close Gate 3항목 모두 ✓ (no open ✗) | 3-item checklist clear |
| **4 Deploy** | — | Skip 규칙: 배포 변경 없으면 자동 pass | deploy log or skip note |
| **5 Close** | — | Retrospective 작성 완료 | `docs/retrospectives/<version>.md` |

## Why the 3-tier memory

사람의 단기 / 중기 / 장기 기억 모방.

| Tier | Scope | Where | Who writes |
|---|---|---|---|
| **Session** | 한 ticket | Claude Code session (`--session-id`, per-ticket fresh) | Claude 자동 |
| **Project** | 한 repo | `docs/<persona>/*.md` (committed) | PO, 사용자 승인 후 |
| **Wiki** | persona-global cross-project | Graphiti KG (`group_id=persona-<name>`, FalkorDB) or `~/.productune/wiki/` | PO, `[PROMOTION-APPROVED]` 마커 + 사용자 승인 |

핵심 제약: **pdt-designer 가 옛 프로젝트 색감을 새 프로젝트에서 즉시 떠올리지 않음** — project tier 가 디렉토리 격리, generalized 원칙만 wiki promote.

## Prerequisites

- **macOS** (Linux 도 가능, path 조정 필요)
- `claude` — Claude Code CLI. 미설치 / 미로그인이면 `install.sh` 가 자동으로 `npm install -g @anthropic-ai/claude-code` + `claude auth login` 처리.
- `jq` — JSON CLI (`brew install jq`)
- `node` >= 18 (Claude Code npm 설치용)

> codex 는 install 에서 완전히 분리됐습니다. 굳이 fallback engine 으로 쓰려면 본인이 직접 `npm i -g @openai/codex` 한 뒤 `<repo>/codex/config.toml` 을 `~/.codex/config.toml` 로 복사하세요.

Wiki backend 에 따라 추가 필요:
- **Graphiti (권장, 자동 설치)**: Docker Desktop + `uv` (`brew install uv`) + ollama (install 이 자동 설치)
- **keeper**: 추가 불필요 (Claude API 사용)

## Install

> **Migration note (T-P4-002)**: core 파일이 `packages/core/` 로 이관됐습니다. 기존 설치 사용자는 `bash packages/core/scripts/install.sh` 재실행으로 symlink/hook 경로를 업데이트하세요.

```sh
git clone https://github.com/shawn-kim-axz/productune
bash productune/packages/core/scripts/install.sh
```

> Clone 위치는 어디든 OK — symlink target 이라 그대로 유지하면 됩니다 (`~/code/productune`, `~/productune` 등 자유). 단, wiki data 가 저장되는 `~/.productune/` 와 겹치지 않게만 주의.

이후엔 어디서든 `productune onboard` 로 재실행 가능 (PATH 등록은 첫 install 마지막에 처리됨).

`install.sh` 가 인터랙티브하게 처리:

1. **Claude Code preflight** — CLI 미설치면 자동 설치, 미로그인이면 `claude auth login` 자동 실행.
2. **PO engine 선택** — `[1] claude` (primary, hooks fire) / `[2] codex` (secondary, doctrine-only).
3. **Wiki backend 설정** — 하드웨어 자동 감지
   - Tier S (RAM ≥ 16GB) / Tier A (RAM ≥ 8GB): Ollama 로컬 LLM → 자동 설치 → FalkorDB + Graphiti 자동 셋업
   - Tier B (RAM 부족 / Docker 없음): wiki-keeper agent (Claude API) 자동 선택
4. **Hook 5개 등록** — `~/.claude/settings.json` 에 PreToolUse / PostToolUse / PostCompact / Stop 자동 merge
5. **OSS skill 설치** — mattpocock + phuryn + `anthropic/frontend-design` skill
6. **PATH 등록** — 현재 세션 즉시 적용

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
#    Gate A 승인 후 frontend-design skill 로 interactive code 생성

# 6. Phase 3: Developer 가 구현 → QA → Close Gate (3항목 체크)

# 7. Phase 4: Deploy (또는 auto-skip)

# 8. Phase 5: Close — Retrospective + 다음 버전 backlog

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

## Wiki backend

| | `graphiti` | `keeper` |
|---|---|---|
| 저장소 | FalkorDB (로컬 Docker) | `~/.productune/wiki/` (파일) |
| LLM | Ollama 로컬 모델 (백그라운드) | Claude API |
| 추가 설치 | Docker + ollama (onboard 자동) | 없음 |
| 검색 품질 | Knowledge Graph (관계 추론) | 파일 검색 |
| 활성 페르소나 | pdt-developer, pdt-designer, pdt-qa | + pdt-wiki-keeper |

backend 는 `~/.productune/productune.env` 의 `WIKI_BACKEND=` 로 확인/변경.

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
├── designer/                                 # Designer master files (global)
│   ├── design-system.md                      # ← 단일 global instance (per-feature copy X)
│   ├── feature-history.md                    # Version 결정 log (Phase 1 read / Phase 5 write)
│   ├── decisions.md                          # Non-trivial design decisions
│   └── R<n>-<slug>.md                        # Work notes
├── qa/
│   ├── <slug>-test-plan.md
│   └── fail-patterns.md                      # QA 누적 실패 패턴 (Phase 1 read)
└── retrospectives/<version>.md               # Phase 5 close (Designer 작성)
```

글로벌 singleton: `docs/designer/design-system.md` — 개발 중 per-feature copy 절대 금지. Version close 시 PO 가 `docs/artifacts/<version>/design-system-snapshot.md` 로 snapshot.

## Memory promotion

각 페르소나는 `promotion_candidates` 만 리턴 (자동 write 안 함). 절차:
- Persona 가 `promotion_candidates[]` 배열로 제안
- PO 가 사용자에 한 줄 propose
- 사용자 `y` → PO 가 mechanical write
  - project tier: `docs/designer/decisions.md` append
  - wiki tier: PO `claude --print` (no `--agent`) subprocess 으로 graphiti 직접 호출 (wiki write 유일 경로)

## Files

```
productune/
├── packages/
│   └── core/                            # CLI core
│       ├── agents/                      # symlinked to ~/.claude/agents/
│       │   ├── pdt-po.md                # PO orchestrator
│       │   ├── pdt-designer.md
│       │   ├── pdt-developer.md
│       │   ├── pdt-qa.md
│       │   ├── pdt-wiki-keeper.md       # keeper backend 시에만
│       │   └── variants/                # backend별 variant (graphiti/keeper/fs)
│       ├── po/                          # PO doctrine (~/.productune/ 로 copy)
│       │   ├── po-instructions.md       # entry index
│       │   ├── po-memory.md.template
│       │   └── sections/               # sub-files (load on demand)
│       │       ├── stages.md  memory.md  tickets.md  routing.md  escalation.md
│       │       ├── lifecycle.md  prd-and-output.md  po-loop.md
│       │       ├── _formats/           # output shape sub-files (8개)
│       │       └── _details/           # reference sub-files (9개)
│       ├── config/
│       │   └── model-catalog.json      # tier별 추천 모델
│       └── scripts/
│           ├── install.sh              # onboard — engine/wiki/LLM/hooks/skills/PATH
│           ├── uninstall.sh
│           ├── productune              # daily entrypoint
│           ├── setup-graphiti.sh / setup-skills.sh / graphiti-launcher.sh
│           └── hooks/
│               ├── pre-delegate-task-check.sh   # PreToolUse(Bash) — firm rule blocks
│               ├── post-delegate-state-write.sh # PostToolUse(Bash) — session_id, turns
│               ├── post-edit-format.sh          # PostToolUse(Write|Edit) — formatter
│               ├── post-compact-doctrine.sh     # PostCompact — hard rules re-inject
│               └── stop-verify.sh              # Stop(pdt-developer) — typecheck/build gate
├── docs/
│   ├── prd/                            # PRD (English, Designer 작성)
│   ├── tickets/<version>/T-NNN.md      # Ticket SoT
│   ├── artifacts/<version>/            # Design + QA artifacts (flat per version)
│   ├── designer/                       # Designer master + global DS
│   ├── qa/                             # Test plans + fail-patterns
│   └── retrospectives/                 # Phase 5 close reviews
└── README.md
```

## Troubleshooting

- **"claude doesn't list my personas"** → `productune onboard` 재실행 (symlink 재생성 + dangling sweep)
- **"hooks didn't fire / boundary keeps drifting"** → 엔진이 `codex` 일 가능성. `productune --engine claude` 또는 `~/.productune/productune.env` 의 `MY_PO_ENGINE=claude` 변경
- **"hook 등록 누락"** → `jq '.hooks' ~/.claude/settings.json` 으로 PreToolUse / PostToolUse / PostCompact / Stop 확인. 빠지면 `productune onboard` 재실행
- **"persona output 이 JSON 이 아니다"** → 페르소나 md 버전 낡은 것. `productune onboard` 재실행 (agent file 재링크)
- **"po-state.json 이 너무 크다"** → hygiene 자동 sweep (H1–H5) 이 미동작한 것. `productune` 재시작하면 turn-start 에 자동 정리
- **"version naming 오류"** → `v<숫자>` 형식만 유효 (예: `v1`, `v2`, `v0.5`). 다른 형식이면 validator 가 차단
- **"graphiti MCP fails to start"** → `docker ps` (falkordb 확인), `curl http://localhost:11434/api/tags` (ollama 확인), `productune onboard` 로 graphiti 재셋업
- **"entity extraction quality is bad"** → `config/model-catalog.json` 에서 더 큰 모델로 교체 후 `productune onboard`
- **legacy state.json schema** — 옛 schema 면 `rm <project>/.productune/po-state.json` 후 PO 다시 시작

## Updating

```sh
cd <clone-dir>           # install 시 clone 한 위치 (예: ~/code/productune)
git pull
productune onboard
```

`packages/core/agents/*.md` + `packages/core/scripts/hooks/*.sh` 는 repo 그대로 사용 — 수정 즉시 반영. PO doctrine (`packages/core/po/` → `~/.productune/`) 는 copy 라 `productune onboard` 재실행 필요.

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
rm -rf ~/.claude/agents/{pdt-po,pdt-designer,pdt-developer,pdt-qa,pdt-wiki-keeper}.md
jq 'del(.hooks.PreToolUse, .hooks.PostToolUse, .hooks.PostCompact, .hooks.Stop)' \
  ~/.claude/settings.json | sponge ~/.claude/settings.json
rm -rf ~/.productune                             # po-instructions, sections/, productune.env, wiki/
docker rm -f falkordb && docker volume rm falkordb-data
rm -rf ~/.graphiti ~/.claude/skills/{mattpocock,phuryn,anthropic}
rm -rf <clone-dir>
```

> `productune uninstall` 이 hook 등록 + statusLine 까지 자동 strip 합니다. 수동 정리는 fallback 용.
