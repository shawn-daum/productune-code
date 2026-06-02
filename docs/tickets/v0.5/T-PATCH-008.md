---
id: T-PATCH-008
type: doctrine
status: done
assignee: designer
qa: skip
---

request_summary: Fix ticket-branch naming in git-workflow doctrine — slash-nested → hyphen-flat to eliminate git ref collision.

## Request

The existing doctrine specified ticket branches as `<version>/T-<N>-<slug>` (e.g. `v0.5/T-3-user-flow`). Git cannot store `refs/heads/v0.5` as a file and `refs/heads/v0.5/` as a directory simultaneously, so ticket-branch creation fails once any version branch exists. Change to hyphen-flat: `v<N>-T-<N>-<slug>` (e.g. `v0.5-T-3-user-flow`). Version branch name `v<N>` is unchanged.

## Acceptance

- [x] SoT line 11 table row: `` `<version>/T-<N>-<slug>` `` → `` `v<N>-T-<N>-<slug>` ``
- [x] SoT line 14 example: `` `v0.5/T-3-user-flow` `` → `` `v0.5-T-3-user-flow` ``
- [x] No other slash-nested ticket-branch reference remains in the file
- [x] Mirror (`~/.productune/doctrine/persona/po/bookshelf/git-workflow.md`) byte-identical to SoT
- [x] No actor-voice leak introduced (no history note, migration note, or design-justification added)

## Plan

1. Edit `packages/core/doctrine/persona/po/bookshelf/git-workflow.md`: replace the 2 slash-nested references (line 11 table cell, line 14 naming example) with hyphen-flat equivalents.
2. Copy the edited file to `~/.productune/doctrine/persona/po/bookshelf/git-workflow.md`.
3. Run `diff` to confirm byte-identical mirror.
4. Write this ticket as `docs/tickets/v0.5/T-PATCH-008.md`.
