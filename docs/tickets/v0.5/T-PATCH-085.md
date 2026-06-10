---
ticket_id: T-PATCH-085
version: v0.5
slug: layout-panel-width-fix
title: Layout column crush fix + PO chat width expansion
type: impl
status: done
phase: 3
assignee: pdt-developer
requires_qa: true
requires_user_gate: false
area_tag: gui-layout-shell
estimated_complexity: L2
risk_flags: []
created_at: 2026-06-10T00:00:00Z
qa_status: pass
---

# T-PATCH-085: Layout column crush fix + PO chat width expansion

## Request

At small window widths the left project/version sidebar crushes to unreadable
(text wraps vertically). Separately, the PO chat panel is capped too
conservatively — the user wants freedom to make it substantially wider.

**R1a — Sidebar crush fix.** The left sidebar must never drop below 200 px at
realistic desktop window sizes. Current bug: `clampSidebarWidth` reserves
`CENTER_MIN_WIDTH = 480 px` for the center column when computing `availableMax`,
which means the sidebar is forced below its 200 px minimum any time
`shellWidth < (48 + 4 + 200 + 4 + 480 + 280) = 1016 px`. Most laptops
(e.g. 900–1100 px) fall in this range.

**R1b — Chat panel width expansion.** `PO_CHAT_MAX_WIDTH = 560` caps the
draggable chat panel hard. User wants substantially more. Raise to 800 px and
update the clamping helper so the larger value is actually reachable.

## Acceptance

### R1a — sidebar crush

- AC-1: Add constant `CENTER_MIN_LAYOUT = 320` in `constants.ts`. This is the
  center-column budget used by sidebar / chat clamping helpers — distinct from
  `CENTER_MIN_WIDTH = 480`, which is kept for any other uses.
- AC-2: In `helpers.ts`, change `clampSidebarWidth` and `clampPoChatWidth` to
  reference `CENTER_MIN_LAYOUT` (320) instead of `CENTER_MIN_WIDTH` (480) in
  their `availableMax` formulas:
  ```ts
  // clampSidebarWidth — was CENTER_MIN_WIDTH:
  const availableMax = shellWidth
    - ACTIVITY_BAR_WIDTH
    - RESIZE_HANDLE_WIDTH
    - CENTER_MIN_LAYOUT        // ← was CENTER_MIN_WIDTH (480)
    - RESIZE_HANDLE_WIDTH
    - poChatWidth

  // clampPoChatWidth — same swap:
  const availableMax = shellWidth
    - ACTIVITY_BAR_WIDTH
    - RESIZE_HANDLE_WIDTH
    - sidebarWidth
    - RESIZE_HANDLE_WIDTH
    - CENTER_MIN_LAYOUT        // ← was CENTER_MIN_WIDTH (480)
  ```
- AC-3: Result: sidebar protected at ≥ 200 px for all windows ≥ 856 px wide
  (48 + 4 + 200 + 4 + 320 + 280 = 856 px), covering MacBook Air 13" and all
  typical 1024 px+ laptop ranges. Previously required ≥ 1016 px.
- AC-4: `CENTER_MIN_WIDTH` constant is **not removed** — only its role in the
  two clamp helpers is replaced. Any other reference to `CENTER_MIN_WIDTH`
  is left unchanged.
- AC-5: At window widths < 856 px (truly tiny windows), the existing
  `clampPanelWidth` graceful-fallback path already allows shrinking below min.
  Add `overflowX: 'auto'` to the shell outer wrapper (the `<div ref={shellRef}>`
  root element in `WorkspaceShell.tsx`) so the layout scrolls horizontally
  rather than visually crushing. This condition only triggers at extreme sizes
  not seen in normal desktop use.

### R1b — chat panel width expansion

- AC-6: In `constants.ts`, raise `PO_CHAT_MAX_WIDTH` from `560` to `800`.
- AC-7: `PO_CHAT_DEFAULT_WIDTH` stays at `340` — existing localStorage
  preference is unaffected; users must drag to reach the expanded range.
- AC-8: At a 1280 px window with sidebar at 200 px, effective chat max becomes
  `1280 - 48 - 4 - 200 - 4 - 320 = 704 px` (bounded by 800 constant) — ~144 px
  gain vs old 560 cap. At 1440 px: 800 px is fully reachable. User can make
  the chat panel occupy ~55 % of workspace at 1440 px (vs ~39 % before).
- AC-9: The two-pass viewport sync in `syncLayoutWidthsToViewport`
  (`useResizeLayout.ts`) is **not changed** — new constants flow through it
  automatically on window resize.

### Verification

- AC-10: Window at 900 px — drag sidebar fully left → stops at 200 px; no
  text crush visible in LeftSidebar.
- AC-11: Window at 1440 px — drag chat panel fully right → reaches ≥ 700 px.
  Old hard stop at ~560 px is gone.
- AC-12: `tsc` + GUI build pass with no errors from constant rename.
- AC-13: Resize window 1440 → 800 → 1440 px — no reflow glitch; sidebar
  stays ≥ 200 px until window < 856 px.

## Out of scope

- Changing `CENTER_MIN_WIDTH = 480` itself (used for content layout elsewhere).
- Auto-collapse of sidebar to icon-only at small windows (can follow up if
  horizontal-scroll fallback is unsatisfactory to the user).
- Persisting the expanded chat width — existing localStorage persistence in
  `persistWidth` already covers this.
- Raising `SIDEBAR_MAX_WIDTH` (currently 420 px; sufficient for current content).

## Plan

| # | File | Change |
|---|---|---|
| 1 | `shell/constants.ts` | Add `CENTER_MIN_LAYOUT = 320`. Raise `PO_CHAT_MAX_WIDTH` from `560` to `800`. |
| 2 | `shell/helpers.ts` | Replace `CENTER_MIN_WIDTH` with `CENTER_MIN_LAYOUT` in `clampSidebarWidth` and `clampPoChatWidth` `availableMax` formulas (2 lines). Add import of `CENTER_MIN_LAYOUT`. |
| 3 | `views/WorkspaceShell.tsx` | Add `overflowX: 'auto'` to root `<div ref={shellRef}>` wrapper style. |

### QA scope

| Area | Check |
|---|---|
| Sidebar crush 900 px | Drag sidebar left → stops at 200 px, text readable |
| Sidebar normal 1280 px | Sidebar usable at 240 px default; drags 200–420 px freely |
| Chat expansion 1440 px | Drag chat right → reaches ~800 px |
| Chat expansion 1280 px | Drag chat right → reaches ~700 px |
| Default unchanged | Fresh launch (no localStorage) → sidebar 240 px, chat 340 px |
| Resize loop | Window 1440 → 800 → 1440 px; no layout glitch or reflow jump |
| Build | `tsc` pass, no import errors |

## Outcome

_To be filled at Phase 5._

## Persona Activity

_PO-managed._

## Persona Activity
- 2026-06-10 QA fail strike1: AC-3 ambiguity resolved by PO per user directive — sidebar 200px = HARD floor at all window widths; shrink order chat->min(280) then center->CENTER_MIN_LAYOUT(320); below sum, grid min-width forces horizontal scroll (overflowX). AC-5 defect: grid lacked min-width so scroll never engaged.
