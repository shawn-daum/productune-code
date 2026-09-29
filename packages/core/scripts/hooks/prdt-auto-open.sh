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
#  - $PRDT_HOME/auto-open = "off" → nothing (default "on" when missing/invalid).
#    Changed with `prdt settings set viewer.auto-open on|off` (T-750), which
#    reads this file by the same rule (whitespace-stripped, exactly "off" = off).
#  - macOS `open` not on PATH → nothing (this feature is macOS-only, T-409
#    decision: single-user tool, cross-platform not worth it yet).
#
# The keychain dialog, and what actually causes it (T-559 → T-571). Symptom:
# an unattributable macOS keychain prompt landing on the user's screen mid-turn.
# Cause: `open <file>` here COLD-STARTS the handling application — Chrome, on
# this machine — out of a sandboxed hook process, and a cold Chrome unlocking
# its Safe Storage keychain item from that parent is what macOS prompts about.
# The cause is the cold LAUNCH, not who asked for it and not which extension
# was written; see the T-571 block near the `open` call for the fix.
#
# Main-session-only firing (T-559, 2026-09-03) is a SEPARATE narrowing, and it
# did not address the above: this hook's own opening line says it exists for PO
# deliverables, but T-409's post-grill hardening below only narrowed subagent
# firing (path exclude, debounce) without ever asking whether it should fire for
# subagents at all. It shouldn't — a worker Write (designer/QA/developer
# artifact) is not a PO-facing result, and the PO already has its own hand-off
# convention for deliverables (`[label](file://…)` links, `open`-ing on
# request); this hook is now only that PO-side surface. T-559 removed one
# caller of the cold launch; main-session Writes kept firing by design, so the
# dialog kept appearing (user report 2026-09-04) until T-571 removed the cause.
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
#    (basename PRD.md, wherever prd_path points it — NOT docs/prd/versions/v<N>.<m>.md:
#    T-602/T-657 moved closed sections there, one file per version, each only
#    ever written by a close-time move, never a deliverable to look at), *.html/*.htm (docs/
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

# T-746 — the static viewer instead of the raw file:
#  - A PO Write of a document the viewer shows (docs/prd/PRD.md, a top-level
#    docs/wiki/*.md, docs/features/*.md, an .md under docs/artifacts/) opens
#    the project's viewer AT that document: `prdt viewer --no-open <file>`
#    regenerates it (so what opens is current) and prints a link to a small
#    forwarding page (`.prdt/scratch/viewer/at/<id>.html` → viewer.html#<id>),
#    which is what gets opened — through the SAME warm-handler + debounce path
#    as any other light open below. No viewer (no node, no generator, a
#    failed generation) → PRD.md falls back to opening the file itself, the
#    other documents stay silent, as before T-746.
#  - `prdt-auto-open.sh --open <file>` is the hand-off mode `prdt tickets
#    --link` / `prdt viewer` call to open a link they just printed: no stdin
#    event, no Write classification, no debounce (one explicit hand-off, one
#    open) — but the GUI-session, auto-open=off and never-cold-start (T-571)
#    rules below apply exactly as for a Write, so the policy lives here once.
#    The extension allowlist applies too (T-785 F2 fix — it used to open
#    ANY path handed to it, unfiltered): the same light/heavy set as a Write,
#    plus a bare `.md` (a jump page is already `.html`, and a ticket/wiki/
#    feature/artifact file that `viewer_links()` hands off directly — no
#    anchor, or no viewer at all — is a legitimate `--open` target that a
#    Write never classifies on its own).
#  - .html mockups, images, pdf and installers keep opening as the file
#    itself — the viewer only summarizes those.

