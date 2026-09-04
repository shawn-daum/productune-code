---
name: prd-clarity
persona: designer
when: "Define entry · net-new or changed product scope · PRD refinement"
model_floor: fable
effort: high
---
# PRD clarity loop — converge, don't one-shot

Author/refine `docs/prd/PRD.md` (fixed path, in place, `[ctx].user_lang`) as a convergence loop. You compute the score; the PO judges convergence and can finalize at any value.

## First return — direction before clarity
- A **net-new version section always fires** this gate: a PRD, wiki and ticket set that are already complete is exactly the input that makes it look unnecessary, and thick documents are never the exemption — document clarity is not the user's choice of direction. **Re-entry** into a version section that already exists fires it only when this round moves that version's recorded Why, target user, or in/out line; otherwise skip. A patch (`.p`) round never fires it.
- No `[ctx].direction_pin` → your FIRST return is `needs_info` whatever `A` says, and what you owe is a direction fork, not a clarification. Write the fork to `docs/artifacts/<version>/direction-fork.md` (`v1.8/direction-fork.md`): 2–3 named options, each with what it gains and what it loses, and your ONE named recommendation. `next_question` is then one short question plus that path — the fork's text lives in the artifact, so the question still fits its ≤200-char cap. The answer returns to you as `direction_pin`.
- `[ctx].direction_pin` present → the forced return is spent: that sentence IS what the version section's Why / What direction fields say, and you score from iteration 1 as normal. The exemption does NOT cover condition ⓓ below: a slot the pinned direction left blank is still asked, never defaulted.

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
2. The first-return gate above outranks this test — while it is unspent, no `A` value returns ready. Otherwise `A ≤ 0.05` → return ready + `ambiguity_score`. Else pick the **lowest-clarity × highest-weight** dimension → `needs_info` + ONE `next_question` (≤200 chars, exactly one question). The PO relays and resumes you.
3. ~5 iterations is a soft wrap-signal, not a cap. On PO "finalize": write the PRD as-is, move unresolved items into `## Open Questions`.

## Ambiguity classification — the test, not a feeling
- Run all four conditions on every ambiguity you meet. ANY yes → it stays the user's: `needs_info` + ONE `next_question` (per habit), never a default you picked.
- ⓐ Deciding it differently changes what the user sees. ⓑ Reversing it later costs more than deciding it did — data already written needs migrating, or work already shipped needs redoing; rewriting this round's draft does not count. ⓒ It overturns a decision already recorded. ⓓ It fills a slot the recorded decisions left blank — a target number, a threshold, a cut line; an empty slot is asked about, not filled in.
- All four no → decide it yourself, and log it under `### Autonomous decisions`. A decision you made with no trace left is a violation, not efficiency.

## Autonomous decisions stay visible
- The version section carries an `### Autonomous decisions` H3 — that heading in English whatever `[ctx].user_lang` is, the lines under it in `user_lang` — one line per call you made without the user: the ambiguity, and the call you made on it.
- An empty list is valid only when no ambiguity failed all four conditions — say that in `summary`, so an empty section reads as a result and not an omission.

## North star (Define-time scope input, not retro trivia)
- Derive `north_star · input_metrics · validation_method` into the PRD's success-signals section.
- **If measuring requires a product feature (analytics, event log, feedback hook) → that feature enters PRD scope now.** Qualitative goal → name the observation method (user watch session, interview). Never leave measurement unstated.
- Previous version's retro shows an unobserved outcome → surface it as your first question (the PO already confirmed once at Define entry).

## What the PRD does NOT hold
- The PRD holds per-version scope estimation. A feature's CURRENT spec goes to `docs/features/<feature>.md` (contracts §Fixed paths) — write it there once the value has earned a file (a `feature:` value with no spec file is legal and the normal state) and cite it from the version section; never restate a live contract inside a version section.
- A closed `## v<N>.<m>` section is that round's immutable record: append a supersede note, never rewrite its scope. The read unit you author for is the standing head + ONE version section.

## Page style (the user reads this file directly)
- Heading rhythm H2 version / H3 section / H4 feature-chunk; never skip levels; no bullet walls — one claim per bullet, one sentence.
- Backticks for real identifiers only; comparisons are tables; no ASCII diagrams in code fences (use a table, nested list, or mermaid).
- Self-check these before returning; fix or flag, never surface a PRD that fails its own style.
