#!/usr/bin/env bash
set -euo pipefail

# uninstall.sh — remove all productune artifacts installed by install.sh
#
# Removes:
#   - ~/.claude/agents/*.md  symlinks pointing to this repo
#   - ~/.codex/productune.env
#   - ~/.codex/po-instructions.md  (and .bak.* siblings)
#   - ~/.codex/config.toml         (restores latest .bak if present)
#   - ~/.codex/po-memory.md        (opt-in — contains accumulated PO memory)
#   - ~/.productune/               (opt-in — wiki/fs backend data)
#   - PATH entry / symlink         (auto, based on PRODUCTUNE_PATH_METHOD in productune.env)

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

say()  { printf '\033[1;34m[uninstall]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[uninstall]\033[0m %s\n' "$*" >&2; }
ok()   { printf '\033[1;32m[uninstall]\033[0m %s\n' "$*"; }

confirm() {
  # confirm <prompt> — returns 0 (yes) or 1 (no/non-interactive)
  local PROMPT="$1"
  if [ -t 0 ] && [ -t 1 ]; then
    printf '\033[1;33m[uninstall]\033[0m %s [y/N] ' "$PROMPT"
    local REPLY=""
    read -r REPLY || REPLY=""
    case "$REPLY" in y|Y|yes|YES) return 0 ;; esac
  fi
  return 1
}

REMOVED=0
SKIPPED=0

# ── 0. Read PATH method from productune.env BEFORE it's deleted ───────────────
PATH_METHOD=""
PATH_RC=""
ENV_FILE="$HOME/.codex/productune.env"
if [ -f "$ENV_FILE" ]; then
  PATH_METHOD="$(grep -E '^PRODUCTUNE_PATH_METHOD=' "$ENV_FILE" | tail -1 | cut -d= -f2 | tr -d '\n' || true)"
  PATH_RC="$(grep -E '^PRODUCTUNE_PATH_RC=' "$ENV_FILE" | tail -1 | cut -d= -f2 | tr -d '\n' || true)"
fi

# ── 1. Agent symlinks ─────────────────────────────────────────────────────────
say "1) Scanning ~/.claude/agents/ for symlinks pointing to this repo..."
AGENT_DIR="$HOME/.claude/agents"
if [ -d "$AGENT_DIR" ]; then
  while IFS= read -r LINK; do
    TARGET="$(readlink "$LINK" 2>/dev/null || true)"
    if [[ "$TARGET" == "$ROOT"* ]]; then
      rm -f "$LINK"
      say "  removed: $LINK → $TARGET"
      REMOVED=$((REMOVED+1))
    fi
  done < <(find "$AGENT_DIR" -maxdepth 1 -type l 2>/dev/null)
  # Also sweep dangling symlinks whose original targets were in this repo path
  while IFS= read -r LINK; do
    TARGET="$(readlink "$LINK" 2>/dev/null || true)"
    if [[ "$TARGET" == "$ROOT"* ]]; then
      rm -f "$LINK"
      say "  removed dangling: $LINK"
      REMOVED=$((REMOVED+1))
    fi
  done < <(find "$AGENT_DIR" -maxdepth 1 -type l ! -exec test -e {} \; -print 2>/dev/null)
  if [ "$REMOVED" = 0 ]; then
    say "  no productune agent symlinks found"
  fi
else
  say "  ~/.claude/agents/ does not exist — nothing to remove"
fi

# ── 2. productune.env ─────────────────────────────────────────────────────────
say "2) Removing ~/.codex/productune.env..."
if [ -f "$HOME/.codex/productune.env" ]; then
  rm -f "$HOME/.codex/productune.env"
  say "  removed: ~/.codex/productune.env"
  REMOVED=$((REMOVED+1))
else
  say "  not found — already clean"
fi

# ── 3. po-instructions.md (and .bak siblings) ────────────────────────────────
say "3) Removing ~/.codex/po-instructions.md..."
for F in "$HOME/.codex/po-instructions.md" "$HOME"/.codex/po-instructions.md.bak.*; do
  if [ -f "$F" ]; then
    rm -f "$F"
    say "  removed: $F"
    REMOVED=$((REMOVED+1))
  fi
done

# ── 4. config.toml — restore latest .bak if available ────────────────────────
say "4) Restoring ~/.codex/config.toml from backup..."
LATEST_BAK=$(ls -1t "$HOME"/.codex/config.toml.bak.* 2>/dev/null | head -1 || true)
if [ -n "$LATEST_BAK" ]; then
  cp "$LATEST_BAK" "$HOME/.codex/config.toml"
  say "  restored: $LATEST_BAK → ~/.codex/config.toml"
  # Clean up all .bak files
  rm -f "$HOME"/.codex/config.toml.bak.*
  say "  cleaned up .bak files"
  REMOVED=$((REMOVED+1))
else
  say "  no backup found — leaving config.toml as-is"
  warn "  if config.toml was originally empty or Codex-default, consider deleting it manually."
