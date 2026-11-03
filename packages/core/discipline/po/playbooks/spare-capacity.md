---
name: spare-capacity
persona: po
when: "stage in `rider.stages` (default `build`) — turn close or a return while a lane shows `next`/`ready` · your own merge or full suite · a 자투리 ticket closes"
model_floor: opus
effort: medium
---
# Spare capacity — the lane loop

Default, never a judgment call; stages = `rider.stages` of `[prdt state]`, absent = `build`. A gate lane with a `next`/`ready` row and nothing in flight is the deviation. One session; never a session per lane.

## Fill
- Every turn close and every return, dispatch in `prdt schedule` order: (1) `first pick` · (2) each gate lane's `next`/`ready` tickets, lane order · (3) 자투리's · (4) then one backlog pull (§Pull). Gate met (`build-entry` §Gate met) → (4) never runs.
- Listed stage ≠ `build` (`define`): only `rider: true` rows fill — (1)–(3) rows without it wait.
- Every dispatch goes out in the background; its return re-runs Fill. A `(po)` row is your own act, done now: a long run (merge · full suite · `prdt doctor`) → Bash `run_in_background`, fill, then wait — never a foreground merge.
- Full test suite = one machine slot (`suites_max`, developer/qa only), held by a merge: designer rows and impl rows on related tests (`contracts/definition-of-done.md`) go out beside it; full suite only at merge.
- Each fill: `change_meta.files` (from `touches` when recorded) overlaps no live dispatch's `files` — same path, or a `/`-dir holding it; overlap → skip to the next row; empty `files` → not filled.
- Dispatch gate's first deny (cap · memory · load) → stop filling, not `dispatch-failure`; Bash `prdt dispatch wait` with `run_in_background`, one running at a time — its exit re-runs Fill, never a wait for a return.
- One reply line names what went out, a reply on another topic included; no user confirm.

## Stop — only these, only that lane
- Lane head needs the user — an open `type: decision` (결정사항) or `assignee: user` (요청사항) blocker, or a Triage confirm (§Never crossed) → that lane waits; every other lane keeps filling.
- User's explicit stop ("퇴근", "기록만", "추가로 보내진 말자") → that turn, Bash `prdt lanes pause [<lane>…]` — the lanes it names, every lane when it names none; the lane-check hook reads only this record, never chat. Paused lane: no new dispatch; a return arriving is recorded only (ticket `## log` · inbox), no next dispatch. Their next work request → `prdt lanes resume [<lane>…]`, then fill.
- Nothing else stops a lane: a side request · a question to the user on another lane · a running merge or suite · QA on another ticket.

## Pull — the 자투리 loop
- A 자투리 ticket of the version (in no gate lane's `deps` closure) reaches `done`/`dropped`, gate not met → pull one backlog ticket that turn: `git mv` into the version dir, then fill.
- Judged at pull, never from a filing label: candidates = open `prdt tickets --backlog --status open` rows meeting `contracts/tickets.md` §`rider:` conditions now; `rider: true` = filing hint, breaks ties only.
- Shortlist ≤5 by row; read each body against current `dev` + open tickets: premise gone or duplicate → `dropped` naming the fixing commit or the duplicate ticket, never pulled.
- Rank: (1) user-reported harm, more occurrences first · (2) a cost every run pays until fixed (test · hook · merge) · (3) `touches` overlap no live dispatch · tie → `rider: true`, then `created`.
- Lane-worthy (deferring costs more · urgent) → `build-entry` §Intake fork, never pulled as 자투리.
- Reply line: `T-NNN ← backlog (자투리: <rank ground>)`; no user confirm.

## Never crossed
- Push · deploy · promote · tag · destructive git stay the user's own word in this session (contracts §Overrides floor); `type: ops` is never filled.
- A row whose dispatch needs a Triage confirm first (landing hook-injected text · shipping terms, screens or messages to real users) is skipped until confirmed, never sent unconfirmed; drafting that text is no such dispatch.
- Isolation: `contracts/git.md` §Isolation; tracks merge in `prdt schedule` order.
