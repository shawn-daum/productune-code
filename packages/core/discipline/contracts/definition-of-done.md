---
name: definition-of-done
section: Definition of Done
when: "choosing the tests a done-claim runs · the change you are handing back edits discipline, agent stub, hook or override text"
---
# Contracts §Definition of Done — annex

Continues `contracts.md` §Definition of Done; binds every persona the same way, loaded on demand at the moment `when` names.

## `relevant tests` — derived from the changed files
- Changed files = the diff you hand back, staged or not. A test file is relevant when one holds: it is itself changed · it imports a changed file, directly or through imports (`vitest related <changed paths>` lists them) · its text names a changed file — the basename, extension optional (`install.sh`, `contracts.md`), or the path as `path.join` pieces (`'scripts', 'prdt'`). The union is the set: run it whole, name it in `summary` — files and counts.
- No test names a changed file → `summary` names that file as untested; the whole suite is never the substitute.
- `change_meta.user_facing` true → the set includes an automated check that drives the changed screen as a user does: render it, act on it, assert what shows, hides or moves (a button's show condition · a warning · a tab change); the tool is the project's own. None → `unresolved[]` names each such behavior, one row `unverified: <behavior>`; logic, data or API tests never stand in for it.
- A red file re-runs alone before it is reported: an assertion red alone = a failure · green alone, or a timeout in either run = contention, reported with the run it failed in and the host load.
- The whole suite has one slot — ship entry, the PO's `readiness-dispatch` — and a done-claim never waits on it. It counts green only when run after commit + mirror sync, in a detached worktree of that commit; a worker barred from committing reports its relevant set and `whole suite: unmeasured (uncommitted)`, never whole-suite green.

## Discipline · hook · override changes
- A discipline-file change is never done on a clean check alone: committed/applied ≠ effective — `discipline_root()` prefers `~/.prdt/discipline` over the repo, so it binds no persona until that mirror is resynced; verify effective with `prdt doctor`'s mirror-drift warning, not by re-reading the diff (T-507).
- Scope: the change edits `discipline/**` · `doctrine.md` · `agents/*.md` · `scripts/hooks/*.sh` · a `[prdt …]` line of `scripts/prdt_cli.py` · `.prdt/overrides/**` · `~/.prdt/overrides/**`. Done only with one ticket `evidence` line per observed case it targets:
- `- replay: <case> · before <k>/<n> · after <k>/<n>` — `<case>` = a string copied from `problem` · k = runs showing the problem · old text then new, same input · real path: every model call live (stubbed model or judge = no replay) · n ≥ 3 per arm.
- Effect shown = before k ≥ 1 and after k < before k. Else the line ends `· user 「<reply>」`: the PO puts the result to the user before close; the reply decides adoption. No replay run → `- effect not shown: <reason> · user 「<reply>」`.
- Worker: the line rides `results[]` `evidence`; the PO copies it into the ticket. A close write without it is refused (`[prdt effect check]`); `prdt tickets fmt --check` names it too.
