---
ticket_id: T-P4-125
title: "Graphiti provider auto-select + claude mcp add automation"
type: impl
status: planned
assignee: pdt-developer
estimated_complexity: L4
model: sonnet
effort: high
created_at: 2026-05-18
---

# Plan — T-P4-125 Graphiti provider auto + claude mcp add automation

> CLI (install.sh) 거의 90% 완성. GUI OnboardingWizard 는 30% 만 — 큰 gap fill +
> 두 경로 parity. T-P4-121 의 4-layer root cause 중 **layer 1 + 2 永구 차단**.

## §1 Hardware tier ↔ 추천 모델 매핑

`config/model-catalog.json` (이미 존재) 의 `tiers.{S,A,B}.max_disk_gb` +
`catalog[]` 으로 동적 선택. 본 plan 은 정책만 명시.

### 1.1 Tier 판정 기준 (이미 install.sh L60–70 구현)

| Tier | RAM | Apple Silicon | Docker | Disk free | 비고 |
|---|---|---|---|---|---|
| **S** | ≥16GB | yes | required | ≥10GB | "Smooth" — 14B 모델 OK, async write 권장 |
| **S** | ≥32GB | (no) | required | ≥10GB | x86 + 충분 RAM |
| **A** | ≥8GB | yes | required | ≥5GB | "Acceptable" — 소형 LLM (7B) 권장 |
| **A** | ≥16GB | (no) | required | ≥5GB | x86 + 중간 RAM |
| **B** | < above | — | optional | <5GB | "Constrained" — keeper fallback |

GUI `detectHardware` IPC (main.ts L244) 이미 동등 logic 반환.

### 1.2 추천 모델 (catalog-driven, install.sh `select_model_for_tier`)

`config/model-catalog.json` 의 `catalog[]` entries — 각 entry 의 `fallback_gb`
값을 `tiers.<tier>.max_disk_gb` 와 비교해 filter. 사용자가 list 에서 선택,
이미 ollama 에 설치된 model 은 기본 추천.

| Tier | 일반 추천 default | 대안 |
|---|---|---|
| S | qwen2.5:14b | gpt-oss:20b, deepseek-r1:14b |
| A | qwen2.5:7b | llama3.1:8b, gemma2:9b |
| B | (keeper fallback — no model) | — |

embedder 는 model 무관 `nomic-embed-text` (~275MB, install.sh L273–278 이미
처리).

**Out of scope for designer:** 본 ticket 은 정책 매핑만, `model-catalog.json`
내용 변경 X. catalog 갱신은 별 turn.

## §2 §A install.sh diff spec (CLI 경로 — 10% gap)

### 2.1 현 상태 (L72–273 + L729–795 활성)

- ✓ Hardware tier detect
- ✓ Model catalog 조회 + tier filter + 사용자 select
- ✓ Ollama install (curl one-liner)
- ✓ Model pull + nomic-embed-text pull
- ✓ Graphiti setup (`scripts/setup-graphiti.sh` — FalkorDB + MCP server compose)
- ✓ `productune.env` 4줄 (`WIKI_BACKEND=graphiti` + 4 GRAPHITI_*)
- ✓ Fallback to keeper on any failure

### 2.2 Gap — `claude mcp add` 미실행

L770 직후 (env 4줄 쓴 다음 / `WIKI_BACKEND=graphiti` 확정 직후) 다음 step
추가:

```bash
# Register graphiti MCP server with Claude Code (T-P4-121 layer 2 fix).
# Idempotent: skip if already registered.
register_graphiti_mcp() {
  if ! command -v claude >/dev/null 2>&1; then
    warn "claude CLI 미설치 — graphiti MCP 자동 등록 건너뜀. 설치 후 수동:"
    warn "  claude mcp add graphiti $LAUNCHER -- designer"
    return 1
  fi

  if claude mcp list 2>/dev/null | grep -q '^graphiti'; then
    say "graphiti MCP — 이미 등록됨 (claude mcp list)"
    return 0
  fi

  local LAUNCHER="$ROOT/scripts/graphiti-launcher.sh"
  say "Claude Code 에 graphiti MCP 등록 중..."
  if claude mcp add graphiti "$LAUNCHER" -- designer >/dev/null 2>&1; then
    say "graphiti MCP 등록 완료"
    return 0
  else
    warn "graphiti MCP 등록 실패 — 수동 등록 필요:"
    warn "  claude mcp add graphiti $LAUNCHER -- designer"
    return 1
  fi
}

# Call after env-write succeeded
if [ "$WIKI_BACKEND" = "graphiti" ]; then
  register_graphiti_mcp || true
fi
```

