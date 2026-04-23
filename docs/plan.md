> **Note**: this document is the design **journey** — the thinking, trade-offs, and intermediate decisions that led to the current system. It evolved during implementation and some parts are now outdated relative to what actually ships.
>
> **For the current spec, read [`../README.md`](../README.md)** — that's the source of truth.
>
> Kept here because the reasoning (why Graphiti over Mem0, why 3-tier, why Ollama for memory only) is useful context when you later edit the system.

---

# Plan: Codex CLI(PO) × Claude Code 서브에이전트 멀티페르소나 + 3-tier 메모리

## Context

이 agentcafe repo 에서 **OpenAI Codex CLI**를 "PO(Product Owner)" 오케스트레이터로 두고, 하위 작업을 **Claude Code 서브에이전트 4개 페르소나**(Planner, Designer, Developer, QA)에게 위임하는 환경을 구축합니다. 나아가 각 페르소나의 기억을 인간의 기억 구조처럼 3계층으로 분리:

| 계층 | 범위 | 영속성 | 구현 |
|------|------|--------|------|
| **Session** | task (한 대화) | 휘발성, 그 작업이 끝나면 사라짐 | Claude Code native `--session-id` + `--resume` |
| **Memory** | project (한 프로젝트) | 프로젝트 전환 시 분리, git 가능 | **Basic Memory** (markdown + sqlite + MCP) |
| **Wiki/Graph** | persona (모든 프로젝트 통합) | 영구, 시간-가중치 | **Graphiti** (Zep OSS, bi-temporal graph + MCP) |

핵심 동기: "디자이너가 옛날 프로젝트의 디자인을 새 프로젝트에서 바로 떠올리면 안 된다." → 프로젝트별로 중기 기억을 격리하되, 정말로 일반화된 스타일/원칙만 persona-global wiki 로 승격. Graphiti 의 bi-temporal 모델(fact validity windows, invalidated facts ≠ deleted)이 이걸 정확히 해결.

현재 리포는 greenfield: `.codex/`, `.claude/`, MCP 설정 없음. AGENTS.md·CLAUDE.md 는 거의 비어 있음.

## 왜 이 라이브러리들인가

### Wiki/Graph (persona-global) = Graphiti (getzep/graphiti)

- **Bi-temporal**: 모든 edge 에 `(event_time, ingestion_time)` 이중 타임스탬프와 validity window. 오래된/반박된 사실은 invalidate 되고 새 사실이 우선. → "오래된 디자인이 빨리 떠오름" 문제를 구조적으로 방지.
- **Group isolation**: `group_id` 로 서브그래프 분리 → persona 별 격리 보장 (`persona:designer`, `persona:developer`, ...).
- **Local-only 가능**: LLM=Ollama, 임베딩=nomic-embed-text, 스토리지=Kuzu(embedded, file-based, Docker 불필요). 네트워크/클라우드 의존성 제거 가능.
- **MCP v1.0 (2025-11 GA)**: Claude/Cursor 호환. 내장 tool 그룹: Episode(add/retrieve/delete), Entity/Relationship handling, Hybrid Search(semantic+keyword+graph), Group management, Graph maintenance.
- **성능**: P95 300ms 하이브리드 검색, LongMemEval 에서 Mem0 대비 +15pt (atlan 비교).
- **Apache 2.0 OSS**, Zep 유료 플랜은 매니지드/관리기능만 차이.

### Memory (project) = Basic Memory (basicmachines-co/basic-memory)

- **Markdown + SQLite + knowledge graph**: 파일은 사람이 직접 읽고 편집·커밋할 수 있는 `.md`. SQLite 는 인덱스/그래프 메타만 보관.
- **네이티브 project scoping**: `basic-memory --project <name>` 플래그, `basic-memory project set/list/create` CLI. → 프로젝트별 기억 격리가 라이브러리 기본 기능.
- **MCP tools**: `write_note`, `read_note`, `edit_note`, `move_note`, `delete_note`, `search`, `build_context`, `recent_activity`, `list_directory`, `canvas`(시각화), `list_memory_projects`, `create_memory_project`, `get_current_project`.
- **활발**: v0.20.3 (2026-03-27), FastMCP 3.0 지원, Semantic Vector Search 도입됨. 77 릴리스.
- **Obsidian-friendly**: 같은 파일을 옵시디언/다른 에디터로도 열람 가능, 팀 공유/PR 리뷰 용이.

