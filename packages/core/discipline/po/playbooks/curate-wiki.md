---
name: curate-wiki
persona: po
when: "stage boundary (mainly Retro entry) · inbox visibly piled up · doctor flags inbox backlog"
model_floor: opus
effort: medium
---
# Curate wiki — consolidate the inbox into living pages

Turn-close appends to `docs/wiki/inbox.md` are raw and cheap. Curation is where they become knowledge. **Default action = update an existing page, not create a new one** — ingest is mostly refreshing the 10–15 pages you already have.

## Route each inbox line — four quadrants: wiki × override, project × machine
You answer these yourself; none of them needs the user, and "unclear" is not one of the answers.
1. **Knowledge, or work?** A line stating work still to be done rather than something that stays true is a **ticket, not a page** — open it (or drop it as already done) and delete the line. A durable lesson sitting inside it still routes on below: one entry exiting twice is normal.
2. **Row — does it hold off this machine?** Carry the project to another machine and the line is still true / still needed → **project** (`docs/wiki/` · `.prdt/overrides/<persona>.md`). Tied to THIS machine's hardware, installed tools, VM, or live user session → **machine** (`~/.prdt/wiki/` · `~/.prdt/overrides/<persona>.md`). A line welding a general claim to a locally measured value is under-specified, not undecidable — split it and route each half.
3. **Column — constraint, or description?** "Violating" it is meaningless → **wiki**. A constraint earns an **override** line only with BOTH: ① violation cost is accident-grade (irreversible · real-environment pollution · security · data loss) ② nothing cues you to look the wiki up at the moment of violation (non-recall). Either one short → wiki `learning--`/`fact--`; that is the common outcome, not a consolation prize.
4. **One event, two quadrants is normal.** Facts and how-it-happened go to a wiki page; the single prohibition drawn from them goes to ONE override line citing that page (`상세: machine:fact--qa-cua-vm`). That split IS the token budget — the recurring cost (once per session start, again after each compaction, and at each worker's SubagentStart — never per turn) is the one line, the body stays pull-only.
5. **Override lines are proposals until approved.** Retro is a sanctioned moment; your writing hand is not the approval. Put layer + persona + the exact line to the user as a text question and write only on an explicit yes. No answer → the proposal stays in `inbox.md`, unwritten. Never write an override that relaxes a constraint on you, and put nothing in a `po` file that isn't the user's own words.
6. **noise** — already in git/code/PRD, or one-session trivia → drop. Drop is a routing outcome; "I can't tell" is not one. Every line left standing has a quadrant.

## Loop (per routed line)
1. **Classify within the quadrant**: decision / stable fact / routing-quality lesson / feature narrative (wiki) · prohibition (override).
2. **Find its home**: search existing pages (`prdt wiki search`, which covers both stores — `machine:` prefixes a machine page) before creating — partial match is weak across Korean/English spelling drift, so a miss on a term with a known other-language form → retry ONCE with that form before concluding "new". (2026-07-03) [T-301] Merge outcomes:
   - **refine** — the fact sharpens an existing page → edit that page in place.
   - **new** — genuinely new topic → `decision--*.md` · `fact--*.md` · `learning--*.md` · `feature--<slug>.md`, frontmatter `title · type · status: live · version · links[]`, body uses `[[wikilink]]`s. Write `title` and load-bearing terms bilingually — e.g. `배포 게이트 (deploy gate)` — so search hits from either language; apply the same when refining a monolingual title. (2026-07-03) [T-301]
   - **supersede** — contradicts a LIVE decision the user has reversed → old page `status: superseded` + link forward. A reversal the user hasn't confirmed → don't write; surface it.
   - **conflict** — contradicts a live page or live rule and no reversal happened → flag to the user, never silently pick a side. A line that only ASKS (a rule's boundary, a scope call the user owns) takes the same exit: surface it, leave it in the inbox until answered. A surfaced question is a reported outcome, not residue.
3. Delete the consumed inbox lines (they live in the pages, tickets, or override proposals now).

## Rules
- Big / irreversible decisions get user confirmation BEFORE the decision page is written.
- Cross-link related pages (`links[]` + `[[...]]`) — an unlinked page is doctor-bait (orphan).
- Root Claude auto-memory, if present, is bonus input — skim, ingest what's real, never depend on it.
- Finish with `prdt wiki reindex` (regenerates `index.md` in each store you touched) and one `log.md` line: `(date) curated N inbox lines → M pages`.

## Never
- Never author product knowledge that isn't in the inbox/returns — you curate, workers know.
- Never hand-edit `index.md` (derived) or leave a superseded page unlinked from its successor.
