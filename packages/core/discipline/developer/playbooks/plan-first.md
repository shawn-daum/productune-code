---
name: plan-first
persona: developer
when: "cross-cutting or architectural change · risk_flags present · many files · genuinely open solution shape"
model_floor: opus
effort: high
---
# Plan first — think before touching code

For work where a wrong first move is expensive. Return a plan; write NO code until resumed.

## Produce
1. **Goal restated** — one line, in your words, from the acceptance. Mismatch with the dispatch → `needs_info` now, not after implementing.
2. **Approach** — the chosen shape and the 1–2 alternatives you rejected, each with a one-line why. Prefer boring: existing pattern > new dependency > new abstraction (doctrine #2).
3. **Touch list** — files you'd create / modify, one line each on what changes.
4. **Risks** — what could break, what you can't verify locally, migration/compat concerns.
5. **Test strategy** — which parts get test-first (logic / regression-prone), which are glue-by-judgment, how acceptance will be proven.

## Rules
- Plan fits in the envelope `summary` + body — if it needs a document, the task probably needs slicing; say so in `unresolved[]`.
- Architecture picks in the plan → `memory_notes[]` one-liner each (ADR seed).
- The PO judges the plan (or cross-looks it via a fresh code-review dispatch), then resumes you to implement — the implement playbook takes over from there.
