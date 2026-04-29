#!/usr/bin/env bash
# Claude Code hook — PostCompact
# Re-injects the productune PO doctrine essentials into the session right after
# Claude compacts its context. The doctrine file is the source of truth at
# ~/.productune/po-instructions.md, but a compaction can drop it from the rolling
# context — this short reminder keeps the critical rules visible.
#
# Stdout from a hook is appended to the session as a system message, so we keep
# this output terse: the rules below are the *non-derivable* parts of the
# doctrine (the derivable parts can be re-read from disk).

set +e

DOCTRINE="$HOME/.productune/po-instructions.md"
MEMORY="$HOME/.productune/po-memory.md"

cat <<'EOF'
[productune doctrine — re-injected after compaction]

Re-read these files now if anything below feels unclear:
  - ~/.productune/po-instructions.md   (full PO doctrine)
  - ~/.productune/po-memory.md         (user prefs + Model/Effort Calibration log)
  - ./.productune/po-state.json        (current_task, recent_turns)

Hard rules that survive compaction:
  - Stage 1 read order: po-memory.md (incl. ## Model/Effort Calibration) → po-state.json.
  - Calibration log biases this turn's model/effort routing for similar task classes.
  - Stage 2: complexity ≥ L5 / multi-file / risk area → Plan mode → cross-review (qa, optionally designer) → auto-accept impl. (See §"Plan mode enforcement".)
  - Stage 3: on task close, append exactly one line to po-memory.md "## Model/Effort Calibration". This is mandatory — it is the feedback signal.
  - Quality escalation: 3-option menu (Path 1 retry / Path 2 skill / Path 3 proceed). Escalation = under-estimate signal → mark calibration_outcome.escalation_triggered = true.
  - pdt-developer: Self-verify before QA handoff (build/typecheck → related tests → smoke). Never claim ready_for_qa without it.
  - pdt-qa: For UI features, prefer real browser (Playwright/Chromium MCP, Chrome ext, computer_use) over `curl`.
  - PO never edits code, never commits unless asked, never mutates a persona file silently.
EOF

# If the doctrine file is unexpectedly missing, flag it so the user notices.
if [ ! -f "$DOCTRINE" ]; then
  echo
  echo "[!] $DOCTRINE not found — re-run scripts/install.sh to restore it."
fi

if [ ! -f "$MEMORY" ]; then
  echo
  echo "[!] $MEMORY not found — re-run scripts/install.sh to seed it."
fi

exit 0