### Session = Claude Code native

- 추가 라이브러리 0 개. `--session-id <uuid>` 로 고정, `--resume <id>` 로 복귀.
- 페르소나별로 세션 id 를 파일 하나에 저장(`.codex/persona-sessions.json`).

### 탈락 후보 (간단히)

- **Mem0**: 최대 커뮤니티, user_id/agent_id/run_id/app_id 4차원 scoping. 그러나 LongMemEval 에서 Graphiti 에 15pt 뒤지고, 호스티드 tier 의존, 사용자 요구(시간-가중치)에 정확히 맞는 건 Graphiti. 후일 필요하면 교체 가능.
- **Cognee**: 문서 인게스트→그래프 빌드 파이프라인. 대화/장기 개인화보다 DB/문서 RAG 에 가깝다고 문서가 명시("doesn't handle conversation personalization well"). 이 유즈케이스 부적합.
- **Letta (MemGPT)**: OS-like tiered memory. graph-native 가 아님, MCP 생태 약함.
- **LangMem**: LangChain 의존, 스택 외.

## 전체 아키텍처

```
┌────────────────────────────────────────────────────────┐
│  Codex CLI  (PO — 최상위 context, AGENTS.md 지침에 따라   │
│   persona 선택 및 위임. shell tool 로 claude CLI 호출)     │
└───────────────┬────────────────────────────────────────┘
                │ shell-out
                ▼
    claude --agent <persona> -p "<task>" \
      --session-id <persona_session_uuid> --resume \
      --output-format json
                │
                ├─── Session tier (Claude native, task 단위)
                │
                │ MCP servers (per Claude session):
                ├─── Memory tier
                │     basic-memory (project-scoped)
                │     └─ ~/.basic-memory/<project>/*.md (or in-repo)
                │
                └─── Wiki tier
                      graphiti (group_id=persona:<name>)
                      └─ ~/.graphiti/kuzu/ (embedded, file-based)
                          + Ollama(LLM/embeddings) localhost
```

Persona 격리 원칙:
- Wiki: `group_id="persona:<name>"` 를 각 페르소나 system prompt 에 강제 → 검색/추가 모두 자기 서브그래프로 한정.
- Memory: `basic-memory --project` 플래그로 프로젝트 디렉토리 격리. 페르소나 간에는 프로젝트 내 네임스페이스(하위 폴더 `designer/`, `developer/` 등)로 분리.
- Session: 페르소나별 session uuid, `.codex/persona-sessions.json` 에 매핑 보관.

## 승격(promotion) 정책

각 페르소나 system prompt 에 포함될 "기억 승격 정책":

1. **Session → Memory(project)**
   - 조건: 대화 중 "결정", "디자인 결론", "트레이드오프 설명", "외부 제약(레거시/규제/보안)" 이 확정됐을 때.
   - 동작: Basic Memory `write_note` 로 `design-decisions.md`, `open-questions.md` 같은 파일에 기록. 앞에 WHY + date.
2. **Memory(project) → Wiki(persona)**
   - 조건: 같은 원칙/스타일/패턴이 **둘 이상 프로젝트에서 반복** 혹은 사용자가 명시적으로 "이건 항상 이렇게 해" 라고 말한 경우.
   - 동작: Graphiti `add_episode` 로 `group_id=persona:<name>` 에 에피소드 추가. 엔티티·관계 자동 추출.
   - 검증: 애매하면 사용자에게 승격 여부 확인(옵션).
3. **Wiki invalidation**
   - 페르소나가 "더 이상 그렇게 하지 않는다" 라고 말하면 새 사실 추가 → Graphiti 가 이전 fact 를 invalidate (bi-temporal). 검색 시 과거 사실은 후순위.

