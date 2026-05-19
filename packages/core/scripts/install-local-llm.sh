#!/usr/bin/env bash
# install-local-llm.sh — Ollama + LLM model installer (shared helper)
#
# Provides functions used by both CLI (install.sh) and GUI IPC subprocess:
#   detect_installed_ollama_models
#   wait_for_ollama_ready
#   ensure_ollama_ready
#   install_local_llm <model>
#
# Usage as sourced library:
#   source "$ROOT/scripts/install-local-llm.sh"
#   install_local_llm "qwen2.5:7b"
#
# Usage as standalone subprocess (by GUI IPC):
#   bash "$ROOT/scripts/install-local-llm.sh" <model>
#
# Non-interactive detection (stdin AND stdout not both TTYs):
#   - no prompts; returns 1 on pull failure.
# Interactive (TTY): retry / keeper prompt preserved for CLI use.

# ── Helpers (no-op if already defined by calling script) ─────────────────────

if ! declare -f say >/dev/null 2>&1; then
  say()  { printf '[llm-install] %s\n' "$*"; }
fi
if ! declare -f warn >/dev/null 2>&1; then
  warn() { printf '[llm-install] WARN: %s\n' "$*" >&2; }
fi

# ── Installed model scanner ───────────────────────────────────────────────────
# List installed Ollama models as "<model>:<tag>" lines.
# Uses `ollama list` if the daemon is up; otherwise scans the manifests dir.

detect_installed_ollama_models() {
  command -v ollama >/dev/null 2>&1 || return 0

  local out
  out=$(ollama list 2>/dev/null) || out=""
  if [ -n "$out" ]; then
    printf '%s\n' "$out" | awk 'NR>1 && NF>0 {print $1}'
    return 0
  fi

  local manifests="$HOME/.ollama/models/manifests/registry.ollama.ai/library"
  [ -d "$manifests" ] || return 0
  local model_dir tag_file
  for model_dir in "$manifests"/*/; do
    [ -d "$model_dir" ] || continue
    local model_name; model_name="$(basename "$model_dir")"
    for tag_file in "$model_dir"*; do
      [ -f "$tag_file" ] || continue
      printf '%s:%s\n' "$model_name" "$(basename "$tag_file")"
    done
  done
}

# ── Ollama readiness ──────────────────────────────────────────────────────────

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

# ── LLM installer ─────────────────────────────────────────────────────────────

install_local_llm() {
  local model="$1"

  # Non-interactive when stdin OR stdout is not a TTY (GUI subprocess / CI).
  local _interactive=1
  [ -t 0 ] && [ -t 1 ] || _interactive=0

  if ! command -v ollama >/dev/null 2>&1; then
    say "Ollama 미설치. 설치 시작..."
    curl -fsSL https://ollama.com/install.sh | sh || {
      warn "ollama 공식 설치 스크립트 실패. https://ollama.com/download 에서 수동 설치 후 재실행."
      return 1
    }
  fi

  ensure_ollama_ready || return 1

  if detect_installed_ollama_models 2>/dev/null | grep -qx "$model"; then
    say "$model — 이미 설치됨 (skip pull)"
  else
    say "$model pull 중 (한 번만, 5–15분 소요)..."
    if ! ollama pull "$model"; then
      if [ "$_interactive" -eq 1 ]; then
        echo
        printf "  [r] 재시도  [k] wiki-keeper(Claude API)로 대신 가기  [q] 중단: "
        read -r choice || choice="q"
        case "$choice" in
          r|R) ollama pull "$model" || return 1 ;;
          k|K) WIKI_BACKEND=keeper; return 0 ;;
          *)   return 1 ;;
        esac
      else
        warn "$model pull 실패 (non-interactive mode)"
        return 1
      fi
    fi
  fi

  if detect_installed_ollama_models 2>/dev/null | grep -qE '^nomic-embed-text(:.+)?$'; then
    say "nomic-embed-text — 이미 설치됨 (skip pull)"
  else
    say "nomic-embed-text pull 중 (Graphiti 임베딩용, ~275MB)..."
    ollama pull nomic-embed-text || warn "nomic-embed-text pull 실패 — 나중에 수동으로: ollama pull nomic-embed-text"
  fi
}

# ── Entry point (run directly, not sourced) ───────────────────────────────────

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  set -euo pipefail

  MODEL="${1:-}"
  if [ -z "$MODEL" ]; then
    printf '[llm-install] WARN: Usage: %s <model>\n' "$0" >&2
    exit 1
  fi

  install_local_llm "$MODEL"
fi
