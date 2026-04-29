# productune

> 오케스트라처럼 — 들으면서 곡 (제품) 을 tune 해 나가는 컨셉.
> **개발에 대해 잘 알지 못하는 기획자가 프로덕트를 성공적으로 만들 수 있는 툴**.

CLI 한 줄 (`productune`) 로 시작해서 **PRD → Test → Issue → 구현 → Refactor** 를 4 명의 전문가 페르소나가 함께 돌리는 로컬 dev-workflow 도구.

```
사용자 ─한 문장─▶ productune (PO orchestrator, sonnet/opus)
                   │
                   ├── claude --agent pdt-designer   → UX/Brand/Design System (default opus)
                   ├── claude --agent pdt-developer  → 구현 (default sonnet)
                   └── claude --agent pdt-qa         → 검증 (default haiku)
                                                  │
                                                  └─ 각 페르소나 3-tier 메모리:
                                                     1. session  — Claude session (per ticket)
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
| **Phase 1 (지금)** | CLI 기반 핵심 + dogfood-ready | terminal `productune` | **현재 작업 중** |
| Phase 2 | 사용자가 실제 프로젝트 1 개로 dogfood 완주 | 동일 (CLI) | Phase 1 완료 후 |
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

> **PO 는 산출물을 직접 작성하지 않습니다.** 인터뷰 brief 만 자기 손으로 (`<project>/.productune/briefs/<slug>.md` append) 채우고, PRD/티켓/디자인/코드는 모두 sub-agent 위임. 이 구조 덕분에 sub-agent 호출 시 `--model opus` override 로 작업별 모델 분리가 자동 됩니다.
> PO 가 task 난이도 → tier 매핑 시 [OSS 7-level task complexity hierarchy](https://github.com/ulab-uiuc/LLMRouter) 차용.
> Effort `xhigh` / `max` 는 **opus 전용** (다른 model 은 자동 승격). `max` 는 Stage 1 라우팅에서만 사용 — escalation Path 1 retry 는 `xhigh` 에서 capped.
> **L4+ implementation 은 plan-first** — pdt-developer 가 opus/xhigh 로 plan 작성 → PO 가 직접 검수 → sonnet/high 로 1-shot 구현.
> **PRD 는 clarity loop** — Designer 가 ambiguity score `A = 1 − Σ(clarityᵢ × weightᵢ)` 를 0.05 까지 reasoning 인터뷰로 낮춤. 5 라운드 cap.

## Why the 3-tier memory

사람의 단기 / 중기 / 장기 기억 모방.

| Tier | Scope | Where | Who writes |
|---|---|---|---|
| **Session** | 한 ticket | Claude Code session (`--session-id`) | Claude 자동 |
| **Project** | 한 repo | `docs/<persona>/*.md` (committed) | PO, 사용자 승인 후 |
| **Wiki** | persona-global cross-project | Graphiti KG (`group_id=persona-<name>`, FalkorDB) or `~/.productune/wiki/` | PO, `[PROMOTION-APPROVED]` 마커 + 사용자 승인 |

핵심 제약: **pdt-designer 가 옛 프로젝트 색감을 새 프로젝트에서 즉시 떠올리지 않음** — project tier 가 디렉토리 격리, generalized 원칙만 wiki promote. Graphiti bi-temporal 로 옛 사실 자동 deprecate.

## Real Engineering 워크플로

```
Interview (PO)               — 사용자 문답 + brief 합성 (pm-product-discovery, grill-me)
   ↓
PRD (Designer Why)            — clarity loop A ≤ 0.05 (opus + ⚡max)
   ↓
Test (pdt-qa What)            — acceptance criteria → test 정의
   ↓
Issue (Designer How)         — PRD 와 함께 ticket 파일 emission (mattpocock to-issues)
   ↓
Impl (pdt-developer What/How) — TDD 사이클 (mattpocock tdd, triage-issue)
   ↓
Refactor (pdt-developer How)  — request-refactor-plan, improve-codebase-architecture
   ↓
QA (pdt-qa What/How)          — 자동화 + manual + e2e
   ↓ (반복)
```

각 stage transition 에 PO 가 1줄 announce. 단순 작업은 stage 일부 skip.

OSS reference: [mattpocock/skills](https://github.com/mattpocock/skills) (23 skill) + [phuryn/pm-skills](https://github.com/phuryn/pm-skills) (65 skill, 8 plugin) — `bash scripts/setup-skills.sh` 로 한 번에 설치.

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

```sh
git clone https://github.com/shawn-kim-axz/productune
bash productune/scripts/install.sh
```

> Clone 위치는 어디든 OK — symlink target 이라 그대로 유지하면 됩니다 (`~/code/productune`, `~/productune` 등 자유). 단, wiki data 가 저장되는 `~/.productune/` 와 겹치지 않게만 주의.

이후엔 어디서든 `productune onboard` 로 재실행 가능 (PATH 등록은 첫 install 마지막에 처리됨).

`install.sh` 가 인터랙티브하게 처리:

1. **Claude Code preflight** — CLI 미설치면 자동 설치 (`npm install -g @anthropic-ai/claude-code`), 미로그인이면 `claude auth login` 자동 실행. 이미 연결돼 있으면 바로 다음 단계로 진행. (PO 엔진은 항상 `claude` — codex 선택지는 install 에서 제거됨.)
2. **Wiki backend 설정** — 하드웨어 자동 감지
   - Tier S (RAM ≥ 16GB) / Tier A (RAM ≥ 8GB): Ollama 로컬 LLM 선택 → 자동 설치 → FalkorDB + Graphiti 자동 셋업
   - Tier B (RAM 부족 / Docker 없음): wiki-keeper agent (Claude API) 자동 선택
3. **Hook 5개 등록** — `~/.claude/settings.json` 에 PreToolUse / PostToolUse / PostCompact / Stop 자동 merge (firm rule 결정론 보장)
4. **OSS skill 설치** — mattpocock + phuryn skill 라이브러리
5. **PATH 등록** — 현재 세션 즉시 적용

> codex 를 fallback engine 으로 쓰려면 `~/.productune/productune.env` 의 `MY_PO_ENGINE=codex` 로 수동 변경하거나 per-session `productune --engine codex` (hook 미발동 → R1-R4 doctrine-only).

> 모델 목록은 [Ollama registry](https://registry.ollama.ai) 에서 실시간 크기를 조회해 하드웨어 tier 에 맞는 것만 표시합니다 (`config/model-catalog.json` 에서 관리).

## Daily use

```sh
cd ~/path/to/target-project

# Full PO flow (권장)
productune                          # default = claude (hooks 발동), onboard 에서 변경 가능
productune --engine claude          # 100% Anthropic stack (default — R1~R4 hook firm rules 활성)
productune --engine codex           # Codex CLI (hook 미발동 → R1~R4는 doctrine-only)

# 도움말
productune --help                   # 현재 설정 포함 커맨드 레퍼런스

# 유지보수
productune onboard                  # 재설치 (페르소나 재연결 / 설정 변경)
productune uninstall                # 설치된 모든 artifact 제거
productune gc                       # productune/* worktree audit (dry-run)
productune gc -y                    # 안전한 worktree 자동 정리

# 직접 호출 (worktree split / parallel-safety 없음)
claude --agent pdt-po
claude --agent pdt-developer        # 단일 페르소나
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
| **Hook firm rules** (R1 slug · R2 archive · R3 `.md` boundary · R4 session reuse) | ✓ deterministic | ✗ doctrine-only (Codex bypasses Claude Code hooks) |
| Cost-split | ✗ all on Anthropic | ✓ |
| ToS | **Cleanest** — 100% first-party | OK |

Default = **claude** because hook-based firm rules (`scripts/hooks/pre-delegate-task-check.sh` etc.) only fire inside Claude Code sessions. Codex spawned PO bypasses them, so boundary/archive/session-reuse violations become PO drift instead of code-blocked.

Switch: `MY_PO_ENGINE=codex` in `~/.productune/productune.env` or `productune --engine codex` per-session.

## Wiki backend

| | `graphiti` | `keeper` |
|---|---|---|
| 저장소 | FalkorDB (로컬 Docker) | `~/.productune/wiki/` (파일) |
| LLM | Ollama 로컬 모델 (백그라운드) | Claude API |
| 추가 설치 | Docker + ollama (onboard 자동) | 없음 |
| 검색 품질 | Knowledge Graph (관계 추론) | 파일 검색 |
| 활성 페르소나 | pdt-developer, pdt-designer, pdt-qa | + pdt-wiki-keeper |

backend 는 `~/.productune/productune.env` 의 `WIKI_BACKEND=` 로 확인/변경. 변경 후 `productune onboard` 재실행.

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

Cleanup: `productune gc` (dry-run) / `productune gc -y` (자동 정리). 결정 기준은 **순수 git state** — 커밋 + push 또는 main merge 됐으면 ✓ safe, 아니면 ❌ unsafe (보존).

## Ticket system

PO 가 작업을 ticket 단위로 영속화:
- `<project>/.productune/po-state.json` 에 `current_round`, `current_task` (with `ticket_id`, `stage`, `assignee_persona`, deps, linked_tickets), `past_tickets[]`, `rounds`
- Ticket close 시 PO 가 archive (current → `past_tickets`) + calibration log 한 줄 → `<project>/docs/tickets/<round-id>/T-<id>.md` git-versioned export
- `pre-delegate-task-check.sh` hook (R2) 가 archive 누락된 채 새 task 시작을 차단

## Memory promotion

각 페르소나는 `[PROMOTION-APPROVED]` 마커 게이트. 직접 호출 시 wiki write 거절. 절차:
- Persona 가 promotion_candidate 만 리턴 (자동 write 안 함)
- PO 가 사용자에 한 줄 propose
- 사용자 `y` → PO 가 mechanical write (project tier: `printf >>`, wiki tier: `[PROMOTION-APPROVED]` 마커 prefix 후 페르소나 재호출)

## Files

```
productune/
├── agents/                              # symlinked to ~/.claude/agents/
│   ├── pdt-po.md                        # PO orchestrator (entry — full doctrine in po/)
│   ├── pdt-designer.md
│   ├── pdt-developer.md
│   ├── pdt-qa.md
│   ├── pdt-wiki-keeper.md               # keeper backend 시에만 ~/.claude/agents/에 링크
│   └── variants/                        # backend별 페르소나 variant (graphiti / keeper / fs)
├── po/                                   # PO doctrine (engine-agnostic; copied to ~/.productune/)
│   ├── po-instructions.md               # entry index (~100L)
│   ├── po-memory.md.template
│   └── sections/                        # detailed wiki (load on demand)
│       ├── stages.md  memory.md  tickets.md  routing.md  escalation.md
│       └── delegation.md  calibration.md  lifecycle.md  evolution.md  prd-and-output.md
├── codex/
│   └── config.toml                      # Codex CLI profile manifest (--engine codex 시)
├── config/
│   └── model-catalog.json               # tier별 추천 모델 (Ollama registry 실시간 조회)
├── scripts/
│   ├── install.sh                       # onboard — engine / wiki / LLM / hooks / Graphiti / PATH
│   ├── uninstall.sh
│   ├── productune                       # daily entrypoint (default --engine claude)
│   ├── setup-graphiti.sh / setup-skills.sh / graphiti-launcher.sh
│   └── hooks/                           # Claude Code hooks (auto-merged into ~/.claude/settings.json)
│       ├── pre-delegate-task-check.sh   # PreToolUse(Bash) — R1~R4 firm rule blocks
│       ├── post-delegate-state-write.sh # PostToolUse(Bash) — capture session_id, bump turns
│       ├── post-edit-format.sh          # PostToolUse(Write|Edit) — formatter
│       ├── post-compact-doctrine.sh     # PostCompact — re-inject hard rules
│       └── stop-verify.sh               # Stop(pdt-developer) — typecheck/build gate
├── docs/
│   ├── prd/productune.md  overview.md  pitch.md  testing.md
└── README.md
```

## Troubleshooting

- **"claude doesn't list my personas"** → `productune onboard` 재실행 (symlink 재생성 + dangling sweep)
- **"hooks didn't fire / boundary keeps drifting"** → 엔진이 `codex` 일 가능성. Claude Code hooks 는 Claude 세션 안에서만 발동. `productune --engine claude` 또는 `~/.productune/productune.env` 의 `MY_PO_ENGINE=claude` 변경
- **"hook 등록 누락"** → `jq '.hooks' ~/.claude/settings.json` 으로 PreToolUse / PostToolUse / PostCompact / Stop 4개 키 확인. 빠지면 `productune onboard` 재실행
- **"`.codex/po-state.json` 이 생긴다"** → `productune` wrapper 가 자동 마이그 (`.codex/` → `.productune/`). 안 되면 `mv <project>/.codex/po-state.json <project>/.productune/po-state.json`
- **"graphiti MCP fails to start"** → `docker ps` (falkordb 확인), `curl http://localhost:11434/api/tags` (ollama 확인), `productune onboard` 로 graphiti 재셋업
- **"entity extraction quality is bad"** → `config/model-catalog.json` 에서 더 큰 모델로 교체 후 `productune onboard`
- **legacy state.json schema** — 옛 `top-level persona_sessions` 면 `rm <project>/.productune/po-state.json` 후 PO 다시 시작 (또는 `productune init` 으로 새로 시드)

## Updating

```sh
cd <clone-dir>           # install 시 clone 한 위치 (예: ~/code/productune)
git pull
productune onboard
```

`agents/*.md` + `scripts/hooks/*.sh` 는 repo 그대로 사용 (symlink 또는 path 참조) — 수정 즉시 반영. Codex config (`codex/config.toml`) + PO doctrine (`po/po-instructions.md` → `~/.productune/`) 는 copy 라 `productune onboard` 재실행 필요.

## Non-goals / future

- UI 는 Phase 3 — 지금은 OOS
- Codex 페르소나 (sub-agent 런타임으로) 통합 — Codex agent 의 권한 / MCP 격리 모델이 1:1 매칭 안 됨, 별도 plan
- Multi-user / 팀 공유 — 현 single-user 가정
- 자동 deploy / CI 통합

## Uninstall

```sh
productune uninstall
```

또는 수동으로:

```sh
rm -rf ~/.claude/agents/{pdt-po,pdt-designer,pdt-developer,pdt-qa,pdt-wiki-keeper}.md
jq 'del(.hooks.PreToolUse, .hooks.PostToolUse, .hooks.PostCompact, .hooks.Stop)' \
  ~/.claude/settings.json | sponge ~/.claude/settings.json   # 또는 productune-only 항목만 strip
rm ~/.codex/config.toml                          # codex profile manifest
rm -rf ~/.productune                             # po-instructions, sections/, po-memory, productune.env, wiki/
docker rm -f falkordb && docker volume rm falkordb-data
rm -rf ~/.graphiti ~/.claude/skills/{mattpocock,phuryn}
rm -rf <clone-dir>       # install 시 clone 한 위치
```

> `productune uninstall` 이 hook 등록 + statusLine 까지 자동 strip 합니다. 수동 정리는 fallback 용.
