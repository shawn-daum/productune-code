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

# 5) Interactive: pick default PO engine (only if running in a terminal and not already set)
PO_ENV_FILE="$HOME/.codex/coolchestration.env"
if [ -t 0 ] && [ -t 1 ] && [ ! -e "$PO_ENV_FILE" ]; then
  echo
  printf '\033[1;36m[install]\033[0m Pick a default PO engine for `my-po`:\n'
  cat <<'PROMPT'
  [1] codex   — Codex CLI (OpenAI subscription) hosts the PO orchestrator.
                Personas still run on Claude Code. Splits cost across providers.
  [2] claude  — Claude Code hosts both PO and personas. 100% Anthropic stack,
                cleanest ToS posture (no third-party-harness concerns).
  [Enter]     — skip; default to 'codex'. You can change anytime by editing
                ~/.codex/coolchestration.env or running `my-po --engine <name>`.

PROMPT
  printf '  Choice [1/2/Enter]: '
  read -r CHOICE || CHOICE=""
  case "$CHOICE" in
    1|c|codex)
      printf 'MY_PO_ENGINE=codex\nCOOLCHESTRATION_REPO=%s\n' "$ROOT" > "$PO_ENV_FILE"
      say "default engine: codex (saved to $PO_ENV_FILE, repo path: $ROOT)"
      ;;
    2|a|cl|claude|anthropic)
      printf 'MY_PO_ENGINE=claude\nCOOLCHESTRATION_REPO=%s\n' "$ROOT" > "$PO_ENV_FILE"
      say "default engine: claude (saved to $PO_ENV_FILE, repo path: $ROOT)"
      ;;
    "")
      printf 'MY_PO_ENGINE=codex\nCOOLCHESTRATION_REPO=%s\n' "$ROOT" > "$PO_ENV_FILE"
      say "default engine: codex (no preference picked; saved baseline to $PO_ENV_FILE)"
      ;;
    *)
      warn "unrecognized choice '$CHOICE'; saving codex + repo path baseline"
      printf 'MY_PO_ENGINE=codex\nCOOLCHESTRATION_REPO=%s\n' "$ROOT" > "$PO_ENV_FILE"
      ;;
  esac
elif [ -e "$PO_ENV_FILE" ]; then
  CURRENT_ENGINE="$(grep -E '^MY_PO_ENGINE=' "$PO_ENV_FILE" | tail -1 | cut -d= -f2 | tr -d '\n')"
  # Update repo path in case user moved the clone
  if grep -qE '^COOLCHESTRATION_REPO=' "$PO_ENV_FILE"; then
    sed -i.bak -E "s|^COOLCHESTRATION_REPO=.*|COOLCHESTRATION_REPO=$ROOT|" "$PO_ENV_FILE" && rm -f "$PO_ENV_FILE.bak"
  else
    printf 'COOLCHESTRATION_REPO=%s\n' "$ROOT" >> "$PO_ENV_FILE"
  fi
  say "PO engine config exists at $PO_ENV_FILE (current: ${CURRENT_ENGINE:-?}, repo path refreshed to $ROOT)"
fi

# 6) Interactive: pick Graphiti backend provider (only if not yet set)
if [ -t 0 ] && [ -t 1 ] && ! grep -qE '^GRAPHITI_LLM_PROVIDER=' "$PO_ENV_FILE" 2>/dev/null; then
  echo
  printf '\033[1;36m[install]\033[0m Pick Graphiti (long-term wiki memory) backend provider:\n'
  cat <<'PROMPT'
  [1] OpenAI    — gpt-4o-mini + text-embedding-3-small.
                  Highest quality entity extraction. Needs OPENAI_API_KEY env.
                  Cost: ~$0.01 / coding session typical.
  [2] Anthropic — Claude Haiku for LLM + OpenAI embed.
                  Needs ANTHROPIC_API_KEY env (+ OPENAI_API_KEY for embed).
  [3] Local     — Ollama gemma4:26b + nomic-embed-text. Free, slower, no network.
                  Needs `ollama pull gemma4:26b` and `ollama pull nomic-embed-text`.
  [Enter]       — [1] OpenAI default. Change later by editing the env file.

