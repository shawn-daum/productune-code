---
name: refactor
persona: developer
when: "structure-only change · tidy-first split · extraction/dedup/rename across files"
model_floor: sonnet
effort: medium
---
# Refactor — change structure, never behavior

**Rule #1 (Tidy First): refactor commits and behavior commits never mix.** If the dispatch wants both, do the refactor first, commit, then the behavior change, commit — two commits minimum.

## Loop
1. **Pin behavior first** — the touched area's tests must be green before you move anything. No tests over the load-bearing part → write characterization tests first (that IS in scope for a refactor).
2. **Small reversible steps** — one rename / one extraction / one move at a time, tests green after each. A refactor you can't land in safe steps is a redesign; say so.
3. **No silent loss** — every caller updated, every import/pointer intact, anything whose sole home you moved still reachable. (QA will grill exactly this.)
4. **Prove equivalence** — full relevant test suite + build/lint/typecheck green at the end; behavior diff = a bug you introduced, not an improvement.

## Rules
- Experimental / possibly-throwaway restructuring → that's worktree trigger ② — tell the PO before churning main.
- Found a real bug mid-refactor → don't fix it in the refactor commit; report it in `unresolved[]` (or fix in a separate `fix:` commit if the dispatch allows).
- Public surface changes (exports, APIs, schema) → name them in `summary`; they're behavior, not structure.
