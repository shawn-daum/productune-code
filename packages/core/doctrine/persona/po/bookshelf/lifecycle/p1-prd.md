# P1 — PRD

- **In**: the user's raw ask + a read of `feature-history.md` + `fail-patterns.md`.
- **Out**: `docs/prd/PRD.md` — the single SoT, authored in `[ctx].user_lang` (the GUI renders PRD.md directly — no separate PRD.html required). If a rendered HTML view is still produced for the P1 gate, it goes to `docs/artifacts/<version>/` with a manifest entry (`kind: prd-view`, `source: docs/prd/PRD.md`, `source_hash`) and is a disposable render, never a second source.
- **Persona**: pdt-designer, clarity loop — opus/max (R1 net-new), opus/xhigh (R2+).
- **Emit at entry**: one `type:design` "PRD authoring" ticket immediately — the user↔PO↔Designer comms vehicle; its `## Plan` holds the clarity-loop steps.
- **Mechanism**: clarity score `A = 1 − Σ(clarityᵢ × weightᵢ)`; ready at `A ≤ 0.05`. Hard cap 5 loops; a PO "finalize" ships `ready` even at `confidence < 0.7`.
- **Git**: `git checkout -b v<N> main` on P1 entry. All version work lives on this branch.
- **po-state version-open**: flip the pointer and register the version in ONE jq pass — `current_version` alone is hook-rejected (the version row must land in the same write, symmetric to a phase transition co-writing `phase_history`):

  ```
  jq --arg v "v<N>" --arg now "$(date -u +%Y-%m-%dT%H:%M:%SZ)" '
    .current_version = $v
    | .versions += [{id:$v, started_at:$now, ended_at:null, prd_anchor:("docs/prd/versions/" + $v + ".md"), outcome:null}]
  ' .productune/po-state.json > /tmp/ps.json && mv /tmp/ps.json .productune/po-state.json
  ```

  Fill `outcome` at version close (p5-close.md), not now.
- **Snapshot guard**: opening a new version (`current_version` write) is hook-blocked (`pre-phase-gate-guard.sh` G5) while the last closed version's `docs/prd/versions/<v>.md` snapshot is missing — backstop for a close that bypassed G4 (e.g. GUI write path).
- **Exit**: PRD `state:"ready"` → P2.
