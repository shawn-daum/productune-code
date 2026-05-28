#!/usr/bin/env bash
set -euo pipefail

# install.sh — one-time setup to wire the productune repo into ~/.claude/ and ~/.productune/
#
# What it does:
#   1. Symlinks agents/*.md  →  ~/.claude/agents/*.md        (persona sub-agents, editable in place)
#   2. Mirrors  packages/core/doctrine/  → ~/.productune/doctrine/  (Tier 0 live mirror, idempotent)
#   3. Scaffolds ~/.productune/{po,designer,developer,qa}/   Tier 2 skeleton (seed-only, never overwrite)
#   4. Writes  ~/.productune/productune.env (engine, repo path)
#
# Migration: pre-2026-04 installs stored po-instructions.md, po-memory.md, productune.env
# under ~/.codex/. install.sh detects those legacy files and moves them to ~/.productune/
# the first time it runs after the rename. (Orphaned artifacts removed in chunk 10.)
#
# Existing files at targets are backed up with a .bak.<timestamp> suffix if they are not already symlinks
# pointing to this repo.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TS="$(date +%s)"

say() { printf "\033[1;34m[install]\033[0m %s\n" "$*"; }
warn() { printf "\033[1;33m[install]\033[0m %s\n" "$*" >&2; }
die() { printf "\033[1;31m[install]\033[0m %s\n" "$*" >&2; exit 1; }


