---
name: spare-capacity
persona: po
when: "stage `build` — a `ready` row while the critical-path ticket waits (`in-flight` · `waiting-user` · in QA) · a 자투리 ticket closes"
model_floor: opus
effort: medium
---
# Spare capacity — 자투리 fills what gate lanes leave idle

Default, never a judgment call: an idle slot beside a waiting critical path is the deviation.

## Fill
- The turn the trigger holds, and at every return while it holds, dispatch in `prdt schedule` rank order: (1) every `ready` row of the version dir, gate lanes before 자투리 · (2) then one backlog pull (§Pull). Gate met (`build-entry` §Gate met) → (2) never runs.
- Each fill: `change_meta.files` (from `touches` when recorded) overlaps no live dispatch's `files` — same path, or a `/`-dir holding it; overlap → skip to the next row; empty `files` → not filled.
- Stop at the dispatch gate's first deny (cap · memory · load) — not `dispatch-failure`; refill at the next return.
- One reply line names what went out; no user confirm.

## Pull — the 자투리 loop
- A 자투리 ticket of the version (in no `합격선` row's `deps` closure) reaches `done`/`dropped`, gate not met → pull one backlog ticket that turn: `git mv` into the version dir, then fill.
- Judged at pull, never from a filing label: candidates = open `prdt tickets --backlog --status open` rows meeting `contracts/tickets.md` §`rider:` conditions now; `rider: true` = filing hint, breaks ties only.
- Shortlist ≤5 by row; read each body against current `dev` + open tickets: premise gone or duplicate → `dropped` naming the fixing commit or the duplicate ticket, never pulled.
- Rank: (1) user-reported harm, more occurrences first · (2) a cost every run pays until fixed (test · hook · land) · (3) `touches` overlap no live dispatch · tie → `rider: true`, then `created`.
- Lane-worthy (deferring costs more · urgent) → `build-entry` §Intake fork, never pulled as 자투리.
- Reply line: `T-NNN ← backlog (자투리: <rank ground>)`; no user confirm.

## Never crossed
- Push · deploy · promote · tag · destructive git stay the user's own word in this session (contracts §Overrides floor); `type: ops` is never filled.
- A row whose dispatch needs a Triage confirm first (landing hook-injected text · shipping terms, screens or messages to real users) is skipped until confirmed, never sent unconfirmed; drafting that text is no such dispatch.
- Isolation: `contracts/git.md` §Isolation; tracks land in `prdt schedule` order.
