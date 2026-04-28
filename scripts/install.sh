#!/usr/bin/env bash
set -euo pipefail

# install.sh — one-time setup to wire the productune repo into ~/.claude/ and ~/.codex/
#
# What it does:
#   1. Symlinks agents/*.md  →  ~/.claude/agents/*.md        (persona sub-agents, editable in place)
#   2. Copies  codex/config.toml   →  ~/.codex/config.toml   (global Codex config, profiles po + local)
#   3. Copies  codex/po-instructions.md  →  ~/.codex/po-instructions.md  (referenced by [profiles.po])
#
# Existing files at targets are backed up with a .bak.<timestamp> suffix if they are not already symlinks
# pointing to this repo.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TS="$(date +%s)"

say() { printf "\033[1;34m[install]\033[0m %s\n" "$*"; }
warn() { printf "\033[1;33m[install]\033[0m %s\n" "$*" >&2; }
die() { printf "\033[1;31m[install]\033[0m %s\n" "$*" >&2; exit 1; }

# ── Hardware tier detection ────────────────────────────────────────────────────
detect_tier() {
  local ram_gb chip arch has_docker disk_free_gb apple_silicon=0
  ram_gb=$(sysctl -n hw.memsize 2>/dev/null | awk '{print int($1/1024/1024/1024)}' || echo 0)
  chip=$(sysctl -n machdep.cpu.brand_string 2>/dev/null || echo "unknown")
  arch=$(uname -m)
  has_docker=0
  command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1 && has_docker=1
  disk_free_gb=$(df -g "$HOME" 2>/dev/null | awk 'NR==2 {print int($4)}' || echo 0)

  [[ "$chip" == *"Apple M"* || "$arch" == "arm64" ]] && apple_silicon=1

  if [[ $has_docker == 0 || $disk_free_gb -lt 5 ]]; then echo "B"; return; fi
  if [[ $apple_silicon == 1 && $ram_gb -ge 16 && $disk_free_gb -ge 10 ]]; then echo "S"; return; fi
  if [[ $apple_silicon == 1 && $ram_gb -ge 8 ]]; then echo "A"; return; fi
  if [[ $ram_gb -ge 32 && $disk_free_gb -ge 10 ]]; then echo "S"; return; fi
  if [[ $ram_gb -ge 16 ]]; then echo "A"; return; fi
  echo "B"
}

# ── Dynamic model catalog (registry.ollama.ai) ────────────────────────────────

# Fetch total disk size of a model tag from Ollama registry.
# Outputs size in GB (e.g. "4.7"), or returns 1 on failure.
fetch_disk_gb() {
  local model="$1" tag="$2"
  local manifest total
  manifest=$(curl -fsSL --max-time 8 \
    -H "Accept: application/vnd.docker.distribution.manifest.v2+json" \
    "https://registry.ollama.ai/v2/library/${model}/manifests/${tag}" 2>/dev/null) || return 1
  total=$(printf '%s' "$manifest" | jq '[.layers[].size] | add // empty' 2>/dev/null) || return 1
  [[ "$total" =~ ^[0-9]+$ ]] || return 1
  awk "BEGIN{printf \"%.1f\", $total/1024/1024/1024}"
}

