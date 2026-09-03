#!/usr/bin/env bash
# prdt — CLI auto-open for PO deliverables (T-409). Registered PostToolUse,
# matcher "Write": fires right after a Write tool call completes and decides
# whether the just-written file is worth surfacing to the operator without
# them asking — the CLI/terminal PO has no in-app artifact panel the way the
# GUI does (T-PATCH-269/275), so this hook is that surface's CLI counterpart.
#
# Scope guards (all silent no-ops, never block the turn):
#  - Not a Write tool call → nothing.
#  - Subagent Write (see T-559 below) → nothing.
#  - $PRDT_GUI_SESSION set → nothing. The GUI po-runner spawn sets this (T-409)
#    specifically so its own PO turns never ALSO pop native Finder/Preview
#    windows behind the Electron window — GUI already auto-surfaces in-app.
#  - $PRDT_HOME/auto-open = "off" → nothing (default "on" when missing/invalid;
#    toggle by direct file edit for now, same convention as audience-mode).
#  - macOS `open` not on PATH → nothing (this feature is macOS-only, T-409
#    decision: single-user tool, cross-platform not worth it yet).
#
# Main-session-only firing (T-559, 2026-09-03): this hook's own opening line
# says it exists for PO deliverables, but T-409's post-grill hardening below
# only narrowed subagent firing (path exclude, debounce) without ever asking
# whether it should fire for subagents at all. It shouldn't — a worker Write
# (designer/QA/developer artifact) was popping a native app window on a cold
# Chrome launch from this sandboxed process, which macOS answers with an
# unattributable keychain dialog on the user's screen mid-task. The PO already
# has its own hand-off convention for deliverables (`[label](file://…)` links,
# `open`-ing on request); this hook is now only that PO-side surface.
#
# Discriminator, empirically observed, not assumed (probed both a headless
# main-session Write and a Task-dispatched subagent Write against a stdin-dump
# PostToolUse hook, Claude Code 2.1.259): a subagent's PostToolUse payload
# carries top-level `agent_id` + `agent_type` (e.g. `"agent_type":"file-writer"`)
# right after `permission_mode`; a main-session payload has neither key at all
# — confirms fact--claude-hooks' T-518 finding for PreToolUse/PostToolBatch
# also holds for PostToolUse. Read with `jq -r 'has("agent_type")'`, which
# is depth-aware: it can only ever match a real top-level member, so a Write
# whose `tool_input.content` or `file_path` happens to contain the literal
# text "agent_type" cannot forge a match the way a substring grep could
# (fact--claude-hooks T-518 "첫 매치" pitfall) — jq's top-level addressing IS
# the mitigation, no extra depth check needed. Checked via key MEMBERSHIP
# (`has("agent_type")`), not truthiness of the value, so a hypothetical
# present-but-empty value still reads as "identity present" — the shape a
# real main-session payload never produces (it omits the key outright).
#  - agent_type key present (has() = true, any value) → subagent → silent no-op.
#  - jq itself fails to parse at this step → treated the same as "present":
#    silent no-op. Fails toward NOT opening, on purpose — a wrongly-skipped
#    open costs a convenience popup the PO can still hand off manually; a
#    wrongly-fired open reproduces the exact keychain-dialog defect this
#    ticket exists to kill. Every other guard in this hook already fails the
#    same direction (missing jq/open, missing file, mode=off → all skip,
#    never open), so this keeps the one consistent failure mode throughout.
#  - agent_type key absent and jq parsed cleanly → main session → proceeds.
#
# Classification (T-409 추가 확정, 2026-07-24): a NARROW allowlist, not "any
# md/html anywhere" — most md/html writes in a session are routine ticket/wiki/
# design bookkeeping, not a deliverable to look at. Matched paths:
#  - light (`open <path>`, opens in the default app/browser): the PRD file
#    (basename PRD.md, wherever prd_path points it), *.html/*.htm (docs/
#    artifacts/* in practice, but any .html is rare enough to not need a path
#    restriction), images (png/jpg/jpeg/gif/svg), *.pdf.
#  - heavy (`open -R <path>`, Finder-reveal only): installer/archive
#    extensions (dmg/pkg/zip/tar.gz/tar.xz/tgz/exe/msi) OR any light-matched
#    file that turned out to be large (>25MB — an oversized png/pdf should be
#    revealed, not auto-launched into a viewer).
# Anything else (source code, tickets, wiki, po-state, lockfiles, …) → silent.
#
# Referenced-not-written files (PO hands off several existing results at once)
# are OUT of this hook's scope on purpose — that is PO judgment, not a
# mechanical Write-time decision, and stays a `po/habit.md` instruction instead
# (T-409 Deliverables section) using this SAME config gate + light/heavy split.
#
# Post-grill hardening (T-409 후속, 2026-07-24 — QA grill confirmed PostToolUse
# fires on SUBAGENT Write calls too, not just the main agent's):
#  - Path exclude: any file_path with a `.prdt/` path segment (scratch, session
#    state, …) → silent, no matter what extension it has. QA's scratch-harness
#    html and any `.prdt/`-nested deliverable are internal bookkeeping, not a
#    PO-facing result — this is a substring/segment match, independent of
#    $PRDT_HOME's actual location (fact--claude-hooks convention: `.prdt/` is
#    always the marker, wherever it's rooted).
#  - Same-path debounce: a delegated agent (e.g. designer) that rewrites the
#    same artifact N times in one turn should pop the window once, not N times
#    — the value of auto-open is surfacing "a result landed", not narrating
#    every intermediate save. Tracked via an epoch marker file per path under
#    $PRDT_HOME/.auto-open-debounce (content = last-fire epoch, compared
#    instead of relying on mtime so tests can seed exact ages without
#    sleeping). Window is $PRDT_AUTO_OPEN_DEBOUNCE_SECS, default 30s.

