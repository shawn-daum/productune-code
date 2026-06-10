---
ticket_id: T-PATCH-089
version: v0.5
slug: notification-not-arriving-diagnosis-test-button
title: "Notifications not arriving — diagnosis + Test button, blocked-status hint, suppress-reason log"
type: impl
status: done
phase: 3
assignee: pdt-developer
requires_qa: true
requires_user_gate: false
area_tag: gui-notifications
estimated_complexity: L2
risk_flags:
  - macos-permission-not-queryable-from-main-no-stock-api
  - deep-link-url-scheme-os-version-dependent-verify-on-target
  - unsigned-dev-electron-identity-permission-instability
  - shared-file-GeneralSettings-locales-with-T-PATCH-083
created_at: 2026-06-10T00:00:00Z
---

# T-PATCH-089: Notifications not arriving — diagnosis + Test button + blocked hint + suppress log

## Request

Followup D6. User enabled notifications (T-PATCH-083 toggles default-on) but got
no OS notification after a PO turn completed (`po-turn-done`, wired in T-PATCH-082).
User asks: was permission never requested, and when does the app ask for it?

**Diagnosis (R1) — see the matrix below. Short answer: most likely the
window-focused gate, not a permission bug.** `fireNotification` (notifications.ts
L72-102) silently returns `false` when ANY productune window is focused
(`isBackgrounded()`, L56-58, L75). A user who finishes a PO turn while *looking at
the app* will never see a notification by design. There is no user-visible feedback
when a notification is suppressed, so "suppressed by gate" is indistinguishable
from "permission denied" from the user's seat — that is the real defect.

This ticket adds the diagnosability + verification surface so the user (and we) can
tell *which* gate fired: a **Test notification button**, an **inline blocked-status
hint with a deep link to the macOS Notifications pane**, and a **main-process
suppress-reason log line**.

### R1 — Diagnosis matrix (why a notification may not appear)

Ordered most→least likely for the reported case (PO turn just finished, user at screen):

| # | Cause | Mechanism (verified against code) | How this ticket exposes/fixes it |
|---|---|---|---|
| a | **Window-focused gate** *(most likely)* | `isBackgrounded()` returns `false` when any window `isFocused()`; `fireNotification` returns early at L75. User watching the app when `onDone` fires → silent skip, by design (AC-1 of T-019). | Test button **bypasses** this gate (R2-i) so the user can verify the pipeline works; suppress-log names `reason: focused` (R2-iii). |
| b | **macOS permission never granted** | First `new Notification().show()` is what registers the app under System Settings ▸ Notifications and (OS-version-dependent) shows/needs an authorization grant. Before that first attempt the app is absent from the list. **Electron's main-process `Notification` has NO permission-request and NO permission-read API** (see Platform notes). So nothing "asks" until the first real `.show()` — which, per cause (a), may never have fired because the user was focused. | Test button forces a real `.show()` → registers the app + surfaces the OS grant flow on explicit user intent (R2-i). Blocked hint guides to the pane (R2-ii). |
| c | **Settings toggle off** | `fireNotification` returns `false` if `!n.enabled` or `!n.types[kind]` (L80-82, T-PATCH-083). User says enabled, but a master-off / per-type-off state is possible. | Test button **respects** toggles (R2-i) — if off, button itself reflects/hints disabled state; suppress-log names `reason: toggle`. |
| d | **macOS Focus / Do Not Disturb** | OS-level suppression; the notification is *delivered to the OS* but withheld by Focus/DnD. Electron cannot detect or override this — no API. | Documented in the blocked-status hint copy as a thing to check; not programmatically detectable (call out in hint, R2-ii). |

### Platform notes (Electron on macOS — VERIFIED, do not contradict in impl)

- **No main-process permission API.** `Notification.requestPermission()` is a
  *renderer / Web Notifications* API; it does **not** exist on the main-process
  `electron.Notification` class. Main-process `Notification` exposes only
  `isSupported()`, the constructor, `show()`, `close()`, and events. There is **no
  stock way to read the current macOS authorization status from the main process** —
  that requires a native addon (e.g. `macos-notification-state` /
  `node-mac-permissions`), which is **out of scope** here. Do not claim we can query
  grant state without a native module.
