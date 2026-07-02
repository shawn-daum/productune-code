#!/usr/bin/env bash
# prdt — Claude Code SessionStart hook, matcher: compact (v1 hook #2).
# Re-injects the same discipline set right after compaction — a compaction can
# drop discipline from the rolling context, and a "re-read these files" reminder
# relies on model compliance exactly when it is weakest (§9: 규율 증발은 판단으로 못 막음).
# Payload logic is identical to hook #1 — single SoT, thin wrapper.
exec "$(cd "$(dirname "$0")" && pwd)/prdt-session-start.sh"
