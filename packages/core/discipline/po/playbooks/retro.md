---
name: retro
persona: po
when: "Retro entry (version shipped or wrapped) · user asks to close out a version"
model_floor: opus
effort: medium
---
# Retro — close the version so the next one starts clean

Retro is a real stage, not a ceremony. Rituals here produce wiki log lines, not tickets.

## Sequence
1. **Inbox curation** — run the `curate-wiki` playbook to empty `docs/wiki/inbox.md`.
2. **Override align** — the `## Override align` section below. It runs every Retro and produces a reported result; "nothing to align" is that result, not a skip.
3. **Wiki lint** — `prdt wiki lint` + fix what it flags: orphan pages (link or fold them), superseded pages still referenced, contradiction flags left standing.
4. **Split bloated files** — the habit / playbook / contracts cap warnings from the one `prdt doctor` run step 2's inventory already made, not a fresh one: split or trim now; deferring bloat is how caps die.
5. **Write `docs/wiki/retro--v<N>.<m>.md`** — what shipped · what worked · what to change, PLUS the **outcome section**: north star + input metrics **observed value, or "unobserved + why"** — an empty outcome is a violation, silence is not an option. Update touched `feature--<slug>.md` pages' version notes. Add a **pair-clause user-inclusion counter**: how many tickets entered this round mid-build by user decision (0 is a valid count) — this is what would show the pair clause going hollow.
6. **Escalation deviations** this version (workers returned `escalate_to`, or you routed badly) → one `learning--` line each: change_meta shape → tier that actually worked.
7. **Doctor** — `prdt doctor` clean (or each warning consciously accepted, noted in the retro).
8. **Close** — `git tag v<N>.<m>` · log line in `wiki/log.md` · stage → `idle` (no next scope) or next version's `define` (scope exists). Unobserved outcomes carry forward: next Define entry asks the user ONCE.

## Override align
Both layers are injected at every session start, after every compaction and at each worker's SubagentStart — never per turn; a stale line costs bytes each time. Verdict targets: EVERY line of BOTH layers, each also read against canonical (`~/.prdt/doctrine.md` · `~/.prdt/discipline/**`) — one row per line, no sampling, no "looked fine". Every project's Retro judges the machine layer; no project owns it.
1. **Inventory** — `prdt doctor` first, ONE run that serves the whole Retro (its cap warnings are Sequence step 4's input — keep the output, don't re-run it there): its override checks hand you the >20-line layer caps, the machine-wiki page budget, and the cross-layer lines that are identical after normalization. Then enumerate EVERY line of the project layer `.prdt/overrides/*.md` and the machine layer `~/.prdt/overrides/*.md` + `~/.prdt/overrides/playbooks/*.md` (all personas), and grep each line's key words in canonical. A layer absent on disk → one line saying so; align continues on the other.
2. **Verdict per line** — exactly one of `keep · promote · canonical · amend · drop`, each with its reason plus its relation to canonical — `duplicate · covered` (a canonical clause already yields its act) `· contradicting · absent` — and, for a project-layer line, to the machine layer: `duplicate · narrower · contradicting · unrelated`. Silence is not `keep`: a project-layer line that no dispatch or return has needed since it was written is reported as a **drop candidate**, with that fact as the reason.
3. **Promote** — per line: holds on any machine, any project → `canonical`; else, for a project-layer line, holds verbatim for the other prdt projects on THIS machine → `promote`: propose the machine-layer write; on the user's confirm (step 8), add it to `~/.prdt/overrides/<persona>.md` and delete the project line in the same pass. `canonical` rows, in the project whose code repo holds `packages/core/discipline/`: one designer `inject-edit` ticket each; the override line is deleted only once the canonical line is installed. In any other project: list them in the retro page's align section as canonical candidates for the user to carry to that project's session; the lines stay.
4. **Redundant** — `duplicate` and canonical `covered` rows: propose dropping the line, and on confirm delete it + one `log.md` line. A machine-detected duplicate NEVER auto-deletes.
5. **Conflict** — `contradicting` rows: runtime already resolves them (project > machine > canonical), so your job here is exposure, not repair. Show the user both texts; they pick intentional divergence (the override line → `amend`, its reason folded in at step 8) or a stale lower rule — a stale machine line: designer `inject-edit` drafts the new machine-layer line from the existing line + the reason it fails; on the user's confirm of that draft as worded, YOU write it to `~/.prdt/overrides/<persona>.md` at step 8 — never handed to the user as a file edit; a stale canonical line → a `canonical` row (step 3). Convergence lands only on their pick.
6. **Cited-page drift** — an override line states its own constraint; a cited wiki page is evidence, nothing more. Any line of either layer whose operative meaning has migrated into the page → `amend`, so the line carries the constraint again. Cited pages are PO-writable outside the sanctioned moments, so meaning parked there drifts unreviewed.
7. **Approval evidence** — YOU verify it, here, before recording any verdict: for every **project-layer** line whose origin was "PO proposal then user approval", point at the approving turn — its `log.md` approval line, or the user's own words in the transcript. No pointer → `amend`/`drop` candidate; it never defaults to `keep`.
8. **Apply** — `promote`/`amend`/`drop` and step 5's machine-line rewrite are override writes: every line written, a verbatim `promote` included, is worded by designer `inject-edit`; user confirm, then one `log.md` line for the batch. Verdicts you couldn't get answered stay reported, not applied.
9. **Record** — the verdict table goes into the retro page's align section (an empty layer = one line saying so). That table is next Retro's baseline for "nothing has needed this line since"; without it, step 2 has nothing to measure silence against.

The machine check assists, it never decides: normalization folds em/en dashes to `-` but leaves a literal `--` alone (deliberate — it protects CLI flags inside rule text), so reworded twins and flag-bearing lines slip past it. **Zero machine findings never means zero duplicates** — the per-line read is the verdict.

## Rules
- You write the retro page yourself — it's curation of what happened, not product content.
- Don't manufacture a next version at Retro's end; idle is a valid resting state.
- A **post-close patch** (`v<N>.<m>.<p>`, rolled from `idle`) does NOT run this full sequence — it closes with one `wiki/log.md` line + an immutable `v<N>.<m>.<p>` tag, no `retro--` page. Run the `patch-cycle` playbook for it.
- Release notes on any `v*` tag cut (version close OR patch close): in the SAME change that cuts the tag, add a `## <version>` section to `<codeRoot>/docs/RELEASES.md` — never after the fact, never a nightly job (`decision--release-notes-format`).
- **README on that same cut, that same change** — `<codeRoot>/README.md` and only that file: not a meta-split project's root, not a package README (a newcomer clones the code repo, so the anchor and the reason are `RELEASES.md`'s). Release notes accumulate what CHANGED; the README states what the product IS, so it is tested against the TAGGED TREE, never against the diff — every repo path its install block names resolves there · every command it shows is one the tagged CLI still accepts · the persona and stage names it presents are the names that ship. All three already true → write nothing; a claim that is false at the tag is fixed before the tag lands.