위치: L772 `say "Graphiti backend 설정 완료"` 직전 또는 직후.

### 2.3 Non-interactive (CI / piped) 분기 — keeper fallback 유지

L789–795 의 non-interactive 분기는 그대로 (keeper default). 변경 없음.
non-interactive 환경에서 ollama install 강제는 별 ticket 후보 (OQ).

### 2.4 Idempotency policy

| Step | Skip 조건 |
|---|---|
| ollama install | `command -v ollama` (L247) — 이미 구현 |
| LLM model pull | `detect_installed_ollama_models grep -qx "$model"` (L257) — 이미 구현 |
| nomic-embed-text pull | 동일 grep (L273) — 이미 구현 |
| productune.env GRAPHITI_LLM_PROVIDER | `grep -qE '^WIKI_BACKEND=' && != ""` (L707) — 이미 구현 |
| **claude mcp add graphiti** | `claude mcp list grep -q '^graphiti'` — 신규 |

## §3 §B GUI OnboardingWizard diff spec (큰 surface)

### 3.1 현 상태 — main.ts `onboarding:complete` (L285–366)

writes:
- `MY_PO_ENGINE`
- `PRODUCTUNE_REPO`
- `WIKI_BACKEND` (`graphiti` 또는 `keeper`)
- `created_at`

**Missing for graphiti tier:**
- `GRAPHITI_LLM_PROVIDER` / `GRAPHITI_LLM_MODEL` / `GRAPHITI_EMBEDDER_PROVIDER` / `GRAPHITI_EMBEDDER_MODEL`
- Ollama install
- LLM model pull + nomic-embed-text pull
- FalkorDB setup (`setup-graphiti.sh`)
- `claude mcp add graphiti`

### 3.2 OnboardingWizard.tsx — step 3 변경

step 3 (Wiki backend) 현재 UI:
- Filesystem / Graphiti 선택
- graphiti 선택 시: hardware tier 표시 + Docker auto-install (이미 있음)
- graphiti 선택 후 step 4 (complete) 로

**확장:**
- graphiti 선택 + tier S/A 확인 후 → **신규 sub-step 3.5: Local LLM setup**
  - hardware tier 표시 (재사용)
  - 추천 모델 list (S/A tier 매핑 표 — §1.2)
  - 사용자 select (기본 = 이미 설치된 모델 OR tier default)
  - Install progress (스피너 + log lines, dockerLogs 패턴 재사용 — wizard L48–50)
  - Phase: `idle | installing-ollama | pulling-model | pulling-embedder | setting-up-graphiti | registering-mcp | done | error`
  - Fail 시 에러 surface + (a) retry / (b) "wiki backend 끄고 진행" 선택지 → step 3 의 backend 를 `keeper` 또는 `filesystem` 으로 전환
- tier B → 자동 keeper 또는 filesystem (사용자 알림 + 선택지: keeper 인증 / filesystem 으로 진행)

### 3.3 main.ts — 신규 IPC handlers

기존 `onboarding:detectHardware` 외 추가:

#### 3.3.1 `onboarding:listOllamaModels` (read-only)

```typescript
ipcMain.handle('onboarding:listOllamaModels', async () => {
  // Spawn 'ollama list' → parse → return string[] of installed model:tag.
  // Used to pre-select already-installed model in wizard.
})
```

#### 3.3.2 `onboarding:installLocalLLM` (long-running)

```typescript
ipcMain.handle('onboarding:installLocalLLM', async (event, opts: {
  model: string  // e.g. 'qwen2.5:14b'
}) => {
  // Spawn install.sh's install_local_llm logic equivalent:
  //   1. curl https://ollama.com/install.sh | sh (if ollama missing)
  //   2. ollama pull $model
  //   3. ollama pull nomic-embed-text
  // Stream stdout/stderr → event.sender.send('onboarding:installProgress', line)
  // Return { ok: boolean, error?: string }
})
```

대안: install.sh 의 `install_local_llm` 함수를 그대로 sub-shell 호출.
**권장 (a)**: install.sh 의 logic 을 한 helper script (`packages/core/scripts/install-local-llm.sh`) 로
분리 + CLI / GUI 양쪽이 호출. 단일 source-of-truth.

#### 3.3.3 `onboarding:setupGraphiti` (long-running)