## LLM provider 전략 (중요)

3 종의 LLM 역할이 존재하고 각각 provider 선택이 다릅니다:

| 역할 | 기본 | 대체/fallback | 비고 |
|------|------|---------------|------|
| **PO 추론** (Codex) | OpenAI 호스티드 | `profile.local` 로 Ollama 의 qwen3.5:4b | 4B 는 단순 태스크만. 멀티스텝 PO 업무는 호스티드 권장. |
| **페르소나 추론** (Claude Code) | Anthropic 호스티드 | (없음, Claude Code 는 provider swap 불가) | 페르소나별 `model: sonnet/opus/haiku` 로만 조정 |
| **Graphiti 백엔드** (엔티티/임베딩) | OpenAI `gpt-4o-mini` + `text-embedding-3-small` | Ollama `deepseek-r1:7b` + `nomic-embed-text` | 호출 빈도 낮아 비용 미미. qwen3.5:4b 는 비권장(엔티티 추출 품질 저하). |
| **Basic Memory 백엔드** (시맨틱 검색) | OpenAI `text-embedding-3-small` | Ollama `nomic-embed-text` | FastMCP 3.0 이후 시맨틱 검색 옵션. |

**기본 모드 = Hybrid (권장)**: Codex·Claude Code·Graphiti·Basic Memory 모두 호스티드. 설치 간단, 품질 최상. 개인 메모/프로젝트 설계 메모가 OpenAI 로 흘러가는 게 싫으면 Local-only 로 전환.

**Local-only 모드 (옵션)**: Graphiti·Basic Memory 둘 다 Ollama 로. Codex 도 `profile.local` 로 스왑. 품질/속도 trade-off 있음. 문서에 명시.

**qwen3.5:4b 의 위치**: 사용자가 이미 설치 중. 역할 = Codex 의 비상 fallback (`codex --profile local` 로 수동 스왑). 토큰 소진·오프라인 시 "경량 PO" 로 쓰되, planner/designer/dev/qa 의 실제 작업은 여전히 Claude Code(호스티드) 가 수행하므로 실무 품질은 유지됨. Graphiti 백엔드로는 사용하지 않는 걸 권장.

## Prerequisites (사용자 로컬 세팅)

구현 단계 밖, 사용자가 본인 단말에서 수행해야 하는 설치:

### 필수 (Hybrid 모드)

1. `npm i -g @openai/codex` → `codex` 첫 실행으로 로그인
2. `claude --version` (이미 설치됨)
3. `brew install uv` (Basic Memory / Graphiti-MCP python 실행기)
4. OpenAI API key 발급 (Graphiti/Basic Memory 백엔드용; Codex 로그인과 별개일 수 있음 — Codex 로그인은 ChatGPT Plus 계정이고, 여기선 API key 가 필요)
5. 환경변수: `OPENAI_API_KEY=sk-...` 를 `~/.zshrc` 혹은 `.env.local`

### 선택 (Local-only 모드 or qwen fallback)

6. `brew install ollama`
7. `ollama pull qwen3.5:4b` (Codex fallback 용 — 사용자 이미 설치 중)
8. (선택) `ollama pull deepseek-r1:7b` + `ollama pull nomic-embed-text` (Graphiti/Basic Memory 를 로컬로 돌릴 경우)
9. `ollama serve` 가 localhost:11434 에서 실행중인지 확인

## Deliverables

### A. Claude Code 페르소나 서브에이전트 (4개)

경로: `/Users/x/Documents/dev/ntf-products/agentcafe/.claude/agents/`

공통 구조 (frontmatter):
```yaml
---
name: <persona>
description: <언제 이 페르소나가 호출되는지>
model: sonnet | opus | haiku
tools: Read, Glob, Grep, ...
permissionMode: plan | acceptEdits | dontAsk
---

# 역할
# 받을 수 있는 입력
# 반환 형식
# 기억 접근 규칙 (아래)
# 승격 정책 (위 참조)
# 자기 영역 밖 거부 규칙
```