fi

# ── 5. po-memory.md — opt-in (contains accumulated data) ─────────────────────
say "5) PO memory: ~/.codex/po-memory.md"
if [ -f "$HOME/.codex/po-memory.md" ]; then
  warn "  This file contains accumulated PO learnings. Deleting is permanent."
  if confirm "Delete ~/.codex/po-memory.md?"; then
    rm -f "$HOME/.codex/po-memory.md"
    say "  removed: ~/.codex/po-memory.md"
    REMOVED=$((REMOVED+1))
  else
    say "  kept: ~/.codex/po-memory.md"
    SKIPPED=$((SKIPPED+1))
  fi
else
  say "  not found — nothing to do"
fi

# ── 6. ~/.productune/ wiki data — opt-in ─────────────────────────────────────
say "6) Wiki data: ~/.productune/"
if [ -d "$HOME/.productune" ]; then
  WIKI_SIZE=$(du -sh "$HOME/.productune" 2>/dev/null | awk '{print $1}' || echo "?")
  warn "  Size: $WIKI_SIZE — contains fs-backend wiki pages."
  if confirm "Delete ~/.productune/ (all wiki data)?"; then
    rm -rf "$HOME/.productune"
    say "  removed: ~/.productune/"
    REMOVED=$((REMOVED+1))
  else
    say "  kept: ~/.productune/"
    SKIPPED=$((SKIPPED+1))
  fi
else
  say "  not found — nothing to do"
fi

# ── 7. PATH entry / symlink ───────────────────────────────────────────────────
say "7) PATH 등록 제거 (method: ${PATH_METHOD:-unknown})..."
case "$PATH_METHOD" in
  rc)
    RC_FILE="${PATH_RC:-$HOME/.zshrc}"
    if [ -f "$RC_FILE" ] && grep -qF "$ROOT/scripts" "$RC_FILE" 2>/dev/null; then
      # Remove the "# productune" comment line + the export PATH line
      sed -i.bak -e "/^# productune$/d" -e "\|$ROOT/scripts|d" "$RC_FILE" && rm -f "$RC_FILE.bak"
      say "  제거 완료: $RC_FILE 에서 productune PATH 항목 삭제"
      REMOVED=$((REMOVED+1))
    else
      say "  $RC_FILE 에서 productune PATH 항목을 찾지 못했습니다 — 이미 없거나 수동 추가된 것"
    fi
    ;;
  local_bin)
    if [ -L "$HOME/.local/bin/productune" ]; then
      rm -f "$HOME/.local/bin/productune"
      say "  제거 완료: ~/.local/bin/productune"
      REMOVED=$((REMOVED+1))
    else
      say "  ~/.local/bin/productune 없음 — 이미 제거됨"
    fi
    ;;
  usr_local_bin)
    if [ -L "/usr/local/bin/productune" ]; then
      if sudo rm -f /usr/local/bin/productune 2>/dev/null; then
        say "  제거 완료: /usr/local/bin/productune"
        REMOVED=$((REMOVED+1))
      else
        warn "  sudo 실패. 수동으로 실행하세요: sudo rm -f /usr/local/bin/productune"
        SKIPPED=$((SKIPPED+1))
      fi
    else
      say "  /usr/local/bin/productune 없음 — 이미 제거됨"
    fi
    ;;
  none|"")
    # Fallback: scan common locations
    FOUND_ANY=0
    [ -L "$HOME/.local/bin/productune" ] && rm -f "$HOME/.local/bin/productune" \
      && say "  제거 완료: ~/.local/bin/productune" && REMOVED=$((REMOVED+1)) && FOUND_ANY=1
    [ -L "/usr/local/bin/productune" ] && sudo rm -f /usr/local/bin/productune 2>/dev/null \
      && say "  제거 완료: /usr/local/bin/productune" && REMOVED=$((REMOVED+1)) && FOUND_ANY=1
    for RC in "$HOME/.zshrc" "$HOME/.bashrc" "$HOME/.bash_profile"; do
      if [ -f "$RC" ] && grep -qF "$ROOT/scripts" "$RC" 2>/dev/null; then
        sed -i.bak -e "/^# productune$/d" -e "\|$ROOT/scripts|d" "$RC" && rm -f "$RC.bak"
        say "  제거 완료: $RC 에서 productune PATH 항목 삭제"
        REMOVED=$((REMOVED+1)); FOUND_ANY=1
      fi
    done
    [ "$FOUND_ANY" = 0 ] && say "  PATH 등록 흔적 없음 — 이미 없거나 onboard 시 등록하지 않은 것"
    ;;
esac

# ── Summary ───────────────────────────────────────────────────────────────────
echo
ok "Uninstall complete. Removed: $REMOVED item(s), Kept: $SKIPPED item(s)."
echo
say "완전히 제거하려면 repo 디렉터리도 삭제하세요:"
say "  rm -rf $ROOT"
