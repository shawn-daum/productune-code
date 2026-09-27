---
name: prd-clarity
persona: designer
when: "Define entry · net-new or changed product scope · PRD refinement"
model_floor: fable
effort: high
---
# PRD clarity loop — converge, don't one-shot

Author/refine `docs/prd/PRD.md` (fixed path, in place, `[ctx].user_lang`) as a convergence loop. You compute the score and carry `A` in `summary`; a stop instruction — the user's call, relayed in a resume, no fixed word — ends the loop at any value.

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
2. The first-return gate above outranks this test — while it is unspent, no `A` value returns ready. Otherwise `A ≤ 0.05` → return ready, `A` in `summary`. Else pick the **lowest-clarity × highest-weight** dimension → `needs_info` + ONE `next_question` (≤200 chars, exactly one question). The PO relays and resumes you.
3. ~5 iterations is a soft wrap-signal, not a cap. On a stop instruction: write the PRD as-is, move unresolved items into `## Open Questions`.

## Ambiguity classification — the test, not a feeling
- Run all four conditions on every ambiguity you meet. ANY yes → it stays the user's: `needs_info` + ONE `next_question` (per habit), never a default you picked.
- ⓐ Deciding it differently changes what the user sees. ⓑ Reversing it later costs more than deciding it did — data already written needs migrating, or work already shipped needs redoing; rewriting this round's draft does not count. ⓒ It overturns a decision already recorded. ⓓ It fills a slot the recorded decisions left blank — a target number, a threshold, a cut line; an empty slot is asked about, not filled in.
- All four no → decide it yourself, and log it under `### Autonomous decisions`. A decision you made with no trace left is a violation, not efficiency.

## Autonomous decisions stay visible
- The version section carries an `### Autonomous decisions` H3 — that heading in English whatever `[ctx].user_lang` is, the lines under it in `user_lang` — one line per call you made without the user: the ambiguity, and the call you made on it.
- An empty list is valid only when no ambiguity failed all four conditions — say that in `summary`, so an empty section reads as a result and not an omission.

## as-is / to-be / reversed — the version section declares its transition
- Two H3s inside the version section, fixed byte-for-byte: `### 이 버전 직전 (as-is)` and `### 이 버전 직후 (to-be)` — one paragraph each, in `user_lang`, leading the section (the as-is is the premise the Why argues from). A receiving pipe slices on exact heading text, so append nothing: an ` — …` subtitle silently empties that column downstream.
- **Purpose — the pair carries this round's transition and nothing else.** The as-is states the condition this round is about to change; the to-be states that same condition once this round has shipped; the pair exists so a reader who arrives with no context can say what this round turns into what. Written as states, the as-is is the Problem & target user answer and the to-be the Acceptance answer.
- **Selection — the transition, not the inventory.** A fact this round does not touch stays out of the as-is however true it is; a standing fact that holds before and after belongs to the Why. Both slots say the same things in the What's order, one moving fact per sentence — a fact is one state the to-be names and the as-is contradicts; a to-be sentence a reader would have to split into two answers carries two — so every as-is sentence has the to-be sentence that answers it facing it. Carry a number only where the round moves that number, and name no ticket id or in-house label a newcomer cannot resolve — spell the act the label stands for; that material is What / Acceptance.
- **Self-check before you return them — both directions.** Bloat: those two paragraphs alone, read by someone with no context, let that reader name what changes and pair each sentence with its answer; an as-is that would survive unchanged into the next round's as-is describes the product, not the round — the inventory failure, which reads as complete while saying nothing about the transition. Omission: walk the What item by item — every state an item changes has its to-be sentence, and every to-be sentence has its as-is; a sentence with no partner gets its partner written, never cut — a pair trimmed to whatever already matched reads as tidy while dropping what the round does. Count: as-is sentences = to-be sentences = moving facts, or one of the two checks failed.
- Contrast, one round — *move the service off a hand-run VM onto managed hosting*:
  - **Inventory, fails** — as-is: *"Runs on a rented VM under PM2, with MySQL 5.7, a nightly backup cron, a CDN in front, a staging box, an error tracker and a CI build; deploys go over SSH."* Nine clauses, every one true; four move (the VM, the process manager, the CI build, the SSH deploy) and five do not, so the to-be beside it repeats five clauses to change four and the reader cannot tell which.
  - **Transition, passes** — as-is: *"Shipping means one person opening an SSH session and restarting the process by hand once CI has built it, so a bad release stays broken until that person is at a keyboard."* · to-be: *"Shipping means merging to `main`; the host builds and swaps the release itself, so anyone on the team ships and a bad release rolls back without a login."* The four moving clauses are parts of one state — how a release ships — so each side is one sentence; the database, its backup cron, the CDN, the staging box and the error tracker are absent because this round does not move them.
- **Asked, never gated.** Not a new score dimension and not an extra iteration. Spend a `next_question` only when the loop never produced that material. A PRD that declines to declare either is NOT a violation: note the gap in `summary` and move on.
- **Current open version section only.** Never add these headings to a closed `## v<N>.<m>` section, and never retro-rename past headings into them — a closed section is that round's immutable record (contracts §Fixed paths, T-546). A project with no PRD, or with no current version section, has nowhere to declare and is outside this rule, not in violation of it.
- Version section, not the document head: the values are per-version (this version's as-is is roughly the last one's to-be), the read unit is head + ONE version section, and only inside the section does immutability preserve what each round declared.
- **After the pair** — `### 이 버전이 뒤집은 것 (reversed)`, fixed byte-for-byte like the pair: one list row per reversed decision page or ticket, opening with its key (`[[decision--<slug>]]` or `T-NNN`), or the single row `- 없음`. Scope items under What are `#### <key> — <label>`; key rule and the ticket address `prd_item`: `contracts/fixed-paths.md`.

## North star (Define-time scope input, not retro trivia)
- Derive `north_star · input_metrics · validation_method` into the PRD's success-signals section.
- **If measuring requires a product feature (analytics, event log, feedback hook) → that feature enters PRD scope now.** Qualitative goal → name the observation method (user watch session, interview). Never leave measurement unstated.
- Previous version's retro shows an unobserved outcome → surface it as your first question (the PO already confirmed once at Define entry).

## What the PRD does NOT hold
- The PRD holds per-version scope estimation. A feature's CURRENT spec goes to `docs/features/<feature>.md` (contracts §Fixed paths) — write it there once the value has earned a file (a `feature:` value with no spec file is legal and the normal state) and cite it from the version section; never restate a live contract inside a version section.
- A closed `## v<N>.<m>` section is that round's immutable record: append a supersede note, never rewrite its scope. Closed sections live one per file in `docs/prd/versions/v<N>.<m>.md` (moved there byte-identical at close — contracts §Fixed paths), so `docs/prd/PRD.md` is exactly the read unit you author for: the standing head + ONE version section.

## Page style (the user reads this file directly)
- Heading rhythm H2 version / H3 section / H4 feature-chunk; never skip levels; no bullet walls — one claim per bullet, one sentence.
- Backticks for real identifiers only; comparisons are tables; no ASCII diagrams in code fences (use a table, nested list, or mermaid).
- Self-check these before returning; fix or flag, never surface a PRD that fails its own style.
