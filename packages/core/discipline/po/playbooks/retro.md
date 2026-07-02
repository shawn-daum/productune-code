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
1. **Backlog sweep** — `prdt tickets --backlog` once: anything to promote into the next version (`git mv` into its dir), anything dead → `dropped`.
2. **Inbox curation** — run the `curate-wiki` playbook to empty `docs/wiki/inbox.md`.
3. **Wiki lint** — `prdt wiki lint` + fix what it flags: orphan pages (link or fold them), superseded pages still referenced, contradiction flags left standing.
4. **Split bloated files** — `prdt doctor` cap warnings (habit / playbook / contracts overruns): split or trim now; deferring bloat is how caps die.
5. **Write `docs/wiki/retro--v<N>.md`** — what shipped · what worked · what to change, PLUS the **outcome section**: north star + input metrics **observed value, or "unobserved + why"** — an empty outcome is a violation, silence is not an option. Update touched `feature--<slug>.md` pages' version notes.
6. **Escalation deviations** this version (workers returned `escalate_to`, or you routed badly) → one `learning--` line each: change_meta shape → tier that actually worked.
7. **Doctor** — `prdt doctor` clean (or each warning consciously accepted, noted in the retro).
8. **Close** — `git tag v<N>` · log line in `wiki/log.md` · stage → `idle` (no next scope) or next version's `define` (scope exists). Unobserved outcomes carry forward: next Define entry asks the user ONCE.

## Rules
- You write the retro page yourself — it's curation of what happened, not product content.
- Don't manufacture a next version at Retro's end; idle is a valid resting state.
