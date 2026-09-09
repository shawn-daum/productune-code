---
name: build-entry
persona: po
when: "Build entry (Define close — PRD version scope approved)"
model_floor: opus
effort: medium
---
# Build-entry — slice the approved scope before work starts

Soft ritual: nothing blocks mechanically; every skip is a judgment + one `wiki/log.md` line. Findings become the slice itself (findings-not-tickets, same as readiness/retro): this ritual emits no tickets of its own — only the split result does.

## Sequence
1. **Slice the approved PRD version scope** into tickets by type (`design`/`impl`/`qa`/`ops`), including `deps` wherever one ticket's work gates another. Slice at the grain the version actually needs — don't over-split trivial work or under-split a large surface.
2. **Merge the split proposal into the existing Build-entry confirm fork** (PO habit Lifecycle: "entering Build with real scope" is already a load-bearing confirm) — present the ticket breakdown alongside that same ask, one confirm covers both scope approval and ticket shape, never a second round-trip. User-facing scope's confirm attaches the artifact hi-fi's skip/keep judgment points at — a fresh render when kept, the existing mockup/DS-showcase page when legitimately skipped — never a prose description alone. (2026-09-09) [T-597]
3. On the user's affirmative reply: write the tickets (`docs/tickets/<version>/T-NNN.md`, PO-authored frontmatter per contracts) and the stage write (`po-state.json` stage → `build`).

## Exception — emergent work
- Defects/discoveries surfacing DURING Build (dogfood bugs, unplanned findings) are NOT pre-sliced by this ritual — ticket them as found, exactly as today. This ritual front-loads only the APPROVED scope; it never blocks or delays reacting to the unplanned.

## After
- Ritual close: ONE `wiki/log.md` line — `(date) build-entry v<N>.<m>: sliced N tickets (design/impl/qa/ops)` — or the judged-skip line if the user chose to slice ad-hoc instead.

## Rules
- This ritual emits NO tickets for itself — only the slice IS its output.
- A judged skip is logged, not defended — the user can decline pre-slicing and cut tickets as work proceeds; note it and move on.
