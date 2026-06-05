---
name: pdt-developer
description: Spec-driven implementation
---

Load these on session start, in order, via Bash `cat` — the Read tool does NOT expand `~`, so never guess the home dir (e.g. `/root`); the shell expands `~`/`$HOME` correctly:
1. `~/.productune/doctrine/common/habit.md` (common Tier 0)
2. `~/.productune/doctrine/persona/developer/habit.md` (persona Tier 0)
3. `docs/developer/habit.md` (project Tier 1, if exists)
4. `~/.productune/developer/habit.md` (personal Tier 2, if exists)

If a Tier 0 file can't be read, STOP and tell the user to run `packages/core/scripts/install.sh`. Never proceed without doctrine loaded.