```typescript
ipcMain.handle('onboarding:setupGraphiti', async (event) => {
  // Spawn 'bash $coreDir/scripts/setup-graphiti.sh'
  // Stream stdout → event.sender.send('onboarding:graphitiProgress', line)
  // Return { ok, error? }
})
```

#### 3.3.4 `onboarding:registerGraphitiMCP` (sync)

```typescript
ipcMain.handle('onboarding:registerGraphitiMCP', async () => {
  // 1. Check 'claude mcp list' for existing graphiti registration.
  // 2. If missing, spawn 'claude mcp add graphiti <launcher> -- designer'.
  // 3. Verify with 'claude mcp list | grep graphiti'.
  // Return { ok, alreadyRegistered, error? }
})
```

### 3.4 `onboarding:complete` payload 확장

```typescript
interface OnboardingCompleteOpts {
  engine: 'claude' | 'codex' | 'both'
  wikiBackend: 'filesystem' | 'graphiti'
  uiLanguage?: 'en' | 'ko'

  // 신규 — graphiti tier 일 때
  graphitiConfig?: {
    llmProvider: 'ollama' | 'openai' | 'anthropic'
    llmModel: string  // e.g. 'qwen2.5:14b' or 'gpt-4o-mini'
    embedderProvider: 'ollama' | 'openai'
    embedderModel: string  // 'nomic-embed-text' for ollama
    // fallback API keys for non-ollama path
    openaiApiKey?: string
    anthropicApiKey?: string
  }
}
```

`onboarding:complete` 핸들러 (L285) 분기:

```typescript
if (opts.wikiBackend === 'graphiti' && opts.graphitiConfig) {
  envContent += `GRAPHITI_LLM_PROVIDER=${opts.graphitiConfig.llmProvider}\n`
  envContent += `GRAPHITI_LLM_MODEL=${opts.graphitiConfig.llmModel}\n`
  envContent += `GRAPHITI_EMBEDDER_PROVIDER=${opts.graphitiConfig.embedderProvider}\n`
  envContent += `GRAPHITI_EMBEDDER_MODEL=${opts.graphitiConfig.embedderModel}\n`
  if (opts.graphitiConfig.openaiApiKey) {
    envContent += `OPENAI_API_KEY=${opts.graphitiConfig.openaiApiKey}\n`
  }
  if (opts.graphitiConfig.anthropicApiKey) {
    envContent += `ANTHROPIC_API_KEY=${opts.graphitiConfig.anthropicApiKey}\n`
  }
}
```

**중요**: ollama install / model pull / setup-graphiti / claude mcp add 는
`onboarding:complete` 전에 분리된 IPC (3.3.2 ~ 3.3.4) 로 실행. complete 핸들러는
env 기록 + agent symlink + po-instructions copy 만.

### 3.5 Wizard step state machine

```
step 3: WikiBackend choice
  ├─ filesystem → step 4 (complete)
  ├─ keeper → step 4 (complete)
  └─ graphiti
       ├─ tier B → 사용자 선택지 surface ("keeper 로 전환" / "API key 입력")
       │            → 결정 후 step 4 (complete with graphitiConfig)
       └─ tier S/A → step 3.5 (Local LLM setup) NEW
                      ├─ select model
                      ├─ install ollama (if needed) — stream progress
                      ├─ pull model — stream progress
                      ├─ pull nomic-embed-text — stream progress
                      ├─ setup-graphiti — stream progress
                      ├─ register-graphiti-mcp — sync verify
                      ├─ fail at any step → retry / fallback to keeper / API key
                      └─ all done → step 4 (complete with graphitiConfig)
```

### 3.6 i18n keys (신규)