**기억 접근 규칙 (모든 페르소나 공통 섹션)**:
- 작업 시작 시:
  1. Basic Memory: `search` with `project=<현재프로젝트>` 로 관련 노트 먼저 로드
  2. Graphiti: `search` with `group_id=persona:<self>` 로 관련 장기 지식 로드
- 작업 중: 중요한 결정은 `write_note` / `add_episode`
- 작업 종료 시: 해당 세션에서 추가/수정된 노트 경로와 episode id 를 JSON 요약으로 반환 (PO 가 추적할 수 있게)

페르소나별 차이:
- `planner.md`: 읽기+탐색만 (`Read, Glob, Grep, WebFetch`), `permissionMode: plan`, 모델 `sonnet`. 출력: 작업 번호 목록 + 담당 페르소나 추천.
- `designer.md`: 읽기 + `docs/design/` 아래 쓰기만 (`Read, Glob, Grep, Write`), 코드 금지, 모델 `sonnet`. 출력: 설계 문서 경로 + 요약.
- `developer.md`: 풀 편집 (`Read, Write, Edit, Bash, Glob, Grep`), `permissionMode: acceptEdits`, 모델은 사용자 선택 (기본 `opus`). 입력은 designer 의 설계 문서 경로.
- `qa.md`: 실행/검증 전용 (`Read, Grep, Glob, Bash`), `permissionMode: dontAsk`, 모델 `haiku`. `allowedTools` 로 `npm test/lint/build` 만 허용. 결과 pass/fail + 재현 스텝.

### B. MCP 설정 (Claude Code 쪽)

경로: `/Users/x/Documents/dev/ntf-products/agentcafe/.mcp.json` (repo-local, 팀 공유용) 혹은 `~/.claude/mcp.json` (글로벌). 리포-로컬 우선.

내용(스케치, 최종 키/필드는 Claude Code 문서 기준으로 확정):
```json
{
  "mcpServers": {
    "basic-memory": {
      "command": "uvx",
      "args": ["basic-memory", "mcp", "--project", "agentcafe"],
      "env": {
        "OPENAI_API_KEY": "${OPENAI_API_KEY}"
      }
    },
    "graphiti": {
      "command": "uvx",
      "args": ["graphiti-mcp", "--transport", "stdio",
               "--storage", "kuzu", "--kuzu-path", "~/.graphiti/kuzu"],
      "env": {
        "OPENAI_API_KEY": "${OPENAI_API_KEY}",
        "GRAPHITI_LLM_MODEL": "gpt-4o-mini",
        "GRAPHITI_EMBEDDING_MODEL": "text-embedding-3-small"
      }
    }
  }
}
```

Local-only 모드 참고 (주석으로 `.mcp.json.local` 같은 대체 파일 제공):
```json
"graphiti": {
  "command": "uvx",
  "args": ["graphiti-mcp", "--transport", "stdio", "--storage", "kuzu", "--kuzu-path", "~/.graphiti/kuzu"],
  "env": {
    "OPENAI_BASE_URL": "http://localhost:11434/v1",
    "OPENAI_API_KEY": "ollama",
    "GRAPHITI_LLM_MODEL": "deepseek-r1:7b",
    "GRAPHITI_EMBEDDING_MODEL": "nomic-embed-text"
  }
}
```

두 서버 모두 페르소나가 frontmatter `tools` 에 선언하면 개별 호출 가능. `group_id` 같은 argument 는 페르소나 system prompt 에서 매 호출 시 주입 지시.

### C. Codex 설정

- `/Users/x/Documents/dev/ntf-products/agentcafe/.codex/config.toml`:
  ```toml
  model = "gpt-5.1-codex"            # 설치 시점 최신 기본값으로 확정
  approval_policy = "on-request"     # 초기; 검증되면 profile.po 에서 "never"
  sandbox_mode = "workspace-write"
  model_reasoning_effort = "high"

  # 기본 PO 모드 (호스티드)
  [profiles.po]
  approval_policy = "never"
  sandbox_mode = "workspace-write"
  model_instructions_file = ".codex/po-instructions.md"

  # 로컬 fallback — 토큰 소진/오프라인 시 "codex --profile local"
  [model_providers.ollama]
  name = "Ollama (local)"
  base_url = "http://localhost:11434/v1"
  wire_api = "chat"
  # Ollama 는 API key 불필요, 공란 or "ollama"

  [profiles.local]
  model_provider = "ollama"
  model = "qwen3.5:4b"
  approval_policy = "never"
  sandbox_mode = "workspace-write"
  model_reasoning_effort = "medium"
  model_instructions_file = ".codex/po-instructions.md"
  ```
