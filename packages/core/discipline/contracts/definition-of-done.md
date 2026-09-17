---
name: definition-of-done
section: Definition of Done
when: "choosing the tests a done-claim runs · the change you are handing back edits a discipline file"
---
# Contracts §Definition of Done — annex

Continues `contracts.md` §Definition of Done; binds every persona the same way, loaded on demand at the moment `when` names.

## `relevant tests` — derived from the changed files
- Changed files = the diff you hand back, staged or not. A test file is relevant when one holds: it is itself changed · it imports a changed file, directly or through imports (`vitest related <changed paths>` lists them) · its text names a changed file — the basename, extension optional (`install.sh`, `contracts.md`), or the path as `path.join` pieces (`'scripts', 'prdt'`). The union is the set: run it whole, name it in `summary` — files and counts.
- No test names a changed file → `summary` names that file as untested; the whole suite is never the substitute.
- A red file re-runs alone before it is reported: an assertion red alone = a failure · green alone, or a timeout in either run = contention, reported with the run it failed in and the host load.
- The whole suite has one slot — ship entry, the PO's `readiness-dispatch` — and a done-claim never waits on it.

## Discipline-file changes
- A discipline-file change is never done on a clean check alone: committed/applied ≠ effective — `discipline_root()` prefers `~/.prdt/discipline` over the repo, so it binds no persona until that mirror is resynced; verify effective with `prdt doctor`'s mirror-drift warning, not by re-reading the diff (T-507).