# Read config/model-catalog.json, fetch sizes in parallel, print filtered menu
# for the given tier, prompt user, and set LLM_MODEL (or WIKI_BACKEND=keeper).
select_model_for_tier() {
  local tier="$1"
  local catalog="$ROOT/config/model-catalog.json"

  if [ ! -f "$catalog" ]; then
    warn "model-catalog.json not found at $catalog — keeper로 전환"
    WIKI_BACKEND=keeper; return
  fi

  local max_disk
  max_disk=$(jq -r ".tiers.\"${tier}\".max_disk_gb" "$catalog")

  say "모델 크기 조회 중 (registry.ollama.ai, 병렬)..."

  local tmpdir; tmpdir=$(mktemp -d)
  local count; count=$(jq '.catalog | length' "$catalog")

  # Parallel fetch — one background job per catalog entry
  local i
  for i in $(seq 0 $((count - 1))); do
    local m t
    m=$(jq -r ".catalog[$i].model" "$catalog")
    t=$(jq -r ".catalog[$i].tag"   "$catalog")
    (
      sz=$(fetch_disk_gb "$m" "$t" 2>/dev/null) && printf '%s' "$sz" > "$tmpdir/${i}.size"
    ) &
  done
  wait

  # Collect entries that fit the tier
  local -a labels=() models=() descs=()
  for i in $(seq 0 $((count - 1))); do
    local m t fallback strengths weaknesses size_gb
    m=$(jq -r         ".catalog[$i].model"       "$catalog")
    t=$(jq -r         ".catalog[$i].tag"          "$catalog")
    fallback=$(jq -r  ".catalog[$i].fallback_gb"  "$catalog")
    strengths=$(jq -r ".catalog[$i].strengths"    "$catalog")
    weaknesses=$(jq -r ".catalog[$i].weaknesses"  "$catalog")

    if [ -f "$tmpdir/${i}.size" ]; then
      size_gb=$(cat "$tmpdir/${i}.size")
    else
      size_gb="$fallback"
    fi

    awk "BEGIN{exit !($size_gb <= $max_disk)}" || continue

    labels+=("${m}:${t}")
    models+=("${m}:${t}")
    descs+=("${size_gb}GB | + ${strengths} | − ${weaknesses}")
  done

  rm -rf "$tmpdir"

  if [ ${#labels[@]} -eq 0 ]; then
    warn "tier ${tier}에 적합한 모델 없음 — wiki-keeper로 전환"
    WIKI_BACKEND=keeper; return
  fi

  echo
  printf '  로컬 LLM 선택 (Graphiti entity 추출용):\n\n'
  local idx=1
  for i in "${!labels[@]}"; do
    IFS='|' read -r sz plus minus <<< "${descs[$i]}"
    printf '  [%d] %-24s %s\n' "$idx" "${labels[$i]}" "$(echo "$sz" | tr -d ' ')"
    printf '       +%s\n'  "$(echo "$plus"  | sed 's/^ + //')"
    [[ "$(echo "$minus" | sed 's/^ − //')" != "null" ]] && \
      printf '       −%s\n' "$(echo "$minus" | sed 's/^ − //')"
    [ "$idx" -eq 1 ] && printf '       *기본 추천*\n'
    echo
    idx=$((idx + 1))
  done
  printf '  [k] skip — wiki-keeper(Claude API)로 대신 가기\n\n'

  printf '  선택 [1–%d/k, 기본=1 (%s)]: ' "${#labels[@]}" "${labels[0]}"
  read -r MCHOICE || MCHOICE=""

  case "${MCHOICE:-1}" in
    k|K) WIKI_BACKEND=keeper; return ;;
    ''|1) LLM_MODEL="${models[0]}" ;;
    [2-9]|[1-9][0-9])
      if [ "$MCHOICE" -ge 1 ] 2>/dev/null && [ "$MCHOICE" -le "${#labels[@]}" ] 2>/dev/null; then
        LLM_MODEL="${models[$((MCHOICE - 1))]}"
      else
        warn "잘못된 선택 '${MCHOICE}' — 기본값 ${models[0]} 사용"
        LLM_MODEL="${models[0]}"
      fi
      ;;
    *) LLM_MODEL="${models[0]}" ;;
  esac
}

