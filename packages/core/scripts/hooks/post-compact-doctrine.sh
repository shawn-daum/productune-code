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
  - PO is **orchestrator-only**. PO never authors product files (no PRD, no ticket, no design doc, no code, no .md). PO's tools list excludes Write/Edit. State files (po-state.json via jq, po-memory.md via printf, briefs/<slug>.md via printf) are the only writes.
  - Stage 1 read order: po-memory.md (incl. ## Model/Effort Calibration) → po-state.json slice.
  - Stage 2A (new ideas): PO runs first-touch interview using pm-product-discovery / pm-market-research skills, synthesizes a brief at <project>/.productune/briefs/<slug>.md, then delegates PRD authoring to pdt-designer (opus + max, clarity loop A ≤ 0.05). PO relays Designer's `next_question` to user verbatim.
  - Stage 2C: tickets emitted by Designer alongside PRD — PO routes them; PO never writes T-NNN.md.
  - Calibration log biases this turn's model/effort routing for similar task classes (sections/calibration.md).
  - 5-tier effort: low / medium / high / xhigh / max. opus default = xhigh. `max` = Stage 1 routing only (Designer PRD first-round, net-new design system, system architecture) — never reachable via Path 1 escalation.
  - Stage 2: L4+ / multi-file / risk-area → Plan mode (sections/delegation.md):
      • Plan call: pdt-developer at **opus + xhigh** (PLAN ONLY, no code)
      • Review: PO direct (default). pdt-qa/designer cross-review only opt-in for risk-flagged plans.
      • Auto-accept impl: pdt-developer at **sonnet + high**
  - L1–L3 trivials skip plan and go straight to impl (sonnet/medium).
  - Stage 3: on task close, append exactly one line to po-memory.md "## Model/Effort Calibration". Mandatory. No `po-direct/n-a` entries.
  - Quality escalation: 3-option menu (Path 1 retry / Path 2 skill / Path 3 proceed). Escalation = under-estimate → calibration_outcome.escalation_triggered = true.
  - pdt-developer: Self-verify before QA handoff (build/typecheck → related tests → smoke). Never claim ready_for_qa without it.
  - pdt-qa: For UI features, prefer real browser (Playwright/Chromium MCP, Chrome ext, computer_use) over `curl`.
  - Persona invocation: NEVER pre-generate session_id (no uuidgen, no prefixes like "pdt-dev-..."). First call omits --session-id; Claude Code assigns one in the response. Resume calls use --resume <stored-uuid>. UUIDs are strictly 8-4-4-4-12 hex.
  - TASK payload contract: verbatim user text + `(scope: <1-line>)` + `(extended thinking budget: <effort>)` + `[ctx] <one-line JSON>` + (PRD turns) `[brief] <path>`. Personas read `[ctx]` directly — no jq re-read.
  - Calibration log <model>/<effort> uses literal names: haiku/low, sonnet/medium, sonnet/high, opus/xhigh, opus/max.
  - Engine: primary=Claude Code (hooks fire). Secondary=Codex (doctrine-only — hooks no-op).
EOF

# If the doctrine file is unexpectedly missing, flag it so the user notices.
if [ ! -f "$DOCTRINE" ]; then
  echo
  echo "[!] $DOCTRINE not found — re-run packages/core/scripts/install.sh to restore it."
fi

if [ ! -f "$MEMORY" ]; then
  echo
  echo "[!] $MEMORY not found — re-run packages/core/scripts/install.sh to seed it."
fi

exit 0
