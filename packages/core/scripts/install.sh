#!/usr/bin/env bash
# prdt v1 install — mirror discipline to ~/.prdt (1-way), register agents + hook 5종.
# (Canonical name since T-293: was prdt-install.sh during pdt-* coexistence;
#  a thin prdt-install.sh forwarder remains for older installed `prdt update` copies.)
# Statusline (T-330): default-on when nothing is registered yet (fresh install, or
# after legacy-statusline cleanup) — a fresh install without --statusline used to
# leave the user with no statusline at all. Any EXISTING statusLine (ours or a
# custom one) is left untouched to avoid clobbering it; pass --statusline to force
# re-registration, or --no-statusline to opt out on a fresh install.
#
# Usage: install.sh [--statusline|--no-statusline]
set -euo pipefail

STATUSLINE_MODE="auto"
for arg in "$@"; do
  case "$arg" in
    --statusline) STATUSLINE_MODE="on" ;;
    --no-statusline) STATUSLINE_MODE="off" ;;
  esac
done

ROOT="$(cd "$(dirname "$0")/.." && pwd)"   # packages/core
PRDT_HOME="${PRDT_HOME:-$HOME/.prdt}"
CLAUDE_DIR="${CLAUDE_DIR:-$HOME/.claude}"
say() { printf '%s\n' "$*"; }

command -v jq >/dev/null 2>&1 || { echo "prdt-install: jq is required" >&2; exit 1; }
command -v python3 >/dev/null 2>&1 || { echo "prdt-install: python3 is required" >&2; exit 1; }

# 1. mirror (1-way: repo → home; user files live in overrides/, never in the mirror)
say "1) Mirroring discipline → $PRDT_HOME"
mkdir -p "$PRDT_HOME/overrides" "$PRDT_HOME/hooks" "$PRDT_HOME/bin"
rm -rf "$PRDT_HOME/discipline"
cp -R "$ROOT/discipline" "$PRDT_HOME/discipline"
cp "$ROOT/doctrine.md" "$PRDT_HOME/doctrine.md"
cp "$ROOT/scripts/hooks/prdt-session-start.sh" "$ROOT/scripts/hooks/prdt-post-compact.sh" \
   "$ROOT/scripts/hooks/prdt-post-dispatch.sh" "$ROOT/scripts/hooks/prdt-user-prompt.sh" \
   "$ROOT/scripts/hooks/prdt-overrides-inject.sh" \
   "$PRDT_HOME/hooks/"
cp "$ROOT/scripts/prdt" "$PRDT_HOME/bin/prdt"
cp "$ROOT/scripts/statusline-prdt.sh" "$PRDT_HOME/bin/statusline-prdt.sh"
chmod +x "$PRDT_HOME/hooks/"*.sh "$PRDT_HOME/bin/prdt" "$PRDT_HOME/bin/statusline-prdt.sh"

# menus are derived — regenerate against the installed mirror
PRDT_DISCIPLINE="$PRDT_HOME/discipline" "$PRDT_HOME/bin/prdt" menus >/dev/null
say "   mirrored (discipline + doctrine + hooks + bin, menus regenerated)"

# 2. prdt.env (잠정 확정 — 열린 항목 ①: 미니멀 계승)
ENV_FILE="$PRDT_HOME/prdt.env"
if [ ! -f "$ENV_FILE" ]; then
  say "2) Writing $ENV_FILE"
  {
    printf 'PRDT_REPO=%s\n' "$ROOT"
    printf 'created_at=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    printf 'PRDT_HOOKS_INSTALLED=true\n'
    printf 'PRDT_STATUSLINE_INSTALLED=false\n'
    printf 'CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1\n'
  } > "$ENV_FILE"
  chmod 600 "$ENV_FILE"
else
  say "2) $ENV_FILE exists — updating PRDT_REPO only"
  python3 - "$ENV_FILE" "$ROOT" <<'PYEOF'
import sys
path, repo = sys.argv[1], sys.argv[2]
lines = [l for l in open(path).read().splitlines() if not l.startswith("PRDT_REPO=")]
lines.insert(0, f"PRDT_REPO={repo}")
open(path, "w").write("\n".join(lines) + "\n")
PYEOF
fi

# 3. agents (copy — additive; pdt-*/pdtl-* untouched)
say "3) Installing agents → $CLAUDE_DIR/agents"
mkdir -p "$CLAUDE_DIR/agents"
cp "$ROOT"/agents/prdt-*.md "$CLAUDE_DIR/agents/"