PROMPT
  printf '  Choice [1/2/3/Enter]: '
  read -r GCHOICE || GCHOICE=""
  case "$GCHOICE" in
    2|anthropic|a)
      cat >> "$PO_ENV_FILE" <<EOF
GRAPHITI_LLM_PROVIDER=anthropic
GRAPHITI_LLM_MODEL=claude-haiku-4-5-20251001
GRAPHITI_EMBEDDER_PROVIDER=openai
GRAPHITI_EMBEDDER_MODEL=text-embedding-3-small
EOF
      say "Graphiti backend: anthropic LLM + openai embed (saved to $PO_ENV_FILE)"
      say "  → ensure ANTHROPIC_API_KEY and OPENAI_API_KEY are set in your shell rc"
      ;;
    3|local|ollama|l)
      cat >> "$PO_ENV_FILE" <<EOF
GRAPHITI_LLM_PROVIDER=ollama
GRAPHITI_LLM_MODEL=gemma4:26b
GRAPHITI_EMBEDDER_PROVIDER=ollama
GRAPHITI_EMBEDDER_MODEL=nomic-embed-text
EOF
      say "Graphiti backend: ollama (local). Pull models if missing:"
      say "  ollama pull gemma4:26b && ollama pull nomic-embed-text"
      ;;
    *)
      cat >> "$PO_ENV_FILE" <<EOF
GRAPHITI_LLM_PROVIDER=openai
GRAPHITI_LLM_MODEL=gpt-4o-mini
GRAPHITI_EMBEDDER_PROVIDER=openai
GRAPHITI_EMBEDDER_MODEL=text-embedding-3-small
EOF
      say "Graphiti backend: openai (saved to $PO_ENV_FILE)"
      say "  → ensure OPENAI_API_KEY is set in your shell rc"
      ;;
  esac
elif grep -qE '^GRAPHITI_LLM_PROVIDER=' "$PO_ENV_FILE" 2>/dev/null; then
  CURRENT_GRAPHITI="$(grep -E '^GRAPHITI_LLM_PROVIDER=' "$PO_ENV_FILE" | tail -1 | cut -d= -f2 | tr -d '\n')"
  say "Graphiti provider config already set (current LLM provider: $CURRENT_GRAPHITI)"
fi

# 6) Summary + next steps
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

  5. Put the \`my-po\` wrapper on your PATH. Pick one (no sudo needed):

     a) Add the scripts dir to PATH (recommended — works everywhere):
          echo 'export PATH="$ROOT/scripts:\$PATH"' >> ~/.zshrc
          source ~/.zshrc
        (use ~/.bashrc if you're on bash)

     b) Symlink into ~/.local/bin (XDG, no sudo):
          mkdir -p ~/.local/bin
          ln -sf $ROOT/scripts/my-po ~/.local/bin/my-po
        Then make sure ~/.local/bin is on your PATH (most modern shells already include it).

     c) Symlink into /usr/local/bin (may need sudo on Apple Silicon):
          sudo ln -sf $ROOT/scripts/my-po /usr/local/bin/my-po

     Verify: \`which my-po\` should print a path.

  6. From any target project directory, start PO:
       my-po
     If another my-po is already running on the same project, this will
     auto-create a git worktree and start the PO engine there. After the
     engine exits it asks once whether to clean up safe worktrees.

     The default PO engine was set in step 5 above (saved to
     ~/.codex/coolchestration.env). To override per-call:
       my-po --engine claude     # one-off: Claude Code hosts PO
       my-po --engine codex      # one-off: Codex hosts PO
     To change the default later, edit ~/.codex/coolchestration.env.

     Direct alternatives (no wrapper logic, no parallel-safety):
       codex --profile po
       claude --agent po
       claude --agent planner    # single persona

  7. After parallel work, audit & remove auto-created worktrees:
       my-po gc        # dry-run, classify each my-po/* worktree
       my-po gc -y     # remove only the ✓ safe ones (dirty / unmerged-unpushed left alone)
       (verbose aliases: 'my-po --cleanup' / 'my-po --cleanup --auto' both still work)

  8. To update personas later, just edit files in $ROOT/agents/ — symlinks ensure changes apply immediately.
EOF
