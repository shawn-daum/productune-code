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

# upsert_env KEY VALUE FILE — set or update a key in an env file (no duplicates).
upsert_env() {
  local key="$1" val="$2" file="$3"
  if grep -qE "^${key}=" "$file" 2>/dev/null; then
    sed -i.bak -E "s|^${key}=.*|${key}=${val}|" "$file" && rm -f "${file}.bak"
  else
    printf '%s=%s\n' "$key" "$val" >> "$file"
  fi
}


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
  local ctxlang="$hooks_dir/pre-delegate-ctx-lang.sh"
  local chunkwarn="$hooks_dir/pre-chunking-warn.sh"
  local strip="$hooks_dir/post-bash-strip-cost.sh"
  local fmlint="$hooks_dir/pre-frontmatter-lint.sh"
  local fmverify="$hooks_dir/post-ticket-status-verify.sh"
  local gitposture="$hooks_dir/pre-git-posture.sh"
  local sessdoc="$hooks_dir/session-start-doctrine.sh"
  local docguard="$hooks_dir/pre-doctrine-guard.sh"
  local phasegate="$hooks_dir/pre-phase-gate-guard.sh"
  local gateinject="$hooks_dir/prompt-gate-inject.sh"
  local pomigrate="$hooks_dir/session-start-po-state-migrate.sh"
  local popreshape="$hooks_dir/pre-po-state-shape-guard.sh"
  local popostshape="$hooks_dir/post-po-state-shape-guard.sh"

  local tmp; tmp="$(mktemp)" || return 1
  if ! jq --arg fmt "$fmt" --arg doc "$doc" --arg stop "$stop" --arg statew "$statew" --arg precheck "$precheck" --arg ctxlang "$ctxlang" --arg chunkwarn "$chunkwarn" --arg strip "$strip" --arg fmlint "$fmlint" --arg fmverify "$fmverify" --arg gitposture "$gitposture" --arg sessdoc "$sessdoc" --arg docguard "$docguard" --arg phasegate "$phasegate" --arg gateinject "$gateinject" --arg pomigrate "$pomigrate" --arg popreshape "$popreshape" --arg popostshape "$popostshape" --arg dir "$hooks_dir/" '
    def is_pdt(cmd; dir):
      (cmd | startswith(dir))
      or (cmd | endswith("/scripts/hooks/post-edit-format.sh"))
      or (cmd | endswith("/scripts/hooks/post-compact-doctrine.sh"))
      or (cmd | endswith("/scripts/hooks/stop-verify.sh"))
      or (cmd | endswith("/scripts/hooks/post-delegate-state-write.sh"))
      or (cmd | endswith("/scripts/hooks/pre-delegate-task-check.sh"))
      or (cmd | endswith("/scripts/hooks/pre-delegate-ctx-lang.sh"))
      or (cmd | endswith("/scripts/hooks/pre-chunking-warn.sh"))
      or (cmd | endswith("/scripts/hooks/post-bash-strip-cost.sh"))
      or (cmd | endswith("/scripts/hooks/pre-frontmatter-lint.sh"))
      or (cmd | endswith("/scripts/hooks/post-ticket-status-verify.sh"))
      or (cmd | endswith("/scripts/hooks/pre-git-posture.sh"))
      or (cmd | endswith("/scripts/hooks/session-start-doctrine.sh"))
      or (cmd | endswith("/scripts/hooks/pre-doctrine-guard.sh"))
      or (cmd | endswith("/scripts/hooks/pre-phase-gate-guard.sh"))
      or (cmd | endswith("/scripts/hooks/prompt-gate-inject.sh"))
      or (cmd | endswith("/scripts/hooks/session-start-po-state-migrate.sh"))
      or (cmd | endswith("/scripts/hooks/pre-po-state-shape-guard.sh"))
      or (cmd | endswith("/scripts/hooks/post-po-state-shape-guard.sh"));
    def strip_pdt(arr; dir):
      (arr // []) | map(
        select(((.hooks // []) | map(is_pdt(.command // ""; dir)) | any) | not)
      );
    (. // {})
    | .hooks //= {}
    | .hooks.PreToolUse = (strip_pdt(.hooks.PreToolUse; $dir) + [
        {matcher: "Write|Edit|Bash",
         hooks: [{type: "command", command: $docguard}]},
        {matcher: "Bash",
         hooks: [{type: "command", command: $precheck}]},
        {matcher: "Bash",
         hooks: [{type: "command", command: $ctxlang}]},
        {matcher: "Bash",
         hooks: [{type: "command", command: $chunkwarn}]},
        {matcher: "Bash",
         hooks: [{type: "command", command: $gitposture}]},
        {matcher: "Bash",
         hooks: [{type: "command", command: $phasegate}]},
        {matcher: "Write|Edit|Bash",
         hooks: [{type: "command", command: $fmlint}]},
        {matcher: "Write|Edit|Bash",
         hooks: [{type: "command", command: $popreshape}]}
      ])
    | .hooks.PostToolUse = (strip_pdt(.hooks.PostToolUse; $dir) + [
        {matcher: "Write|Edit",
         hooks: [{type: "command", command: $fmt}]},
        {matcher: "Bash",
         hooks: [{type: "command", command: $statew}]},
        {matcher: "Bash",
         hooks: [{type: "command", command: $strip}]},
        {matcher: "Bash",
         hooks: [{type: "command", command: $fmverify}]},
        {matcher: "Bash",
         hooks: [{type: "command", command: $popostshape}]}
      ])
    | .hooks.PostCompact = (strip_pdt(.hooks.PostCompact; $dir) + [{
        hooks: [{type: "command", command: $doc}]
      }])
    | .hooks.Stop = (strip_pdt(.hooks.Stop; $dir) + [{
        matcher: "pdt-developer",
        hooks: [{type: "command", command: $stop}]
      }])
    | .hooks.SessionStart = (strip_pdt(.hooks.SessionStart; $dir) + [
        {matcher: "startup|resume",
         hooks: [{type: "command", command: $sessdoc}]},
        {matcher: "startup|resume",
         hooks: [{type: "command", command: $pomigrate}]}
      ])
    | .hooks.UserPromptSubmit = (strip_pdt(.hooks.UserPromptSubmit; $dir) + [{
        hooks: [{type: "command", command: $gateinject}]
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

# ── ~/.claude/settings.json permissions.allow merge (idempotent) ─────────────
# Ensures all productune persona Bash patterns are globally allowed so that
# pdt-po / pdt-developer / pdt-qa subagents can run their required commands in
# any managed project without hitting auto-mode silent denials.
# Existing user entries in allow[] are preserved; only new patterns are appended.
merge_claude_settings_permissions() {
  local settings="$HOME/.claude/settings.json"
  mkdir -p "$HOME/.claude"
  [ -f "$settings" ] || echo '{}' > "$settings"

  local tmp; tmp="$(mktemp)" || return 1
  if ! jq '
    (. // {}) as $root
    | ($root.permissions.allow // []) as $existing
    | [
        "Bash(pnpm *)",
        "Bash(npm *)",
        "Bash(node *)",
        "Bash(npx *)",
        "Bash(ls)",
        "Bash(ls *)",
        "Bash(mkdir *)",
        "Bash(which *)",
        "Bash(find *)",
        "Bash(grep *)",
        "Bash(cat *)",
        "Bash(git status*)",
        "Bash(git diff*)",
        "Bash(git log*)",
        "Bash(git add *)",
        "Bash(tsc *)",
        "Bash(eslint *)",
        "Bash(python3 *)",
        "Bash(jq *)",
        "Bash(mv *)",
        "Bash(cp *)",
        "Bash(git commit*)",
        "Bash(git merge*)",
        "Bash(git checkout*)",
        "Bash(git branch*)",
        "Bash(git tag*)",
        "Bash(git push*)",
        "Bash(git worktree*)",
        "Bash(gh *)",
        "Bash(sed *)",
        "Bash(bash *)",
        "Bash(sh *)"
      ] as $pdt_patterns
    | ($existing + ($pdt_patterns - $existing)) as $merged
    | $root
    | .permissions //= {}
    | .permissions.allow = $merged
  ' "$settings" > "$tmp"; then
    rm -f "$tmp"
    return 1
  fi
  mv "$tmp" "$settings"
  return 0
}

# ── Claude Code preflight — auto-install + auth check ────────────────────────
ensure_claude_installed() {
  # command -v only checks PATH presence; also verify the binary actually runs.
  # A broken npm install (broken symlink, wrong node version, etc.) passes command -v
  # but fails on execution — catch that here so we can reinstall.
  if command -v claude >/dev/null 2>&1; then
    if claude --version >/dev/null 2>&1; then
      return 0
    fi
    warn "claude binary가 PATH에 있지만 실행할 수 없습니다 (broken install) — 재설치를 시도합니다."
  else
    warn "Claude Code CLI가 설치되어 있지 않습니다."
  fi
  if [ ! -t 0 ] || [ ! -t 1 ]; then
    die "비대화형 환경: 먼저 설치 후 install.sh 재실행 — npm install -g @anthropic-ai/claude-code"
  fi
  printf '\033[1;36m[install]\033[0m 자동 설치할까요? (npm install -g @anthropic-ai/claude-code) [Y/n]: '
  read -r ANS || ANS=""
  case "${ANS:-Y}" in
    [Yy]*|"")
      command -v npm >/dev/null 2>&1 || die "npm 미설치 — 먼저 Node.js 설치: https://nodejs.org"
      npm install -g @anthropic-ai/claude-code || die "Claude Code 설치 실패"
      # Refresh PATH so the newly installed claude binary is visible in this session.
      # Two strategies cover most setups (Homebrew, nvm, fnm, custom .npmrc prefix):
      #   S1: npm prefix -g → the configured global prefix's bin dir
      #   S2: dirname of npm itself → the bin dir where Homebrew/system places binaries
      #       (covers cases where npm prefix -g differs from the real npm bin dir)
      _path_prepend() {
        local d="$1"
        [ -d "$d" ] || return 0
        case ":$PATH:" in
          *":$d:"*) return 0 ;;
        esac
        export PATH="$d:$PATH"
        say "PATH 추가: $d"
      }
      _path_prepend "$(npm prefix -g 2>/dev/null || true)/bin"   # S1
      _path_prepend "$(dirname "$(command -v npm 2>/dev/null || echo /nonexistent)")"  # S2
      unset -f _path_prepend
      # Clear bash/zsh command hash cache so 'command -v claude' picks up the new binary.
      hash -r 2>/dev/null || rehash 2>/dev/null || true
      if ! command -v claude >/dev/null 2>&1; then
        die "설치 후에도 claude CLI를 찾을 수 없습니다.
  진단:
    npm 위치: $(command -v npm 2>/dev/null || echo '?')
    npm prefix -g: $(npm prefix -g 2>/dev/null || echo '?')
    현재 PATH: $PATH
  수동 해결: export PATH=\"\$(dirname \"\$(which npm)\"):\$PATH\" && exec \$SHELL"
      fi
      if ! claude --version >/dev/null 2>&1; then
        die "claude binary를 찾았지만 실행할 수 없습니다 (node 버전 불일치 또는 broken install).
  진단:
    claude 경로: $(command -v claude 2>/dev/null || echo '?')
    node 버전: $(node --version 2>/dev/null || echo '?')
  수동 해결: npm uninstall -g @anthropic-ai/claude-code && npm install -g @anthropic-ai/claude-code"
      fi
      say "Claude Code 설치 완료: $(claude --version 2>/dev/null | head -1 || echo '?')"
      ;;
    *) die "Claude Code 설치 후 install.sh 재실행: npm install -g @anthropic-ai/claude-code" ;;
  esac
}

ensure_claude_authed() {
  local status
  status="$(claude auth status 2>/dev/null || true)"

  # Helper: returns 0 if $1 (status string) indicates authenticated.
  # Tries JSON parse first; falls back to plain-text grep for CLI versions
  # that output "Logged in as ..." instead of JSON.
  _is_authed() {
    local s="$1"
    printf '%s' "$s" | jq -e '.loggedIn == true' >/dev/null 2>&1 && return 0
    printf '%s' "$s" | grep -qiE '(logged in|authenticated)' 2>/dev/null && return 0
    return 1
  }

  if _is_authed "$status"; then
    local who org
    who="$(printf '%s' "$status" | jq -r '.email // ""' 2>/dev/null || true)"
    org="$(printf '%s' "$status" | jq -r '.orgName // ""' 2>/dev/null || true)"
    say "Claude Code 인증 OK${who:+ (${who}${org:+ / $org})}"
    unset -f _is_authed
    return 0
  fi

  warn "Claude Code 로그인이 필요합니다."
  if [ ! -t 0 ] || [ ! -t 1 ]; then
    die "비대화형 환경: 'claude auth login' 먼저 실행 후 install.sh 재실행"
  fi
  say "이제 claude 로그인 흐름을 시작합니다 (브라우저가 열릴 수 있습니다)..."
  claude auth login || die "로그인 실패 — install.sh 재실행 필요"
  status="$(claude auth status 2>/dev/null || true)"
  if _is_authed "$status"; then
    say "로그인 확인 완료"
  else
    die "로그인이 완료되지 않았습니다. 'claude auth login' 직접 실행 후 install.sh 재실행"
  fi
  unset -f _is_authed
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

# 2c-1b) Mirror shared config literals (close-gate canonical array etc.) —
#        single-source for hooks + the doctrine turn-open sweep; no drift.
mkdir -p "$HOME/.productune/config"
if [ -f "$ROOT/config/close-gate.p3.json" ]; then
  cp "$ROOT/config/close-gate.p3.json" "$HOME/.productune/config/close-gate.p3.json"
  say "config mirror 완료: ~/.productune/config/close-gate.p3.json"
fi
if [ -f "$ROOT/config/ticket-status-enum.json" ]; then
  cp "$ROOT/config/ticket-status-enum.json" "$HOME/.productune/config/ticket-status-enum.json"
  say "config mirror 완료: ~/.productune/config/ticket-status-enum.json"
fi

# 2c-1c) Mirror migrations — session-start hook 이 프로젝트별 미적용분을 감지해
#        PO 가 적용을 제안한다 (auto_check + PO 지시 프롬프트 동봉).
if [ -d "$ROOT/migrations" ] && ls "$ROOT/migrations"/*.md >/dev/null 2>&1; then
  mkdir -p "$HOME/.productune/migrations"
  rm -f "$HOME/.productune/migrations"/*.md
  cp "$ROOT/migrations/"*.md "$HOME/.productune/migrations/"
  say "migrations mirror 완료: ~/.productune/migrations/ ($(ls "$ROOT/migrations"/*.md | wc -l | tr -d ' ')개)"
fi

# 2c-2) One-time per-machine migration: personal-po-state DEPRECATION.
#       Work-state now lives ONLY in each project's .productune/po-state.json.
#       This resets a leftover personal ~/.productune/po/po-state.json that still
#       carries work fields (backup + _deprecated marker). Idempotent: no-op when
#       the file is missing, already deprecated, or has no work fields. Never
#       touches any project po-state. Runs after the doctrine mirror.
# ROOT here is packages/core; the migration script lives at the repo root's
# scripts/ dir. Resolve the repo root via git, falling back to $ROOT/..
_REPO_ROOT="$(cd "$ROOT/.." 2>/dev/null && git rev-parse --show-toplevel 2>/dev/null || true)"
[ -n "$_REPO_ROOT" ] || _REPO_ROOT="$(cd "$ROOT/.." 2>/dev/null && pwd || true)"
_MIGRATE_SCRIPT="$_REPO_ROOT/scripts/migrate-po-state-scope.mjs"
if command -v node >/dev/null 2>&1 && [ -f "$_MIGRATE_SCRIPT" ]; then
  node "$_MIGRATE_SCRIPT" "$(date +%Y-%m-%d 2>/dev/null || true)" || \
    warn "personal po-state migration reported a non-zero exit — see output above (install continues)"
else
  warn "skipped personal po-state migration (node missing or migrate-po-state-scope.mjs not found at $_MIGRATE_SCRIPT)"
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

# 5) PO env file — claude is the only engine. Seed productune.env idempotently,
#    refresh PRODUCTUNE_REPO in case the clone moved, and migrate any legacy
#    MY_PO_ENGINE=codex (or other non-claude value) from older installs.
PO_ENV_FILE="$HOME/.productune/productune.env"
mkdir -p "$(dirname "$PO_ENV_FILE")"
[ -e "$PO_ENV_FILE" ] || : > "$PO_ENV_FILE"

# MY_PO_ENGINE — kept as a literal claude marker so external scripts that grep
# for it keep working. Legacy codex values are rewritten in place.
if grep -qE '^MY_PO_ENGINE=' "$PO_ENV_FILE"; then
  if ! grep -qE '^MY_PO_ENGINE=claude$' "$PO_ENV_FILE"; then
    sed -i.bak -E 's|^MY_PO_ENGINE=.*|MY_PO_ENGINE=claude|' "$PO_ENV_FILE" && rm -f "$PO_ENV_FILE.bak"
    warn "migrated legacy MY_PO_ENGINE → claude in $PO_ENV_FILE"
  fi
else
  printf 'MY_PO_ENGINE=claude\n' >> "$PO_ENV_FILE"
  say "seeded MY_PO_ENGINE=claude in $PO_ENV_FILE"
fi

# PRODUCTUNE_REPO — always refresh to the current clone path.
if grep -qE '^PRODUCTUNE_REPO=' "$PO_ENV_FILE"; then
  sed -i.bak -E "s|^PRODUCTUNE_REPO=.*|PRODUCTUNE_REPO=$ROOT|" "$PO_ENV_FILE" && rm -f "$PO_ENV_FILE.bak"
else
  printf 'PRODUCTUNE_REPO=%s\n' "$ROOT" >> "$PO_ENV_FILE"
fi
say "PO env ready: $PO_ENV_FILE (engine=claude, repo=$ROOT)"

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
#    claude personas — no manual shell-rc export needed.
mkdir -p "$(dirname "$PO_ENV_FILE")"
if [ ! -e "$PO_ENV_FILE" ] || ! grep -qE '^CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=' "$PO_ENV_FILE"; then
  printf 'CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=70\n' >> "$PO_ENV_FILE"
  say "auto-compact threshold defaulted to 70% in $PO_ENV_FILE"
fi

# 7a) T-PATCH-228: enable claude agent-teams (SendMessage / auto-resume / TeamCreate)
#    for the CLI path. GUI po-runner.ts sets this in the spawn env; the CLI sources
#    productune.env with `set -a`, so backfilling it here brings CLI to parity.
#    Backfill ONLY when absent — a user who explicitly set 0 keeps their value (AC-4).
#    Keep the value (1) in sync with packages/gui/electron/po-runner.ts.
if ! grep -qE '^CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=' "$PO_ENV_FILE"; then
  printf 'CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1\n' >> "$PO_ENV_FILE"
  say "agent-teams enabled (CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1) in $PO_ENV_FILE"
fi

# 7b) Auto-install Claude Code hooks (idempotent merge into ~/.claude/settings.json)
# Always re-run: merge function strips old productune hooks by basename so stale
# absolute paths (clone moved to new device or new directory) are replaced correctly.
if merge_claude_settings_hooks; then
  upsert_env 'PRODUCTUNE_HOOKS_INSTALLED' 'true' "$PO_ENV_FILE"
  say "hooks 등록 완료 (~/.claude/settings.json)"
else
  upsert_env 'PRODUCTUNE_HOOKS_INSTALLED' 'failed' "$PO_ENV_FILE"
  warn "hooks 등록 실패 — ~/.claude/settings.json 수동 확인 필요"
fi

# 7c) Auto-install statusLine (idempotent — always overwrites .statusLine with current clone path)
# Always re-run: statusLine command embeds an absolute path to this repo; re-running
# install.sh (e.g. after git pull on a new device) must update it to the new path.
if merge_claude_settings_statusline; then
  upsert_env 'PRODUCTUNE_STATUSLINE_INSTALLED' 'true' "$PO_ENV_FILE"
  say "statusLine 등록 완료"
else
  upsert_env 'PRODUCTUNE_STATUSLINE_INSTALLED' 'failed' "$PO_ENV_FILE"
  warn "statusLine 등록 실패 — ~/.claude/settings.json 수동 확인 필요"
fi

# 7d) Auto-install dev/qa Bash allow list (idempotent — union merge into permissions.allow)
# Prevents pdt-developer / pdt-qa subagents from hitting auto-mode silent denials
# when dispatched to any managed project that has no project-level settings.
if merge_claude_settings_permissions; then
  say "dev/qa Bash 권한 allow list 등록 완료 (~/.claude/settings.json)"
else
  warn "dev/qa Bash allow list 등록 실패 — ~/.claude/settings.json 수동 확인 필요"
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
          say "이미 $SHELL_RC 에 등록되어 있습니다 (현재 셸 미적용 — source 필요)"
          printf 'PRODUCTUNE_PATH_METHOD=rc\nPRODUCTUNE_PATH_RC=%s\n' "$SHELL_RC" >> "$PO_ENV_FILE"
          PATH_REGISTERED=1
          NEEDS_SOURCE=1
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

# 10) Summary + next steps
#
# PATH 상태는 3가지:
#   A. 즉시 사용 가능       (PATH_REGISTERED=1, NEEDS_SOURCE=0)
#      → 이미 셸에서 productune 명령 인식됨. PATH 등록 step 생략.
#   B. rc 추가됨, 셸 미적용   (PATH_REGISTERED=1, NEEDS_SOURCE=1)
#      → source 명령 안내.
#   C. 미등록               (PATH_REGISTERED=0)
#      → 수동 등록 옵션 3가지 안내.
# "등록됨"이라고 거짓말하지 않도록 NEEDS_SOURCE도 반영해서 표기.

case "${SHELL:-}" in
  */zsh)  SHELL_RC="${SHELL_RC:-$HOME/.zshrc}" ;;
  */bash) SHELL_RC="${SHELL_RC:-$HOME/.bashrc}" ;;
  *)      SHELL_RC="${SHELL_RC:-$HOME/.zshrc}" ;;
esac

if [ "$PATH_REGISTERED" = 1 ] && [ "$NEEDS_SOURCE" = 0 ]; then
  PATH_STATUS="등록됨 (즉시 사용 가능)"
elif [ "$PATH_REGISTERED" = 1 ] && [ "$NEEDS_SOURCE" = 1 ]; then
  PATH_STATUS="rc 추가됨 — 현재 셸 적용 필요 (아래 1번)"
else
  PATH_STATUS="미등록 (아래 1번 참고)"
fi

cat <<EOF

$(printf "\033[1;32m✓ onboard complete\033[0m")

  PATH         : $PATH_STATUS

Next steps:
EOF

STEP=1
if [ "$NEEDS_SOURCE" = 1 ]; then
cat <<PATHRC
  $STEP. PATH 등록 (현재 셸에 즉시 적용 — 새 터미널은 자동 적용되므로 생략 가능):
       source $SHELL_RC

PATHRC
  STEP=$((STEP + 1))
elif [ "$PATH_REGISTERED" = 0 ]; then
cat <<NOPATH
  $STEP. PATH 등록 — 다음 중 하나 선택:
       # 옵션 a) 셸 rc 파일에 추가 (권장, sudo 불필요)
       echo 'export PATH="$ROOT/scripts:\$PATH"' >> $SHELL_RC && source $SHELL_RC

       # 옵션 b) ~/.local/bin 심볼릭 링크 (sudo 불필요)
       mkdir -p ~/.local/bin && ln -sf $ROOT/scripts/productune ~/.local/bin/productune

       # 옵션 c) /usr/local/bin 심볼릭 링크 (sudo 필요할 수 있음)
       sudo ln -sf $ROOT/scripts/productune /usr/local/bin/productune

NOPATH
  STEP=$((STEP + 1))
fi

cat <<EOF
  $STEP. 원하는 프로젝트 폴더로 이동 후 실행:
       cd <your-project>
       productune init        # 해당 폴더에서 한 번만 실행
       productune             # PO와 대화 시작
     → 대화를 시작해서 만들고 싶은 제품을 말하면, 대화를 통해 PRD를 완성해 나갑니다.

  $((STEP + 1)). 완전히 제거할 때:
       productune uninstall
EOF