# ── Local LLM installer (Tier S/A only) ───────────────────────────────────────
install_local_llm() {
  local model="$1"

  if ! command -v ollama >/dev/null 2>&1; then
    say "Ollama 미설치. 설치 시작..."
    curl -fsSL https://ollama.com/install.sh | sh || {
      warn "ollama 공식 설치 스크립트 실패. https://ollama.com/download 에서 수동 설치 후 재실행."
      return 1
    }
  fi

  ensure_ollama_ready || return 1

  say "$model pull 중 (한 번만, 5–15분 소요)..."
  if ! ollama pull "$model"; then
    echo
    printf "  [r] 재시도  [k] wiki-keeper(Claude API)로 대신 가기  [q] 중단: "
    read -r choice || choice="q"
    case "$choice" in
      r|R) ollama pull "$model" || return 1 ;;
      k|K) WIKI_BACKEND=keeper; return 0 ;;
      *)   return 1 ;;
    esac
  fi

  say "nomic-embed-text pull 중 (Graphiti 임베딩용, ~275MB)..."
  ollama pull nomic-embed-text || warn "nomic-embed-text pull 실패 — 나중에 수동으로: ollama pull nomic-embed-text"
}

wait_for_ollama_ready() {
  local i
  for i in $(seq 1 45); do
    if curl -fsS http://localhost:11434/api/tags >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  return 1
}

ensure_ollama_ready() {
  # Already responding — nothing to do.
  if curl -fsS http://localhost:11434/api/tags >/dev/null 2>&1; then
    return 0
  fi

  mkdir -p "$HOME/.ollama"
  local log_file="$HOME/.ollama/productune-ollama.log"

  # macOS: prefer the managed app to avoid server conflicts with launchd.
  if [ -d "/Applications/Ollama.app" ]; then
    say "Ollama app 시작 중..."
    open -a Ollama
    if ! wait_for_ollama_ready; then
      warn "Ollama 준비 실패. /Applications/Ollama.app 수동 실행 후 재시도하세요."
      return 1
    fi
    return 0
  fi

  # Non-app install (Linux / CLI-only): only spawn serve if not already running.
  if pgrep -x ollama >/dev/null 2>&1; then
    say "Ollama 프로세스 감지 — 준비 대기 중..."
    if ! wait_for_ollama_ready; then
      warn "Ollama 준비 실패. 로그 확인: $log_file"
      return 1
    fi
    return 0
  fi

  say "Ollama daemon 시작..."
  nohup ollama serve >"$log_file" 2>&1 &
  if ! wait_for_ollama_ready; then
    warn "Ollama 준비 실패. 로그 확인: $log_file"
    return 1
  fi
}

