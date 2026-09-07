---
name: definition-of-done
section: Definition of Done
when: "the change you are handing back edits a discipline file"
---
# Contracts §Definition of Done — annex

Continues `contracts.md` §Definition of Done; binds every persona the same way, loaded on demand at the moment `when` names.

## Discipline-file changes
- A discipline-file change is never done on a clean check alone: committed/applied ≠ effective — `discipline_root()` prefers `~/.prdt/discipline` over the repo, so it binds no persona until that mirror is resynced; verify effective with `prdt doctor`'s mirror-drift warning, not by re-reading the diff (T-507).
