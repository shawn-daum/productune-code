#!/usr/bin/env bash
# Claude Code hook — PostCompact
# Re-injects the productune PO doctrine essentials into the session right after
# Claude compacts its context. The new doctrine SoT lives under
# ~/.productune/doctrine/persona/po/. A compaction can drop it from the rolling
# context — this short reminder keeps the critical rules visible.
#
# Stdout from a hook is appended to the session as a system message, so we keep
# this output terse: the rules below are the *non-derivable* parts of the
# doctrine (the derivable parts can be re-read from disk).

set +e

DOCTRINE="$HOME/.productune/doctrine/persona/po/habit.md"
PERSONAL="$HOME/.productune/po/habit.md"

COMMON="$HOME/.productune/doctrine/common/habit.md"

# Unquoted heredoc so $HOME-expanded absolute paths are injected (NOT a literal
# `~` — the Read tool does not expand `~`; on a foreign $HOME the model would
# guess `/root` and silently proceed). `\$` keeps an intended literal `$`; the
# repo-relative po-state path stays literal (it is relative to cwd, not $HOME).
cat <<EOF
[productune doctrine — re-injected after compaction]

Re-read these files now (load via Bash \`cat\` — the Read tool does NOT expand \`~\`):
  - $COMMON          (Tier 0 common doctrine — shared habits)
  - $DOCTRINE          (Tier 0 PO doctrine — identity + core habits)
  - $HOME/.productune/doctrine/persona/po/bookshelf/<name>.md  (detail per topic; load on demand)
  - $PERSONAL                           (Tier 2 personal — user prefs + product taste + workflow)
  - ./.productune/po-state.json                         (current_task, recent_turns, calibration_outcome)

PO is orchestrator-only — authors no content; never self-generate a session_id; re-read the files above before acting.
EOF

# If the Tier 0 doctrine file is unexpectedly missing, flag it so the user notices.
if [ ! -f "$DOCTRINE" ]; then
  echo
  echo "[!] $DOCTRINE not found — re-run packages/core/scripts/install.sh to restore it."
fi

if [ ! -f "$PERSONAL" ]; then
  echo
  echo "[!] $PERSONAL not found — re-run packages/core/scripts/install.sh to restore it."
fi

exit 0
