# P3 — Build

- **In**: approved design + emitted `impl` / `refactor` / `test` / `qa` tickets.
- **Out**: working code, QA pass, close-gate items resolved.
- **Persona**: pdt-developer (impl/refactor), pdt-qa (test/qa loop), pdt-designer (close-gate review).
- **Build loop**: impl ↔ qa auto-loop, PO-owned — see `lifecycle/ticket-ops.md` *Auto QA smoke gate*.
- **Test trigger**: emit `type:test` on any of — risk flag ∈ {auth, payments, PII} · multi-step flow ≥3 · area-tag ≥3 cumulative fails in `fail-patterns.md` · user explicit.
- **Close gate** (sequential, once build is complete). First, before any close-gate ticket or phase summary: backlog triage — read `docs/backlog.md` and walk the user through each open item, asking per item to APPLY in this version (open a ticket in this build before close) or DEFER to next (keep/refile under the next-version section). User decides each; never auto-apply. Then: T+0 `type:design` design review (Designer sonnet/medium, **mandatory, no waiver** — `designer/bookshelf/phase3-close-gate.md`) → T+1 `type:design` PRD-requirements check (PO + user, waivable) → T+2 `type:qa` 6 security items (waivable).
- **Exit**: all close-gate tickets `done` → P4.