- **`Notification.isSupported()` is NOT a permission check.** It returns `true` on
  macOS whether or not the user has authorized notifications. Never treat it as
  "permission granted."
- **First `.show()` registers the app.** macOS adds the app to System Settings ▸
  Notifications on the first delivery attempt; the authorization prompt/behavior is
  OS-version-dependent. Until a `.show()` is attempted, the app is not in the list
  and the user has nothing to toggle in System Settings.
- **Signed vs unsigned nuance.** In dev the app runs via the Electron CLI binary
  (unsigned) and registers under the generic **"Electron"** identity with an
  unstable bundle id — macOS may drop or fail to persist authorization. A later
  **unsigned `.dmg`** has the same class of problem: reliable, persistent
  notification authorization on macOS requires a **stable `CFBundleIdentifier` +
  code signature**. Flag this to the user; it is an environment/packaging issue, not
  a code bug. (Impl: do not over-promise reliability in dev/unsigned builds.)

## Acceptance

### R2-i — Test notification button (`fireNotification` gets a bypass param + new IPC)

- AC-1: `fireNotification(spec, opts?)` in `packages/gui/electron/notifications.ts`
  gains an optional second arg `opts?: { bypassFocusGate?: boolean }`. When
  `opts.bypassFocusGate === true`, the `isBackgrounded()` early-return (L75) is
  **skipped**. ALL other gates are unchanged and still apply in this order:
  `Notification.isSupported()` (L73) → *[focus gate skipped]* →
  `getNotificationSettings()` enabled/per-type (L80-82). Default behavior
  (no `opts`) is byte-for-byte identical to today.
