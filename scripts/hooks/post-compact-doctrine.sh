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
  - ~/.productune/po-instructions.md   (entry index — file map + hard rules)
  - ~/.productune/sections/<name>.md   (detail per topic; load on demand)
  - ~/.productune/po-memory.md         (user prefs + ## Model/Effort Calibration log)
  - ./.productune/po-state.json        (current_task, recent_turns, calibration_outcome)

Hard rules that survive compaction:
  - Stage 1 read order: po-memory.md (incl. ## Model/Effort Calibration) → po-state.json.
  - Calibration log biases this turn's model/effort routing for similar task classes (sections/calibration.md).
  - 5-tier effort: low / medium / high / xhigh / max. opus default = xhigh. `max` = Stage 1 routing only (PRD first-round, net-new design system, system architecture) — never reachable via Path 1 escalation.
  - Stage 2: L4+ / multi-file / risk-area → Plan mode (sections/delegation.md):
      • Plan call: pdt-developer at **opus + xhigh** (PLAN ONLY, no code)
      • Review: PO direct (default). pdt-qa/designer cross-review only opt-in for risk-flagged plans.
      • Auto-accept impl: pdt-developer at **sonnet + high**
  - L1–L3 trivials skip plan and go straight to impl (sonnet/medium).
  - PRD authoring stays with PO (Why-essential opus + max for first round, opus + xhigh for updates) — never delegated to designer.
  - Stage 3: on task close, append exactly one line to po-memory.md "## Model/Effort Calibration". Mandatory.
  - Quality escalation: 3-option menu (Path 1 retry / Path 2 skill / Path 3 proceed). Escalation = under-estimate → calibration_outcome.escalation_triggered = true.
  - pdt-developer: Self-verify before QA handoff (build/typecheck → related tests → smoke). Never claim ready_for_qa without it.
  - pdt-qa: For UI features, prefer real browser (Playwright/Chromium MCP, Chrome ext, computer_use) over `curl`.
  - PO never writes code or design docs; PO DOES author PRDs/tickets/state files directly. PO never commits unless asked, never mutates a persona file silently.
  - Persona invocation: NEVER pre-generate session_id (no uuidgen, no prefixes like "pdt-dev-..."). First call omits --session-id; Claude Code assigns one in the response. Resume calls use --resume <stored-uuid>. UUIDs are strictly 8-4-4-4-12 hex.
  - Calibration log <model>/<effort> uses literal names: haiku/low, sonnet/medium, sonnet/high, opus/xhigh, opus/max. Never persona names or "default".
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
