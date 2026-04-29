#!/usr/bin/env bash
# graphiti-launcher.sh — spawn Graphiti MCP server with provider settings
# read from ~/.productune/productune.env. Persona name is passed as $1
# and used as the Graphiti group_id (persona-<name>).
#
# Why a launcher (vs. inlining args in agents/*.md):
# - Provider choice (OpenAI / Anthropic / Ollama) is per-user, picked at
#   install.sh time. agents/*.md files are git-shared and persona-scoped,
#   they shouldn't bake in user-specific provider config.
# - This launcher reads ~/.productune/productune.env at every spawn so
#   changing the env file takes effect on the next persona invocation
#   (no re-install needed).

set -euo pipefail

PERSONA="${1:?usage: graphiti-launcher.sh <persona-name>}"

# Source user config (provider choices, repo path)
ENV_FILE="$HOME/.productune/productune.env"
if [ -r "$ENV_FILE" ]; then
  # shellcheck source=/dev/null
  set -a; . "$ENV_FILE"; set +a
fi

# Defaults if env file didn't pin them
GRAPHITI_LLM_PROVIDER="${GRAPHITI_LLM_PROVIDER:-openai}"
GRAPHITI_EMBEDDER_PROVIDER="${GRAPHITI_EMBEDDER_PROVIDER:-openai}"
GRAPHITI_DIR="${GRAPHITI_DIR:-$HOME/.graphiti}"

# Per-provider environment translation (graphiti reads these env names)
case "$GRAPHITI_LLM_PROVIDER" in
  openai)
    export MODEL_NAME="${GRAPHITI_LLM_MODEL:-gpt-4o-mini}"
    : "${OPENAI_API_KEY:?OPENAI_API_KEY env var is required for openai provider}"
    ;;
  anthropic)
    export MODEL_NAME="${GRAPHITI_LLM_MODEL:-claude-haiku-4-5-20251001}"
    : "${ANTHROPIC_API_KEY:?ANTHROPIC_API_KEY env var is required for anthropic provider}"
    ;;
  ollama)
    export OPENAI_BASE_URL="${OPENAI_BASE_URL:-http://localhost:11434/v1}"
    export OPENAI_API_KEY="${OPENAI_API_KEY:-ollama}"
    export MODEL_NAME="${GRAPHITI_LLM_MODEL:-gemma4:26b}"
    # Graphiti's --llm-provider flag still wants 'openai' for ollama path
    GRAPHITI_LLM_PROVIDER_FLAG=openai
    ;;
  *)
    echo "[graphiti-launcher] unknown GRAPHITI_LLM_PROVIDER='$GRAPHITI_LLM_PROVIDER'" >&2
    exit 1
    ;;
esac

case "$GRAPHITI_EMBEDDER_PROVIDER" in
  openai)
    export EMBEDDER_MODEL_NAME="${GRAPHITI_EMBEDDER_MODEL:-text-embedding-3-small}"
    : "${OPENAI_API_KEY:?OPENAI_API_KEY env var is required for openai embedder}"
    ;;
  voyage)
    export EMBEDDER_MODEL_NAME="${GRAPHITI_EMBEDDER_MODEL:-voyage-3}"
    : "${VOYAGE_API_KEY:?VOYAGE_API_KEY env var is required for voyage embedder}"
    ;;
  ollama)
    export OPENAI_BASE_URL="${OPENAI_BASE_URL:-http://localhost:11434/v1}"
    export OPENAI_API_KEY="${OPENAI_API_KEY:-ollama}"
    export EMBEDDER_MODEL_NAME="${GRAPHITI_EMBEDDER_MODEL:-nomic-embed-text}"
    GRAPHITI_EMBEDDER_PROVIDER_FLAG=openai
    ;;
  *)
    echo "[graphiti-launcher] unknown GRAPHITI_EMBEDDER_PROVIDER='$GRAPHITI_EMBEDDER_PROVIDER'" >&2
    exit 1
    ;;
esac

export FALKORDB_URI="${FALKORDB_URI:-redis://localhost:6379}"
export SEMAPHORE_LIMIT="${SEMAPHORE_LIMIT:-4}"
export GRAPHITI_TELEMETRY_ENABLED="${GRAPHITI_TELEMETRY_ENABLED:-false}"

# Resolve provider flags actually passed to graphiti (ollama path piggy-backs on openai-compatible API)
LLM_PROVIDER_FLAG="${GRAPHITI_LLM_PROVIDER_FLAG:-$GRAPHITI_LLM_PROVIDER}"
EMBED_PROVIDER_FLAG="${GRAPHITI_EMBEDDER_PROVIDER_FLAG:-$GRAPHITI_EMBEDDER_PROVIDER}"

if [ ! -d "$GRAPHITI_DIR/mcp_server" ]; then
  echo "[graphiti-launcher] $GRAPHITI_DIR/mcp_server not found. Run scripts/setup-graphiti.sh first." >&2
  exit 1
fi

exec uv --directory "$GRAPHITI_DIR/mcp_server" run main.py \
  --transport stdio \
  --group-id "persona-$PERSONA" \
  --database-provider falkordb \
  --llm-provider "$LLM_PROVIDER_FLAG" \
  --embedder-provider "$EMBED_PROVIDER_FLAG"