- `.codex/po-instructions.md`: PO doctrine.
  - 4 페르소나 카탈로그 및 라우팅 규칙
  - 호출 템플릿 (`claude --agent <p> -p "<t>" --session-id $(jq ...) --resume --output-format json`)
  - `.codex/persona-sessions.json` 읽기/쓰기 (없으면 초기화, 신규는 새 uuid 생성)
  - 시퀀스: Planner → Designer → Developer → QA, QA 실패 시 loop-back
  - "PO 는 코드 직접 편집 금지, 구현은 항상 developer 위임"
  - 각 페르소나 결과 JSON 을 PO 가 취합/요약하는 방식
- `.codex/persona-sessions.json`: `{}` 로 시작, gitignore.

### D. AGENTS.md 보강

경로: `/Users/x/Documents/dev/ntf-products/agentcafe/AGENTS.md`

기존 Next.js 경고 유지 + "Orchestration", "Memory model(3-tier)", "Persona catalog" 섹션 추가. `codex --profile po` 로 기동, 단일 페르소나는 `claude --agent <name>` 로 직접.

### E. `package.json` scripts

```jsonc
"agent:po": "codex --profile po",
"agent:po:local": "codex --profile local",
"agent:plan": "claude --agent planner",
"agent:design": "claude --agent designer",
"agent:dev": "claude --agent developer",
"agent:qa": "claude --agent qa",
"memory:serve": "uvx basic-memory mcp --project agentcafe",
"wiki:serve": "uvx graphiti-mcp --transport stdio --storage kuzu --kuzu-path $HOME/.graphiti/kuzu"
```
(마지막 두 개는 수동 디버깅/점검용. 보통은 Claude Code 가 stdio 로 자동 기동. Graphiti LLM/임베딩 provider 는 `.mcp.json` 에서 `env` 로 주입.)

### F. `.gitignore`

- `.codex/persona-sessions.json`
- `.codex/logs/`
- `.basic-memory-cache/` (Basic Memory sqlite 가 repo 에 떨어질 경우)
- (Graphiti 는 `~/.graphiti/` 기본값이므로 repo 에 안 떨어짐)

## 사용자 입장의 first-time 플로우

설치·구현이 다 끝난 뒤 **사용자가 실제로 마주하는 UX** 를 시간 순으로:

### [0] 첫 세팅 (일회성, 약 10–15 분)

```sh
# 1) 바이너리 설치
npm i -g @openai/codex
brew install uv
# (선택) brew install ollama && ollama pull qwen3.5:4b

# 2) 키 세팅
export OPENAI_API_KEY=sk-...              # Graphiti/Basic Memory 백엔드용
echo 'export OPENAI_API_KEY=sk-...' >> ~/.zshrc

# 3) 로그인
codex          # 한 번 뜨면 ChatGPT 계정 로그인
# claude 는 이미 로그인돼 있음

# 4) 리포 진입 후 smoke test
cd ~/Documents/dev/ntf-products/agentcafe
claude --mcp-config .mcp.json -p "Use basic-memory to search for anything, and graphiti to list episodes in group persona:designer"
# → MCP 서버 2 개가 uvx 로 자동 기동, 접속 OK 면 세팅 완료
```

### [1] 평소 사용 — PO 모드 (기본)

```sh
cd ~/Documents/dev/ntf-products/agentcafe
npm run agent:po
# === Codex CLI 프롬프트 === (PO 모드)
> "로그인 모달에 '비밀번호 찾기' 링크 추가해줘"
```

