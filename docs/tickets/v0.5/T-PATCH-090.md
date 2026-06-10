---
ticket_id: T-PATCH-090
version: v0.5
slug: app-lifecycle-prefs-close-to-tray-launch-at-login
title: "App lifecycle prefs — close-to-tray (keep running) + launch at login"
type: impl
status: done
phase: 3
assignee: pdt-developer
requires_qa: true
requires_user_gate: false
area_tag: gui-settings-lifecycle
estimated_complexity: L3
risk_flags:
  - tray-icon-non-mac-scope-decision-mac-only-first-cut
  - stopUsageWatch-window-all-closed-must-not-fire-when-tray-active
  - cmdQ-guard-must-still-quit-even-when-close-to-tray-on
  - app-setLoginItemSettings-mas-vs-non-mas-api-shape-differs
  - close-to-tray-default-off-to-avoid-surprise-background-process
created_at: 2026-06-10T00:00:00Z
---

# T-PATCH-090: App lifecycle prefs — close-to-tray (keep running) + launch at login

## Request

Followup D7 — two of four approved preferences from the pref-scan batch.

**R1 — Close-to-tray / keep-running-in-background.** Closing the main window keeps
the app (and the PO loop if active) alive rather than quitting. On macOS this means
the window hides; the dock icon remains; the user can reopen via the dock click or
`activate` event. On non-mac, a tray icon would be the conventional mechanism, but
tray management (Tray instance, icon asset, context menu, Tray.destroy) adds
significant scope. Decision: **macOS-only for the first cut** (see §decision below).
Non-mac: feature not present, toggle hidden.

**R2 — Launch at login** via `app.setLoginItemSettings`. Toggle in General Settings,
default off.

### §decision — mac-only first cut for close-to-tray

Non-mac tray requires: a Tray instance + bundled icon asset + context menu +
Tray.destroy coordination + cross-platform testing. Mac hide-on-close is free:
`win.hide()` in the close event; dock icon + `activate` already handle re-show —
standard macOS app behavior (Finder, Mail, etc.). Cost/benefit: mac-only delivers
the feature at ~20% of non-mac effort. Non-mac tray is a promotion_candidate.

Record in `docs/designer/bookshelf/decisions.md`:
> [T-PATCH-090] close-to-tray: mac-only first cut (win.hide + activate);
> non-mac tray deferred as promotion_candidate. Default off (surprise-process risk).

## Acceptance

### Schema — packages/core/src/settings/ui-settings.ts

- AC-1: Add `closeToTray: boolean` and `launchAtLogin: boolean` to the `ui` block
  of `UiSettings`. Update `DEFAULT_SETTINGS` to set both `false`.
  Read-merge in `loadSettings()`: use `=== true` (NOT boolDefault — both prefs
  default OFF; a missing key stays false):
  ```
  closeToTray:   parsed?.ui?.closeToTray   === true,
  launchAtLogin: parsed?.ui?.launchAtLogin === true,
  ```

- AC-2: Add 4 typed helpers (atomic-tmp-rename pattern, same as setUiLanguage):
  getCloseToTray, setCloseToTray, getLaunchAtLogin, setLaunchAtLogin.

### IPC — packages/gui/electron/ipc/settings.ts

- AC-3: Register 4 handlers: settings:getCloseToTray, settings:setCloseToTray,
  settings:getLaunchAtLogin, settings:setLaunchAtLogin. All wrapped in try/catch
  returning { ok, error? }. The setLaunchAtLogin handler also calls syncLoginItem(v).

- AC-4: syncLoginItem helper (module-private, not exported):
  `app.setLoginItemSettings({ openAtLogin: enabled })`.
  Comment: non-MAS Electron only; MAS requires SMAppService (macOS 13+) — out of scope.

### Preload — packages/gui/electron/preload.ts

- AC-5: Expose 4 bridge methods (getCloseToTray, setCloseToTray, getLaunchAtLogin,
  setLaunchAtLogin). Add getPlatform(): Promise<string> exposing process.platform if
  no equivalent bridge exists (check first — do not duplicate).

### Main process — packages/gui/electron/main.ts

- AC-6: In createWindow(), add a close event handler immediately after BrowserWindow
  construction:
  ```
  win.on('close', (event) => {
    if (process.platform === 'darwin' && getCloseToTray()) {
      event.preventDefault()
      win.hide()
      // window-all-closed does NOT fire; stopUsageWatch NOT called; PO loop stays alive.
    }
  })
  ```
  Import getCloseToTray from @productune/core. Pref is read at close-time (disk),
  so a mid-session toggle takes effect on next close with no restart.

- AC-7: Update the activate handler to re-show a hidden window:
  ```
  app.on('activate', () => {
    const wins = BrowserWindow.getAllWindows()
    if (wins.length === 0) {
      createWindow()
    } else {
      const [win] = wins
      if (!win.isVisible()) win.show()  // re-show hidden window (close-to-tray)
    }
  })
  ```

