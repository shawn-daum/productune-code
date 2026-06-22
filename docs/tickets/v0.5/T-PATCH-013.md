---
ticket_id: T-PATCH-013
version: v0.5
phase: 3
type: impl
status: done
assignee: pdt-developer
estimated_complexity: L4
risk_flags: [auto-open-coupling, store-persistence, rehydrate-switch-collision]
qa: true
qa_status: pass
qa_loops: 1
slug: tab-pane-behavior-r2
---

# T-PATCH-013: Tab / pane behavior fixes round 2 (#1 regression, #2 follow-up, refresh persistence)

> Follow-up to T-PATCH-010. T-PATCH-010 fixed only the ActivityBar icon-click path for #1,
> but the real trigger is the current-version CARD click, which is still wired to
> `handleVersionClick` and still opens the version-history tab. Plus two new items:
> ActivityBar active-state consistency after project switch, and cmd-R reload session restore.

## Request

### B1 (REGRESSION of T-PATCH-010 #1) — current-version card click ALSO opens version-history tab
Clicking the current-version item in the project side panel opens BOTH the intended
`ticket-review` tab AND an unwanted `version-history` tab. version-history must open ONLY on an
explicit PAST-version row click.

Root cause (pin):
- `LeftSidebar.tsx:141` — the `SidePanelCurrentVersion` `onSelect` prop is wired to
  `onSelect={(id) => handleVersionClick(id)}`, the SAME dispatcher used by past-version rows.
- `LeftSidebar.tsx:78-96` — `handleVersionClick` UNCONDITIONALLY calls `openTab('version-history:main', 'version-history', ...)`
  (or `version-unassigned:main`) and dispatches the `version-select` event.
- `SidePanelCurrentVersion.tsx:101-110` — the card's own `onClick` already opens the correct
  `ticket-review:<cv>` tab AND calls `onSelect(currentVersionId)`. Because `onSelect` === `handleVersionClick`,
  the version-history tab is opened as a side effect of every current-version card click.

T-PATCH-010 changed `WorkspaceShell.onSelectActivity` (`WorkspaceShell.tsx:211-218`) so the icon click
no longer opens version-history — but the card-click path was never decoupled. The current-version
card must select (set `selectedVersionId`) WITHOUT going through `handleVersionClick`'s
version-history `openTab`.

### B2 (follow-up to T-PATCH-010 #3) — ActivityBar must reflect "project tab active" after switch
On project switch, panes reset and the new current-version `ticket-review` tab opens correctly
(`WorkspaceShell.tsx:138-159`), but `activeIcon` local state (`WorkspaceShell.tsx:105`) is NOT
re-asserted to `'project'`. If the user had a different icon active (e.g. `explorer`, `versions`)
before switching, the side panel stays on the old icon while the main panel shows the new project's
current-version tab — inconsistent state.

Root cause (pin):
- `WorkspaceShell.tsx:105` — `activeIcon` is component-local `useState`, never reset on switch.
- `WorkspaceShell.tsx:131-136` — the switch-detection effect sets `pendingSwitchTabRef` but does not
  touch `activeIcon`.

### B3 — cmd-R reload resets workspace to fresh state (lost tabs / pane tree / active project context)
A renderer reload (cmd-R) re-runs the bundle from scratch. The `useWorkspace` zustand store
(`store/workspace.ts:255`) is a plain `create()` with NO `persist` middleware, so `panes`,
`activePaneId`, `nextPaneSeq`, `selectedVersionId` are in-memory only and reset to
`makeEmptyLeaf(INIT_PANE_ID)` on every reload. Only the active PROJECT survives, via
`localStorage 'productune.lastProject'` (`App.tsx:28-37, 42-47`). Result after cmd-R: project is
restored but all open tabs and the pane split tree are gone.

Note: T-PATCH-010 marked "pane persistence across app RESTART" out of scope. cmd-R renderer reload
is IN scope here (process stays alive; only the renderer reloads).

Root cause (pin):
- `store/workspace.ts:255` — `create<WorkspaceState>((set, get) => ({ ... }))` with no persistence.
- Pane-bearing state initialized fresh at `store/workspace.ts:266-270`.

Switch/rehydrate collision risk (must handle): on reload, `App.tsx` restores `project` from
localStorage, then `WorkspaceShell` mounts and its switch-detection effect
(`WorkspaceShell.tsx:131-136`) sees `prevProjectDirRef.current === null !== project.projectDir`,
treats it as a SWITCH, and would reset panes + open current-version tab — clobbering any rehydrated
pane tree. The fix must make the rehydrate path NOT be treated as a fresh switch, OR rehydrate AFTER
and override the switch reset for the same project.

## Acceptance