# T-794 — main-session-only relay for the CLI's OWN hand-offs (`prdt viewer`,
# `prdt tickets --link`, any future `prdt` command that prints a paste-ready
# `[label](file://…)` line). Before this, `viewer_auto_open()` in the CLI shelled
# out to this same script's `--open` mode directly from whatever process ran
# `prdt` — a worker persona running the identical command got the identical
# open, because a plain subprocess has no way to see who invoked it (the
# `agent_type` discriminator above exists only on a Claude Code hook event, not
# on argv/env reaching a Bash-spawned child). The CLI no longer calls `--open`
# at all; the only remaining caller of `--open` is registered on PostToolUse
# with matcher "Bash", where a genuine hook event again carries `agent_type`
# (or not) exactly the way the Write registration above already relies on.
#  - agent_type present → a worker ran it → silent, no matter what it printed.
#  - agent_type absent (main session) → read `tool_input.command`; not a
#    `prdt …` invocation (word-bounded, so `sprdt`/`prdthing` don't match) →
#    silent (this hook only ever relays prdt's own hand-off, never generic
#    Bash output that happens to look like one). A literal `--no-open` token
#    on that SAME command line → silent (the PO's own suppression still
#    works, now read off the command instead of an argparse value the CLI
#    itself no longer acts on).
#  - Otherwise: `tool_response.stdout` is scanned line by line for the exact
#    `[label](file://path)` shape `viewer_links()`/`cmd_viewer` print, and each
#    path found is handed to THIS SAME script's `--open <path>` mode — one
#    recursive invocation per link, so every guard already proven for `--open`
#    (GUI session, auto-open=off, the extension allowlist, T-571's warm-
#    handler check) applies unchanged and only once each, per path.

# T-802 — background, coalesced viewer regeneration on ANY docs/**/*.md write
# (Write/Edit/MultiEdit), from the PO or any worker, opening nothing: the user
# refreshes the viewer by hand ("새로고침은 내손으로 자주하니까 일단 1로만 해줘
# 이번버젼엔" — 2, an always-fresh live view, stays backlog). See the call site
# near the top of the main script body for why this fires ahead of — and
# independent of — the GUI-session / agent_type / auto-open guards below: none
# of those gate "may this hook OPEN something", never "may a doc write refresh
# the file the user reads by hand".

# Resolve the projectRoot the same way `prdt` itself does (find_project_root):
# outermost `.prdt/po-state.json` on the ancestor chain (T-484) — kept in
# lockstep with prdt-session-start.sh's own find_proj / the python twins
# (prdt-post-dispatch.sh, prdt-user-prompt.sh), so the regen lock below and the
# `prdt viewer` call it shells out to agree on the SAME project, never two
# different nested markers each running their own lock.
find_proj() {
  local d hit="" up="" phys=""
  phys="$(cd -P -- "$1" 2>/dev/null && pwd -P)"
  d="${phys:-$1}"
  while [ -n "$d" ] && [ "$d" != "/" ]; do
    [ -f "$d/.prdt/po-state.json" ] && hit="$d"
    up="$(dirname "$d")"
    [ "$up" = "$d" ] && break
    d="$up"
  done
  printf '%s' "$hit"
  return 0
}

