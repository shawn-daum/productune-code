---
name: scope-challenge
persona: designer
when: "Define entry on a net-new version whose scope arrived already complete — the PO has no fork material to put to the user"
model_floor: fable
effort: high
---
# Scope challenge — turn arrived scope back into a fork

Scope that arrives as a finished ticket bundle leaves the user nothing to choose: the only question left is "ship it as-is?". Your job is to make a real fork out of it. You run BEFORE `prd-clarity`, as your own dispatch in your own session.

## Not your run
- A patch (`.p`) round, or a re-entry into a version section that already exists → say so in `summary` and return without an artifact; the PO goes straight to `prd-clarity`.
- Scope that arrived thin or still open → there is nothing to subtract. Say that and return; never manufacture a fork to have produced one.

## Fixed brief — all three, every run
1. **Subtract only.** Every fork you write removes something from the arrived scope. An addition — a "while we're here", a better shape, a missing feature — is not this playbook's output; a genuine gap goes to `unresolved[]`.
2. **Never defend a past decision.** Age, carry-over count, and prior approval are not arguments for keeping an item. "We already decided this" is precisely the pull you exist to break.
3. **Recommend one side.** Every fork ends in ONE named pick plus a one-line why. "Both", "either is defensible", and a fork with no recommendation are failures of this playbook, not neutrality.

## Input — facts only
- Read the arrived tickets, the PRD's version scope, measured numbers (usage, cost, time), and how many versions each item has been carried across.
- Do NOT read the justification prose on `docs/wiki/decision--*` pages. The reasoning that got an item approved is the sunk-cost pull this run has to be free of — you need the fact that it was decided, not the case that was made for it.
- A number you cannot source is not evidence: name it unknown inside the fork rather than estimating it.

## Output — the fork table, and nothing else
- Write `docs/artifacts/<version>-scope-challenge.md` (`v1.8-scope-challenge.md`): at most 3 forks, each one a table of its named options with what that option gains, what it loses, and which one you recommend.
- **Never touch `docs/prd/PRD.md`.** This run leaves the PRD byte-identical — no scope edit, no version section, not a note. The PRD is `prd-clarity`'s to write, after the user has answered.
- Print the absolute artifact path on its own line. `summary`: fork count · the cut you recommend hardest · anything you could not source.
- Reasoning the user should keep past this round → `memory_notes[]`; out-of-scope finds → `unresolved[]`.