PO 가 뒤에서 자동으로:
1. `planner` 에게 "이 요청을 작업 단위로 쪼개라" 위임 → 읽기만 해서 계획 반환
2. 디자인 필요하다고 판단되면 `designer` 에게 설계 위임 → `docs/design/login-modal.md` 작성 후 반환
3. `developer` 에게 "이 설계로 구현해라" 위임 → 코드 편집
4. `qa` 에게 "빌드/린트/수동 플로우 확인" 위임 → pass/fail 리포트
5. PO 가 최종 요약을 사용자에게 표시

사용자는 **그냥 한 문장**만 던졌고, 내부에서 4 페르소나가 각자의 Claude 세션·project 메모·persona wiki 를 활용해 일을 마침.

### [2] 단일 페르소나만 수동 호출

```sh
npm run agent:design        # claude --agent designer 직접 진입
> "NDJSON streaming 로그 포맷 더 읽기 좋게 개선안 달라"
# designer 만 단독 실행. PO 거치지 않음. 디버깅/탐색용.
```

### [3] 토큰 소진 / 오프라인

```sh
npm run agent:po:local      # codex --profile local → qwen3.5:4b 백엔드
> "남은 TODO 중에 오타 수정만 해치워줘"
# PO 가 qwen3.5 로 돌아감. 페르소나(Claude Code)는 여전히 호스티드.
# 복잡한 planning 은 무리, 단순 라우팅/요약만 시킬 것.
```

### [4] 수 주 후 — 장기 기억 누적 확인

```sh
# 페르소나 wiki 직접 들여다보기
claude --mcp-config .mcp.json -p "Using graphiti search, show me all facts in group persona:designer from the last 30 days"
```

→ Graphiti 가 디자이너 페르소나가 여러 프로젝트에서 결정한 스타일 원칙·색상 원칙을 시간 순으로 리턴. 과거에 "파스텔" 이라고 한 뒤 "다크 모노톤" 으로 바뀌었으면 파스텔은 invalidated 상태로 표시.

### [5] 새 프로젝트 스타트

새 디렉토리로 가면 **project 메모는 자동으로 분리**됩니다:

```sh
cd ~/Documents/dev/new-project
# .mcp.json 복사 + 그 repo 의 --project <name> 만 바꿈
# 새 Basic Memory 프로젝트로 격리 → 디자이너가 agentcafe 의 로그인 모달 디자인을 바로 떠올리지 않음
# 단, persona:designer wiki 는 공유됨 → 일반화된 원칙은 승계
```

### [6] 페르소나가 자기 기억을 이상하게 갖고 있을 때

```sh
# 특정 fact 를 직접 invalidate / 수정
claude --mcp-config .mcp.json -p "Using graphiti, invalidate the fact that says 'designer prefers pastel colors' in group persona:designer"
```

## 범위 외 (non-goals, 후속)

- Graphiti 의 Neo4j/FalkorDB 백엔드 전환 (Kuzu 로 시작해도 충분, 규모 커지면 교체)
- Mem0 병행 탑재 (후일 대체/비교 시)
- stdio MCP 가 아닌 HTTP/SSE 전환
- 페르소나 system prompt 의 자동 튜닝/평가 (MemoryAgentBench 같은 걸로 후속 측정 가능)
- GitHub PR/이슈 자동화
- `~/.codex/`, `~/.claude/` 글로벌 승격 (repo 에서 검증 후)

## 검증 포인트 (구현 직전 한 번 더 확인)

1. `claude --help` 로 실제 플래그명 확인: `--agent`, `--session-id`, `--resume`, `--permission-mode`, `--output-format`, `--allowedTools`. 문서와 다르면 수정.
2. `codex --help`, `codex exec --help` 로 `--profile`, `--json`, `--output-schema`, `--output-last-message`, `--full-auto` 확인.
3. `.claude/agents/*.md` frontmatter 키(`tools` 포맷, `permissionMode` 스펠링, `model` 별칭) — 공식 문서 기준 확정.
4. `.mcp.json` 위치 — `.claude/mcp.json` vs repo-root `.mcp.json` 현재 버전 기준 확인.
5. Basic Memory 의 `--project` flag 지속성(매 호출마다 지정? config 로 기본값?) — README 에서 한 번 더 확인.
6. Graphiti MCP 의 실제 tool 이름(`add_episode` 맞는지 등)과 `group_id` 파라미터 전달 경로 — `mcp_server/README.md` 기준 확인.

