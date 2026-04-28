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
                                                     3. wiki     — Graphiti, persona-global
                                                                   group_id=persona-<name>
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

| 페르소나 | Default 모델 | Why mode | How mode | What mode |
|---|---|---|---|---|
| **productune** (PO) | sonnet | **opus + ⚡xhigh** — MVP PRD 첫 round 수립 (Discovery / 실현가능성 / 위험 동시 reasoning) | sonnet/medium — 라우팅 / 티켓 관리 / 교통정리 | — |
| **pdt-designer** | opus | **opus + ⚡xhigh** — net-new 시스템 디자인 (UX/Brand/DS) | sonnet/low — 단순 token 매핑, haiku — 단일 컴포넌트 compliance | — |
| **pdt-developer** | sonnet | — | **opus + high** — 아키텍처 / 멀티-파일 refactor / 2턴+ 디버깅. **opus + ⚡xhigh** — 3턴 째 디버깅 / 시스템 차원 결정 | sonnet/medium — PRD 기반 명료한 구현 |
| **pdt-qa** | haiku | — | sonnet/high — 복잡 UX flow, stress, e2e, 반복 QA issue. test 환경 bypass 요청 (auth pass 등) PO 통해 처리 | haiku/low — npm test, lint/build, 단일 페이지 nav |