# Schedule a background `prdt viewer --no-open` for the project root holding
# $1 (a just-written docs/**/*.md file). Never blocks the caller: this
# function only launches a detached python3 and returns — a bare `&` would
# leave the job in THIS hook's own process group, which the harness may reap
# along with the hook itself (prdt-session-start.sh's meta-backup tick already
# documents the same finding), so detaching needs `start_new_session=True`,
# which only `subprocess.Popen` gives us, not bash job control. All the
# coalescing (single-flight per root via a non-blocking flock + a dirty flag
# any write landing mid-regen sets, so the in-flight run loops once more
# instead of a second run racing it) happens inside that detached process,
# never here — a burst of writes regenerates once or a few times, never once
# per write.
schedule_viewer_regen() {
  local fpath="$1" root prdt_cli
  root="$(find_proj "$(dirname -- "$fpath")" 2>/dev/null)"
  [ -n "$root" ] || return 0
  prdt_cli="${PRDT_BIN:-${PRDT_HOME:-$HOME/.prdt}/bin/prdt}"
  [ -x "$prdt_cli" ] || prdt_cli="$(command -v prdt 2>/dev/null)"
  [ -n "$prdt_cli" ] || return 0
  command -v python3 >/dev/null 2>&1 || return 0
  python3 - "$root" "$prdt_cli" >/dev/null 2>&1 <<'PY'
import subprocess, sys

root, cli = sys.argv[1], sys.argv[2]

# The actual single-flight worker: spawned as its OWN detached process (below)
# so this outer script — the one the hook waits on — never itself blocks on a
# regen, however long one takes.
WORKER = r'''
import fcntl, os, subprocess, sys
root, cli = sys.argv[1], sys.argv[2]
vdir = os.path.join(root, ".prdt", "scratch", "viewer")
os.makedirs(vdir, exist_ok=True)
dirty = os.path.join(vdir, ".regen-dirty")
lock = os.path.join(vdir, ".regen-lock")
try:
    with open(dirty, "w") as f:
        f.write("1")
except OSError:
    pass
fd = os.open(lock, os.O_CREAT | os.O_RDWR, 0o644)
try:
    fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
except OSError:
    os.close(fd)
    sys.exit(0)  # a regen is already in flight for this root; the dirty write
                 # above is what makes IT loop again, not a second run of ours
try:
    while True:
        try:
            os.remove(dirty)
        except OSError:
            pass
        subprocess.run([cli, "viewer", "--no-open"], cwd=root,
                        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if not os.path.exists(dirty):
            break
finally:
    try:
        fcntl.flock(fd, fcntl.LOCK_UN)
    except OSError:
        pass
    os.close(fd)
'''

subprocess.Popen([sys.executable, "-c", WORKER, root, cli],
                  stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                  start_new_session=True)
PY
}

set +e

OPEN_MODE=""
if [ "${1:-}" = "--open" ]; then
  OPEN_MODE="yes"
  [ -n "${2:-}" ] && [ -f "$2" ] || exit 0
fi

if [ -n "$OPEN_MODE" ]; then
  EVENT_JSON='{"tool_name":"Write"}'
else
  EVENT_JSON="$(cat 2>/dev/null || true)"
fi
[ -z "$EVENT_JSON" ] && { printf '{}'; exit 0; }

command -v jq >/dev/null 2>&1 || { printf '{}'; exit 0; }

TOOL_NAME="$(printf '%s' "$EVENT_JSON" | jq -r '.tool_name // ""' 2>/dev/null)"