## End-to-end verification

1. **바이너리/의존성**: `codex --version`, `claude --version`, `ollama --version`, `uvx --version`, `ollama list` 에 `deepseek-r1:7b` + `nomic-embed-text` 확인.
2. **MCP 서버 smoke test** (Claude 독립 세션에서):
   ```sh
   claude --mcp-config .mcp.json \
     -p "Use basic-memory to write_note 'test' body 'hello' then search for 'test'" \
     --allowedTools "mcp__basic-memory__write_note,mcp__basic-memory__search" \
     --output-format json
   ```
   동일하게 graphiti 에 대해 `add_episode` + `search`.
3. **페르소나 단독 실행**: 각 페르소나에 저위험 질문 ("README 에서 오타 1개 찾아" 같은). 읽기만 하고 역할 외는 거부하는지, Basic Memory/Graphiti 에서 읽기/쓰기를 올바른 `group_id`·`project` 로 하는지.
4. **세션 지속성**: 동일 session-id 로 두 번째 호출 시 이전 대화 기억하는지.
5. **PO E2E**: `codex --profile po`, "README 오타 1개 고쳐줘" → planner → developer → qa 흐름 + git diff 1-2 줄.
6. **Persona isolation 검증**: designer 로 "프로젝트 X 색상 팔레트는 파스텔로" 승격 → developer 페르소나 검색 시 **안 나와야 함** (group_id 격리).
7. **Project isolation**: 다른 디렉토리에 새 repo 만들고 동일 워크플로 → 이전 프로젝트의 Basic Memory 노트가 안 섞이는지.
8. **Bi-temporal**: designer 에 "색상은 파스텔" 저장 → 나중에 "색상은 다크 모노톤" 저장 → 검색 시 최신이 우선하는지, 과거가 여전히 `invalidated` 로 남아있는지.
9. **권한 모드 sanity**: qa 가 `allowedTools` 밖 명령 (예: `npm install <pkg>`) 거부하는지.
10. **재개**: `codex resume`, `.codex/persona-sessions.json` 유지되는지.

## Critical Files (작성/수정 대상)

- NEW: `.claude/agents/planner.md`, `designer.md`, `developer.md`, `qa.md`
- NEW: `.mcp.json` (repo-local, basic-memory + graphiti)
- NEW: `.codex/config.toml`, `.codex/po-instructions.md`, `.codex/persona-sessions.json`
- MODIFY: `AGENTS.md` (orchestration + memory model 섹션)
- MODIFY: `package.json` (scripts 7개)
- MODIFY: `.gitignore` (+3 항목)

## Sources (참고, 구현 중 재확인)

- [Graphiti GitHub](https://github.com/getzep/graphiti) — bi-temporal, Kuzu/Neo4j/FalkorDB/Neptune, MCP
- [Zep Knowledge Graph MCP product page](https://www.getzep.com/product/knowledge-graph-mcp/) — MCP v1.0, Nov 2025
- [Zep paper (arxiv 2501.13956)](https://arxiv.org/abs/2501.13956) — temporal KG architecture
- [Basic Memory GitHub](https://github.com/basicmachines-co/basic-memory) — v0.20.3 (2026-03), project-scoping
- [Mem0 memory scoping](https://mem0.ai/blog/multi-agent-memory-systems) — 대안 참고
- [atlan: Zep vs Mem0](https://atlan.com/know/zep-vs-mem0/) — LongMemEval 벤치 비교
- Codex CLI: developers.openai.com/codex/{cli, noninteractive, config-reference, mcp, subagents, concepts/sandboxing}
- Claude Code: docs.claude.com / code.claude.com (CLI reference, subagents, permission modes)
