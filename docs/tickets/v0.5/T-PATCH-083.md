---
ticket_id: T-PATCH-083
version: v0.5
slug: settings-notifications-section
title: General Settings — Notifications section (master + per-type toggles, persisted)
type: impl
status: done
phase: 3
assignee: pdt-developer
requires_qa: true
requires_user_gate: false
area_tag: gui-settings-notifications
estimated_complexity: L3
risk_flags:
  - settings-schema-read-merge-backcompat
  - depends-on-T-PATCH-082-notifykind
created_at: 2026-06-10T00:00:00Z
---

# T-PATCH-083: General Settings — Notifications section

## Request

GUI patch (sub-area D3 settings). Add a **Notifications** section to
`GeneralSettings.tsx`: one master on/off plus a per-type toggle for each of the
4 native-notification types. Persist in `settings.json` under `ui.notifications`;
`notifications.ts` must respect the toggles before firing. Default: everything on.

The 4 types (post-T-PATCH-082):
`dispatch-done`, `escalation-raised`, `phase-gate-entry`, `po-turn-done`.

PO note: `po-turn-done` is added to the `NotifyKind` union by T-PATCH-082 — this
ticket consumes that union and MUST sequence after it (see Plan §coordination).

## Acceptance

### R1a — settings schema (`packages/core/src/settings/ui-settings.ts`)

- AC-1: `UiSettings.ui` gains:
  ```ts
  notifications: {
    enabled: boolean
    types: {
      'dispatch-done': boolean
      'escalation-raised': boolean
      'phase-gate-entry': boolean
      'po-turn-done': boolean
    }
  }
  ```
- AC-2: `DEFAULT_SETTINGS.ui.notifications` = `enabled: true` + all 4 types `true`.
- AC-3: `loadSettings()` read-merge defaults a MISSING `ui.notifications` (and any
  missing individual type key) to its default of `true` — existing `settings.json`
  files that predate this key must behave as "all notifications on", never crash.
  Each type defaults `true` unless the persisted value is exactly `false`.
- AC-4: New helpers `getNotificationSettings(): NotificationSettings` and
  `setNotificationSettings(n: NotificationSettings): void` (round-trip through
  `loadSettings`/`saveSettings`, same atomic-tmp-rename pattern as `setUiLanguage`).
  Export the `NotificationSettings` type from `core/src/index.ts`.

### R1b — IPC (`packages/gui/electron/ipc/settings.ts` + `preload.ts`)

- AC-5: New handler `settings:getNotifications` → returns `getNotificationSettings()`.
- AC-6: New handler `settings:setNotifications` accepts the full
  `NotificationSettings` object → calls `setNotificationSettings(...)`, returns
  `{ ok: boolean; error?: string }` (same shape as `settings:setUiLanguage`).
- AC-7: `preload.ts` exposes `getNotifications()` and `setNotifications(n)` on the
  `api` bridge, invoking the two channels above.

### R1c — gating (`packages/gui/electron/notifications.ts`)

- AC-8: `fireNotification(spec)` reads `getNotificationSettings()` from
  `@productune/core` and returns `false` (fires nothing) when:
  `n.enabled === false`, OR `n.types[spec.kind] === false`.
  This check runs AFTER `Notification.isSupported()` and the existing
  `isBackgrounded()` gate (no change to those two gates).
- AC-9: The module header comment + `NotifyKind` union list `po-turn-done`
  (already true after T-PATCH-082 — verify, do not duplicate).
- AC-10: With all toggles default-on, observable behavior is unchanged from today.

### R1d — UI (`packages/gui/src/components/workspace/GeneralSettings.tsx`)

- AC-11: A new **Notifications** section renders between the UI-Language section
  and the Claude-Code-connection section, separated by the existing `divider`
  style on both sides.
- AC-12: Section = `sectionTitle` (`settings.notifications.title`) + `description`
  (`settings.notifications.description`), then a **master `ToggleRow`**
  (`settings.notifications.master`), then the 4 per-type `ToggleRow`s.
- AC-13: When the master toggle is OFF, the 4 type rows render visually disabled
  (`opacity: 0.4`, `pointerEvents: 'none'`) — their stored values are preserved,
  not reset.
- AC-14: Toggling any row calls `api.setNotifications(next)` and updates local
  state optimistically; a `try/catch` swallows IPC-unavailable (browser dev mode)
  exactly like `handleLangChange`. On mount, `useEffect` loads current values via
  `api.getNotifications()` with the same graceful degradation.
