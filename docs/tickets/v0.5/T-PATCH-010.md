---
ticket_id: T-PATCH-010
version: v0.5
phase: 3
type: bug
status: done
assignee: pdt-developer
estimated_complexity: L4
qa: true
qa_status: pass
qa_loops: 1
completed_at: 2026-06-04
risk_flags: pane-tree-reset, auto-open-coupling
slug: tab-pane-behavior
---

# T-PATCH-010: Tab / pane behavior fixes (#1, #2, #3, #8)

> Phase 3-B patch. Four pane/tab behaviors from the UI review. Keep the click-vs-switch
> distinction explicit (see #1/#2 vs #3).

## Request

### #1 — project-tab click should NOT open version-history
Clicking the ActivityBar "project" icon also opens the version-history tab. It must not.
`onSelectActivity('project')` (`WorkspaceShell.tsx:191`) should only set the active icon; the
version-history tab opens only via an explicit past-version row click (`handleVersionClick`,
`LeftSidebar.tsx:78`).

### #2 — project-tab click should NOT auto-open current-version tab
Same icon-click also auto-opens the current-version tab. Decouple: selecting the project icon
renders the side panel only; no main-panel tab is auto-opened on icon-click. (Current-version tab
opens only on explicit user action, or on project SWITCH per #3.)

### #3 — project SWITCH must reset panes + open new current-version tab
Opening a different project via File→Open Project leaves the previous project's main-panel tabs
open. On project switch, reset the pane tree (close all tabs) and open the NEW project's
current-version tab.
- Site: `store/workspace.ts:263` `setProject` does not touch `panes`. Reset `panes` to a fresh
  empty leaf (see `makeEmptyLeaf(INIT_PANE_ID)`, `:255`) on switch, then open the new project's
  current-version tab. Distinguish from #1/#2: switch = reset + open; icon-click = nothing.

### #8 — hide empty past-versions area
When a project has no past versions, hide the past-versions area entirely.
- Site: `LeftSidebar.tsx:130` renders `SidePanelPastVersions` unconditionally. Render it only when
  the project has ≥1 past version.

## Acceptance

- [ ] **[AC-1]** Clicking the project ActivityBar icon opens NO version-history tab.
- [ ] **[AC-2]** Clicking the project ActivityBar icon auto-opens NO current-version tab.
- [ ] **[AC-3]** Switching projects (File→Open Project) closes all previous tabs and opens the new
      project's current-version tab; no stale tabs remain.
- [ ] **[AC-4]** With zero past versions, the past-versions area is not rendered.
- [ ] **[AC-5]** `pnpm tsc --noEmit` passes.

## Plan

1. Audit where project-icon selection triggers `openTab` (WorkspaceShell `onSelectActivity` +
   SidePanelCurrentVersion mount/auto-open) and remove the auto-open coupling (#1, #2).
2. In `setProject`, reset `panes` to a fresh empty leaf and open the new current-version tab (#3).
   Guard so this fires on actual project change, not same-project re-set.
3. Conditionally render `SidePanelPastVersions` on past-version count > 0 (#8).

## Out of scope

- Tab overflow / drag-split (T-023); pane persistence across app restarts.