- [ ] **[AC-1]** Clicking the current-version card in the project side panel opens ONLY the
      `ticket-review:<cv>` tab. No `version-history` / `version-unassigned` tab is opened, and no
      stray `version-select` event for the current version fires from the card click.
- [ ] **[AC-2]** Clicking a PAST-version row still opens the `version-history` (or
      `version-unassigned`) tab and dispatches `version-select` (unchanged behavior, no regression).
- [ ] **[AC-3]** After a project switch (File→Open Project / Open Recent), the ActivityBar shows
      the `project` icon active, regardless of which icon was active before the switch.
- [ ] **[AC-4]** After cmd-R renderer reload with the same project: open tabs, the pane split tree,
      `activePaneId`, and `selectedVersionId` are restored to their pre-reload state (not reset to a
      single empty leaf).
- [ ] **[AC-5]** After cmd-R reload, the restore path does NOT additionally open a duplicate
      current-version tab nor reset panes (no switch/rehydrate collision).
- [ ] **[AC-6]** A genuine project SWITCH (to a different projectDir) still resets panes and opens
      the new project's current-version tab (T-PATCH-010 #3 preserved).
- [ ] **[AC-7]** `pnpm tsc --noEmit` passes green (run from `packages/gui`).

## Plan

### B1 — decouple current-version card select from version-history openTab
- Edit `SidePanelCurrentVersion.tsx`: keep the card's own `ticket-review` `openTab`
  (`:101-110`, `:119-129`), but change `onSelect` so it ONLY sets the selected version id, not the
  history tab. Simplest: change the `onSelect` prop semantics to "select only" and pass
  `setSelectedVersionId` for the current card.
- Edit `LeftSidebar.tsx:137-142`: change the current-version block's `onSelect` from
  `(id) => handleVersionClick(id)` to `(id) => setSelectedVersionId(id)` (selection only; the card
  already opens its own `ticket-review` tab). Leave `SidePanelPastVersions` `onSelect`
  (`LeftSidebar.tsx:143-149`) wired to `handleVersionClick` unchanged.
- Keep `handleVersionClick` (`LeftSidebar.tsx:78-96`) intact for past-version rows only.

### B2 — assert activeIcon='project' on project switch
- Edit `WorkspaceShell.tsx:131-136` switch effect: when `isSwitch` is true, also call
  `setActiveIcon('project')`. (Do this only on a true switch — i.e. previous dir was non-null and
  differs — to avoid forcing 'project' on the cmd-R rehydrate path; coordinate with B3's switch
  guard below.)

### B3 — persist + rehydrate workspace pane/tab/version across cmd-R reload
- Edit `store/workspace.ts`: wrap the store in zustand `persist` middleware
  (`import { persist, createJSONStorage } from 'zustand/middleware'`). Use `sessionStorage`
  (survives cmd-R, cleared on app quit — keeps "across RESTART" out of scope per T-PATCH-010) with
  a `partialize` that persists ONLY serializable workspace shape: `panes`, `activePaneId`,
  `nextPaneSeq`, `selectedVersionId`. Do NOT persist `messages`, `poState`, `streaming`,
  `inFlight*`, `dragHint`, `tabDragActive`, `project` (project is owned by App.tsx localStorage).
  - Persist key should be project-scoped (e.g. include projectDir) so a different restored project
    does not rehydrate another project's pane tree. If scoping is non-trivial with `persist`,
    alternative: store under a single key but on rehydrate compare a persisted `projectDir` marker
    against the active project and discard if mismatched.
- Resolve the switch/rehydrate collision in `WorkspaceShell.tsx:131-159`:
  - The fresh-mount case (`prevProjectDirRef.current === null`) after a cmd-R reload for the SAME
    project must NOT trigger the pane reset / current-version auto-open. Distinguish "first mount
    with rehydrated panes for this project" from "user switched to a different project."
  - Concretely: gate `pendingSwitchTabRef.current = true` (`WorkspaceShell.tsx:134`) so it only
    fires when there is no rehydrated pane state for the current projectDir (i.e. panes are the
    empty initial leaf) OR the previous dir was a real different project. Read rehydrated state via
    `useWorkspace.getState().panes` to decide.
  - Mirror the same guard for B2's `setActiveIcon('project')` so reload does not force the icon.
- `setProject` switch branch (`store/workspace.ts:278-302`) already resets panes on real switch;
  ensure the persist `partialize`/merge does not re-clobber a real switch (persist rehydrates on
  store creation = once per reload, before any switch, so order is fine — but verify the merge does
  not overwrite a post-switch reset).

## Out of scope

- Pane persistence across full app RESTART / quit (sessionStorage intentionally clears on quit).
- Tab overflow / drag-split behavior (T-023).
- Persisting `messages` / PO chat scrollback (loaded from fs via IPC on mount, `LeftSidebar.tsx:43-54`).
- Multi-window pane sync.