# ── Backend variant activator ──────────────────────────────────────────────────
activate_backend() {
  local backend="$1"   # graphiti | keeper | fs
  local variants_dir="$ROOT/agents/variants/$backend"

  if [ ! -d "$variants_dir" ]; then
    warn "variants dir not found: $variants_dir — leaving current agents as-is"
    return
  fi

  for variant in "$variants_dir"/*.md; do
    local name; name="$(basename "$variant")"
    local dest="$ROOT/agents/$name"
    ln -sfn "$variant" "$dest"
    say "backend=$backend: agents/$name → variants/$backend/$name"
  done

  # wiki-keeper only needed for keeper backend — link/unlink accordingly
  local keeper_dest="$ROOT/agents/pdt-wiki-keeper.md"
  if [[ "$backend" == "keeper" ]]; then
    if [ ! -e "$keeper_dest" ]; then
      ln -sfn "$ROOT/agents/pdt-wiki-keeper.md" "$keeper_dest" 2>/dev/null || true
    fi
  fi
}

# Preflight
command -v claude >/dev/null || die "claude CLI not found. Install Claude Code first."
command -v codex  >/dev/null || die "codex CLI not found. Run: npm i -g @openai/codex"
command -v uv     >/dev/null || warn "uv not found (optional). Install if needed: brew install uv"
command -v jq     >/dev/null || die "jq not found. Run: brew install jq"

# 1) Symlink agents (and clean up any dangling symlinks from prior renames)
mkdir -p "$HOME/.claude/agents"
for AGENT in "$ROOT"/agents/*.md; do
  NAME="$(basename "$AGENT")"
  DEST="$HOME/.claude/agents/$NAME"
  if [ -L "$DEST" ] && [ "$(readlink "$DEST")" = "$AGENT" ]; then
    say "agent unchanged: $NAME"
    continue
  fi
  if [ -e "$DEST" ] && [ ! -L "$DEST" ]; then
    mv "$DEST" "$DEST.bak.$TS"
    warn "backed up existing $DEST → $DEST.bak.$TS"
  fi
  ln -sfn "$AGENT" "$DEST"
  say "linked agent: $NAME"
done

# Sweep dangling symlinks (e.g. old persona names removed in a rename)
DANGLING=$(find "$HOME/.claude/agents" -maxdepth 1 -type l ! -exec test -e {} \; -print 2>/dev/null)
if [ -n "$DANGLING" ]; then
  echo "$DANGLING" | while IFS= read -r broken; do
    rm -f "$broken"
    warn "removed dangling symlink: $broken"
  done
fi

# 2) Codex config (always overwritten, backup if content differs)
mkdir -p "$HOME/.codex"
for F in config.toml po-instructions.md; do
  SRC="$ROOT/codex/$F"
  DEST="$HOME/.codex/$F"
  if [ -e "$DEST" ] && ! cmp -s "$SRC" "$DEST"; then
    mv "$DEST" "$DEST.bak.$TS"
    warn "backed up existing $DEST → $DEST.bak.$TS"
  fi
  cp "$SRC" "$DEST"
  say "copied codex file: $F"
done

# 3) PO memory (seed ONLY if user hasn't started one yet — do NOT clobber learnings)
PO_MEM="$HOME/.codex/po-memory.md"
if [ ! -e "$PO_MEM" ]; then
  cp "$ROOT/codex/po-memory.md.template" "$PO_MEM"
  say "seeded PO memory at $PO_MEM (PO will append over time)"
else
  say "PO memory already exists at $PO_MEM — leaving as-is"
fi

# 4) Make wrapper scripts executable (idempotent — git checkout usually preserves +x already)
chmod +x "$ROOT/scripts/productune" "$ROOT/scripts/setup-graphiti.sh" "$ROOT/scripts/install.sh" \
         "$ROOT/scripts/wiki-init.sh" "$ROOT/scripts/migrate-graphiti-to-fs.sh"
say "wrapper scripts ready"
# Legacy `my-po` symlink (compat alias) — recreate if missing.
if [ ! -e "$ROOT/scripts/my-po" ]; then
  ln -s productune "$ROOT/scripts/my-po"
  say "created compat symlink scripts/my-po → productune"
fi

# 5) Interactive: pick default PO engine (only if running in a terminal and not already set)
PO_ENV_FILE="$HOME/.codex/productune.env"
if [ -t 0 ] && [ -t 1 ] && [ ! -e "$PO_ENV_FILE" ]; then
  echo
  printf '\033[1;36m[install]\033[0m Pick a default PO engine for `productune`:\n'
  cat <<'PROMPT'
  [1] codex   — Codex CLI (OpenAI subscription) hosts the PO orchestrator.
                Personas still run on Claude Code. Splits cost across providers.
  [2] claude  — Claude Code hosts both PO and personas. 100% Anthropic stack,
                cleanest ToS posture (no third-party-harness concerns).
  [Enter]     — skip; default to 'codex'. You can change anytime by editing
                ~/.codex/productune.env or running `productune --engine <name>`.

PROMPT
  printf '  Choice [1/2/Enter]: '
  read -r CHOICE || CHOICE=""
  case "$CHOICE" in
    1|c|codex)
      printf 'MY_PO_ENGINE=codex\nPRODUCTUNE_REPO=%s\n' "$ROOT" > "$PO_ENV_FILE"
      say "default engine: codex (saved to $PO_ENV_FILE, repo path: $ROOT)"
      ;;
    2|a|cl|claude|anthropic)
      printf 'MY_PO_ENGINE=claude\nPRODUCTUNE_REPO=%s\n' "$ROOT" > "$PO_ENV_FILE"
      say "default engine: claude (saved to $PO_ENV_FILE, repo path: $ROOT)"
      ;;
    "")
      printf 'MY_PO_ENGINE=codex\nPRODUCTUNE_REPO=%s\n' "$ROOT" > "$PO_ENV_FILE"
      say "default engine: codex (no preference picked; saved baseline to $PO_ENV_FILE)"
      ;;
    *)
      warn "unrecognized choice '$CHOICE'; saving codex + repo path baseline"
      printf 'MY_PO_ENGINE=codex\nPRODUCTUNE_REPO=%s\n' "$ROOT" > "$PO_ENV_FILE"
      ;;
  esac
elif [ -e "$PO_ENV_FILE" ]; then
  CURRENT_ENGINE="$(grep -E '^MY_PO_ENGINE=' "$PO_ENV_FILE" | tail -1 | cut -d= -f2 | tr -d '\n')"
  # Update repo path in case user moved the clone
  if grep -qE '^PRODUCTUNE_REPO=' "$PO_ENV_FILE"; then
    sed -i.bak -E "s|^PRODUCTUNE_REPO=.*|PRODUCTUNE_REPO=$ROOT|" "$PO_ENV_FILE" && rm -f "$PO_ENV_FILE.bak"
  else
    printf 'PRODUCTUNE_REPO=%s\n' "$ROOT" >> "$PO_ENV_FILE"
  fi
  say "PO engine config exists at $PO_ENV_FILE (current: ${CURRENT_ENGINE:-?}, repo path refreshed to $ROOT)"
fi

# 6) Wiki memory backend — hardware-aware tier detection + model recommendation
WIKI_BACKEND=""
if grep -qE '^WIKI_BACKEND=' "$PO_ENV_FILE" 2>/dev/null; then
  WIKI_BACKEND="$(grep -E '^WIKI_BACKEND=' "$PO_ENV_FILE" | tail -1 | cut -d= -f2 | tr -d '\n')"
  if [ "$WIKI_BACKEND" = "keeper" ] && [ -t 0 ] && [ -t 1 ]; then
    printf '\033[1;36m[install]\033[0m 현재 Wiki backend=keeper 입니다. 로컬 Graphiti/Ollama 설정을 다시 시도할까요? [y/N]: '
    read -r RETRY_LOCAL || RETRY_LOCAL=""
    case "$RETRY_LOCAL" in
      y|Y|yes|YES)
        TMP_ENV="$PO_ENV_FILE.tmp.$$"
        grep -Ev '^(WIKI_BACKEND|GRAPHITI_LLM_PROVIDER|GRAPHITI_LLM_MODEL|GRAPHITI_EMBEDDER_PROVIDER|GRAPHITI_EMBEDDER_MODEL)=' "$PO_ENV_FILE" > "$TMP_ENV" || true
        mv "$TMP_ENV" "$PO_ENV_FILE"
        WIKI_BACKEND=""
        say "Wiki backend 설정 초기화 완료. 하드웨어 감지를 다시 실행합니다."
        ;;
      *)
        say "Wiki backend already configured: $WIKI_BACKEND (skipping detection)"
        ;;
    esac
  else
    say "Wiki backend already configured: $WIKI_BACKEND (skipping detection)"
  fi
fi

if [ -z "$WIKI_BACKEND" ] && [ -t 0 ] && [ -t 1 ]; then
  echo
  printf '\033[1;36m[install]\033[0m Wiki memory backend 설정 (하드웨어 감지 중)...\n'

  RAM_GB=$(sysctl -n hw.memsize 2>/dev/null | awk '{print int($1/1024/1024/1024)}' || echo 0)
  CHIP=$(sysctl -n machdep.cpu.brand_string 2>/dev/null || echo "unknown")
  HAS_DOCKER=0; command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1 && HAS_DOCKER=1
  DISK_FREE=$(df -g "$HOME" 2>/dev/null | awk 'NR==2 {print int($4)}' || echo 0)
  DETECTED_TIER=$(detect_tier)

  printf "  감지 결과: %s, RAM %dGB, Docker=%s, 여유디스크=%dGB\n" \
    "$CHIP" "$RAM_GB" "$([ $HAS_DOCKER -eq 1 ] && echo yes || echo no)" "$DISK_FREE"

  case "$DETECTED_TIER" in
    S)
      printf '\033[1;32m  → Tier S (Smooth)\033[0m 감지. Graphiti + async write 권장.\n'
      select_model_for_tier S
      ;;
    A)
      printf '\033[1;33m  → Tier A (Acceptable)\033[0m 감지. Graphiti + 소형 LLM 권장.\n'
      select_model_for_tier A
      ;;
    B|*)
      printf '\033[1;31m  → Tier B (Constrained)\033[0m 감지 (RAM 부족 또는 Docker 없음).\n'
      printf '  wiki-keeper agent (Claude API) 자동 선택.\n'
      WIKI_BACKEND=keeper
      ;;
  esac

  # If not overridden to keeper, proceed with Graphiti + chosen LLM
  if [ -z "$WIKI_BACKEND" ] && [ -n "${LLM_MODEL:-}" ]; then
    WIKI_BACKEND=graphiti
    say "로컬 LLM 설치 시작: $LLM_MODEL"
    if install_local_llm "$LLM_MODEL"; then
      cat >> "$PO_ENV_FILE" <<EOF
WIKI_BACKEND=graphiti
GRAPHITI_LLM_PROVIDER=ollama
GRAPHITI_LLM_MODEL=$LLM_MODEL
GRAPHITI_EMBEDDER_PROVIDER=ollama
GRAPHITI_EMBEDDER_MODEL=nomic-embed-text
EOF
      say "Graphiti 로컬 backend 설정 완료 ($LLM_MODEL)"
      say "  → FalkorDB 시작: bash $ROOT/scripts/setup-graphiti.sh"
    else
      warn "LLM 설치 실패 — wiki-keeper로 fallback"
      WIKI_BACKEND=keeper
    fi
  fi

  # keeper fallback: write env and init wiki dirs
  if [ "$WIKI_BACKEND" = "keeper" ]; then
    printf 'WIKI_BACKEND=keeper\n' >> "$PO_ENV_FILE"
    say "Wiki backend: wiki-keeper agent (Claude API). 로컬 LLM/Docker 불필요."
    bash "$ROOT/scripts/wiki-init.sh"
  fi
elif [ -z "$WIKI_BACKEND" ]; then
  # Non-interactive (CI / piped) — default to keeper (safest, no local deps)
  WIKI_BACKEND=keeper
  printf 'WIKI_BACKEND=keeper\n' >> "$PO_ENV_FILE"
  say "Non-interactive mode: wiki-keeper backend selected"
  bash "$ROOT/scripts/wiki-init.sh"
fi

# Activate backend-specific agent variants
FINAL_BACKEND="$(grep -E '^WIKI_BACKEND=' "$PO_ENV_FILE" | tail -1 | cut -d= -f2 | tr -d '\n' || echo graphiti)"
activate_backend "$FINAL_BACKEND"

# 7) Ensure auto-compact threshold default is present in env file.
#    `productune` sources this with `set -a` so the var is inherited by spawned
#    codex/claude personas — no manual shell-rc export needed.
mkdir -p "$(dirname "$PO_ENV_FILE")"
if [ ! -e "$PO_ENV_FILE" ] || ! grep -qE '^CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=' "$PO_ENV_FILE"; then
  printf 'CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=70\n' >> "$PO_ENV_FILE"
  say "auto-compact threshold defaulted to 70% in $PO_ENV_FILE"
fi

# 8) Interactive: install OSS skill libraries (mattpocock + phuryn) — only if not yet installed
if [ -t 0 ] && [ -t 1 ] && ! grep -qE '^PRODUCTUNE_SKILLS_INSTALLED=' "$PO_ENV_FILE" 2>/dev/null; then
  echo
  printf '\033[1;36m[install]\033[0m OSS skill 라이브러리 설치 (productune 페르소나 자동 invoke 활용):\n'
  cat <<'PROMPT'
  설치 대상:
    [Y] mattpocock/skills (Real engineering: to-prd, tdd, triage-issue 등 23개)
        + phuryn/pm-skills (PM workflow: discovery / strategy / execution 65개)
  [n]   skip — 나중에 `bash $ROOT/scripts/setup-skills.sh` 로 설치 가능

PROMPT
  printf '  설치하시겠어요? [Y/n]: '
  read -r SCHOICE || SCHOICE=""
  case "$SCHOICE" in
    n|N|no|NO|skip)
      printf 'PRODUCTUNE_SKILLS_INSTALLED=skipped\n' >> "$PO_ENV_FILE"
      say "skill 설치 건너뜀 — 나중에 bash $ROOT/scripts/setup-skills.sh"
      ;;
    *)
      if bash "$ROOT/scripts/setup-skills.sh"; then
        printf 'PRODUCTUNE_SKILLS_INSTALLED=true\n' >> "$PO_ENV_FILE"
        say "OSS skill 설치 완료"
      else
        warn "skill 설치 중 일부 실패 — 수동 확인: bash $ROOT/scripts/setup-skills.sh"
        printf 'PRODUCTUNE_SKILLS_INSTALLED=partial\n' >> "$PO_ENV_FILE"
      fi
      ;;
  esac
fi

# 9) Interactive: PATH registration
PATH_REGISTERED=0
if [ -t 0 ] && [ -t 1 ]; then
  echo
  printf '\033[1;36m[install]\033[0m productune PATH 등록 확인...\n'

  if command -v productune >/dev/null 2>&1; then
    say "이미 PATH에 있습니다: $(command -v productune)"
    PATH_REGISTERED=1
  else
    # Detect shell RC
    case "${SHELL:-}" in
      */zsh)  SHELL_RC="$HOME/.zshrc" ;;
      */bash) SHELL_RC="$HOME/.bashrc" ;;
      *)      SHELL_RC="$HOME/.zshrc" ;;
    esac

    cat <<PROMPT

  productune가 PATH에 없습니다. 등록 방법을 선택하세요:

  [1] $SHELL_RC 에 PATH 추가  (권장, sudo 불필요)
  [2] ~/.local/bin 심볼릭 링크  (sudo 불필요)
  [3] /usr/local/bin 심볼릭 링크  (sudo 필요할 수 있음)
  [n] 건너뜀  — 나중에 수동으로 설정

