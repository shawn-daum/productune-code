---
ticket_id: T-PATCH-086
version: v0.5
slug: cmdq-quit-guard
title: Cmd+Q hold-to-quit guard (Chrome-style, PO-turn-aware)
type: impl
status: done
phase: 3
assignee: pdt-developer
requires_qa: true
requires_user_gate: false
area_tag: gui-quit-guard
estimated_complexity: L3
risk_flags:
  - process-lifecycle
created_at: 2026-06-10T00:00:00Z
qa_status: pass
---

# T-PATCH-086: Cmd+Q hold-to-quit guard (Chrome-style, PO-turn-aware)

## Request

Pressing ⌘Q currently kills the app instantly with no confirmation, even while a
PO dispatch is running. Chrome-style protection is required: pressing ⌘Q once
shows a brief "press ⌘Q again to quit" warning; pressing it again within 1.5 s
confirms the quit. If a PO turn is active, a native confirm dialog is shown
instead (with abort).

A separate settings-level "confirm before quit" toggle has been discussed as a
future preference; this ticket ships the guard as a standalone always-on
behaviour compatible with that future toggle.

**Design rationale — hold-to-quit vs confirm dialog.** A modal confirm dialog
blocks keyboard flow and forces a mouse click for every intentional quit. The
Chrome two-stage pattern preserves keyboard-only UX: intentional users just
press ⌘Q twice quickly; accidental presses see the 1.5 s overlay and can simply
release/wait. Implemented here as a **two-tap within 1.5 s** pattern (same UX,
no OS-level hold detection required).

## Acceptance

### Menu override — macOS

- AC-1: In `buildAppMenu()` (`packages/gui/electron/main.ts`), replace the
  macOS app-menu entry `{ role: 'quit' as const }` with a custom item:
  ```ts
  {
    label: 'Quit productune',
    accelerator: 'CmdOrCtrl+Q',
    click: handleQuitRequest,
  }
  ```
  This removes the default role so the quit keystroke is intercepted before
  the OS processes it.

- AC-2: The non-macOS File menu entry `{ role: 'quit' as const }` is similarly
  replaced:
  ```ts
  ...(isMac ? [] : [{
    label: 'Quit',
    accelerator: 'CmdOrCtrl+Q',
    click: handleQuitRequest,
  }]),
  ```

### `handleQuitRequest` logic — main process

- AC-3: Add module-level state to `main.ts`:
  ```ts
  let quitPending   = false
  let quitTimer: ReturnType<typeof setTimeout> | null = null
  ```

- AC-4: `handleQuitRequest` function:
  ```
  async function handleQuitRequest(): Promise<void> {
    // --- PO turn guard (requires T-PATCH-081 activeChild or stub) ---
    if (isPoRunning()) {
      const { response } = await dialog.showMessageBox({
        type: 'warning',
        buttons: ['Abort & Quit', 'Cancel'],
        defaultId: 1,
        cancelId: 1,
        message: 'PO turn in progress',
        detail: 'Quitting now will abort the running dispatch. Continue?',
      })
      if (response === 0) {
        abortActiveTurn()
        app.quit()
      }
      return
    }

    // --- Two-tap hold-to-quit ---
    if (quitPending) {
      if (quitTimer) clearTimeout(quitTimer)
      quitPending = false
      app.quit()
      return
    }

    quitPending = true
    mainWindow?.webContents.send('quit:pending', { timeoutMs: 1500 })
    quitTimer = setTimeout(() => {
      quitPending = false
      quitTimer = null
      mainWindow?.webContents.send('quit:cancelled')
    }, 1500)
  }
  ```

- AC-5: `dialog` is imported from `'electron'` (add to existing import).

- AC-6: `mainWindow` ref must be accessible inside `handleQuitRequest`.
  The existing `createWindow()` assigns `win` locally; hoist to a module-level
  `let mainWindow: BrowserWindow | null = null` and assign on create.
  (Check first — if a module-level window ref already exists, reuse it.)

### `isPoRunning()` — po-runner dependency

- AC-7: `packages/gui/electron/po-runner.ts` exports:
  ```ts
  export function isPoRunning(): boolean {
    return activeChild != null && !activeChild.killed
  }
  ```
  This reuses `activeChild` introduced by T-PATCH-081. **If T-PATCH-081 is not
  yet merged**, stub with `export function isPoRunning(): boolean { return false }`.
  The stub is safe — it means the PO-turn branch never fires; the two-tap guard
  still works. Mark the stub with `// TODO: remove stub after T-PATCH-081 merges`.

- AC-8: In `main.ts`, import `abortActiveTurn` and `isPoRunning` from
  `'./po-runner'` (add alongside existing po-runner imports if any).

### Preload / renderer bridge

- AC-9: `packages/gui/electron/preload.ts` adds two IPC listener helpers:
  ```ts
  onQuitPending: (cb: (data: { timeoutMs: number }) => void) =>
    ipcRenderer.on('quit:pending', (_e, data) => cb(data)),
  onQuitCancelled: (cb: () => void) =>
    ipcRenderer.on('quit:cancelled', _e => cb()),
  ```
  Placed in the existing `window.electron` contextBridge object.

### Renderer overlay — QuitGuardToast