| Key | en | ko |
|---|---|---|
| `onboarding.wiki.graphiti.localLLM.title` | "Local LLM setup" | "로컬 LLM 설정" |
| `onboarding.wiki.graphiti.localLLM.tierSummary` | "Tier {{tier}} detected — {{ram}}GB RAM, {{chip}}" | "Tier {{tier}} 감지 — RAM {{ram}}GB, {{chip}}" |
| `onboarding.wiki.graphiti.localLLM.selectModel` | "Select model" | "모델 선택" |
| `onboarding.wiki.graphiti.localLLM.installing` | "Installing Ollama…" | "Ollama 설치 중…" |
| `onboarding.wiki.graphiti.localLLM.pullingModel` | "Pulling {{model}}…" | "{{model}} 다운로드 중…" |
| `onboarding.wiki.graphiti.localLLM.pullingEmbedder` | "Pulling embedder (nomic-embed-text, ~275MB)…" | "임베더 다운로드 중 (nomic-embed-text, ~275MB)…" |
| `onboarding.wiki.graphiti.localLLM.settingUpGraphiti` | "Setting up Graphiti (FalkorDB + MCP server)…" | "Graphiti 세팅 중 (FalkorDB + MCP server)…" |
| `onboarding.wiki.graphiti.localLLM.registeringMCP` | "Registering Graphiti MCP with Claude Code…" | "Graphiti MCP 를 Claude Code 에 등록 중…" |
| `onboarding.wiki.graphiti.localLLM.done` | "Local LLM ready" | "로컬 LLM 준비 완료" |
| `onboarding.wiki.graphiti.localLLM.failed` | "Setup failed: {{error}}" | "설정 실패: {{error}}" |
| `onboarding.wiki.graphiti.tierB.title` | "Hardware below recommended" | "하드웨어 권장 사양 미달" |
| `onboarding.wiki.graphiti.tierB.body` | "Local LLM requires 16GB+ RAM or Apple Silicon. Choose:" | "로컬 LLM 은 16GB+ RAM 또는 Apple Silicon 필요. 선택:" |
| `onboarding.wiki.graphiti.fallback.useKeeper` | "Use Claude API (keeper)" | "Claude API 사용 (keeper)" |
| `onboarding.wiki.graphiti.fallback.useOpenAI` | "Enter OpenAI API key" | "OpenAI API 키 입력" |
| `onboarding.wiki.graphiti.fallback.useAnthropic` | "Enter Anthropic API key" | "Anthropic API 키 입력" |
| `onboarding.wiki.graphiti.fallback.disable` | "Disable wiki backend" | "Wiki backend 끄기" |
| `onboarding.wiki.graphiti.retry` | "Retry" | "재시도" |

## §4 §C Idempotency policy (CLI + GUI 공통)

각 step 의 skip 조건:

| Step | CLI skip | GUI skip |
|---|---|---|
| ollama install | `command -v ollama` | `which ollama` via IPC |
| LLM model pull | `ollama list grep -qx model` | 동일 IPC |
| nomic-embed-text pull | 동일 | 동일 |
| FalkorDB compose | `docker ps grep falkordb-graphiti` | 동일 |
| productune.env 4 lines | `grep -qE '^GRAPHITI_LLM_PROVIDER=' ~/.productune/productune.env` | 동일 |
| **claude mcp add** | `claude mcp list grep -q '^graphiti'` | 동일 |

GUI 의 경우 wizard 가 이미 일부 설정된 user 의 install 을 처리할 수 있어야
함 (재설치 / partial 진행 후 종료 / 다음 install 시 재진입). step 3.5 진입
시 idempotent check 먼저 실행 → 모두 만족 시 곧장 "이미 설정 완료, 다음" 으로
skip 가능한 UI.

## §5 §D Fallback 분기 (tier B 또는 ollama 실패)

사용자 선택지:

| 옵션 | productune.env 결과 | claude mcp add | downstream |
|---|---|---|---|
| (i) **keeper (Claude API)** | `WIKI_BACKEND=keeper` | skip | wiki-init.sh, pdt-wiki-keeper agent 활성 |
| (ii) **OpenAI API key** | `WIKI_BACKEND=graphiti` + `GRAPHITI_LLM_PROVIDER=openai` + `GRAPHITI_LLM_MODEL=gpt-4o-mini` + `OPENAI_API_KEY=<user>` | `claude mcp add graphiti` | graphiti via OpenAI |
| (iii) **Anthropic API key** | `WIKI_BACKEND=graphiti` + `GRAPHITI_LLM_PROVIDER=anthropic` + `GRAPHITI_LLM_MODEL=claude-haiku-4-5` + `ANTHROPIC_API_KEY=<user>` | `claude mcp add graphiti` | graphiti via anthropic |
| (iv) **filesystem only** | `WIKI_BACKEND=filesystem` | skip | wiki-init.sh, no MCP |

GUI 의 step 3 의 "B tier 감지 → 옵션 surface" UI 는 위 4개 라디오 + 조건부
입력 필드 (ii/iii 시 API key input + show/hide toggle).

CLI 도 같은 4 옵션 prompt — install.sh L752 의 "tier B 감지 → 자동 keeper"
를 "tier B 감지 → 사용자 선택" 으로 변경.

## §6 §E i18n + 새 IPC 채널 정리

i18n 신규 keys → §3.6 표 (17 keys × 2 lang = 34 entries).