# T-802: background regen fires for a real Write/Edit/MultiEdit of a
# docs/**/*.md file only — never for the synthetic `--open` hand-off event
# (OPEN_MODE), which opens an already-generated link and writes nothing.
if [ -z "$OPEN_MODE" ]; then
  case "$TOOL_NAME" in
    Write|Edit|MultiEdit)
      REGEN_FILE="$(printf '%s' "$EVENT_JSON" | jq -r '.tool_input.file_path // ""' 2>/dev/null)"
      case "$REGEN_FILE" in
        */docs/*.md|docs/*.md) schedule_viewer_regen "$REGEN_FILE" ;;
      esac
      ;;
  esac
fi

# GUI po-runner spawns set this (T-409) — CLI-only feature, GUI already surfaces
# artifacts in-app; skips only the OPENING pipeline below — T-802's regen just
# above already ran regardless of this flag (regenerating is not opening a
# window, and the GUI needs the static viewer current too).
[ -n "${PRDT_GUI_SESSION:-}" ] && { printf '{}'; exit 0; }

# T-794 relay (see header): a real Bash PostToolUse event, never the synthetic
# one `--open` builds above (OPEN_MODE is unset here on purpose — an `--open`
# call is never itself re-relayed).
if [ -z "$OPEN_MODE" ] && [ "$TOOL_NAME" = "Bash" ]; then
  HAS_AGENT_TYPE="$(printf '%s' "$EVENT_JSON" | jq -r 'has("agent_type")' 2>/dev/null)"
  JQ_AGENT_STATUS=$?
  if [ "$JQ_AGENT_STATUS" -eq 0 ] && [ "$HAS_AGENT_TYPE" = "false" ]; then
    COMMAND="$(printf '%s' "$EVENT_JSON" | jq -r '.tool_input.command // ""' 2>/dev/null)"
    if printf '%s' "$COMMAND" | grep -Eq '(^|[/[:space:];&|(])prdt([[:space:]]|$)' \
      && ! printf '%s' "$COMMAND" | grep -Eq '(^|[[:space:]])--no-open([[:space:]]|$)'; then
      STDOUT="$(printf '%s' "$EVENT_JSON" | jq -r '.tool_response.stdout // ""' 2>/dev/null)"
      printf '%s\n' "$STDOUT" | while IFS= read -r LINE; do
        FP="$(printf '%s' "$LINE" | sed -n 's/^\[[^]]*\](file:\/\/\(.*\))$/\1/p')"
        [ -n "$FP" ] && bash "$0" --open "$FP"
      done
    fi
  fi
  printf '{}'
  exit 0
fi

[ "$TOOL_NAME" = "Write" ] || { printf '{}'; exit 0; }

if [ -n "$OPEN_MODE" ]; then
  FILE_PATH="$2"
else
  FILE_PATH="$(printf '%s' "$EVENT_JSON" | jq -r '.tool_input.file_path // ""' 2>/dev/null)"
fi
[ -n "$FILE_PATH" ] && [ -f "$FILE_PATH" ] || { printf '{}'; exit 0; }

if [ -z "$OPEN_MODE" ]; then

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
fi

PRDT_HOME="${PRDT_HOME:-$HOME/.prdt}"
MODE="$(cat "$PRDT_HOME/auto-open" 2>/dev/null | tr -d '[:space:]')"
[ "$MODE" = "off" ] && { printf '{}'; exit 0; }

command -v open >/dev/null 2>&1 || { printf '{}'; exit 0; }

BASENAME="$(basename -- "$FILE_PATH")"
LOWER="$(printf '%s' "$BASENAME" | tr '[:upper:]' '[:lower:]')"

# The file actually handed to `open` — the written file itself, except for a
# viewer-routed document (T-746), where it is the forwarding page. Debounce
# stays keyed on the WRITTEN path either way.
OPEN_PATH="$FILE_PATH"

ACTION=""
VIEWER_DOC=""
if [ -z "$OPEN_MODE" ]; then
  case "$FILE_PATH" in
    */docs/prd/PRD.md|*/docs/features/*.md|*/docs/artifacts/*.md) VIEWER_DOC="yes" ;;
    */docs/wiki/*/*) ;;
    */docs/wiki/*.md) VIEWER_DOC="yes" ;;
  esac
fi
if [ -n "$VIEWER_DOC" ]; then
  PRDT_CLI="${PRDT_BIN:-$PRDT_HOME/bin/prdt}"
  [ -x "$PRDT_CLI" ] || PRDT_CLI="$(command -v prdt 2>/dev/null)"
  if [ -n "$PRDT_CLI" ]; then
    LINK="$(cd "$(dirname -- "$FILE_PATH")" 2>/dev/null && "$PRDT_CLI" viewer --no-open "$FILE_PATH" 2>/dev/null | head -1)"
    JUMP="$(printf '%s' "$LINK" | sed -n 's/^\[[^]]*\](file:\/\/\(.*\))$/\1/p')"
    case "$JUMP" in
      */.prdt/scratch/viewer/at/*.html) [ -f "$JUMP" ] && { OPEN_PATH="$JUMP"; ACTION="open"; } ;;
    esac
  fi
fi

if [ -z "$ACTION" ]; then
# T-785 F2: `--open` (the hand-off mode `prdt viewer` / `prdt tickets --link`
# call to open a link they just printed, see header) used to skip this
# allowlist entirely and open ANY path handed to it. It must clear the SAME
# gate as a Write-classified open — the allowlist below plus a bare `.md`
# (the ticket/wiki/feature/artifact file `viewer_links()` hands off directly
# when the viewer has no anchor for it, or when no viewer exists at all;
# `prd.md` and a viewer jump page under .prdt/scratch/viewer/at/*.html are
# already `.md`/`.html` respectively, so they need no separate case here).
case "$LOWER" in
  prd.md) ACTION="open" ;;
  *.md) [ -n "$OPEN_MODE" ] && ACTION="open" ;;
  *.html|*.htm|*.png|*.jpg|*.jpeg|*.gif|*.svg|*.pdf) ACTION="open" ;;
  *.dmg|*.pkg|*.zip|*.tar.gz|*.tar.xz|*.tgz|*.exe|*.msi) ACTION="reveal" ;;
  *) ACTION="" ;;
esac
fi

[ -n "$ACTION" ] || { printf '{}'; exit 0; }

# Oversized light file → reveal instead of launching a viewer app on it.
if [ "$ACTION" = "open" ]; then
  SIZE="$(wc -c < "$OPEN_PATH" 2>/dev/null | tr -d '[:space:]')"
  if [ -n "$SIZE" ] && [ "$SIZE" -gt 26214400 ] 2>/dev/null; then
    ACTION="reveal"
  fi
fi

# T-571 (2026-09-04): never COLD-START an application from this hook — that is
# the keychain dialog's actual cause (see header). A light `open` is allowed
# only when the app that would handle the file is ALREADY running, so the open
# lands in a live process instead of spawning one. Otherwise it degrades to the
# reveal we already have: Finder is a permanently-running system app, so
# `open -R` starts nothing, and the PO still sees the deliverable land — the
# surface is kept, only the launch is dropped.
#
# Handler resolution, deliberately conservative:
#  - UTI from `mdls -raw -name kMDItemContentType` (works on any real file,
#    Spotlight-indexed or not — probed on /tmp and /var/folders alike).
#  - Bundle id from the user's LaunchServices overrides
#    (~/Library/Preferences/com.apple.LaunchServices/com.apple.launchservices.
#    secure.plist), read through plutil → jq.
#  - A UTI with NO override falls back to the SYSTEM default, which cannot be
#    read without launching something. That is left UNRESOLVED on purpose and
#    treated as "possibly cold" → reveal. Same direction as every other guard
#    in this hook (T-559): uncertainty fails toward not opening.
# Bundle ids are compared case-INSENSITIVELY: observed on this machine, the
# handler plist stores `com.google.chrome` while the running process registers
# as `com.google.Chrome`, and a literal compare would call a live Chrome cold.
if [ "$ACTION" = "open" ]; then
  UTI=""
  command -v mdls >/dev/null 2>&1 && \
    UTI="$(mdls -raw -name kMDItemContentType "$OPEN_PATH" 2>/dev/null)"

  HANDLER_BUNDLE=""
  LS_PLIST="$HOME/Library/Preferences/com.apple.LaunchServices/com.apple.launchservices.secure.plist"
  case "$UTI" in
    ''|'(null)') ;;
    *)
      if command -v plutil >/dev/null 2>&1 && [ -f "$LS_PLIST" ]; then
        HANDLER_BUNDLE="$(plutil -convert json -o - "$LS_PLIST" 2>/dev/null \
          | jq -r --arg uti "$UTI" '
              [ .LSHandlers[]?
                | select((.LSHandlerContentType // "") == $uti)
                | (.LSHandlerRoleAll // .LSHandlerRoleViewer // empty) ]
              | first // ""' 2>/dev/null)"
      fi
      ;;
  esac

  HANDLER_WARM="no"
  if [ -n "$HANDLER_BUNDLE" ] && command -v lsappinfo >/dev/null 2>&1; then
    WANT_BUNDLE="$(printf '%s' "$HANDLER_BUNDLE" | tr '[:upper:]' '[:lower:]')"
    if lsappinfo list 2>/dev/null \
      | grep -o 'bundleID="[^"]*"' \
      | sed -e 's/^bundleID="//' -e 's/"$//' \
      | tr '[:upper:]' '[:lower:]' \
      | grep -qxF "$WANT_BUNDLE"; then
      HANDLER_WARM="yes"
    fi
  fi

  [ "$HANDLER_WARM" = "yes" ] || ACTION="reveal"
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
[ -n "$OPEN_MODE" ] && KEY=""
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
  open -R "$OPEN_PATH" >/dev/null 2>&1
else
  open "$OPEN_PATH" >/dev/null 2>&1
fi

printf '{}'
exit 0