- AC-2: New IPC handler `notifications:fireTest` in
  `packages/gui/electron/ipc/settings.ts` (notifications has no own ipc module;
  settings is the correct home — it already imports notification helpers' siblings):
  calls
  ```ts
  fireNotification(
    {
      kind: 'po-turn-done',
      title: 'productune',
      body: t-equivalent: 'Test notification — notifications are working.',
      route: { surface: 'chat' },
    },
    { bypassFocusGate: true },
  )
  ```
  and returns `{ shown: boolean; reason?: 'unsupported' | 'toggle' }`. `shown` is
  the boolean `fireNotification` returns. When `false`, set `reason`:
  `'unsupported'` if `!Notification.isSupported()`, else `'toggle'` (master or the
  `po-turn-done` type is off). The handler must NOT throw — wrap in try/catch and
  return `{ shown: false }` on error. (Body text is hardcoded English to match the
  existing notification strings per T-PATCH-082; no new main-process i18n.)
- AC-3: `preload.ts` exposes `fireTestNotification(): Promise<{ shown: boolean;
  reason?: string }>` on the `api` bridge, invoking `notifications:fireTest`.
- AC-4: `GeneralSettings.tsx` `NotificationsSection` renders a **Test button** below
  the 4 per-type rows. Button uses `lucide-react` `BellRing` icon (DS §7, no
  color-emoji). Clicking calls `api.fireTestNotification()` (wrapped in try/catch for
  browser dev mode, like the existing toggle handlers). The button is **disabled**
  (visually + `pointerEvents:'none'`, reuse the `opacity:0.4` pattern from AC-13 of
  T-PATCH-083) when `notif.enabled === false` OR `notif.types['po-turn-done'] ===
  false` — a test would be suppressed by the toggle gate, so don't offer it.

### R2-ii — Inline blocked-status hint + macOS deep link

- AC-5: After the user clicks Test, render an inline result line under the button
  driven by the IPC result:
  - `shown === true` → success hint (`settings.notifications.test.shown`), e.g.
    "Sent — if nothing appeared, check macOS Notifications & Focus settings below."
    (We cannot confirm the OS actually *displayed* it — `shown:true` only means we
    attempted `.show()` past our gates; copy must not over-claim.)
  - `shown === false && reason === 'toggle'` → `...test.blockedToggle`.
  - `shown === false && reason === 'unsupported'` → `...test.unsupported`.
- AC-6: Always render a persistent macOS guidance hint (`settings.notifications.
  macosHint`) in the section: short copy explaining (1) the app must be allowed in
  System Settings ▸ Notifications, (2) the first notification attempt is what
  registers the app there, (3) macOS Focus / Do Not Disturb can withhold delivery,
  (4) in unsigned dev builds the app appears as "Electron". Keep ≤3 sentences.
- AC-7: A **"Open macOS Notification settings"** link/button (lucide `ExternalLink`
  icon) that calls the EXISTING `api.openExternal(url)` bridge (preload L8-9 →
  `shell:openExternal`, handler in `ipc/project.ts:121`) — **do not add a new IPC**.
  The URL is OS-version dependent (see AC-8). The link renders **only on
  `process.platform === 'darwin'`** — gate via a value passed from main (reuse
  `api.getOsLocale`-style pattern) OR a new tiny `api.getPlatform()` if none exists;
  prefer reading an existing platform signal, add the minimal bridge only if absent.
- AC-8: **Deep-link URL — VERIFY ON TARGET macOS before hardcoding.** The
  Notifications pane anchor differs by OS:
  - Ventura (13) and later (System Settings): `x-apple.systempreferences:com.apple.Notifications-Settings.extension`
  - Monterey (12) and earlier (System Preferences): `x-apple.systempreferences:com.apple.preference.notifications`
  Impl: try the Ventura+ scheme first (current macOS baseline). If the dev cannot
  confirm it opens the Notifications pane on the target macOS, fall back to opening
  System Settings root (`x-apple.systempreferences:`) rather than a wrong pane.
  **Leave a `// VERIFY:` comment at the URL constant** so this is not silently
  shipped on an unverified scheme. Wrong scheme = link opens nothing or the wrong
  pane → worse than no link.

### R2-iii — Suppress-reason diagnostic log (main process)

- AC-9: In `fireNotification`, at EACH early-return that suppresses a notification,
  emit a single structured `console.log` (visible in the dev terminal / packaged
  app logs) naming the reason. Exact reasons:
  - `unsupported` — `!Notification.isSupported()` (L73)
  - `focused` — focus gate hit (L75) **and** `bypassFocusGate` was not set
  - `toggle` — `!enabled` or `!types[kind]` (L80-82)
  Format: `[notifications] suppressed kind=<kind> reason=<reason>`. The happy path
  (notification shown) logs nothing (avoid noise). Bypass path that skips the focus
  gate must NOT log `focused`. Keep it a plain `console.log` — no new logger dep.
- AC-10: No change to the existing 4 emit sites (po-runner `onDone`, qa-loop, gate
  parse). They keep calling `fireNotification(spec)` with no opts — default path,
  unchanged.

### R3 — First-launch warm-up notification: **DECISION = NO**

- AC-11: **Do NOT add an automatic warm-up/no-op notification at app launch.**
  Rationale (record in the decision log):
  1. Main-process Electron has **no truly-silent register-only API** — `.show()` is
     the only thing that registers the app, and it always surfaces a visible
     notification. A launch-time warm-up = a surprise notification on every cold
     start = poor first-run UX.
  2. The **Test button (R2-i) already provides the registration + permission-grant
     path**, but on *explicit user intent* in the Notifications settings section —
     strictly better than a surprise.
  3. The first real background event (`po-turn-done` etc.) registers the app anyway;
     the only loss is that the very first event could be missed while the OS grant is
     pending — acceptable, and mitigated by the AC-6 status hint.
  - If priming is ever desired later, do it **contextually** (e.g. on first enabling
    a toggle, fire one confirmation notification), NOT at launch. Out of scope here.

### R2-iv — locale keys (`packages/gui/src/locales/en.json` + `ko.json`)

- AC-12: Add under `settings.notifications`:
  ```json
  "test": {
    "button": "Send test notification",
    "shown": "Sent. If nothing appeared, check macOS Notifications and Focus settings below.",
    "blockedToggle": "Turn notifications on above to send a test.",
    "unsupported": "Native notifications aren't supported on this system."
  },
  "macosHint": "productune must be allowed in System Settings ▸ Notifications. The first notification it sends is what adds it to that list. macOS Focus / Do Not Disturb can also hold notifications back. In an unsigned dev build the app appears as \"Electron\".",
  "openMacosSettings": "Open macOS Notification settings"
  ```
  ko: same shape, Korean copy (designer/PO-reviewed wording). Keep ≤3 sentences in
  `macosHint`.

## Out of scope

- Native addon to **read** macOS authorization status (`macos-notification-state` /
  `node-mac-permissions`) — would let us show a true "permission denied" badge, but
  adds a native dependency. Note as a `promotion_candidate` if the user wants it.
- Code-signing / stable bundle-id work to make notifications reliable in
  packaged/dmg builds — packaging concern, separate ticket.
- Windows / Linux notification-permission parity (macOS-first, unchanged).
- Changing the default focus-gate behavior for real events (the gate is correct by
  design — T-019 AC-1; this ticket only adds a *test-time* bypass).
- Notification sound / DnD schedule / quiet hours (already out of scope in T-083).
- Per-message notification body text.

## Plan

### §coordination
- **Shared files with T-PATCH-083** (`GeneralSettings.tsx`, `en.json`, `ko.json`) —
  T-083 is `done`, so this extends the existing `NotificationsSection` /
  `settings.notifications.*` block rather than creating it. Insert the Test button +
  hints INSIDE the existing section component (after the per-type rows). No new
  section divider.
- Sequence anytime after T-083 (merged). Independent of T-087/T-088 in this batch.

| # | File | Change |
|---|---|---|
| 1 | `electron/notifications.ts` | Add `opts?: { bypassFocusGate?: boolean }` to `fireNotification`; skip focus gate when set (AC-1). Add suppress-reason `console.log` at each early return (AC-9). Update header comment to note the bypass + log. |
| 2 | `electron/ipc/settings.ts` | Add `notifications:fireTest` handler → calls `fireNotification(spec, { bypassFocusGate:true })`, returns `{ shown, reason? }` (AC-2). Import `fireNotification` + `Notification` from electron for the `isSupported` reason branch. |
| 3 | `electron/preload.ts` | Expose `fireTestNotification()` (AC-3); confirm `openExternal` already present (it is, L8-9) — reuse, don't re-add. Add minimal `getPlatform()` only if no existing platform signal (AC-7). |
| 4 | `src/components/workspace/GeneralSettings.tsx` | In `NotificationsSection`: Test button (lucide `BellRing`, disabled when toggle-off, AC-4), inline result line (AC-5), persistent macOS hint (AC-6), darwin-only "Open macOS Notification settings" link (lucide `ExternalLink`) via `api.openExternal` (AC-7/8). |
| 5 | `src/locales/en.json` | Add `settings.notifications.test.*`, `macosHint`, `openMacosSettings` (AC-12). |
| 6 | `src/locales/ko.json` | Korean copy, same shape (AC-12). |

### §QA scope
| Area | Check |
|---|---|
| focus-bypass | Test button with window FOCUSED → notification appears (bypass works); real `po-turn-done` with window focused → still silent (default path unchanged). |
| toggle-respect | Master off → Test button disabled, no fire; `po-turn-done` type off → Test button disabled. Toggle on → Test fires. |
| suppress-log | Dev terminal shows `[notifications] suppressed kind=… reason=focused\|toggle\|unsupported` at the right gate; happy path logs nothing; bypass path never logs `focused`. |
| deep-link | On macOS target, "Open macOS Notification settings" opens the Notifications pane (verify scheme per AC-8); link hidden on non-darwin. |
| permission-flow | Fresh machine / app never sent a notification → clicking Test triggers macOS registration + grant flow; app then appears in System Settings ▸ Notifications. |
| dev-mode | Section renders + Test no-ops gracefully when `api` undefined (browser dev), like existing toggle handlers. |
| regression | All 4 existing emit sites unchanged; default-on behavior identical to pre-089. |

## Outcome

_To be filled at Phase 5._

## Persona Activity

_PO-managed._

## Persona Activity
- 2026-06-10 PO verify: deep-link scheme x-apple.systempreferences:com.apple.Notifications-Settings.extension confirmed working on macOS 26.5 (open cmd exit 0, Settings pane opened). VERIFY satisfied for this target.