set +e

EVENT_JSON="$(cat 2>/dev/null || true)"
[ -z "$EVENT_JSON" ] && { printf '{}'; exit 0; }

# GUI po-runner spawns set this (T-409) — CLI-only feature, GUI already surfaces
# artifacts in-app; skip before even touching jq/tool_name.
[ -n "${PRDT_GUI_SESSION:-}" ] && { printf '{}'; exit 0; }

command -v jq >/dev/null 2>&1 || { printf '{}'; exit 0; }

TOOL_NAME="$(printf '%s' "$EVENT_JSON" | jq -r '.tool_name // ""' 2>/dev/null)"
[ "$TOOL_NAME" = "Write" ] || { printf '{}'; exit 0; }

FILE_PATH="$(printf '%s' "$EVENT_JSON" | jq -r '.tool_input.file_path // ""' 2>/dev/null)"
[ -n "$FILE_PATH" ] && [ -f "$FILE_PATH" ] || { printf '{}'; exit 0; }

# T-559: subagent Write → silent no-op. `agent_type` is a top-level payload
# member on subagent Writes only (see header) — jq's addressing is itself the
# anti-spoofing guard, and a jq failure here is folded into the same "present"
# branch (fails toward skip, not open; see header for why that direction).
HAS_AGENT_TYPE="$(printf '%s' "$EVENT_JSON" | jq -r 'has("agent_type")' 2>/dev/null)"
JQ_AGENT_STATUS=$?
[ "$JQ_AGENT_STATUS" -eq 0 ] && [ "$HAS_AGENT_TYPE" = "false" ] || { printf '{}'; exit 0; }

# .prdt/ 하위(scratch, session state, …) is internal bookkeeping, never a
# PO-facing deliverable, regardless of extension — exclude before anything else.
case "$FILE_PATH" in
  */.prdt/*|.prdt/*) printf '{}'; exit 0 ;;
esac

PRDT_HOME="${PRDT_HOME:-$HOME/.prdt}"
MODE="$(cat "$PRDT_HOME/auto-open" 2>/dev/null | tr -d '[:space:]')"
[ "$MODE" = "off" ] && { printf '{}'; exit 0; }

command -v open >/dev/null 2>&1 || { printf '{}'; exit 0; }

BASENAME="$(basename -- "$FILE_PATH")"
LOWER="$(printf '%s' "$BASENAME" | tr '[:upper:]' '[:lower:]')"

ACTION=""
case "$LOWER" in
  prd.md) ACTION="open" ;;
  *.html|*.htm|*.png|*.jpg|*.jpeg|*.gif|*.svg|*.pdf) ACTION="open" ;;
  *.dmg|*.pkg|*.zip|*.tar.gz|*.tar.xz|*.tgz|*.exe|*.msi) ACTION="reveal" ;;
  *) ACTION="" ;;
esac

[ -n "$ACTION" ] || { printf '{}'; exit 0; }

# Oversized light file → reveal instead of launching a viewer app on it.
if [ "$ACTION" = "open" ]; then
  SIZE="$(wc -c < "$FILE_PATH" 2>/dev/null | tr -d '[:space:]')"
  if [ -n "$SIZE" ] && [ "$SIZE" -gt 26214400 ] 2>/dev/null; then
    ACTION="reveal"
  fi
fi

# Same-path debounce: a rewritten-in-place deliverable (designer iterating on
# an artifact, a subagent re-saving) should surface once, not on every Write.
# Keyed on the raw file_path string (not a resolved realpath — cheap, and two
# different paths that merely resolve to the same inode is a rare enough edge
# to not be worth a stat/readlink chain here).
DEBOUNCE_SECS="${PRDT_AUTO_OPEN_DEBOUNCE_SECS:-30}"
DEBOUNCE_DIR="$PRDT_HOME/.auto-open-debounce"
mkdir -p "$DEBOUNCE_DIR" 2>/dev/null
KEY="$(printf '%s' "$FILE_PATH" | cksum 2>/dev/null | tr -s ' ' '-')"
if [ -n "$KEY" ]; then
  MARKER="$DEBOUNCE_DIR/$KEY"
  NOW="$(date +%s 2>/dev/null)"
  if [ -f "$MARKER" ] && [ -n "$NOW" ]; then
    LAST="$(cat "$MARKER" 2>/dev/null | tr -d '[:space:]')"
    if [ -n "$LAST" ] && [ "$LAST" -eq "$LAST" ] 2>/dev/null; then
      AGE=$((NOW - LAST))
      if [ "$AGE" -lt "$DEBOUNCE_SECS" ] 2>/dev/null; then
        printf '{}'
        exit 0
      fi
    fi
  fi
  [ -n "$NOW" ] && printf '%s' "$NOW" > "$MARKER" 2>/dev/null
fi

if [ "$ACTION" = "reveal" ]; then
  open -R "$FILE_PATH" >/dev/null 2>&1
else
  open "$FILE_PATH" >/dev/null 2>&1
fi

printf '{}'
exit 0