# 4. hooks merge into ~/.claude/settings.json (idempotent: prdt entries replaced, others preserved)
#    Also sweeps out the deleted legacy pdt-* hook set (T-316 C3a): a machine that
#    previously ran the pre-T-293 installer still carries settings.json entries whose
#    commands point at packages/core/scripts/hooks/<basename>.sh scripts that no longer
#    exist — every session then fails those with command-not-found. We strip them by the
#    repo-distributed path SUFFIX only, so other apps' and users' own hooks are untouched.
say "4) Registering hook 5종 in $CLAUDE_DIR/settings.json (+ legacy pdt-* cleanup)"
SETTINGS="$CLAUDE_DIR/settings.json"
[ -f "$SETTINGS" ] || echo '{}' > "$SETTINGS"
TMP="$(mktemp)"
jq --arg h "$PRDT_HOME/hooks/" '
  # C3a: legacy pdt-* hook basenames this repo distributed (deleted in T-293/T-311).
  (["post-edit-format.sh","post-compact-doctrine.sh","stop-verify.sh",
    "post-delegate-state-write.sh","pre-delegate-task-check.sh","pre-delegate-ctx-lang.sh",
    "pre-chunking-warn.sh","post-bash-strip-cost.sh","pre-frontmatter-lint.sh",
    "post-ticket-status-verify.sh","pre-git-posture.sh","session-start-doctrine.sh",
    "pre-doctrine-guard.sh","pre-phase-gate-guard.sh","prompt-gate-inject.sh",
    "session-start-po-state-migrate.sh","pre-po-state-shape-guard.sh",
    "post-po-state-shape-guard.sh"]) as $legacy |
  def isLegacy(cmd): (cmd) as $c | any($legacy[]; . as $b | $c | endswith("/scripts/hooks/" + $b));
  def stripLegacy(arr): (arr // []) | map(
    .hooks = ((.hooks // []) | map(select(isLegacy(.command // "") | not)))
  ) | map(select((.hooks | length) > 0));
  def strip(ev): (.hooks[ev] // []) | map(
    .hooks = ((.hooks // []) | map(select((.command // "") | (startswith($h) or startswith("\"" + $h)) | not)))
  ) | map(select((.hooks | length) > 0));
  .hooks = (.hooks // {}) |
  # sweep legacy pdt-* out of EVERY event array (incl. PreToolUse/PostCompact/Stop
  # that prdt never re-adds), then drop any now-empty event key.
  .hooks = (.hooks | with_entries(.value = stripLegacy(.value)) | with_entries(select((.value | length) > 0))) |
  # T-358: prdt-overrides-inject.sh rides the SAME matcher as prdt-session-start.sh
  # on both events, but as its OWN hook command entry -- never merged into the
  # other additionalContext string -- so a large main payload persist/
  # truncation event can never carry the (small) overrides output down with it.
  .hooks.SessionStart = (strip("SessionStart") + [
    {matcher: "startup|resume|clear",
     hooks: [{type: "command", command: ("\"" + $h + "prdt-session-start.sh" + "\"")},
             {type: "command", command: ("\"" + $h + "prdt-overrides-inject.sh" + "\"")}]},
    {matcher: "compact",
     hooks: [{type: "command", command: ("\"" + $h + "prdt-post-compact.sh" + "\"")}]}
  ]) |
  .hooks.SubagentStart = (strip("SubagentStart") + [
    {matcher: "^prdt-",
     hooks: [{type: "command", command: ("\"" + $h + "prdt-session-start.sh" + "\"")},
             {type: "command", command: ("\"" + $h + "prdt-overrides-inject.sh" + "\"")}]}
  ]) |
  .hooks.SubagentStop = (strip("SubagentStop") + [
    {matcher: "^prdt-",
     hooks: [{type: "command", command: ("\"" + $h + "prdt-post-dispatch.sh" + "\"")}]}
  ]) |
  .hooks.PostToolUse = (strip("PostToolUse") + [
    {matcher: "Agent",
     hooks: [{type: "command", command: ("\"" + $h + "prdt-post-dispatch.sh" + "\"")}]}
  ]) |
  # T-336 stage guard: deterministic per-prompt po-state line + deploy tripwire
  # (UserPromptSubmit takes no matcher).
  .hooks.UserPromptSubmit = (strip("UserPromptSubmit") + [
    {hooks: [{type: "command", command: ("\"" + $h + "prdt-user-prompt.sh" + "\"")}]}
  ]) |
  # C3a: drop the legacy statusline (deleted statusline-productune.sh). The prdt
  # statusline (§6, default-on) is a different basename and is never matched here;
  # a user custom statusLine is preserved (only the repo-distributed suffix matches).
  (if ((.statusLine.command // "")
        | (endswith("/scripts/statusline-productune.sh")
           or endswith("/scripts/statusline-productune.sh\"")))
   then del(.statusLine) else . end)
' "$SETTINGS" > "$TMP" && mv "$TMP" "$SETTINGS"

# 5. PATH symlink
if [ -d "$HOME/.local/bin" ] || mkdir -p "$HOME/.local/bin" 2>/dev/null; then
  ln -sf "$PRDT_HOME/bin/prdt" "$HOME/.local/bin/prdt"
  say "5) Symlinked ~/.local/bin/prdt (ensure ~/.local/bin is on PATH)"
fi

# 6. statusline — default-on, but never clobber an existing statusLine (ours or a
#    custom one); --statusline forces re-registration, --no-statusline opts out.
CURRENT_STATUSLINE="$(jq -r '.statusLine.command // empty' "$SETTINGS")"
REGISTER_STATUSLINE=false
case "$STATUSLINE_MODE" in
  off) say "6) Statusline NOT registered (--no-statusline)" ;;
  on) REGISTER_STATUSLINE=true ;;
  *)
    if [ -z "$CURRENT_STATUSLINE" ]; then
      REGISTER_STATUSLINE=true
    else
      say "6) Statusline NOT registered (existing statusLine preserved) — force with: install.sh --statusline"
    fi
    ;;
esac

if [ "$REGISTER_STATUSLINE" = true ]; then
  say "6) Registering statusline"
  TMP="$(mktemp)"
  jq --arg cmd "$PRDT_HOME/bin/statusline-prdt.sh" \
     '.statusLine = {type: "command", command: ("\"" + $cmd + "\"")}' "$SETTINGS" > "$TMP" && mv "$TMP" "$SETTINGS"
  python3 - "$ENV_FILE" <<'PYEOF'
import sys
path = sys.argv[1]
s = open(path).read().replace("PRDT_STATUSLINE_INSTALLED=false", "PRDT_STATUSLINE_INSTALLED=true")
open(path, "w").write(s)
PYEOF
fi

say "prdt install done."
