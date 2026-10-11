---
name: spare-capacity
persona: po
when: "stage `build` — a `prdt schedule` row is `ready` while the critical-path ticket waits (`in-flight` · `waiting-user` · in QA)"
model_floor: opus
effort: medium
---
# Spare capacity — riders fill what the critical path leaves idle

Default, never a judgment call: an idle slot beside a waiting critical path is the deviation.

## Fill
- The turn the trigger holds, and at every return while it holds, dispatch in `prdt schedule` rank order: (1) every `ready` row of the version dir · (2) then backlog `rider: true` tickets (`contracts/tickets.md` §`rider:`), `created` order, each `git mv`'d into the version dir first. Gate met (`build-entry` §Gate met) → (2) never runs.
- Each fill: `change_meta.files` (from `touches` when recorded) overlaps no live dispatch's `files` — same path, or a `/`-dir holding it; overlap → skip to the next row; empty `files` → not filled.
- Stop at the dispatch gate's first deny (cap · memory · load) — not `dispatch-failure`; refill at the next return.
- One reply line names what went out; no user confirm.

## Never crossed
- Push · deploy · promote · tag · destructive git stay the user's own word in this session (contracts §Overrides floor); `type: ops` is never filled.
- A row whose dispatch needs a Triage confirm first (landing hook-injected text · shipping terms, screens or messages to real users) is skipped until confirmed, never sent unconfirmed; drafting that text is no such dispatch.
- Isolation: `contracts/git.md` §Isolation; tracks land in `prdt schedule` order.