# ── Persona recognition verifier ───────────────────────────────────────────────
# Confirms each expected agent file is present in ~/.claude/agents/, the symlink
# target is readable, and the YAML frontmatter `name:` matches. On failure,
# prints a small debug block so the user can see what's broken.
verify_agents_recognized() {
  local -a expected=(pdt-po pdt-designer pdt-developer pdt-qa)

  local -a missing=() broken=() name_mismatch=()
  local agent
  for agent in "${expected[@]}"; do
    local path="$HOME/.claude/agents/${agent}.md"
    if [ ! -e "$path" ]; then
      missing+=("$agent")
      continue
    fi
    if [ -L "$path" ] && [ ! -e "$(readlink "$path")" ]; then
      broken+=("$agent → $(readlink "$path")")
      continue
    fi
    local declared
    declared=$(awk '/^name:[[:space:]]*/ {sub(/^name:[[:space:]]*/, ""); print; exit}' "$path" 2>/dev/null || echo "")
    if [ "$declared" != "$agent" ]; then
      name_mismatch+=("$agent (frontmatter says: '${declared:-<none>}')")
    fi
  done

  if [ ${#missing[@]} -eq 0 ] && [ ${#broken[@]} -eq 0 ] && [ ${#name_mismatch[@]} -eq 0 ]; then
    say "페르소나 인식 확인 완료: ${expected[*]}"
    return 0
  fi

  warn "페르소나 인식 검증 실패:"
  [ ${#missing[@]} -gt 0 ]       && warn "  • 파일 없음:        ${missing[*]}"
  [ ${#broken[@]} -gt 0 ]        && warn "  • 깨진 심볼릭 링크: ${broken[*]}"
  [ ${#name_mismatch[@]} -gt 0 ] && warn "  • frontmatter name 불일치: ${name_mismatch[*]}"
  warn "디버그:"
  warn "  ls -la ~/.claude/agents/    # 심볼릭 링크 상태"
  warn "  bash $ROOT/scripts/install.sh   # 재실행"
  return 1
}

# ── ~/.claude/settings.json hooks merge (idempotent) ──────────────────────────
# Existing user hooks are preserved. Productune's own hook entries are detected
# by EITHER:
#   - command starting with the current $ROOT/scripts/hooks/  (this clone), OR
#   - command ending with one of the known productune hook basenames
#     (catches hooks left behind by a previous install from a different clone path).
# Re-running install replaces them rather than duplicating.
merge_claude_settings_hooks() {
  local settings="$HOME/.claude/settings.json"
  mkdir -p "$HOME/.claude"
  [ -f "$settings" ] || echo '{}' > "$settings"

  local hooks_dir="$ROOT/scripts/hooks"
  local fmt="$hooks_dir/post-edit-format.sh"
  local doc="$hooks_dir/post-compact-doctrine.sh"
  local stop="$hooks_dir/stop-verify.sh"
  local statew="$hooks_dir/post-delegate-state-write.sh"
  local precheck="$hooks_dir/pre-delegate-task-check.sh"
  local chunkwarn="$hooks_dir/pre-chunking-warn.sh"
  local strip="$hooks_dir/post-bash-strip-cost.sh"

  local tmp; tmp="$(mktemp)" || return 1
  if ! jq --arg fmt "$fmt" --arg doc "$doc" --arg stop "$stop" --arg statew "$statew" --arg precheck "$precheck" --arg chunkwarn "$chunkwarn" --arg strip "$strip" --arg dir "$hooks_dir/" '
    def is_pdt(cmd; dir):
      (cmd | startswith(dir))
      or (cmd | endswith("/scripts/hooks/post-edit-format.sh"))
      or (cmd | endswith("/scripts/hooks/post-compact-doctrine.sh"))
      or (cmd | endswith("/scripts/hooks/stop-verify.sh"))
      or (cmd | endswith("/scripts/hooks/post-delegate-state-write.sh"))
      or (cmd | endswith("/scripts/hooks/pre-delegate-task-check.sh"))
      or (cmd | endswith("/scripts/hooks/pre-chunking-warn.sh"))
      or (cmd | endswith("/scripts/hooks/post-bash-strip-cost.sh"));
    def strip_pdt(arr; dir):
      (arr // []) | map(
        select(((.hooks // []) | map(is_pdt(.command // ""; dir)) | any) | not)
      );
    (. // {})
    | .hooks //= {}
    | .hooks.PreToolUse = (strip_pdt(.hooks.PreToolUse; $dir) + [
        {matcher: "Bash",
         hooks: [{type: "command", command: $precheck}]},
        {matcher: "Bash",
         hooks: [{type: "command", command: $chunkwarn}]}
      ])
    | .hooks.PostToolUse = (strip_pdt(.hooks.PostToolUse; $dir) + [
        {matcher: "Write|Edit",
         hooks: [{type: "command", command: $fmt}]},
        {matcher: "Bash",
         hooks: [{type: "command", command: $statew}]},
        {matcher: "Bash",
         hooks: [{type: "command", command: $strip}]}
      ])
    | .hooks.PostCompact = (strip_pdt(.hooks.PostCompact; $dir) + [{
        hooks: [{type: "command", command: $doc}]
      }])
    | .hooks.Stop = (strip_pdt(.hooks.Stop; $dir) + [{
        matcher: "pdt-developer",
        hooks: [{type: "command", command: $stop}]
      }])
  ' "$settings" > "$tmp"; then
    rm -f "$tmp"
    return 1
  fi
  mv "$tmp" "$settings"
  return 0
}

merge_claude_settings_statusline() {
  local settings="$HOME/.claude/settings.json"
  mkdir -p "$HOME/.claude"
  [ -f "$settings" ] || echo '{}' > "$settings"

  local script="$ROOT/scripts/statusline-productune.sh"
  local tmp; tmp="$(mktemp)" || return 1
  if ! jq --arg cmd "$script" '
    (. // {}) | .statusLine = {type: "command", command: $cmd}
  ' "$settings" > "$tmp"; then
    rm -f "$tmp"
    return 1
  fi
  mv "$tmp" "$settings"
  return 0
}

# ── Claude Code preflight — auto-install + auth check ────────────────────────
ensure_claude_installed() {
  if command -v claude >/dev/null 2>&1; then
    return 0
  fi
  warn "Claude Code CLI가 설치되어 있지 않습니다."
  if [ ! -t 0 ] || [ ! -t 1 ]; then
    die "비대화형 환경: 먼저 설치 후 install.sh 재실행 — npm install -g @anthropic-ai/claude-code"
  fi
  printf '\033[1;36m[install]\033[0m 자동 설치할까요? (npm install -g @anthropic-ai/claude-code) [Y/n]: '
  read -r ANS || ANS=""
  case "${ANS:-Y}" in
    [Yy]*|"")
      command -v npm >/dev/null 2>&1 || die "npm 미설치 — 먼저 Node.js 설치: https://nodejs.org"
      npm install -g @anthropic-ai/claude-code || die "Claude Code 설치 실패"
      command -v claude >/dev/null 2>&1 || die "설치 후에도 claude CLI를 찾을 수 없습니다 — PATH 확인"
      say "Claude Code 설치 완료: $(claude --version 2>/dev/null | head -1 || echo '?')"
      ;;
    *) die "Claude Code 설치 후 install.sh 재실행: npm install -g @anthropic-ai/claude-code" ;;
  esac
}

ensure_claude_authed() {
  local status
  status="$(claude auth status 2>/dev/null || true)"
  if printf '%s' "$status" | jq -e '.loggedIn == true' >/dev/null 2>&1; then
    local who org
    who="$(printf '%s' "$status" | jq -r '.email // ""' 2>/dev/null)"
    org="$(printf '%s' "$status" | jq -r '.orgName // ""' 2>/dev/null)"
    say "Claude Code 인증 OK${who:+ (${who}${org:+ / $org})}"
    return 0
  fi
  warn "Claude Code 로그인이 필요합니다."
  if [ ! -t 0 ] || [ ! -t 1 ]; then
    die "비대화형 환경: 'claude auth login' 먼저 실행 후 install.sh 재실행"
  fi
  say "이제 claude 로그인 흐름을 시작합니다 (브라우저가 열릴 수 있습니다)..."
  claude auth login || die "로그인 실패 — install.sh 재실행 필요"
  status="$(claude auth status 2>/dev/null || true)"
  if printf '%s' "$status" | jq -e '.loggedIn == true' >/dev/null 2>&1; then
    say "로그인 확인 완료"
  else
    die "로그인이 완료되지 않았습니다. 'claude auth login' 직접 실행 후 install.sh 재실행"
  fi
}

# Preflight
command -v jq >/dev/null || die "jq not found. Run: brew install jq"   # required for auth probe + state writes
ensure_claude_installed
ensure_claude_authed
command -v uv >/dev/null || warn "uv not found (optional). Install if needed: brew install uv"

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

# 2a) Migration: pre-rename installs stored productune-owned files under ~/.codex/.
#     Move po-instructions.md, po-memory.md, productune.env to ~/.productune/ if found.
#     ~/.codex/config.toml stays where it is — it's Codex CLI's own config.
mkdir -p "$HOME/.productune"
for OLD_NAME in po-instructions.md po-memory.md productune.env; do
  OLD="$HOME/.codex/$OLD_NAME"
  NEW="$HOME/.productune/$OLD_NAME"
  if [ -f "$OLD" ] && [ ! -e "$NEW" ]; then
    mv "$OLD" "$NEW"
    say "migrated: ~/.codex/$OLD_NAME → ~/.productune/$OLD_NAME"
  elif [ -f "$OLD" ] && [ -e "$NEW" ]; then
    # Both exist — keep new, archive old
    mv "$OLD" "$OLD.legacy.$TS"
    warn "both ~/.codex/$OLD_NAME and ~/.productune/$OLD_NAME exist; archived legacy → $OLD.legacy.$TS"
  fi
done
# Clean up legacy .bak siblings under ~/.codex/ (they belong to old po-instructions.md)
for BAK in "$HOME"/.codex/po-instructions.md.bak.* "$HOME"/.codex/po-memory.md.bak.*; do
  [ -e "$BAK" ] || continue
  mv "$BAK" "${BAK/.codex/.productune}" 2>/dev/null || true
done

# 2b) Codex CLI profile manifest — only deployed if the user opts into Codex
#     as their PO engine in section 5 below. install.sh does not pre-install
#     Codex CLI itself; user must `npm i -g @openai/codex` (or whatever the
#     packaging is) on their own. We just stage the productune profile manifest
#     when they pick codex.
maybe_install_codex_config() {
  command -v codex >/dev/null 2>&1 || {
    warn "codex CLI not found on PATH. Install separately, then re-run install.sh to deploy ~/.codex/config.toml."
    return 0
  }
  local src="$ROOT/codex/config.toml"
  local dest="$HOME/.codex/config.toml"
  mkdir -p "$HOME/.codex"
  if [ -e "$dest" ] && ! cmp -s "$src" "$dest"; then
    mv "$dest" "$dest.bak.$TS"
    warn "backed up existing $dest → $dest.bak.$TS"
  fi
  cp "$src" "$dest"
  say "copied Codex profile manifest: $dest"
}

# 2c) Setup ~/.productune/doctrine/ — Tier 0 live mirror (byte-identical copy of SoT)
#     cp -r overwrites on re-run, which is intentional: re-running install.sh = doctrine update.
say "Tier 0 doctrine mirror 설정 중..."
mkdir -p \
  "$HOME/.productune/doctrine/common/bookshelf" \
  "$HOME/.productune/doctrine/persona/po/bookshelf" \
  "$HOME/.productune/doctrine/persona/designer/bookshelf" \
  "$HOME/.productune/doctrine/persona/developer/bookshelf" \
  "$HOME/.productune/doctrine/persona/qa/bookshelf"
if [ -d "$ROOT/doctrine" ]; then
  cp -r "$ROOT/doctrine/." "$HOME/.productune/doctrine/"
  say "doctrine mirror 완료: ~/.productune/doctrine/"
else
  warn "doctrine/ not found at $ROOT/doctrine — Tier 0 mirror skipped (run again after doctrine/ is present)"
fi

# 2d) Setup ~/.productune/mcp/ — dispatch-time MCP configs (--mcp-config files)
#     Agents are frontmatter-less habit pointers now; QA gets playwright at
#     dispatch via `claude --agent pdt-qa --mcp-config ~/.productune/mcp/playwright.json`.
#     cp overwrites on re-run, matching the doctrine mirror (re-run = config update).
mkdir -p "$HOME/.productune/mcp"
if [ -f "$ROOT/agents/mcp/playwright.json" ]; then
  cp "$ROOT/agents/mcp/playwright.json" "$HOME/.productune/mcp/playwright.json"
  say "MCP config 설치 완료: ~/.productune/mcp/playwright.json"
else
  warn "agents/mcp/playwright.json not found at $ROOT/agents/mcp — playwright MCP config skipped"
fi

# 3) Setup ~/.productune/<persona>/ — Tier 2 scaffolding (seed-only, never overwrite)
#    Creates bookshelf/ dir + empty habit.md header for fresh installs.
for _PERSONA in po designer developer qa; do
  mkdir -p "$HOME/.productune/$_PERSONA/bookshelf"
  _HABIT="$HOME/.productune/$_PERSONA/habit.md"
  if [ ! -e "$_HABIT" ]; then
    printf '# %s Tier 2 habit\n\n> Per-user, cross-project, curated. \xe2\x89\xa4100 lines.\n\n## Entries\n\n<!-- append manually -->\n' \
      "$_PERSONA" > "$_HABIT"
    say "Tier 2 scaffold: ~/.productune/$_PERSONA/habit.md"
  fi
done

# 4) Make wrapper scripts executable (idempotent — git checkout usually preserves +x already)
chmod +x "$ROOT/scripts/productune" "$ROOT/scripts/install.sh" \
         "$ROOT/scripts/statusline-productune.sh"
chmod +x "$ROOT/scripts/hooks"/*.sh 2>/dev/null || true
say "wrapper scripts ready"
# Legacy `my-po` symlink (compat alias) — recreate if missing.
if [ ! -e "$ROOT/scripts/my-po" ]; then
  ln -s productune "$ROOT/scripts/my-po"
  say "created compat symlink scripts/my-po → productune"
fi

# 5) PO engine — claude (primary, hooks fire) or codex (secondary, doctrine-only)
#    Interactive prompt picks one and seeds productune.env. Non-interactive falls
#    back to claude. Existing env file with MY_PO_ENGINE is preserved (just
#    repo-path refresh). Picking codex also drops ~/.codex/config.toml.
PO_ENV_FILE="$HOME/.productune/productune.env"

choose_engine_interactive() {
  # Echoes the chosen engine. Returns 0.
  local _codex_status="not installed"
  command -v codex >/dev/null 2>&1 && _codex_status="installed"
  cat >&2 <<PROMPT

[install] PO engine 선택:
  [1] claude   primary — Claude Code, hooks fire (R1/R2/R4 enforced). 권장.
  [2] codex    secondary — Codex CLI, doctrine-only (hooks don't fire on codex).
              codex CLI 상태: $_codex_status
PROMPT
  printf '  선택 [1/2, 기본=1]: ' >&2
  local _ans=""; read -r _ans || _ans=""
  case "$_ans" in
    2|codex) printf 'codex' ;;
    *)       printf 'claude' ;;
  esac
}

if [ ! -e "$PO_ENV_FILE" ]; then
  if [ -t 0 ] && [ -t 1 ]; then
    CHOSEN_ENGINE="$(choose_engine_interactive)"
  else
    CHOSEN_ENGINE="claude"
  fi
  printf 'MY_PO_ENGINE=%s\nPRODUCTUNE_REPO=%s\n' "$CHOSEN_ENGINE" "$ROOT" > "$PO_ENV_FILE"
  say "engine: $CHOSEN_ENGINE (saved to $PO_ENV_FILE, repo path: $ROOT)"
  [ "$CHOSEN_ENGINE" = "codex" ] && maybe_install_codex_config
else
  # Refresh repo path in case the user moved the clone; preserve any existing engine.
  CURRENT_ENGINE=""
  if grep -qE '^MY_PO_ENGINE=' "$PO_ENV_FILE"; then
    CURRENT_ENGINE="$(grep -E '^MY_PO_ENGINE=' "$PO_ENV_FILE" | tail -1 | cut -d= -f2 | tr -d '\n')"
  fi
  CURRENT_ENGINE="${CURRENT_ENGINE:-claude}"
  if grep -qE '^PRODUCTUNE_REPO=' "$PO_ENV_FILE"; then
    sed -i.bak -E "s|^PRODUCTUNE_REPO=.*|PRODUCTUNE_REPO=$ROOT|" "$PO_ENV_FILE" && rm -f "$PO_ENV_FILE.bak"
  else
    printf 'PRODUCTUNE_REPO=%s\n' "$ROOT" >> "$PO_ENV_FILE"
  fi
  if [ -t 0 ] && [ -t 1 ]; then
    printf '\033[1;36m[install]\033[0m 현재 PO engine=%s. 변경할까요? [y/N]: ' "$CURRENT_ENGINE"
    SWAP=""; read -r SWAP || SWAP=""
    case "$SWAP" in
      y|Y|yes|YES)
        NEW_ENGINE="$(choose_engine_interactive)"
        if [ "$NEW_ENGINE" != "$CURRENT_ENGINE" ]; then
          sed -i.bak -E "s|^MY_PO_ENGINE=.*|MY_PO_ENGINE=$NEW_ENGINE|" "$PO_ENV_FILE" && rm -f "$PO_ENV_FILE.bak"
          CURRENT_ENGINE="$NEW_ENGINE"
          say "engine switched to $CURRENT_ENGINE"
          [ "$CURRENT_ENGINE" = "codex" ] && maybe_install_codex_config
        fi
        ;;
      *) ;;
    esac
  fi
  say "PO engine config exists at $PO_ENV_FILE (current: $CURRENT_ENGINE, repo path refreshed to $ROOT)"
  # Even on no-swap path: if existing config says codex but ~/.codex/config.toml
  # is stale or missing, refresh it.
  [ "$CURRENT_ENGINE" = "codex" ] && maybe_install_codex_config
fi

# 5b) Non-interactive / partial-env safety net — ensure MY_PO_ENGINE + PRODUCTUNE_REPO are
# always present in the env file. The interactive prompt block above runs only when stdin
# is a TTY AND the env file doesn't yet exist. Without this, a non-interactive install
# (e.g. `bash install.sh </dev/null`) creates an env file without
# the engine line, and the wrapper falls back to its compiled default — which works, but
# `grep MY_PO_ENGINE ~/.productune/productune.env` returns nothing, confusing operators.
mkdir -p "$(dirname "$PO_ENV_FILE")"
[ -e "$PO_ENV_FILE" ] || : > "$PO_ENV_FILE"
if ! grep -qE '^MY_PO_ENGINE=' "$PO_ENV_FILE"; then
  printf 'MY_PO_ENGINE=claude\n' >> "$PO_ENV_FILE"
  say "ensured: MY_PO_ENGINE=claude (default — appended to $PO_ENV_FILE)"
fi
if ! grep -qE '^PRODUCTUNE_REPO=' "$PO_ENV_FILE"; then
  printf 'PRODUCTUNE_REPO=%s\n' "$ROOT" >> "$PO_ENV_FILE"
  say "ensured: PRODUCTUNE_REPO=$ROOT (appended to $PO_ENV_FILE)"
fi
# Remove legacy USER_MODE line if present (removed 2026-05-22 — wiki-keeper default)
if grep -qE '^USER_MODE=' "$PO_ENV_FILE" 2>/dev/null; then
  TMP_ENV="$PO_ENV_FILE.tmp.$$"
  grep -Ev '^USER_MODE=' "$PO_ENV_FILE" > "$TMP_ENV" || true
  mv "$TMP_ENV" "$PO_ENV_FILE"
  say "removed legacy USER_MODE from $PO_ENV_FILE"
fi

# Verify Claude recognizes the personas (fail-soft: warn but continue)
verify_agents_recognized || true

# 7) Ensure auto-compact threshold default is present in env file.
#    `productune` sources this with `set -a` so the var is inherited by spawned
#    codex/claude personas — no manual shell-rc export needed.
mkdir -p "$(dirname "$PO_ENV_FILE")"
if [ ! -e "$PO_ENV_FILE" ] || ! grep -qE '^CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=' "$PO_ENV_FILE"; then
  printf 'CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=70\n' >> "$PO_ENV_FILE"
  say "auto-compact threshold defaulted to 70% in $PO_ENV_FILE"
fi

# 7b) Auto-install Claude Code hooks (idempotent merge into ~/.claude/settings.json)
if ! grep -qE '^PRODUCTUNE_HOOKS_INSTALLED=' "$PO_ENV_FILE" 2>/dev/null; then
  if merge_claude_settings_hooks; then
    printf 'PRODUCTUNE_HOOKS_INSTALLED=true\n' >> "$PO_ENV_FILE"
    say "hooks 등록 완료 (~/.claude/settings.json)"
  else
    warn "hooks 등록 실패 — ~/.claude/settings.json 수동 확인 필요"
    printf 'PRODUCTUNE_HOOKS_INSTALLED=failed\n' >> "$PO_ENV_FILE"
  fi
fi

# 7c) Auto-install statusLine (idempotent — overwrites .statusLine field)
if ! grep -qE '^PRODUCTUNE_STATUSLINE_INSTALLED=' "$PO_ENV_FILE" 2>/dev/null; then
  if merge_claude_settings_statusline; then
    printf 'PRODUCTUNE_STATUSLINE_INSTALLED=true\n' >> "$PO_ENV_FILE"
    say "statusLine 등록 완료"
  else
    warn "statusLine 등록 실패 — ~/.claude/settings.json 수동 확인 필요"
    printf 'PRODUCTUNE_STATUSLINE_INSTALLED=failed\n' >> "$PO_ENV_FILE"
  fi
fi

# 8) Auto-install OSS skill libraries (mattpocock + phuryn)
if ! grep -qE '^PRODUCTUNE_SKILLS_INSTALLED=' "$PO_ENV_FILE" 2>/dev/null; then
  if bash "$ROOT/scripts/setup-skills.sh"; then
    printf 'PRODUCTUNE_SKILLS_INSTALLED=true\n' >> "$PO_ENV_FILE"
    say "OSS skill 설치 완료"
  else
    warn "skill 설치 중 일부 실패 — 수동 확인: bash $ROOT/scripts/setup-skills.sh"
    printf 'PRODUCTUNE_SKILLS_INSTALLED=partial\n' >> "$PO_ENV_FILE"
  fi
fi

# 9) Interactive: PATH registration
PATH_REGISTERED=0
NEEDS_SOURCE=0

# 9a) Stale-path sweep — when the user re-runs install.sh from a different clone
# location, prior PATH entries (symlinks under /usr/local/bin or ~/.local/bin
# and `export PATH=...` lines in shell rc files) still point at the old clone.
# `command -v productune` would happily report "already on PATH" and silently
# leave the stale shim active. Detect and refresh them up front.
EXPECTED_BIN="$ROOT/scripts/productune"
abs_readlink() {
  # Resolve symlink target to absolute path. Avoids GNU `readlink -f`
  # (BSD readlink on macOS doesn't support -f reliably).
  local link="$1" target
  target="$(readlink "$link" 2>/dev/null)" || return 1
  case "$target" in
    /*) printf '%s\n' "$target" ;;
    *)
      local link_dir; link_dir="$(cd "$(dirname "$link")" 2>/dev/null && pwd)" || return 1
      local tgt_dir; tgt_dir="$(cd "$link_dir/$(dirname "$target")" 2>/dev/null && pwd)" || return 1
      printf '%s/%s\n' "$tgt_dir" "$(basename "$target")"
      ;;
  esac
}

for STALE_LINK in "$HOME/.local/bin/productune" "/usr/local/bin/productune"; do
  [ -L "$STALE_LINK" ] || continue
  CURRENT_TARGET="$(abs_readlink "$STALE_LINK" || true)"
  if [ -z "$CURRENT_TARGET" ]; then
    warn "stale dangling symlink: $STALE_LINK (target unresolvable) — refreshing"
  elif [ "$CURRENT_TARGET" = "$EXPECTED_BIN" ]; then
    continue
  else
    warn "stale symlink: $STALE_LINK → $CURRENT_TARGET"
    say  "  refreshing → $EXPECTED_BIN"
  fi
  if [ "$STALE_LINK" = "/usr/local/bin/productune" ]; then
    sudo ln -sfn "$EXPECTED_BIN" "$STALE_LINK" 2>/dev/null \
      || warn "  sudo 실패. 수동 정리: sudo ln -sfn $EXPECTED_BIN $STALE_LINK"
  else
    mkdir -p "$(dirname "$STALE_LINK")"
    ln -sfn "$EXPECTED_BIN" "$STALE_LINK"
  fi
done

# Detect stale productune `export PATH=...` lines in shell rc files. Lines that
# contain `productune/scripts` but do NOT include the current $ROOT/scripts are
# leftovers from a clone in a different location.
for STALE_RC in "$HOME/.zshrc" "$HOME/.bashrc" "$HOME/.bash_profile"; do
  [ -f "$STALE_RC" ] || continue
  STALE_HITS="$(awk -v root="$ROOT/scripts" '
    index($0, "productune/scripts") > 0 && index($0, root) == 0 { print NR": "$0 }
  ' "$STALE_RC")"
  [ -z "$STALE_HITS" ] && continue
  warn "stale productune PATH 라인 발견: $STALE_RC"
  printf '%s\n' "$STALE_HITS" | sed 's/^/    /'
  if [ -t 0 ] && [ -t 1 ]; then
    printf '\033[1;33m[install]\033[0m %s 의 stale 라인을 제거할까요? (백업: %s.bak.%s) [y/N]: ' \
      "$STALE_RC" "$STALE_RC" "$TS"
    STALE_ANS=""; read -r STALE_ANS || STALE_ANS=""
    case "$STALE_ANS" in
      y|Y|yes|YES)
        cp "$STALE_RC" "$STALE_RC.bak.$TS"
        STALE_TMP="$(mktemp)"
        # Drop stale productune lines plus a preceding "# productune" marker
        # if it directly precedes one (best-effort cleanup).
        awk -v root="$ROOT/scripts" '
          BEGIN { hold = "" }
          {
            if (hold != "") {
              if (index($0, "productune/scripts") > 0 && index($0, root) == 0) {
                hold = ""; next
              } else {
                print hold; hold = ""
              }
            }
            if ($0 ~ /^# productune$/) { hold = $0; next }
            if (index($0, "productune/scripts") > 0 && index($0, root) == 0) next
            print
          }
          END { if (hold != "") print hold }
        ' "$STALE_RC" > "$STALE_TMP" && mv "$STALE_TMP" "$STALE_RC"
        say "  제거 완료. 백업: $STALE_RC.bak.$TS"
        ;;
      *)
        warn "  남겨둠 — 수동으로 정리하세요."
        ;;
    esac
  else
    warn "  비대화형 — 그대로 둠. TTY에서 install.sh를 다시 실행하면 정리 가능."
  fi
done

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
          say "PATH 추가 완료: $SHELL_RC (새 터미널에서 자동 적용)"
          printf 'PRODUCTUNE_PATH_METHOD=rc\nPRODUCTUNE_PATH_RC=%s\n' "$SHELL_RC" >> "$PO_ENV_FILE"
          PATH_REGISTERED=1
          NEEDS_SOURCE=1
        fi
        ;;
    esac
  fi
fi

# 9b) Advanced opt-in — Codex engine (interactive only)
#     Skipped automatically in non-interactive mode or when PRODUCTUNE_SKIP_ADVANCED=1.
if [ -t 0 ] && [ -t 1 ] && [ "${PRODUCTUNE_SKIP_ADVANCED:-0}" != "1" ]; then

  # ── Codex engine opt-in ───────────────────────────────────────────────────
  echo
  printf '\033[1;36m[install]\033[0m Codex 엔진 활성화할까요? (OpenAI ChatGPT 구독 cost-split, 대부분 불필요) [y/N]: '
  read -r _CODEX_ANS || _CODEX_ANS=""
  case "$_CODEX_ANS" in
    y|Y|yes|YES)
      say "Codex 엔진 설정 중..."
      if grep -qE '^MY_PO_ENGINE=' "$PO_ENV_FILE"; then
        sed -i.bak -E "s|^MY_PO_ENGINE=.*|MY_PO_ENGINE=codex|" "$PO_ENV_FILE" \
          && rm -f "$PO_ENV_FILE.bak"
      else
        printf 'MY_PO_ENGINE=codex\n' >> "$PO_ENV_FILE"
      fi
      maybe_install_codex_config
      say "Codex 엔진 설정 완료"
      ;;
    *)
      say "Codex 엔진 opt-in skip — 기본 설정 유지"
      ;;
  esac

fi

# 10) Summary + next steps
cat <<EOF

$(printf "\033[1;32m✓ onboard complete\033[0m")

  PATH         : $([ "$PATH_REGISTERED" = 1 ] && echo "등록됨" || echo "미등록 (위 안내 참고)")

Next steps:
$(if [ "$NEEDS_SOURCE" = 1 ]; then
cat <<PATHRC
  1. 현재 셸에 PATH 즉시 적용 (새 터미널에서는 자동 적용되므로 생략 가능):
       source $SHELL_RC

  2. 원하는 프로젝트 폴더로 이동 후 init → productune 실행:
       cd <your-project>
       productune init        # 한 번만: .productune/, docs/pdt-*/, .gitignore 세팅
       productune             # PO 세션 시작
     → 대화를 시작해서 만들고 싶은 제품을 말하면, 대화를 통해 PRD를 완성해 나갑니다.
     (페르소나 인식이 안 되면: ls -la ~/.claude/agents/ 확인 후 install.sh 재실행)

  3. 고급 옵션 변경 (Codex 엔진):
       bash $ROOT/scripts/install.sh   # end-of-install Codex opt-in 에서 선택

  4. 병렬 작업 후 worktree 정리:
       productune gc        # dry-run
       productune gc -y     # safe한 것 자동 제거

  5. 완전히 제거할 때:
       productune uninstall
PATHRC
else
cat <<NOPATH
  1. 원하는 프로젝트 폴더로 이동 후 init → productune 실행:
       cd <your-project>
       productune init        # 한 번만: .productune/, docs/pdt-*/, .gitignore 세팅
       productune             # PO 세션 시작
     → 대화를 시작해서 만들고 싶은 제품을 말하면, 대화를 통해 PRD를 완성해 나갑니다.
     (페르소나 인식이 안 되면: ls -la ~/.claude/agents/ 확인 후 install.sh 재실행)

  2. 고급 옵션 변경 (Codex 엔진):
       bash $ROOT/scripts/install.sh   # end-of-install Codex opt-in 에서 선택

  3. 병렬 작업 후 worktree 정리:
       productune gc        # dry-run
       productune gc -y     # safe한 것 자동 제거

  4. 완전히 제거할 때:
       productune uninstall
NOPATH
fi)
EOF
