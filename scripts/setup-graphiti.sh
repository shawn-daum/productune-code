#!/usr/bin/env bash
set -euo pipefail

# setup-graphiti.sh — one-time setup for the persona wiki memory tier.
#
# What it does:
#   1. Starts FalkorDB (graph DB, Redis-based) in Docker on :6379 if not already running.
#   2. Clones the Graphiti repo to ~/.graphiti if not already cloned.
#   3. Runs `uv sync` in the MCP server directory to install Python deps.
#   4. Sanity-checks that Ollama is serving on :11434 and that the chosen models are present.
#
# Persona sub-agents reference ~/.graphiti/mcp_server via their frontmatter mcpServers block,
# spawning a stdio Graphiti MCP server per persona with a distinct --group-id.

say()  { printf "\033[1;34m[graphiti]\033[0m %s\n" "$*"; }
warn() { printf "\033[1;33m[graphiti]\033[0m %s\n" "$*" >&2; }
die()  { printf "\033[1;31m[graphiti]\033[0m %s\n" "$*" >&2; exit 1; }

# Preflight
command -v docker >/dev/null || die "docker not found. Install Docker Desktop first."
command -v git    >/dev/null || die "git not found."
command -v uv     >/dev/null || die "uv not found. Run: brew install uv"
command -v ollama >/dev/null || die "ollama not found. Run: brew install ollama (and 'ollama serve')"

# 1) FalkorDB
if docker ps --format '{{.Names}}' | grep -qx falkordb; then
  say "falkordb container already running."
else
  if docker ps -a --format '{{.Names}}' | grep -qx falkordb; then
    say "starting existing falkordb container..."
    docker start falkordb >/dev/null
  else
    say "starting falkordb container (first run, will pull ~30MB image)..."
    docker run -d \
      --name falkordb \
      -p 6379:6379 \
      -v falkordb-data:/data \
      --restart unless-stopped \
      falkordb/falkordb:latest >/dev/null
  fi
fi

# Wait for FalkorDB to accept connections
for i in $(seq 1 10); do
  if docker exec falkordb redis-cli PING 2>/dev/null | grep -q PONG; then
    say "falkordb is ready."
    break
  fi
  sleep 1
done

# 2) Clone + uv sync Graphiti
GRAPHITI_DIR="$HOME/.graphiti"
if [ -d "$GRAPHITI_DIR/.git" ]; then
  say "graphiti already cloned at $GRAPHITI_DIR (pulling latest main)..."
  git -C "$GRAPHITI_DIR" pull --ff-only || warn "git pull failed; continuing with existing checkout"
else
  say "cloning graphiti into $GRAPHITI_DIR..."
  git clone --depth 1 https://github.com/getzep/graphiti "$GRAPHITI_DIR"
fi

say "installing graphiti MCP server python deps via uv (this may take a minute)..."
(cd "$GRAPHITI_DIR/mcp_server" && uv sync)

# 3) Ollama sanity check
if ! curl -fsS http://localhost:11434/api/tags >/dev/null 2>&1; then
  warn "ollama does not appear to be serving on :11434."
  warn "run 'ollama serve' (or 'brew services start ollama') in another terminal."
fi

HAS_LLM=""
HAS_EMB=""
if curl -fsS http://localhost:11434/api/tags 2>/dev/null | jq -e '.models[]?.name' >/dev/null 2>&1; then
  HAS_LLM=$(curl -fsS http://localhost:11434/api/tags | jq -r '.models[].name' | grep -ix "gemma4:26b" || true)
  HAS_EMB=$(curl -fsS http://localhost:11434/api/tags | jq -r '.models[].name' | grep -iE '^(nomic-embed-text|mxbai-embed-large)' || true)
fi
if [ -z "$HAS_LLM" ]; then
  warn "ollama model 'gemma4:26b' not found. Pull it: ollama pull gemma4:26b"
  warn "  (extraction quality depends heavily on this — alternates: gemma2:27b, qwen2.5:32b)"
  warn "  set GRAPHITI_LLM_MODEL=<chosen-tag> in ~/.codex/productune.env if you pick an alternate"
  warn "  or run install.sh and pick option [4] Hybrid for hosted-quality extraction with local embed"
fi
[ -n "$HAS_EMB" ] || warn "no embedding model found on ollama. Recommend: ollama pull nomic-embed-text"

cat <<EOF

$(printf "\033[1;32m✓ graphiti setup complete\033[0m")

Infrastructure:
  - FalkorDB   : docker container 'falkordb' on localhost:6379
  - Graphiti   : $GRAPHITI_DIR/mcp_server (run via \`uv run main.py\` from persona frontmatter)

Verification:
  # Confirm FalkorDB:
  docker exec falkordb redis-cli PING

  # Smoke-test Graphiti MCP (from a terminal; press Ctrl+C to exit):
  cd $GRAPHITI_DIR/mcp_server && uv run main.py --transport stdio --group-id persona:test \\
      --database-provider falkordb --llm-provider openai --model gemma4:26b --embedder-provider openai

  # Then in another terminal:
  claude --agent pdt-developer -p "Search your graphiti wiki for anything known. Return JSON."

If the wiki search returns [] that's expected for a fresh install — you haven't seeded knowledge yet.
EOF
