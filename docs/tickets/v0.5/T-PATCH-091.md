---
ticket_id: T-PATCH-091
version: v0.5
slug: ui-prefs-zoom-density-statusbar-visibility
title: "UI prefs — zoom / UI density + status bar visibility toggle"
type: impl
status: done
phase: 3
assignee: pdt-developer
requires_qa: true
requires_user_gate: false
area_tag: gui-settings-ui
estimated_complexity: L2
risk_flags:
  - webContents-zoom-must-persist-across-window-recreate
  - zoom-applies-to-all-windows-not-just-mainWindow
  - status-bar-grid-area-collapse-must-not-break-grid-layout
  - statusbar-hides-project-slug-dropdown-and-health-segment
created_at: 2026-06-10T00:00:00Z
---

# T-PATCH-091: UI prefs — zoom / UI density + status bar visibility toggle

## Request

Followup D7 — remaining two of four approved preferences.

**R3 — Zoom / UI density.** Persist `webContents.setZoomFactor()` across sessions.
User adjusts via a stepper in General Settings (80–150%, step 10%). Default 100%.
Note: View menu already has Role-based zoomIn/zoomOut/resetZoom (main.ts
buildAppMenu) but these are not persisted. This ticket persists the zoom factor
via settings.json and restores it on window creation.

**R4 — Status bar visibility toggle.** The `StatusBar` component
(`packages/gui/src/components/workspace/StatusBar.tsx`, grid area `status`,
28 px bottom bar in `WorkspaceShell.tsx`) can be hidden. Toggle in General Settings.
Default on (visible). When hidden the grid row collapses to 0 height.

## Acceptance

### Schema — packages/core/src/settings/ui-settings.ts

- AC-1: Add `zoomFactor: number` and `statusBarVisible: boolean` to the `ui` block.
  Update DEFAULT_SETTINGS: zoomFactor: 1.0, statusBarVisible: true.
  Read-merge in loadSettings():
  - zoomFactor: if typeof parsed?.ui?.zoomFactor === 'number' AND in [0.8, 1.5]
    use it; else 1.0. Clamp on read — corrupt value resets to default.
  - statusBarVisible: boolDefault pattern (missing -> true; explicit false -> false).

- AC-2: Add 4 typed helpers (atomic-tmp-rename, same as existing):
  getZoomFactor, setZoomFactor, getStatusBarVisible, setStatusBarVisible.

### IPC — packages/gui/electron/ipc/settings.ts

- AC-3: Register 4 handlers: settings:getZoomFactor, settings:setZoomFactor,
  settings:getStatusBarVisible, settings:setStatusBarVisible.
  setZoomFactor handler: after saveSettings, call applyZoomToAllWindows(v).
  All try/catch wrapped.

- AC-4: applyZoomToAllWindows (module-private):
  iterate BrowserWindow.getAllWindows(); for each non-destroyed window,
  call win.webContents.setZoomFactor(factor).
  Import BrowserWindow from electron (add if not already in scope in this file).

### Preload — packages/gui/electron/preload.ts

- AC-5: Expose 4 bridge methods: getZoomFactor, setZoomFactor,
  getStatusBarVisible, setStatusBarVisible (same get/set pattern as existing prefs).

### Main process — packages/gui/electron/main.ts

- AC-6: In createWindow(), after BrowserWindow construction, apply persisted zoom:
  ```
  const zf = getZoomFactor()
  if (zf !== 1.0) win.webContents.setZoomFactor(zf)
  ```
  Import getZoomFactor from @productune/core.
  Add code comment: View-menu role:zoomIn/zoomOut/resetZoom also call setZoomFactor
  internally but do NOT persist to settings.json — accepted for v0.5.

### GeneralSettings UI — packages/gui/src/components/workspace/GeneralSettings.tsx

**Zoom stepper (R3)**

- AC-7: Append zoom stepper row to the App section introduced by T-PATCH-090.
  If T-090 lands first: add after its two ToggleRows. If landing in parallel:
  T-090 creates the section header + its rows; T-091 appends. Developer
  coordinates the merge; neither ticket edits the other's rows.

- AC-8: Zoom row — NOT a ToggleRow. Custom inline row:
  Left: label (settings.app.zoom) + desc (settings.app.zoomDesc).
  Right: [−] button + percentage display + [+] button.
  Step: 0.1 zoom factor (10 pp). Range: 0.8 to 1.5.
  Display: Math.round(zoomFactor * 100) + '%'.
  Minus disabled (opacity 0.3, pointerEvents none) at 0.8.
  Plus disabled at 1.5.
  On step: update local state + call api.setZoomFactor(next) — zoom applied
  to all windows immediately by the main-process handler (AC-4). No debounce.

- AC-9: Load zoomFactor on mount (add to the shared Promise.all useEffect
  from T-090, or create one if T-090 has not landed).

**Status bar toggle (R4)**

- AC-10: statusBarVisible is a renderer-side concern. The pref is loaded from IPC
  on mount and managed via the zustand workspace store. Changes are applied
  immediately and persisted via IPC.

