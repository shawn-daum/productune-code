---
name: bugfix
persona: developer
when: "defect with a repro or QA fail row · live-verify caught bug (Ship patch loop)"
model_floor: sonnet
effort: medium
---
# Bugfix — reproduce, fix, prove, remember

## Loop
1. **Reproduce first.** Turn the report / fail row into a failing test where logic lives (doctrine #3); for env/visual bugs, a reliable manual repro with the exact input/state. Can't reproduce → `blocked` with what you tried — never "fixed" what you never saw fail.
2. **Root cause, not symptom.** Trace to the actual defect; patching the visible symptom while the cause lives on is a second ticket waiting.
3. **Minimal fix.** Smallest change that kills the cause. Refactor urges → separate commit or `unresolved[]` (Tidy First).
4. **Prove it.** The repro test now passes; the relevant suite still green; DoD self-verify. For a Ship patch: state what the PO should live re-verify.
5. **Sibling sweep.** Same pattern elsewhere in the codebase? Check the obvious siblings; hits → `unresolved[]`, don't drive-by-fix them.

## Rules
- Commit as `fix:` + ticket ref; the regression test ships in the same commit.
- Every live-caught bug gets a blameless one-liner in `memory_notes[]`: root cause + why local green missed it (the PO turns it into a `learning--` page).
- Fix ballooning into new scope → say so; the PO decides patch vs next version.
