# P1 — PRD

- **In**: the user's raw ask + a read of `feature-history.md` + `fail-patterns.md`.
- **Out**: `docs/prd/PRD.md` (versioned section, master EN) + `docs/artifacts/<version>/PRD.html` (user-lang).
- **Persona**: pdt-designer, clarity loop — opus/max (R1 net-new), opus/xhigh (R2+).
- **Emit at entry**: one `type:design` "PRD authoring" ticket immediately — the user↔PO↔Designer comms vehicle; its `## Plan` holds the clarity-loop steps.
- **Mechanism**: clarity score `A = 1 − Σ(clarityᵢ × weightᵢ)`; ready at `A ≤ 0.05`. Hard cap 5 loops; a PO "finalize" ships `ready` even at `confidence < 0.7`.
- **Git**: `git checkout -b v<N> main` on P1 entry. All version work lives on this branch.
- **Exit**: PRD `state:"ready"` → P2.