- AC-11: Add a ToggleRow in the App section:
  label: t('settings.app.statusBar')
  desc:  t('settings.app.statusBarDesc')
  checked: statusBarVisible (from workspace store)
  onToggle: handleStatusBarToggle

- AC-12: Lift statusBarVisible to the workspace store
  (packages/gui/src/store/workspace.ts). Add:
  statusBarVisible: boolean  // default true
  setStatusBarVisible: (v: boolean) => void
  This avoids prop-drilling; the store already owns UI state (project, phase, etc.).

- AC-13: WorkspaceShell.tsx reads statusBarVisible from the workspace store.
  When false: collapse the status grid row. Preferred mechanism:
  Add explicit gridTemplateRows to the dynamicGrid style object, with the status
  row height conditional. The current gridTemplateAreas defines 3 row bands
  (breadcrumb / center / status). Add:
  gridTemplateRows: statusBarVisible ? 'auto 1fr 28px' : 'auto 1fr 0px'
  AND wrap the StatusBar in a div with overflow:'hidden' so it clips at 0 height
  without a dangling empty cell.

- AC-14: handleStatusBarToggle in GeneralSettings.tsx:
  Update local state + call api.setStatusBarVisible(next) + call
  useWorkspace.getState().setStatusBarVisible(next) so the change is immediate
  (no reload required). Use functional-setState pattern (derive next from prev).

- AC-15: Seed store from IPC on WorkspaceShell mount:
  useEffect(() => { getStatusBarVisible IPC -> store.setStatusBarVisible(v) }, [])
  Ensures persisted value applies on every launch.

### Locale keys

- AC-16: Append under settings.app in en.json + ko.json
  (same object as T-090 settings.app.* keys — append only, no conflict):
  zoom: 'Zoom'
  zoomDesc: 'Scale the UI. Takes effect immediately.'
  statusBar: 'Show status bar'
  statusBarDesc: 'Bottom bar with project name and session health.'
  ko: Korean copy, same shape.

## Out of scope

- Persisting View-menu zoom (role:zoomIn/Out/resetZoom) — deferred; noted in comment.
- Per-window zoom factor — all windows share one pref.
- Zoom outside [80%, 150%] — beyond readable range; clamp enforced.
- CSS transform:scale() alternative — webContents zoom is the correct Electron mechanism.
- Custom stepper DS promotion — out of scope; use inline impl.

## Plan

### §coordination
T-090 creates the App section in GeneralSettings. T-091 appends to it.
If landing in parallel, developer merges both without editing each other's rows.
WorkspaceShell.tsx + workspace store are new touches not modified by T-089/090.

| # | File | Change |
|---|---|---|
| 1 | packages/core/src/settings/ui-settings.ts | zoomFactor + statusBarVisible; read-merge (clamp / boolDefault); DEFAULT_SETTINGS; 4 helpers (AC-1,2). |
| 2 | packages/gui/electron/ipc/settings.ts | 4 handlers + applyZoomToAllWindows (AC-3,4). BrowserWindow import if absent. |
| 3 | packages/gui/electron/preload.ts | 4 bridge methods (AC-5). |
| 4 | packages/gui/electron/main.ts | Apply persisted zoom in createWindow (AC-6). Add View-menu comment. |
| 5 | packages/gui/src/store/workspace.ts | statusBarVisible + setStatusBarVisible (AC-12). |
| 6 | packages/gui/src/views/WorkspaceShell.tsx | gridTemplateRows conditional + StatusBar overflow clip + seed IPC on mount (AC-13,15). |
| 7 | packages/gui/src/components/workspace/GeneralSettings.tsx | Zoom stepper + status bar ToggleRow in App section (AC-7,8,9,11,14). |
| 8 | packages/gui/src/locales/en.json | settings.app.zoom/zoomDesc/statusBar/statusBarDesc (AC-16). |
| 9 | packages/gui/src/locales/ko.json | Korean copy (AC-16). |

### §QA scope

| Area | Check |
|---|---|
| zoom persist | Set 120% -> close/reopen app -> zoom is 120%. |
| zoom live | Step zoom -> all open windows update immediately. |
| zoom clamp | At 80%: minus disabled; at 150%: plus disabled. No value outside range. |
| zoom backcompat | Old settings.json without zoomFactor -> loads as 1.0; no crash. |
| zoom corrupt | settings.json zoomFactor:99 -> clamped to 1.0; no crash. |
| zoom display | Display shows '100%', '80%', '150%' — no float artifacts. |
| status bar hide | Toggle off -> bar collapses; grid layout intact; no content shift. |
| status bar show | Toggle on -> bar at 28px; project slug + health segment visible. |
| status bar persist | Toggle off -> close/reopen -> bar still hidden. |
| status bar backcompat | Old settings.json without statusBarVisible -> loads as true; no crash. |
| combo | Both non-default simultaneously -> correct layout + zoom. |
| View-menu conflict | View > Zoom In changes zoom but does NOT update Settings stepper. Accepted/documented. |

## Outcome

_To be filled at Phase 5._

## Persona Activity

_PO-managed._
