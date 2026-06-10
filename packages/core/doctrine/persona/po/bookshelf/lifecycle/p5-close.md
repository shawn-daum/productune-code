# P5 — Close

- **Git**: open PR `v<N> → main`, surface to user for final approval → merge + `git tag v<N>` → delete version branch. Full: `bookshelf/git-workflow.md`.
- **In**: shipped version. Run 5a → 5b → 5c → 5d:
  - **5a** Designer (opus/xhigh): fill `outcome.observed_result`, append `docs/designer/feature-history.md` (direct write), propose next-version backlog.
  - **5b** QA (opus/xhigh): aggregate fail-patterns → `docs/qa/version-summaries/<version>.md`.
  - **5c** Designer (sonnet/medium): write `docs/retrospectives/<version>.md`.
  - **5d** PO: append the calibration line, drain `pending_promotions` to the user, run **## Master archive** below (PRD snapshot → `docs/prd/versions/<v>.md` + DS snapshot — the `pre-phase-gate-guard.sh` hook BLOCKS the `ended_at` close write until the PRD snapshot exists).
- **Mechanism**: `outcome.observed_result` lazy-fills (null if not yet observable); the next version's P1 picks up the null + `validation_method` and asks the user.
- **Exit**: version archived; next version's P1 opens.

## Retrospective read sources (P5)

At 5a/5b/5c read stored memory only; never spawn fresh analysis (for every `~`-path below, resolve `$HOME` first + `cat` via Bash — the Read tool does NOT expand `~`, never guess home):
1. project notes — `docs/{designer,developer,qa}/bookshelf/*.md`
2. po-state `recent_turns` — rolling 5
3. global persona memory — `$HOME/.productune/<persona>/{habit,bookshelf}.md` (file-read ahead, inject via `[ctx]`)
4. po-memory — `$HOME/.productune/po/habit.md` + `$HOME/.productune/po/bookshelf/calibration-log.md`
5. approved-promotion archive — `pending_promotions[]` with `status ∈ {approved, edited}` ∧ `decided_at ∈ [version.started_at, version.ended_at]`

## Outcome measurement

Append-only; never blocks lifecycle.
- **Per-version** (required `versions[].outcome`): `north_star`, `input_metrics[]`, `validation_method` — Designer derives from the ready PRD, emits via `version_outcome` in the ready-turn JSON; mirror into state. `observed_result`, `retrospective_path` filled at P5.
- **Lazy protocol**: when `validation_method` needs external data (PostHog / Sentry / GA), leave `observed_result: null` at P5; Designer chases it in the next version's P1. Never remind. No next version → it never runs.

## Master archive at version close

Snapshots are INTERNAL archival records, not user-gate deliverables — they live in their
SoT homes, never `docs/artifacts/` (criterion = user-gate; manifest lint enforces).
The PRD snapshot is what the GUI PrdSection shows for a closed version.

```bash
mkdir -p docs/prd/versions docs/designer/archive
cp docs/prd/PRD.md "docs/prd/versions/$VERSION.md"
cp docs/designer/design-system.md "docs/designer/archive/design-system-$VERSION.md"
```

After the snapshot, prune the master `docs/prd/PRD.md` for the next version: collapse the
closed version's section to a one-line pointer at `versions/$VERSION.md` (delegate Designer —
content work); the master always reads as the CURRENT picture.