> PO 가 task 난이도 → tier 매핑 시 [OSS 7-level task complexity hierarchy](https://github.com/ulab-uiuc/LLMRouter) 차용.
> Effort `xhigh` 는 opus 에만 허용 (다른 model 은 자동 승격).

## Why the 3-tier memory

사람의 단기 / 중기 / 장기 기억 모방.

| Tier | Scope | Where | Who writes |
|---|---|---|---|
| **Session** | 한 ticket | Claude Code session (`--session-id`) | Claude 자동 |
| **Project** | 한 repo | `docs/<persona>/*.md` (committed) | PO, 사용자 승인 후 |
| **Wiki** | persona-global cross-project | Graphiti KG (`group_id=persona-<name>`, FalkorDB) | PO, `[PROMOTION-APPROVED]` 마커 + 사용자 승인 |

핵심 제약: **pdt-designer 가 옛 프로젝트 색감을 새 프로젝트에서 즉시 떠올리지 않음** — project tier 가 디렉토리 격리, generalized 원칙만 wiki promote. Graphiti bi-temporal 로 옛 사실 자동 deprecate.

## Real Engineering 워크플로

```
PRD (productune Why)         — 사용자 문답 + 실현가능성 (mattpocock to-prd, grill-me)
   ↓
Test (pdt-qa What)            — acceptance criteria → test 정의
   ↓
Issue (productune How)       — vertical-slice ticket 분해 (mattpocock to-issues)
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
- `claude` — Claude Code CLI, 인증 완료
- `codex` — OpenAI Codex CLI (`npm i -g @openai/codex`)
- `uv` — Python runner (`brew install uv`)
- `jq` — JSON CLI (`brew install jq`)
- `docker` — Docker Desktop (FalkorDB 용)
- `ollama` — 로컬 LLM (`brew install ollama && brew services start ollama`)
- Ollama 모델:
  - `gemma4:26b` — Graphiti entity 추출 (wiki tier)
  - `nomic-embed-text` — Graphiti embedding (`ollama pull nomic-embed-text`)
  - `qwen3.5:4B` — Codex fallback (선택)

## Install

```sh
# 1. Clone — 원하는 경로로
git clone https://github.com/shawn-kim-axz/productune.git ~/<your-path>/productune
cd ~/<your-path>/productune

# 2. install.sh — 인터랙티브 (engine / wiki backend / skill / PATH 등록 prompt)
bash scripts/install.sh

# 3. Graphiti wiki tier 셋업 (선택, 권장)
bash scripts/setup-graphiti.sh

# 4. 검증
which productune     # 경로 출력
claude agents        # 4 페르소나 보임: productune, pdt-designer, pdt-developer, pdt-qa
```

`install.sh` 가 자동으로 처리:
- 페르소나 symlink 정리 (dangling 자동 sweep)
- `~/.codex/productune.env` 에 engine 선택 + wiki backend + skill 설치 흔적 저장
- PATH 등록 인터랙티브 — shell rc 추가 / `~/.local/bin` symlink / `/usr/local/bin` symlink / 건너뜀 중 선택
- `productune` 가 env 파일 source 하므로 spawn 페르소나도 상속

## Daily use

```sh
cd ~/path/to/target-project

# Full PO flow (권장)
productune                          # default engine: Codex
productune --engine claude          # 100% Anthropic stack

# 유지보수
productune onboard                  # install.sh 재실행 (페르소나 재연결 / 설정 변경)
productune uninstall                # 설치된 모든 artifact 제거

# 직접 호출 (worktree split / parallel-safety 없음)
codex --profile productune          # (legacy `--profile po` 도 동작)
claude --agent pdt-po
claude --agent pdt-developer         # 단일 페르소나

# Legacy 명령 (호환 alias — 한동안 유지)
my-po                               # productune 과 동일
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

## Quality-based escalation

페르소나가 confidence=low 또는 unresolved 항목 보고 → PO 가 3-option 메뉴 surface:

```
[PO] pdt-developer 결과 confidence=low (unresolved: ["Next 16 middleware..."]).
     [1] retry — 모델 sonnet → opus, effort medium → high (같은 session resume)
     [2] skill 검색 — keyword 로 9 registry 조회 (mattpocock + phuryn + skill-fetch)
     [3] 그냥 진행 (Follow-ups 로 surface)
     선택? [1/2/3/Enter=1]
```

OSS 근거: RouteLLM cascade, Anthropic engineering "Demystifying evals" 의 reflect-and-retry 패턴.

## Ticket system

PO 가 작업을 ticket 단위로 영속화:
- `<project>/.codex/po-state.json` 에 `current_round`, `current_task` (with `ticket_id`, `stage`, `assignee_persona`, deps, linked_tickets), `past_tickets`, `rounds`
- Ticket close 시 자동 export — `<project>/docs/tickets/<round-id>/T-<id>.md` git-versioned

후일 Phase 3 의 UI dashboard backend.

## Picking a PO engine

| | `--engine codex` (default) | `--engine claude` |
|---|---|---|
| Top-level reasoning | OpenAI hosted (Codex CLI) | Anthropic hosted (Claude Code) |
| Subscription | ChatGPT Plus / Pro | Claude Pro / Max |
| Persona subscription | Claude (변동 없음) | Claude (변동 없음) |
| Cost-split | ✓ | ✗ — all on Anthropic |
| ToS | OK | **Cleanest** — 100% first-party |

`MY_PO_ENGINE=claude` 또는 `productune --engine claude` 로 변경 가능. 환경 변수 이름 `MY_PO_ENGINE` 은 호환을 위해 유지.

## 병렬 작업 (자동 worktree split)

같은 프로젝트에서 두 번째 `productune` 호출:
```
[productune] another PO is running on /Users/.../my-project (pid 12345)
[productune] creating worktree at .../my-project-productune-<ts> on branch productune/<ts>
```

Cleanup: `productune gc` (dry-run) / `productune gc -y` (자동 정리). 결정 기준은 **순수 git state** — 커밋 + push 또는 main merge 됐으면 ✓ safe, 아니면 ❌ unsafe (보존).

## Files

```
productune/
├── agents/                       # symlinked to ~/.claude/agents/
│   ├── productune.md             # PO (구 my-po; planner role 흡수)
│   ├── pdt-designer.md
│   ├── pdt-developer.md
│   └── pdt-qa.md
├── codex/
│   ├── config.toml               # profiles.productune (+ legacy po alias) + local
│   ├── po-instructions.md        # PO doctrine (Real Engineering + ticket + tier + quality)
│   └── po-memory.md.template
├── scripts/
│   ├── install.sh                # one-time setup (onboard)
│   ├── uninstall.sh              # 모든 artifact 제거
│   ├── productune                # daily entrypoint — onboard / uninstall / gc / engine 선택
│   ├── my-po                     # → productune (compat symlink)
│   ├── setup-graphiti.sh         # FalkorDB + Graphiti
│   ├── setup-skills.sh           # mattpocock + phuryn skill 설치
│   └── graphiti-launcher.sh      # provider-aware Graphiti spawn
├── docs/
│   ├── prd/productune.md         # 자체 PRD (round 누적)
│   ├── overview.md
│   ├── pitch.md
│   ├── customization.md
│   ├── plan.md
│   └── testing.md                # end-to-end 테스트 플랜 (한글)
└── README.md                     # this file
```

## Memory promotion

각 페르소나는 `[PROMOTION-APPROVED]` 마커 게이트. 직접 호출 시 wiki write 거절. 절차:
- Persona 가 promotion_candidate 만 리턴 (자동 write 안 함)
- PO 가 사용자에 한 줄 propose
- 사용자 `y` → PO 가 mechanical write (project tier: `printf >>`, wiki tier: `[PROMOTION-APPROVED]` 마커 prefix 후 페르소나 재호출)

## Troubleshooting

- **"claude doesn't list my personas"** → `bash scripts/install.sh` 재실행 (symlink 재생성 + dangling sweep)
- **"graphiti MCP fails to start"** → `docker ps` (falkordb), `curl http://localhost:11434/api/tags` (ollama), `ls ~/.graphiti/mcp_server/main.py`
- **"entity extraction quality is bad"** → `gemma4:26b` 대체 (`gemma2:27b`, `qwen2.5:32b`, `GRAPHITI_LLM_MODEL` 으로 set) 또는 install.sh option [2] Anthropic 으로 hosted-quality
- **legacy state.json schema** — 옛 `top-level persona_sessions` 면 `rm <project>/.codex/po-state.json` 후 PO 다시 시작

## Updating personas

`agents/*.md` 가 symlink 라 직접 수정하면 즉시 반영. Codex config (`codex/config.toml`, `codex/po-instructions.md`) 은 copy 라 수정 후 `bash scripts/install.sh` 재실행 필요.

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
rm -rf ~/.claude/agents/{productune,pdt-designer,pdt-developer,pdt-qa}.md
rm ~/.codex/{config.toml,po-instructions.md,productune.env}
docker rm -f falkordb && docker volume rm falkordb-data
rm -rf ~/.graphiti ~/.claude/skills/{mattpocock,phuryn}
```
