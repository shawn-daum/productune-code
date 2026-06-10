---
ticket_id: T-PATCH-080
version: v0.5
phase: 3
type: build
status: done
assignee: pdt-developer
created_at: 2026-06-10T00:00:00Z
estimated_complexity: L2
risk_flags:
  - buildRail-persona-key-normalization
slug: ticket-detail-view-fixes
qa_status: pass
requires_qa: true
requires_user_gate: false
area_tag: gui-ticket-detail
---

# T-PATCH-080: Ticket-detail view fixes (kanban click · stale dispatch · i18n · section order)

## Request

Four GUI patch items observed during visual review. All changes are confined to
`TicketDashboardView.tsx` and `TicketDetailTab.tsx` + locale files.

**R1 — Kanban card click → open ticket detail**
Clicking a kanban card in `TicketDashboardView` does nothing. Expected: opens
`ticket-detail` tab for that ticket (same intent as cmd+p ticket-open).

**R2 — Stale dispatch-progress "active" state**
`DispatchProgress` marks a persona as "active" based on `poState.persona_sessions`
key presence + ticket `assignee` field. Result: a designer session on a completed
ticket (e.g. T-006) still renders as "active" long after the task is done.
Fix: tie "active" to `poState.current_task` match, not to historic session keys.

**R3 — i18n: hardcoded "Show full spec" / "Hide full spec"**
`TicketDetailTab.tsx` line 347 uses hardcoded English strings. Rest of file uses
`t()` / `tMode()`. Add locale keys and replace hardcoded strings.

**R4 — Full spec: expand by default + move DispatchProgress above full spec**
`showFullSpec` state defaults to `false` (collapsed). Default should be expanded.
Section order: `DispatchProgress` sits below full spec; move it above.

## Acceptance

### R1 — Kanban card click

- AC-1: Clicking anywhere on a kanban `Card` div calls
  `openTab('ticket-detail:<ticketId>', 'ticket-detail', { ticketId }, ticketId)`
  using the same `openTab` from `useWorkspace` already imported in
  `TicketDashboardView.tsx`.
- AC-2: Card div has `cursor: 'pointer'` in its inline style.
- AC-3: Opening the same ticket twice (click → click) opens a single tab (deduped
  by `tabId = 'ticket-detail:<ticketId>'`) — no duplicate tabs.

### R2 — Staleness rule for DispatchProgress

Precise staleness rule (implemented in `buildRail()`):

```
isCurrentTicket = (
  viewedTicketId !== '' &&
  poState.current_task?.ticket_id === viewedTicketId
)

isActivePersona(personaId) = (
  isCurrentTicket &&
  normalizedPersonaId(poState.current_task?.assignee_persona) === personaId
)
  where normalizedPersonaId(s) = s?.replace('pdt-', '') ?? ''
```

Rail-state resolution (replaces current `isOwner + hasSession` logic):

| isActivePersona | hasSession (any key in persona_sessions matches personaId) | railState |
|---|---|---|
| true | any | `'active'` |
| false | true | `'idle'` |
| false | false | `'off'` |

- AC-4: `buildRail()` receives three new parameters: `viewedTicketId: string`,
  `currentTaskTicketId: string | undefined`, `currentTaskAssignee: string | undefined`.
  Existing `assignee` param (ticket frontmatter) is kept but no longer drives
  `active` state.
- AC-5: At call site (line 224), pass
  `ticketId` (viewed ticket), `poState?.current_task?.ticket_id`,
  `poState?.current_task?.assignee_persona`.
- AC-6: After fix, a persona whose session key exists in `persona_sessions` but
  whose ticket does NOT match `current_task.ticket_id` renders as `'idle'`, not
  `'active'`.
- AC-7: When `current_task` is null / undefined, all personas render as `'idle'`
  (session present) or `'off'` (no session) — none render `'active'`.

### R3 — i18n keys