PROMPT
    printf '  선택 [1/2/3/n, 기본=1]: '
    read -r PCHOICE || PCHOICE=""

    case "${PCHOICE:-1}" in
      2)
        mkdir -p "$HOME/.local/bin"
        ln -sf "$ROOT/scripts/productune" "$HOME/.local/bin/productune"
        say "심볼릭 링크 생성: ~/.local/bin/productune"
        printf 'PRODUCTUNE_PATH_METHOD=local_bin\n' >> "$PO_ENV_FILE"
        if [[ ":$PATH:" != *":$HOME/.local/bin:"* ]]; then
          warn "~/.local/bin 이 PATH에 없습니다. $SHELL_RC 에 추가 필요:"
          warn "  export PATH=\"\$HOME/.local/bin:\$PATH\""
        else
          PATH_REGISTERED=1
        fi
        ;;
      3)
        if sudo ln -sf "$ROOT/scripts/productune" /usr/local/bin/productune 2>/dev/null; then
          say "심볼릭 링크 생성: /usr/local/bin/productune"
          printf 'PRODUCTUNE_PATH_METHOD=usr_local_bin\n' >> "$PO_ENV_FILE"
          PATH_REGISTERED=1
        else
          warn "sudo 실패. 수동으로 실행하세요:"
          warn "  sudo ln -sf $ROOT/scripts/productune /usr/local/bin/productune"
        fi
        ;;
      n|N|no|NO|skip)
        say "PATH 등록 건너뜀 — 나중에 수동 설정:"
        say "  echo 'export PATH=\"$ROOT/scripts:\$PATH\"' >> $SHELL_RC && source $SHELL_RC"
        printf 'PRODUCTUNE_PATH_METHOD=none\n' >> "$PO_ENV_FILE"
        ;;
      *)
        EXPORT_LINE="export PATH=\"$ROOT/scripts:\$PATH\""
        if grep -qF "$ROOT/scripts" "$SHELL_RC" 2>/dev/null; then
          say "이미 $SHELL_RC 에 등록되어 있습니다"
          printf 'PRODUCTUNE_PATH_METHOD=rc\nPRODUCTUNE_PATH_RC=%s\n' "$SHELL_RC" >> "$PO_ENV_FILE"
          PATH_REGISTERED=1
        else
          printf '\n# productune\n%s\n' "$EXPORT_LINE" >> "$SHELL_RC"
          say "PATH 추가 완료: $SHELL_RC"
          # Apply immediately in the current session so the user doesn't need to re-source manually.
          export PATH="$ROOT/scripts:$PATH"
          say "  → 현재 세션에 즉시 적용됨 (새 터미널에서도 자동 적용)"
          printf 'PRODUCTUNE_PATH_METHOD=rc\nPRODUCTUNE_PATH_RC=%s\n' "$SHELL_RC" >> "$PO_ENV_FILE"
          PATH_REGISTERED=1
        fi
        ;;
    esac
  fi
