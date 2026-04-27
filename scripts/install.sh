#!/usr/bin/env bash
set -euo pipefail

# install.sh — one-time setup to wire the orchestration repo into ~/.claude/ and ~/.codex/
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

# Preflight
command -v claude >/dev/null || die "claude CLI not found. Install Claude Code first."
command -v codex  >/dev/null || die "codex CLI not found. Run: npm i -g @openai/codex"
command -v uv     >/dev/null || die "uv not found. Run: brew install uv"
command -v jq     >/dev/null || die "jq not found. Run: brew install jq"

# 1) Symlink agents
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
chmod +x "$ROOT/scripts/my-po" "$ROOT/scripts/setup-graphiti.sh" "$ROOT/scripts/install.sh"
say "wrapper scripts ready: $ROOT/scripts/{my-po,setup-graphiti.sh,install.sh}"

# 5) Summary + next steps
cat <<EOF

$(printf "\033[1;32m✓ install complete\033[0m")

Next steps:
  1. Run \`bash $ROOT/scripts/setup-graphiti.sh\` to install Graphiti MCP server + FalkorDB for persona wiki memory.
     (Skippable on first try — personas still work without wiki tier, falling back to project docs.)

  2. Pull an embedding model for Ollama if you don't already have one:
       ollama pull nomic-embed-text

  3. Recommended: trigger persona compaction earlier than the default 95% so long sessions stay responsive. Add to your shell rc:
       export CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=70

  4. Verify Claude sees the personas:
       claude agents

  5. Put the \`my-po\` wrapper on your PATH (one of):
       ln -sf $ROOT/scripts/my-po /usr/local/bin/my-po
     OR add this line to your shell rc (~/.zshrc, ~/.bashrc):
       export PATH="$ROOT/scripts:\$PATH"

  6. From any target project directory, start PO:
       my-po
     (auto-creates a git worktree if another my-po is already running on the same project; stays direct \`codex --profile po\` otherwise. See docs/customization.md.)
     Or call codex/persona directly:
       codex --profile po
       claude --agent planner

  7. After parallel work, audit & cleanup auto-created worktrees:
       my-po --cleanup            # dry-run
       my-po --cleanup --auto     # remove safe (✓) ones

  8. To update personas later, just edit files in $ROOT/agents/ — symlinks ensure changes apply immediately.
EOF
