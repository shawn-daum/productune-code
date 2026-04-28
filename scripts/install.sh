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

# ── Local LLM installer (Tier S/A only) ───────────────────────────────────────
install_local_llm() {
  local model="$1"

  if ! command -v ollama >/dev/null 2>&1; then
    say "Ollama 미설치. 설치 시작..."
    if [[ "$(uname)" == "Darwin" ]]; then
      brew install ollama 2>/dev/null || {
        warn "brew install ollama 실패. https://ollama.com/download 에서 수동 설치 후 재실행."
        return 1
      }
    else
      curl -fsSL https://ollama.com/install.sh | sh || { warn "ollama 설치 실패"; return 1; }
    fi
  fi

  if ! curl -fsS http://localhost:11434/api/tags >/dev/null 2>&1; then
    say "Ollama daemon 시작..."
    nohup ollama serve >/dev/null 2>&1 &
    sleep 3
  fi

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
  say "Wiki backend already configured: $WIKI_BACKEND (skipping detection)"
elif [ -t 0 ] && [ -t 1 ]; then
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
      cat <<'PROMPT'

  로컬 LLM 선택 (Graphiti entity 추출용):

  [1] qwen2.5:14b    9GB disk, ~9GB RAM
       + 최고 추출 품질, 한국어 강함, multilingual
       − write 가장 느림 (8–15s, background라 안 보임)
       *기본 추천*

  [2] gemma2:9b      5.5GB disk, ~6GB RAM
       + 안정적 structured output, 빠름 (write 3–6s)
       − 한국어 약간 약함

  [3] llama3.1:8b    5GB disk, ~5.5GB RAM
       + 영어 reasoning 강, 잘 검증됨
       − 한국어 약함, 추출 품질 #1보다 약간↓

  [k] skip — wiki-keeper(Claude API)로 대신 가기

PROMPT
      printf '  선택 [1/2/3/k, 기본=1]: '
      read -r MCHOICE || MCHOICE=""
      case "${MCHOICE:-1}" in
        2) LLM_MODEL=gemma2:9b ;;
        3) LLM_MODEL=llama3.1:8b ;;
        k|K) WIKI_BACKEND=keeper ;;
        *) LLM_MODEL=qwen2.5:14b ;;
      esac
      ;;
    A)
      printf '\033[1;33m  → Tier A (Acceptable)\033[0m 감지. Graphiti + 소형 LLM 권장.\n'
      cat <<'PROMPT'

  로컬 LLM 선택:

  [1] qwen2.5:7b     5GB disk, ~5GB RAM
       + Tier A 최적 균형, 한국어 강함
       − 8GB Mac에서 다른 앱 동시 사용 시 빡빡함
       *기본 추천*

  [2] llama3.1:8b    5GB disk, ~5.5GB RAM
       + 영어 reasoning 강
       − 8GB에서 swap 가능, 한국어 약함

  [3] phi3.5:3.8b    2.5GB disk, ~3GB RAM
       + 매우 가볍고 빠름 (write 1–3s)
       − 추출 품질 눈에 띄게↓ (entity 누락 잦음)

  [k] skip — wiki-keeper(Claude API)로 대신 가기

PROMPT
      printf '  선택 [1/2/3/k, 기본=1]: '
      read -r MCHOICE || MCHOICE=""
      case "${MCHOICE:-1}" in
        2) LLM_MODEL=llama3.1:8b ;;
        3) LLM_MODEL=phi3.5:3.8b ;;
        k|K) WIKI_BACKEND=keeper ;;
        *) LLM_MODEL=qwen2.5:7b ;;
      esac
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
else
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

# 9) Summary + next steps
FINAL_BACKEND_DISPLAY="$(grep -E '^WIKI_BACKEND=' "$PO_ENV_FILE" | tail -1 | cut -d= -f2 | tr -d '\n' || echo '?')"

cat <<EOF

$(printf "\033[1;32m✓ install complete\033[0m")

Wiki backend: $FINAL_BACKEND_DISPLAY

Next steps:
  1. Wiki backend = $FINAL_BACKEND_DISPLAY
$(if [ "$FINAL_BACKEND_DISPLAY" = "graphiti" ]; then
cat <<'GRAPHITI'
     Run `bash $ROOT/scripts/setup-graphiti.sh` to start FalkorDB (Docker) + Graphiti MCP server.
     (Skippable on first try — personas work without wiki tier, falling back to project docs.)
GRAPHITI
elif [ "$FINAL_BACKEND_DISPLAY" = "keeper" ]; then
cat <<'KEEPER'
     wiki-keeper agent (Claude API) active. No local models needed.
     Wiki stored at ~/.productune/wiki/. Verify: ls ~/.productune/wiki/
KEEPER
fi)

  2. Auto-compact threshold (70%) is auto-applied via $PO_ENV_FILE when you launch through \`productune\`.
     Direct \`claude --agent my-X\` calls don't inherit this — add \`export CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=70\` to your shell rc if needed.

  3. Verify Claude sees the personas:
       claude agents
     (expect: pdt-po, pdt-designer, pdt-developer, pdt-qa$([ "$FINAL_BACKEND_DISPLAY" = "keeper" ] && echo ", pdt-wiki-keeper")

  4. Put the \`productune\` wrapper on your PATH. Pick one (no sudo needed):

     a) Add the scripts dir to PATH (recommended):
          echo 'export PATH="$ROOT/scripts:\$PATH"' >> ~/.zshrc && source ~/.zshrc
     b) Symlink into ~/.local/bin:
          mkdir -p ~/.local/bin && ln -sf $ROOT/scripts/productune ~/.local/bin/productune
     c) Symlink into /usr/local/bin (may need sudo):
          sudo ln -sf $ROOT/scripts/productune /usr/local/bin/productune

  5. From any target project directory, start PO:
       productune

  6. To switch wiki backend later (e.g. Tier A → B):
       # Edit ~/.codex/productune.env: WIKI_BACKEND=keeper
       # Then re-run: bash $ROOT/scripts/install.sh
       # To migrate existing Graphiti episodes:
       #   bash $ROOT/scripts/migrate-graphiti-to-fs.sh

  7. After parallel work, audit & remove auto-created worktrees:
       productune gc        # dry-run
       productune gc -y     # remove safe ones

  8. To update personas, edit files in $ROOT/agents/variants/<backend>/ — re-run install.sh or re-symlink.
EOF
