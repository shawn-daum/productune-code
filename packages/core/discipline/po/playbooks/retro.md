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
Both override layers are injected once per session start (and again after every compaction), plus once at each worker's SubagentStart — never per turn. A stale line still costs bytes every one of those times, a real recurring cost, and silence hides it. The verdict target is the PROJECT layer — report one row per project-layer line, no sampling, no "looked fine". The machine layer is read as reference and is judged only in the project that owns it.
1. **Inventory** — `prdt doctor` first, ONE run that serves the whole Retro (its cap warnings are Sequence step 4's input — keep the output, don't re-run it there): its override checks hand you the >20-line layer caps, the machine-wiki page budget, and the cross-layer lines that are identical after normalization. Then enumerate EVERY line of the **project** layer `.prdt/overrides/*.md` (all personas) — these are the verdict targets. Read `~/.prdt/overrides/*.md` alongside as reference only, for step 2's relation and step 3's promote comparisons — it is never itself walked for a verdict. No project layer on disk → report "project layer absent" and align ends there.
2. **Verdict per project-layer line** — exactly one of `keep · promote · amend · drop`, each with its reason plus its relation to the machine layer (read as reference, never itself verdicted): `duplicate · narrower · contradicting · unrelated`. Silence is not `keep`: a project-layer line that no dispatch or return has needed since it was written is reported as a **drop candidate**, with that fact as the reason.
3. **Promote** — per line, "does this hold verbatim for the other prdt projects on THIS machine?" Yes → propose the machine-layer write; on the user's confirm, add it to `~/.prdt/overrides/<persona>.md` and delete the project line in the same pass.
4. **Redundant** — `duplicate` rows: propose dropping the project line, and on confirm delete it + one `log.md` line. A machine-detected duplicate NEVER auto-deletes.
5. **Conflict** — `contradicting` rows: runtime already resolves them project-wins, so your job here is exposure, not repair. Show the user both texts; they pick intentional divergence (the project line gains a reason comment) or a stale machine rule (they update the machine layer). Convergence lands only on their pick.
6. **Cited-page drift** — an override line states its own constraint; a cited wiki page is evidence, nothing more. Any project-layer line whose operative meaning has migrated into the page → `amend`, so the line carries the constraint again. A machine-layer line that has drifted this way is the owning project's to fix, not this one's — reference reading never produces a verdict. Cited pages are PO-writable outside the sanctioned moments, so meaning parked there drifts unreviewed.
7. **Approval evidence** — YOU verify it, here, before recording any verdict: for every **project-layer** line whose origin was "PO proposal then user approval", point at the approving turn — its `log.md` approval line, or the user's own words in the transcript. No pointer → `amend`/`drop` candidate; it never defaults to `keep`.
8. **Apply** — `promote`/`amend`/`drop` are override writes: user confirm, then one `log.md` line for the batch. Verdicts you couldn't get answered stay reported, not applied.
9. **Record** — the verdict table goes into the retro page's align section (an empty layer = one line saying so). That table is next Retro's baseline for "nothing has needed this line since"; without it, step 2 has nothing to measure silence against.

The machine check assists, it never decides: normalization folds em/en dashes to `-` but leaves a literal `--` alone (deliberate — it protects CLI flags inside rule text), so reworded twins and flag-bearing lines slip past it. **Zero machine findings never means zero duplicates** — the per-line read is the verdict.

## Rules
- You write the retro page yourself — it's curation of what happened, not product content.
- Don't manufacture a next version at Retro's end; idle is a valid resting state.
- A **post-close patch** (`v<N>.<m>.<p>`, rolled from `idle`) does NOT run this full sequence — it closes with one `wiki/log.md` line + an immutable `v<N>.<m>.<p>` tag, no `retro--` page. Run the `patch-cycle` playbook for it.
- Release notes on any `v*` tag cut (version close OR patch close): in the SAME change that cuts the tag, add a `## <version>` section to `<codeRoot>/docs/RELEASES.md` — never after the fact, never a nightly job (`decision--release-notes-format`).
- **README on that same cut, that same change** — `<codeRoot>/README.md` and only that file: not a meta-split project's root, not a package README (a newcomer clones the code repo, so the anchor and the reason are `RELEASES.md`'s). Release notes accumulate what CHANGED; the README states what the product IS, so it is tested against the TAGGED TREE, never against the diff — every repo path its install block names resolves there · every command it shows is one the tagged CLI still accepts · the persona and stage names it presents are the names that ship. All three already true → write nothing; a claim that is false at the tag is fixed before the tag lands.