- AC-8: Line 347 in `TicketDetailTab.tsx` replaces hardcoded strings with:
  ```tsx
  <span>{showFullSpec
    ? tMode('workspace.ticketDetail.hideFullSpec')
    : tMode('workspace.ticketDetail.showFullSpec')}
  </span>
  ```
- AC-9: `en.json` under `workspace.ticketDetail` gains:
  ```json
  "showFullSpec": "Show full spec",
  "showFullSpec.dev": "expand full ticket body",
  "hideFullSpec": "Hide full spec",
  "hideFullSpec.dev": "collapse full ticket body"
  ```
- AC-10: `ko.json` under `workspace.ticketDetail` gains:
  ```json
  "showFullSpec": "전체 spec 보기",
  "showFullSpec.dev": "티켓 전체 본문 펼치기",
  "hideFullSpec": "전체 spec 숨기기",
  "hideFullSpec.dev": "티켓 전체 본문 접기"
  ```

### R4 — Section order + default expanded

- AC-11: `useState(false)` on line 181 → `useState(true)` (full spec expanded by default).
- AC-12: In the JSX returned for `loadState === 'done'`, the render order of
  sections is:
  1. `§2.0 Header`
  2. `§2a KR body` (MdRenderer / noKrHint)
  3. **`§2b DispatchProgress`** (moved up)
  4. **Full spec collapsible** (moved down)
- AC-13: No other changes to either section's markup or styling.

## Out of scope

- Editing ticket data from the detail view (read-only viewer — no edit affordance).
- `buildRail` showing session start/end timestamps.
- Kanban drag-and-drop reorder.
- Filtering or searching kanban by assignee / version.

## Plan

| # | File | Change |
|---|---|---|
| 1 | `TicketDashboardView.tsx` | In `TicketDashboardView` component body: extract `openTab = useWorkspace((s) => s.openTab)`. Pass to `Card` as prop (or lift hook into `Card` — either approach OK; prop is simpler since `useWorkspace` is already imported at module level). |
| 2 | `TicketDashboardView.tsx` | `Card` component: add `onClick` handler → `openTab('ticket-detail:' + ticket.ticket_id, 'ticket-detail', { ticketId: ticket.ticket_id }, ticket.ticket_id)`. Add `cursor: 'pointer'` to `card` style object. |
| 3 | `TicketDetailTab.tsx` | Extend `buildRail()` signature: add `viewedTicketId: string`, `currentTaskTicketId: string \| undefined`, `currentTaskAssignee: string \| undefined` after existing `personaSessions` param. |
| 4 | `TicketDetailTab.tsx` | Inside `buildRail()` map callback: replace `isOwner` / active logic with staleness rule (AC-4 table). Keep `hasSession` derivation unchanged. |
| 5 | `TicketDetailTab.tsx` | Call site (line 224): update `buildRail(...)` call to pass `ticketId`, `poState?.current_task?.ticket_id`, `poState?.current_task?.assignee_persona`. |
| 6 | `TicketDetailTab.tsx` | Line 181: `useState(false)` → `useState(true)`. |
| 7 | `TicketDetailTab.tsx` | JSX section order: cut DispatchProgress `<section>` block, paste it above the full-spec collapsible `<div>`. |
| 8 | `TicketDetailTab.tsx` | Line 347: replace hardcoded strings with `tMode(...)` calls (AC-8). |
| 9 | `en.json` | Add 4 locale keys under `workspace.ticketDetail` (AC-9). |
| 10 | `ko.json` | Add 4 locale keys under `workspace.ticketDetail` (AC-10). |

### Risk note — `buildRail` persona-key normalization

`current_task.assignee_persona` is stored as `'pdt-designer'` (prefixed).
`personaId` inside `buildRail()` is already the bare key (`'designer'`).
Step 4 must strip `'pdt-'` from `currentTaskAssignee` before comparing:
`currentTaskAssignee?.replace('pdt-', '') === id` — same pattern already used
elsewhere in the file (line 139).
