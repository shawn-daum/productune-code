---
ticket_id: T-PATCH-082
version: v0.5
slug: po-turn-done-notification
title: po-turn-done OS notification
type: impl
status: done
phase: 3
assignee: pdt-developer
requires_qa: false
requires_user_gate: false
area_tag: gui-notifications
estimated_complexity: L1
risk_flags: []
created_at: 2026-06-10T00:00:00Z
qa_status: pending
---

# T-PATCH-082: po-turn-done OS notification

## Request

When a PO chat turn fully completes, no OS notification is fired. Users who
step away while a long turn runs have no signal that the response is ready.

R1 — Add a new `po-turn-done` notification type that fires once per completed
PO turn, reusing the existing `isBackgrounded()` gate and click-to-focus
pattern already in place for `dispatch-done` / `escalation-raised` /
`phase-gate-entry`.

## Acceptance

### notifications.ts changes

- AC-1: `NotifyKind` union extended to include `'po-turn-done'`:
  ```ts
  export type NotifyKind =
    | 'dispatch-done'
    | 'escalation-raised'
    | 'phase-gate-entry'
    | 'po-turn-done'
  ```
- AC-2: `NotifyRoute.surface` union extended to include `'chat'`:
  ```ts
  surface: 'ticket-review' | 'phase-gate' | 'chat'
  ```
  No new routing logic needed in `notifications.ts` — `fireNotification`
  is data-driven; the render handler for `'chat'` is added in
  `poEvents.ts` (AC-5).

### po-runner.ts — emit point

- AC-3: In `bindEvents()` (the function at line ~986 that wires renderer
  IPC event sends), the `onDone` callback is extended to fire
  `po-turn-done` after the existing `wc.send('po:onDone', ...)` call:
  ```ts
  onDone: (msgId, info) => {
    wc.send('po:onDone', msgId, info)
    fireNotification({
      kind: 'po-turn-done',
      title: 'productune',
      body: 'PO turn complete — response ready.',
      route: { surface: 'chat' },
    })
  },
  ```
- AC-4: `fireNotification` already applies the `isBackgrounded()` gate
  internally (notifications.ts line ~70). No extra guard needed here.
  The notification fires **at most once per turn** because `onDone` fires
  exactly once per `runPoTurn()` call (single-turn model). This holds for
  both the real spawn path and the echo path.

### poEvents.ts — click routing

- AC-5: The `notification:navigate` handler in
  `packages/gui/src/store/poEvents.ts` (line ~348) adds a `'chat'` case:
  ```ts
  if (route.surface === 'chat') {
    // Window focus is already handled by main (notifications.ts click handler).
    // Chat panel is the default visible surface; no tab open needed.
  }
  ```
  The type annotation for the `route` parameter is updated to include
  `'chat'` in the union:
  ```ts
  surface: 'ticket-review' | 'phase-gate' | 'chat'
  ```

### Suppression during abort

- AC-6: If the turn was aborted via `po:abort` (T-PATCH-081), `onDone`
  still fires from `child.on('close')`. The notification fires if the
  window is backgrounded. This is acceptable: the user chose to abort but
  may still want to know the turn ended. No suppression logic needed.

## Out of scope

- Custom notification text reflecting the last user message or PO response
  summary (deferred — requires message state access from main process).
- Notification per persona sub-agent turn (only the top-level PO turn is
  targeted).
- Notification sound customization.
- Windows / Linux platform testing (macOS-first, same as existing
  notification code; `Notification.isSupported()` guards the rest).

## Plan

| # | File | Change |
|---|---|---|
| 1 | `electron/notifications.ts` | Extend `NotifyKind` (add `'po-turn-done'`) + `NotifyRoute.surface` (add `'chat'`). |
| 2 | `electron/po-runner.ts` | Extend `onDone` in `bindEvents()` to call `fireNotification(...)` with `kind: 'po-turn-done'`. |
| 3 | `src/store/poEvents.ts` | Add `'chat'` case (no-op body) + update surface type annotation. |

No new locale keys needed (notification title/body are hardcoded English
strings consistent with existing notifications).

## Outcome

_To be filled at Phase 5._

## Persona Activity

_PO-managed._
