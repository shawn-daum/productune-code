# P3 — Build

- **In**: approved design + emitted `impl` / `refactor` / `test` / `qa` tickets.
- **Out**: working code, QA pass, close-gate items resolved.
- **Persona**: pdt-developer (impl/refactor), pdt-qa (test/qa loop), pdt-designer (close-gate review).
- **Build loop**: impl ↔ qa auto-loop, PO-owned — see `lifecycle/ticket-ops.md` *Auto QA smoke gate*.
- **Test trigger**: emit `type:test` on any of — risk flag ∈ {auth, payments, PII} · multi-step flow ≥3 · area-tag ≥3 cumulative fails in `fail-patterns.md` · user explicit.
- **Deferred decisions → backlog, never PRD edits**: a decision knowingly postponed mid-build goes to `docs/backlog.md` (sections: pre-deploy / next-version / near-term). The PRD stays the intended spec; the backlog tracks what was knowingly deferred. PRD open-question items stay in the PRD — link only.
- **Close gate** (sequential, once build is complete). First, before any close-gate ticket or phase summary: backlog triage — read `docs/backlog.md` and present ONE summary table in a single turn (rendered in user lang): per open item `1-line title · PO recommendation (APPLY this version / DEFER) · 1-line reason`. The user replies ONCE, flipping exceptions only (e.g. "ok, but APPLY #3"); never interrogate item-by-item, never auto-apply without the table being answered. Then: T+0 `type:design` design review (Designer sonnet/medium, **mandatory, no waiver** — `designer/bookshelf/phase3-close-gate.md`) → T+1 `type:design` PRD-requirements check (PO + user, waivable) → T+2 `type:qa` 6 security items (waivable).
- **Exit**: all close-gate tickets `done` → P4.
- **Gate = po-state generator-SoT**: this 4-step sequence is the single definition; phase entry instantiates it into po-state `close_gate` (`backlog_triage` → `design_review`[no-waiver] → `prd_check`[waivable] → `security_6`[waivable]). Define it here only — never re-enumerate elsewhere.
- **Executable literal** = `$HOME/.productune/config/close-gate.p3.json` (byte-for-byte this sequence; SoT `packages/core/config/`, mirrored by install). Hooks enforce it mechanically: `prompt-gate-inject.sh` injects + self-heals the live `close_gate` at every turn-open; `pre-phase-gate-guard.sh` BLOCKS any `current_phase` write while an item is unresolved (and blocks `waived` on a no-waiver step). A blocked transition = surface remaining items to the user, never work around the hook.