- AC-15: Type rows map `NotifyKind` → locale key via an explicit lookup
  (`dispatchDone | escalationRaised | phaseGateEntry | poTurnDone`) — do NOT
  interpolate the hyphenated kind into an i18n path.
- AC-16: `ToggleRow` is a local component (switch affordance): track + knob, ON =
  `#8B5CF6` track, OFF = `#2A2A2A` track; knob `#F0F0F0`; reuses `description`
  token for the sub-label. No new color-emoji; if any glyph is needed use
  `lucide-react` (DS §7). Row = label/desc on the left, switch on the right.

### R1e — locale keys (`packages/gui/src/locales/en.json` + `ko.json`)

- AC-17: `settings.notifications` added to both locales:
  ```json
  "notifications": {
    "title": "Notifications",
    "description": "Choose which background events show a desktop notification while productune isn't focused.",
    "master": "Enable notifications",
    "dispatchDone": "Dispatch complete",
    "dispatchDoneDesc": "A dispatched ticket finished its QA loop (pass).",
    "escalationRaised": "Escalation raised",
    "escalationRaisedDesc": "A QA loop hit the retry cap or needs authentication.",
    "phaseGateEntry": "Phase gate",
    "phaseGateEntryDesc": "The PO reached a phase-transition gate awaiting approval.",
    "poTurnDone": "PO turn complete",
    "poTurnDoneDesc": "The PO finished a turn and is waiting on you."
  }
  ```
  ko: same shape, Korean copy (PO/designer-reviewed wording).

## Out of scope

- Per-project notification prefs (this is a global `~/.productune/settings.json` pref).
- Notification sound / Do-Not-Disturb schedule / quiet hours.
- Adding new notification *types* (the 4 types are fixed by T-PATCH-082).
- Windows/Linux native-notification parity (macOS-first, unchanged).
- The 6 candidate General prefs in the envelope analysis (not ticketed).

## Plan

### §coordination
- **Sequence AFTER T-PATCH-082** — it introduces `po-turn-done` in `NotifyKind`.
  If T-082 not yet merged, `NotifyKind` lacks `po-turn-done` and AC-8/AC-15 won't
  type-check.
- **Shared file w/ T-PATCH-084** — both edit `GeneralSettings.tsx`, `en.json`,
  `ko.json`. Recommended global order: **T-080 → T-084 → T-083** (T-084 removes
  the User-Mode section first, leaving a clean file for this insertion). If run
  before T-084, insert the Notifications section without touching the User-Mode
  block and leave a merge note.

| # | File | Change |
|---|---|---|
| 1 | `core/src/settings/ui-settings.ts` | Add `NotificationSettings` type + `ui.notifications` field (AC-1); extend `DEFAULT_SETTINGS` (AC-2); read-merge with per-key `=== false` default-true (AC-3); add `getNotificationSettings`/`setNotificationSettings` (AC-4). |
| 2 | `core/src/index.ts` | Export `getNotificationSettings`, `setNotificationSettings`, `NotificationSettings` type. |
| 3 | `gui/electron/ipc/settings.ts` | Register `settings:getNotifications` + `settings:setNotifications` handlers (AC-5/6); import the two core helpers. |
| 4 | `gui/electron/preload.ts` | Expose `getNotifications()` + `setNotifications(n)` on `api` (AC-7). |
| 5 | `gui/electron/notifications.ts` | Import `getNotificationSettings`; add the enabled/per-type gate in `fireNotification` after `isBackgrounded()` (AC-8); verify `po-turn-done` in union/header (AC-9). |
| 6 | `gui/src/components/workspace/GeneralSettings.tsx` | Add `Notifications` section + local `ToggleRow` component + load/save state (AC-11..16). |
| 7 | `gui/src/locales/en.json` | Add `settings.notifications.*` (AC-17). |
| 8 | `gui/src/locales/ko.json` | Add `settings.notifications.*` (Korean). |

### §QA scope
| Area | Check |
|---|---|
| back-compat | Pre-existing `settings.json` with no `ui.notifications` → all 4 fire (default-on); no crash. |
| persistence | Toggle a type off → relaunch → stays off; toggle master off → all suppressed; master back on → per-type values restored (not reset). |
| gate order | With window focused, still silent (existing gate); with window backgrounded + type off, no fire; type on, fires. |
| i18n | en + ko both render all labels/descs; no missing-key fallback strings. |
| dev-mode | Settings UI renders + toggles no-op gracefully when `api` undefined (browser dev). |

## Outcome
<null — Phase 5>

## Persona Activity
<PO-managed>