fi

# 10) Summary + next steps
FINAL_BACKEND_DISPLAY="$(grep -E '^WIKI_BACKEND=' "$PO_ENV_FILE" | tail -1 | cut -d= -f2 | tr -d '\n' || echo '?')"

cat <<EOF

$(printf "\033[1;32m✓ onboard complete\033[0m")

  Wiki backend : $FINAL_BACKEND_DISPLAY
  PATH         : $([ "$PATH_REGISTERED" = 1 ] && echo "등록됨" || echo "미등록 (위 안내 참고)")

Next steps:
  1. Wiki backend = $FINAL_BACKEND_DISPLAY
$(if [ "$FINAL_BACKEND_DISPLAY" = "graphiti" ]; then
cat <<'GRAPHITI'
     FalkorDB + Graphiti MCP 시작:
       bash scripts/setup-graphiti.sh
     (첫 실행 시 건너뛰어도 됨 — 페르소나는 project docs 폴백으로 동작)
GRAPHITI
elif [ "$FINAL_BACKEND_DISPLAY" = "keeper" ]; then
cat <<'KEEPER'
     wiki-keeper agent (Claude API) 활성화. 로컬 모델/Docker 불필요.
     Wiki 저장 위치: ~/.productune/wiki/
KEEPER
fi)

  2. Claude가 페르소나를 인식하는지 확인:
       claude agents
     (기대값: pdt-po, pdt-designer, pdt-developer, pdt-qa$([ "$FINAL_BACKEND_DISPLAY" = "keeper" ] && echo ", pdt-wiki-keeper"))

  3. 프로젝트 디렉터리에서 PO 시작:
       productune

  4. Wiki backend 변경 (예: Tier A → B):
       # ~/.codex/productune.env 에서 WIKI_BACKEND=keeper 로 수정 후
       productune onboard

  5. 병렬 작업 후 worktree 정리:
       productune gc        # dry-run
       productune gc -y     # safe한 것 자동 제거

  6. 완전히 제거할 때:
       productune uninstall
EOF
