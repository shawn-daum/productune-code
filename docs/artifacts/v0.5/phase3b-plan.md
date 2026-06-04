# v0.5 Phase 3-B — Patch Plan (UI review follow-up)

> Source: PO hands-on UI review of the Phase-3 Build GUI (13 items). PO triaged + investigated
> each; this plan groups them into 7 tickets and is grounded in code (paths verified on disk).
> GUI app = `packages/gui/`. Tickets → `docs/tickets/v0.5/`.

## Numbering decision

- Bug / migration fixes → `T-PATCH-009 … T-PATCH-011` (continues from T-PATCH-008).
- Genuinely new features → `T-022 … T-025` (type `build`, continues from T-021).

## Grounding highlights (what code confirmed)

- **#11** dead path is real: `~/.productune/po-memory.md` is referenced at `PersonaDefTab.tsx:68`,
  `TeamWikiTab.tsx:91`, `en.json:110`, `ko.json:110`, and re-seeded in `onboarding.ts:466-468`.
  Verified 4-tier model on disk: each persona's Tier-2 long-term memory is now
  `~/.productune/<persona>/habit.md` (PO = `~/.productune/po/habit.md`, confirmed present).
- **#5b** wiki-keeper leak is real: `helpers.ts:146 PERSONAS` still lists `'pdt-wiki-keeper'`, and
  it is mapped to a PO dot at `helpers.ts:284`. Full wiki surface still present (TeamWikiTab,
  Step3_WikiBackend, Step3_5_LocalLLM, onboarding/types, workspace store `wiki` refs).
  Answer to user: the wiki tier is **abolished** (T-017) — remove the surface.
- **#5a** id-mismatch is real: palette emits `persona:pdt-*` slugs but downstream uses short ids
  `po|designer|dev|qa` in places, and `dev` vs `developer` differ. `settings.ts:19`
  allowlist = `pdt-po|pdt-designer|pdt-developer|pdt-qa` (note: no `pdt-wiki-keeper`, so the
  abolished entry hard-fails "unknown persona").
- **#7** is a **detection bug, not "genuinely none"**: `~/.claude.json` `projects[<productune dir>].mcpServers`
  contains `playwright`, yet the GUI shows "No MCP servers". `mcp:getServers` (mcp.ts:70) keys the
  local tier by exact `projectDir` — likely a path-normalization / projectDir-not-passed mismatch.
  Also `graphiti` (referenced in PersonaDefTab `mcpServers`) is not registered anywhere — genuine gap.
- **#1/#2** project-tab: `onSelectActivity('project')` (WorkspaceShell.tsx:191) only sets the icon;
  the auto-open of version-history / current-version tabs happens in the project panel render path
  (`SidePanelCurrentVersion` / `handleVersionClick`). Fix = decouple icon-click from tab-open.
- **#3** project switch goes through `setProject` (store workspace.ts:263) which does NOT reset
  `panes` — previous project's tabs persist. Fix = reset pane tree + open new current-version tab on switch.
- **#9** `useKeyboardShortcuts.ts:91-98` caps at `n>=1 && n<=4` — extend to `<=9`.
- **#13** zoom exists only in `ArtifactMermaidTab`; the md/detail artifact viewer has none.

## Ticket groups

| id | title | items | assignee | qa | design | complexity | risk_flags |
|----|-------|-------|----------|----|--------|-----------|------------|
| T-PATCH-009 | GUI doctrine-migration debt + MCP detection | #11, #5a, #5b, #7 | pdt-developer | yes | no | L5 | dead-path, enum-drift, broad-component-touch, onboarding-seed |
| T-PATCH-010 | Tab / pane behavior fixes | #1, #2, #3, #8 | pdt-developer | yes | no | L4 | pane-tree-reset, auto-open-coupling |
| T-PATCH-011 | issue-tracker unknown-status investigation | #12 | pdt-developer (spike→fix) | yes | no | L2 | cross-project-schema |
| T-022 | Small UI additions (tab shortcut + artifact zoom) | #9, #13 | pdt-developer | yes | light | L3 | none |
| T-023 | Tab overflow shrink + drag-to-edge auto-split | #4 | pdt-designer→pdt-developer | yes | YES | L6 | dropzone-ux, drag-state, controls-encroach |
| T-024 | Explorer code-content search | #6 | pdt-designer→pdt-developer | yes | YES | L5 | search-perf, scope-ux, new-ipc |
| T-025 | SPIKE: session/weekly usage feasibility | #10 | spike (pdt-developer) | no (spike) | no | L2 | data-accessibility-unknown |

## Notes per group

- **A (T-PATCH-009)** folds #7 in (PO option "own or fold into A"): it is a confirmed
  doctrine-migration-era detection bug, same family as #11/#5. Keep #7 as a delimited section
  with an investigation step (confirm projectDir key mismatch) before fixing.
- **B (T-PATCH-010)** keeps the #1/#2 (click = no auto-open) vs #3 (switch = reset + open new
  current-version) distinction explicit; #8 (hide empty past-versions) rides along — same panel.
- **C (T-023)** is the largest, design-bearing piece. Two sub-parts kept in ONE ticket per user
  decision: (a) Chrome-style tab shrink that never encroaches the right-side split/close controls;
  (b) cmux/VS-Code drag-tab-to-edge auto-split with quarter/half drop-zones. Note an existing
  tab-reorder DnD already lives in `TabBar.tsx` (DRAG_MIME, dragHint) and pane split primitives
  exist in the store (`splitRight`/`splitDown`, `moveTab`) — designer details the drop-zone UX,
  dev reuses these primitives.
- **D (T-022)** is two trivially-scoped additions; "light" design = confirm zoom-button placement
  + step against design-system tokens, no full mockup.
- **E (T-024)** design-bearing: input + results list + scoping (current dir / whole project),
  open-at-match. New IPC for full-text search.
- **F (T-025)** is a SPIKE: do NOT assume buildable. Determine if Claude subscription session/weekly
  usage is readable (API response headers / `claude` CLI / status), then either scope impl or report
  the fallback. #12 is its own small investigation (T-PATCH-011) since it's a data/schema question,
  not a feature.

## Open questions

- None blocking. Designer must detail Plan for T-023 (drop-zone UX) and T-024 (search UX) at design
  time; both tickets carry full Request + Acceptance now.