- AC-8: Add explanatory comment on the window-all-closed handler: when close-to-tray
  is on (mac), win.hide() is used not destroy — this event does NOT fire. Fires only
  on genuine destruction (app.quit()). app.quit() bypasses the close handler's
  event.preventDefault(), so quit always works regardless of the pref.

- AC-9: Login-item OS reconciliation in app.whenReady() (after registerSettings()):
  ```
  try {
    const osLogin = app.getLoginItemSettings().openAtLogin
    if (osLogin !== getLaunchAtLogin()) setLaunchAtLogin(osLogin)
  } catch {}
  ```
  OS value is authoritative (user may have toggled in System Settings directly).

### GeneralSettings UI — packages/gui/src/components/workspace/GeneralSettings.tsx

- AC-10: Add an "App" section BETWEEN the Notifications divider and Claude Code.
  Close-to-tray ToggleRow wrapped in `{platform === 'darwin' && (...)}` guard.
  Launch-at-login ToggleRow shown on all platforms.
  New divider after the App section, before Claude Code.

- AC-11: Load platform once on mount via api.getPlatform(). Store in local state.
  Fallback to 'darwin' if IPC unavailable (browser dev mode — show both toggles,
  handlers no-op gracefully).

- AC-12: Both toggles use the T-083 functional-setState pattern (derive next from
  prev, fire IPC in async IIFE inside setter, return next synchronously). Load both
  prefs + platform in a single useEffect on mount via Promise.all.

### Locale keys

- AC-13: Add settings.app.* in en.json + ko.json:
  title: "App"
  closeToTray: "Keep running in background"
  closeToTrayDesc: "Closing the window keeps productune alive. Reopen from the dock."
  launchAtLogin: "Launch at login"
  launchAtLoginDesc: "Automatically open productune when you log in."
  ko: Korean copy, same shape. Descriptions kept to <=12 words (ToggleRow layout).

## Out of scope

- Non-mac tray icon — promotion_candidate.
- openAsHidden on login (launch window pre-hidden) — promotion_candidate.
- MAS / SMAppService login-item path.
- Multi-window: only the most-recent mainWindow ref affected; "New Window" windows
  follow normal close behavior. Acceptable for v0.5.
- Linux XDG autostart parity — deferred.

## Plan

### §coordination
Independent of T-089/T-091. No shared-component conflicts: GeneralSettings adds a
new App section (no edit to T-089 Notifications block). Locales add new
settings.app.* key (no conflict with T-089 settings.notifications.*).

| # | File | Change |
|---|---|---|
| 1 | packages/core/src/settings/ui-settings.ts | Extend UiSettings.ui; read-merge; DEFAULT_SETTINGS; 4 helpers (AC-1,2). |
| 2 | packages/gui/electron/ipc/settings.ts | 4 IPC handlers + syncLoginItem (AC-3,4). |
| 3 | packages/gui/electron/preload.ts | 4 bridge methods + getPlatform if absent (AC-5). |
| 4 | packages/gui/electron/main.ts | close event in createWindow (AC-6); activate handler update (AC-7); window-all-closed comment (AC-8); login-item reconciliation in whenReady (AC-9). |
| 5 | packages/gui/src/components/workspace/GeneralSettings.tsx | App section + 2 ToggleRows + platform gate (AC-10,11,12). |
| 6 | packages/gui/src/locales/en.json | settings.app.* keys (AC-13). |
| 7 | packages/gui/src/locales/ko.json | Korean copy (AC-13). |

### §QA scope

| Area | Check |
|---|---|
| close-to-tray on (mac) | Close window → app alive (dock icon present); window-all-closed NOT fired. |
| dock reopen | Dock click with pref on → window re-shows. |
| cmd+Q with pref on | Two-tap cmd+Q still quits; stopUsageWatch fires; dock icon gone. |
| close-to-tray off | Close window → window-all-closed fires → app quits. Same as pre-patch. |
| toggle live | Toggle pref → close window → correct behavior without restart. |
| PO loop survives | PO turn running, user closes window (pref on, mac) → turn completes; stopUsageWatch NOT called. |
| launch at login on | Relogin → productune auto-opens. getLoginItemSettings().openAtLogin === true. |
| launch at login off | Relogin → does NOT auto-open. |
| OS reconcile | Toggle in System Settings → relaunch app → UI toggle matches OS value. |
| schema backcompat | Old settings.json without new keys → loads as false for both (no crash). |
| non-mac | Close-to-tray toggle NOT visible; launch-at-login visible; no crash. |

## Outcome

_To be filled at Phase 5._

## Persona Activity

_PO-managed._
