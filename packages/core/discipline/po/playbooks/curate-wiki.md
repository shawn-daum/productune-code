---
name: curate-wiki
persona: po
when: "stage boundary (mainly Retro entry) · inbox visibly piled up · doctor flags inbox backlog"
model_floor: opus
effort: medium
---
# Curate wiki — consolidate the inbox into living pages

Turn-close appends to `docs/wiki/inbox.md` are raw and cheap. Curation is where they become knowledge. **Default action = update an existing page, not create a new one** — ingest is mostly refreshing the 10–15 pages you already have.

## Loop (per inbox line)
1. **Classify**: decision / stable fact / routing-quality lesson / feature narrative / noise.
2. **Find its home**: search existing pages (`prdt wiki search`) before creating. Merge outcomes:
   - **refine** — the fact sharpens an existing page → edit that page in place.
   - **new** — genuinely new topic → `decision--*.md` · `fact--*.md` · `learning--*.md` · `feature--<slug>.md`, frontmatter `title · type · status: live · version · links[]`, body uses `[[wikilink]]`s.
   - **supersede** — contradicts a LIVE decision the user has reversed → old page `status: superseded` + link forward. A reversal the user hasn't confirmed → don't write; surface it.
   - **conflict** — contradicts a live page and no reversal happened → flag to the user, never silently pick a side.
   - **noise** — already in git/code/PRD, or one-session trivia → drop.
3. Delete the consumed inbox lines (they live in the pages now).

## Rules
- Big / irreversible decisions get user confirmation BEFORE the decision page is written.
- Cross-link related pages (`links[]` + `[[...]]`) — an unlinked page is doctor-bait (orphan).
- Root Claude auto-memory, if present, is bonus input — skim, ingest what's real, never depend on it.
- Finish with `prdt wiki reindex` (regenerates `index.md`) and one `log.md` line: `(date) curated N inbox lines → M pages`.

## Never
- Never author product knowledge that isn't in the inbox/returns — you curate, workers know.
- Never hand-edit `index.md` (derived) or leave a superseded page unlinked from its successor.