- AC-10: New file `packages/gui/src/components/workspace/QuitGuardToast.tsx`.
  Component listens for `quit:pending` / `quit:cancelled` IPC events and shows
  a transient bottom-center toast:
  - On `quit:pending`: show a fixed-position overlay (z-index 9999,
    `position: fixed`, `bottom: 32px`, `left: 50%`, `transform: translateX(-50%)`)
    with text **"Press ⌘Q again to quit"** (macOS) / **"Press Ctrl+Q again to
    quit"** (non-macOS, detect via `navigator.platform`).
  - Include a thin progress bar (full width at 0 ms, shrinks to 0 over
    `timeoutMs` ms) so the user sees the remaining window visually.
  - On `quit:cancelled` or after `timeoutMs` ms: hide the overlay.
  - Icon: `LogOut` from lucide-react (size 14), no color emoji.
  - Styling: dark surface, matches app design (background `#1A1A1A`,
    border `1px solid #333`, text `#E5E5E5`, pill border-radius 8 px).
    Progress bar accent `#EF4444` (red-500) to signal urgency.

- AC-11: `QuitGuardToast` is mounted inside `WorkspaceShell.tsx` at the root
  level (below the shell grid, not inside a pane). One instance, always in the
  DOM, hidden by default.

- AC-12: Locale keys added to `en.json` + `ko.json`:
  - `app.quitGuard.mac` → `"Press ⌘Q again to quit"` / `"⌘Q를 다시 누르면 종료됩니다"`
  - `app.quitGuard.win` → `"Press Ctrl+Q again to quit"` / `"Ctrl+Q를 다시 누르면 종료됩니다"`

### `window-all-closed` / `stopUsageWatch` preservation

- AC-13: The existing `app.on('window-all-closed')` handler in `main.ts` is
  **not changed**. `stopUsageWatch()` + `app.quit()` (non-macOS branch) continue
  to fire as before. The two-tap guard only intercepts the keyboard/menu path;
  closing the last window via the × button still quits normally.

## Out of scope

- A user-configurable "confirm before quit" settings toggle (future preference,
  this ticket ships always-on).
- Globalshortcut-based interception (not needed — menu override is sufficient
  and simpler; avoids unregister lifecycle risk).
- SIGKILL escalation if `abortActiveTurn()` SIGTERM is ignored (covered by
  T-PATCH-081 risk note).
- Windows / Linux native hold-key detection (not supported via Electron menu;
  two-tap approximation is cross-platform equivalent).
- Quit guard in onboarding / modal overlay windows (main window only).

## Plan

| # | File | Change |
|---|---|---|
| 1 | `electron/main.ts` | Add `mainWindow` module ref. Add `quitPending` + `quitTimer` state. Add `handleQuitRequest()`. Replace both `{ role: 'quit' }` entries with custom items (AC-1, AC-2). Import `dialog` from electron. Import `abortActiveTurn`, `isPoRunning` from `'./po-runner'`. |
| 2 | `electron/po-runner.ts` | Export `isPoRunning(): boolean` using `activeChild` from T-081 (or stub). |
| 3 | `electron/preload.ts` | Add `onQuitPending` + `onQuitCancelled` IPC listener bridges to contextBridge. |
| 4 | `src/components/workspace/QuitGuardToast.tsx` | New component — fixed overlay, progress bar, IPC listeners (AC-10). |
| 5 | `src/views/WorkspaceShell.tsx` | Mount `<QuitGuardToast />` at root level below shell grid. |
| 6 | `src/locales/en.json` + `ko.json` | Add `app.quitGuard.mac` + `app.quitGuard.win` keys (AC-12). |

### Risk notes

- **Menu-role removal:** removing `role: 'quit'` also removes Electron's
  default macOS Dock quit behavior. Mitigated: `app.on('window-all-closed')`
  still calls `app.quit()` on non-macOS; on macOS, right-click Dock → Quit
  calls `app.quit()` directly (bypasses menu), which is correct (no guard on
  Dock quit — consistent with Chrome).
- **T-PATCH-081 dependency:** if T-081 not merged, stub `isPoRunning()` returns
  false. PO-turn dialog branch silently disabled until T-081 lands; two-tap
  guard fully functional standalone.
- **Timer leak:** `quitTimer` is always cleared before setting a new one.
  `app.quit()` path clears the timer before quitting. No leak path.

### QA scope

| Area | Check |
|---|---|
| Normal quit — two-tap | Press ⌘Q → overlay appears; press ⌘Q again within 1.5 s → app quits |
| Normal quit — let expire | Press ⌘Q → overlay appears; wait 1.5 s → overlay dismisses, app stays |
| Normal quit — progress bar | Bar shrinks smoothly over 1.5 s |
| PO turn active | Start streaming turn; press ⌘Q → native confirm dialog appears |
| PO turn — confirm quit | Confirm dialog "Abort & Quit" → turn aborts, app quits |
| PO turn — cancel | Confirm dialog "Cancel" → app stays, turn continues |
| Window close button | Click × → app closes without guard (existing behaviour) |
| Non-macOS (Windows) | Ctrl+Q → same two-tap flow, overlay shows Ctrl+Q copy |
| `stopUsageWatch` | Normal window close path still fires `stopUsageWatch` |
| No globalShortcut leak | Dev console — no duplicate handler warnings |

## Outcome

_To be filled at Phase 5._

## Persona Activity

_PO-managed._