IPC 채널 신규:
- `onboarding:listOllamaModels` → `string[]` (model:tag)
- `onboarding:installLocalLLM` (with model + stream `onboarding:installProgress`) → `{ ok, error? }`
- `onboarding:setupGraphiti` (stream `onboarding:graphitiProgress`) → `{ ok, error? }`
- `onboarding:registerGraphitiMCP` → `{ ok, alreadyRegistered, error? }`

preload `api` 객체 (`packages/gui/electron/preload.ts`) 에도 동일 method 노출
필요.

## §7 Open Questions

(1) **install.sh helper 분리** — `install_local_llm` 을 별 스크립트
(`scripts/install-local-llm.sh`) 로 분리해서 CLI / GUI 양쪽이 호출? 또는 GUI
는 내부 IPC 로직 자체 구현?
- (a) helper 분리 — single source-of-truth, dev 가 한쪽만 유지보수.
- (b) GUI 자체 구현 — IPC stream / progress UI 와 직접 결합 가능.
- **Designer 추천 = (a)** (anchor: `[Architecture trade-offs · very strong]` install.sh 의 검증된 logic 재사용 + duplication 회피).

(2) **CLI 의 non-interactive (CI / piped) keeper default** 유지 여부 —
현재 keeper default 인데, 본 ticket 의 의도 (graphiti 자동화) 와 충돌하는지?
- (a) 유지 — CI 환경은 graphiti 자동 install 부담 X.
- (b) 변경 — CI 도 graphiti 자동 시도 (실패 시 keeper).
- **Designer 추천 = (a)** (anchor: `[Architecture trade-offs]` CI/headless 에 docker pull 강제는 위험).

(3) **tier B 의 default fallback** — 현재 CLI 는 자동 keeper, GUI 는 별 처리 없음. 본 ticket 에서:
- (a) tier B 자동 keeper (현재 CLI 동작) + GUI 도 자동 keeper.
- (b) tier B → 사용자 선택지 (§5 의 4 옵션).
- **Designer 추천 = (b)** (anchor: `[Architecture trade-offs · very strong]` 사용자가 OpenAI key 있으면 graphiti 쓸 수 있음 — 자동 keeper 는 그 선택을 가로챔).

(4) **API key 입력 storage** — productune.env 에 OPENAI_API_KEY / ANTHROPIC_API_KEY 평문 저장? 또는 OS keychain?
- (a) productune.env (mode 0600) — 현재 패턴, simple.
- (b) OS keychain (macOS Keychain, Windows Credential Manager, libsecret) — 보안 향상.
- **Designer 추천 = (a)** (anchor: `[Architecture trade-offs · very strong]` productune.env mode 0600 이 현 doctrine. keychain 은 별 ticket 으로 promote 가능 — Phase 5 이후).

## §Out of scope

- Ollama 자체 GPU 가속 설정 (CUDA / Metal hand-tuning).
- 모델 fine-tuning / LoRA.
- Graphiti backend 변경 (keeper / fs 분기 별도) — 본 ticket 은 ollama tier 자동화만.
- `model-catalog.json` 내용 갱신 — 별 turn.
- non-interactive CI 의 graphiti 자동화 — OQ-2 에서 (a) 유지 결정.
- OS keychain API key storage — OQ-4 에서 (b) defer.

## §QA scope

| Field | Value |
|:--|:--|
| **QA invoke** | `manual smoke only` |
| **test target** | install.sh (CLI 경로) + OnboardingWizard step 3+3.5 (GUI 경로) — claude mcp list / productune.env 결과 / ollama list 결과 일치 |
| **사용자 dogfood** | (1) tier S 머신 — CLI install 후 `claude mcp list grep graphiti` 보임 + `productune.env` 5줄 graphiti config 보임 + 다음 PROMOTION-APPROVED wiki write 가 즉시 작동. (2) GUI OnboardingWizard step 3 graphiti 선택 → step 3.5 진행 → 동일 결과. (3) tier B 머신 (또는 강제) — fallback 4 옵션 surface + 각각 결과 검증. (4) idempotent — 두 번째 install 실행 시 모든 step skip 또는 빠른 통과. |
| **regression check** | (a) install.sh 의 keeper fallback 분기 (L709 retry prompt) 정상 동작. (b) GUI OnboardingWizard 의 filesystem 경로 (Phase 5 도입) 영향 없음. (c) T-P4-121 doctrine 의 PO subprocess wiki write 가 새 자동화 후에도 동작 (다음 wiki promotion turn 으로 dogfood). |
