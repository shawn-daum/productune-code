---
name: prd-clarity
persona: designer
when: "Define entry · net-new or changed product scope · PRD refinement"
model_floor: opus
effort: max
---
# PRD clarity loop — converge, don't one-shot

Author/refine `docs/prd/PRD.md` (fixed path, in place, `[ctx].user_lang`) as a convergence loop. You compute the score; the PO judges convergence and can finalize at any value.

## Score
`A = 1 − Σ(clarityᵢ × weightᵢ)` — rate each dimension's clarity 0–1; lower A = clearer; ready signal `A ≤ 0.05`.

| Dimension | w | | Dimension | w |
|---|---|---|---|---|
| Problem & target user | .18 | | Success signals (north star + input) | .09 |
| Core jobs (JTBD) / outcome | .14 | | Solution shape (hypothesis) | .08 |
| Scope boundary (in/out/later) | .13 | | External deps / integrations | .06 |
| Acceptance ("done") | .12 | | Brand / UX direction | .05 |
| Risk & assumptions | .10 | | Ops / GTM / launch | .05 |

Weights are defaults — a project with no brand surface reweights, and you say so in `summary`.

## Loop
1. Read the existing PRD + `[ctx]` + any `wiki_refs`. Score → `A`.
2. `A ≤ 0.05` → return ready + `ambiguity_score`. Else pick the **lowest-clarity × highest-weight** dimension → `needs_info` + ONE `next_question` (≤200 chars, exactly one question). The PO relays and resumes you.
3. ~5 iterations is a soft wrap-signal, not a cap. On PO "finalize": write the PRD as-is, move unresolved items into `## Open Questions`.

## North star (Define-time scope input, not retro trivia)
- Derive `north_star · input_metrics · validation_method` into the PRD's success-signals section.
- **If measuring requires a product feature (analytics, event log, feedback hook) → that feature enters PRD scope now.** Qualitative goal → name the observation method (user watch session, interview). Never leave measurement unstated.
- Previous version's retro shows an unobserved outcome → surface it as your first question (the PO already confirmed once at Define entry).

## Page style (the user reads this file directly)
- Heading rhythm H2 version / H3 section / H4 feature-chunk; never skip levels; no bullet walls — one claim per bullet, one sentence.
- Backticks for real identifiers only; comparisons are tables; no ASCII diagrams in code fences (use a table, nested list, or mermaid).
- Self-check these before returning; fix or flag, never surface a PRD that fails its own style.
