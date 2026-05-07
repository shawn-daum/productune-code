# T-P4-046 Implementation Plan — Main split-pane + tab dispatcher (10 type) + drag-drop

**Round**: phase4-r4  **Stage**: impl-plan (developer-internal)  **Status**: drafted by pdt-developer 2026-05-07
**Spec source**: [docs/tickets/phase4/T-P4-046.md](../tickets/phase4/T-P4-046.md), [docs/design/service-flow-and-screens.md §4.2](./service-flow-and-screens.md)
**Consumers (followers)**: T-P4-045 / 047 / 048 / 049 — all open tabs through the API defined here.

> Plan-driven implementation; PO has waived a review checkpoint for this ticket. Plan refines as ambiguity is hit.

---

## 1. Pane tree data model

Recursive discriminated union, stored in zustand:

```ts
type Pane =
  | { type: 'leaf'; paneId: string; tabs: Tab[]; activeTabId: string | null }
  | { type: 'hbox'; children: [Pane, Pane]; ratio: number }   // ratio = left child width fraction (0..1)
  | { type: 'vbox'; children: [Pane, Pane]; ratio: number }   // ratio = top child height fraction (0..1)

interface Tab {
  id: string                 // stable id — `${type}:${key}`, e.g. 'markdown:prd', 'version-detail:V0.1'
  type: TabType              // 11 types (see §3)
  title: string              // short label for tab bar; localized when persisted, raw when type-derived
  props?: Record<string, unknown>
  closable?: boolean         // default true; init pane's "Welcome" pane has no tabs (empty leaf), no closable concept
}
```

Why two-children only (instead of N-ary `hbox/vbox` with array): VS Code / cmux paradigm uses binary splits with nested boxes. Easier reducer logic, ratio simply 0..1, drop zone math obvious. N-ary can come later if needed.

`activePaneId: string | null` lives alongside `panes: Pane` at store root.

**Init pane**: single `leaf` with `paneId='pane-1'`, `tabs: []`, `activeTabId: null`. Empty-state (T-P4-046 §Empty pane) renders when `tabs` is empty.

**ID generation**: monotonic counter `nextPaneSeq` in store (`pane-1, pane-2…`); never reused so React keys stable.

---

## 2. Store shape additions (`packages/gui/src/store/workspace.ts`)

```ts
interface WorkspaceState {
  // ...existing
  panes: Pane
  activePaneId: string
  nextPaneSeq: number

  openTab: (tabId: string, type: TabType, props?: object, title?: string) => void
  closeTab: (paneId: string, tabId: string) => void
  setActiveTab: (paneId: string, tabId: string) => void
  setActivePane: (paneId: string) => void
  splitRight: (paneId: string) => void
  splitDown: (paneId: string) => void
  closePane: (paneId: string) => void
  moveTab: (
    fromPaneId: string,
    tabId: string,
    target:
      | { kind: 'tab-before' | 'tab-after'; paneId: string; refTabId: string }
      | { kind: 'bar-end'; paneId: string }
      | { kind: 'pane-zone'; paneId: string; zone: 'top' | 'right' | 'bottom' | 'left' | 'center' }
  ) => void
  setPaneRatio: (path: number[], ratio: number) => void   // path = walk indices to the box
}
```

Path-based ratio set: traversal yields a list of `0|1` (left/right child) — for the resize handle this is gathered when the handle is rendered.

### Reducer helpers
- `findLeafPath(root, paneId): number[]`
- `replaceAt(root, path, newSubtree): Pane`
- `removePane(root, paneId): { tree, removedTabs }` — when a leaf is removed, its sibling box collapses up. If pane removed had tabs, its tabs are absorbed into the **adjacent leaf** (parent's other child if leaf, otherwise leftmost descendant leaf).
- `splitLeaf(root, paneId, axis: 'h' | 'v', side: 'right' | 'down'): tree` — replaces leaf with `hbox/vbox(originalLeaf, newEmptyLeaf)`, ratio=0.5.

### Last-pane reset
If `closePane` would leave 0 panes, reset to fresh init leaf instead.

---

## 3. Tab type dispatcher (11 types)

Decision: use **11 types**, splitting `markdown` from a dedicated `version-detail`. Reason: VersionDetailView is structured (header / phase timeline / outcome card / stage groups) — wedging this through `markdown` props would force a generic md type to know about Versions. `ticket-review` is similarly structured. Both get dedicated tab types.

| TabType | This ticket | Component |
|---|---|---|
| `markdown` | full (placeholder body — md-toolbar + md-view stub; PRD/notes will plug in via props.path later) | `tabs/MarkdownTab.tsx` |
| `version-detail` | full (wraps existing `VersionDetailView`; props: `{ versionId }`) | `tabs/VersionDetailTab.tsx` |
| `ticket-review` | full (wraps existing `TicketDashboardView` for board view; props: `{ ticketId? }` for single review when given) | `tabs/TicketReviewTab.tsx` |
| `design-gate`, `qa-result`, `persona-def`, `env-view`, `skill-matrix`, `preview`, `terminal`, `browser` | placeholder — `T-P4-04X 에서 채워짐` message | `tabs/PlaceholderTab.tsx` |

Dispatcher: `tabs/TabContent.tsx` switches on `type` and renders. Unknown type → red error banner (defensive).

**Tab title resolution**: if explicit title in `Tab.title` → use; else lookup in a small static table per type using props (e.g. `version-detail` → versionId); else type-cased label.

---

## 4. Drag-and-drop — HTML5 native

**Decision: HTML5 native DnD** (not react-dnd):
- No new dependency (already pulling 4 frontend libs);
- VS Code uses native DnD; the tab-bar + pane-zone interactions fit naturally;
- Glow/insert-line feedback is pure CSS based on a single `dragOver` state in store.

Drag state lives transient in component refs + a small `dragHint` slice in store:

```ts
dragHint:
  | null
  | { kind: 'tab-before' | 'tab-after'; paneId: string; tabId: string }
  | { kind: 'bar-end'; paneId: string }
  | { kind: 'pane-zone'; paneId: string; zone: 'top' | 'right' | 'bottom' | 'left' | 'center' }
```

Tab `<button>` sets `draggable=true`, `dataTransfer.setData('application/x-productune-tab', JSON.stringify({fromPaneId, tabId}))`.

### Drop zone rules
- **Tab area**: `onDragOver` measures cursor x relative to tab midpoint → emit `tab-before/tab-after` hint. CSS adds 2px PO-orange line.
- **Tab bar empty space (after last tab)**: emit `bar-end` hint; CSS highlights bar bg.
- **Pane body**: divide pane bbox into 5 zones with 25% margin frames:
  - top-25%, right-25%, bottom-25%, left-25%, center (the rest).
  - top/right/bottom/left → split before drop; center → just move into target pane.
  - CSS: a single overlay `<div>` per pane shows the half-pane glow rectangle representing the resulting split.

`onDrop` reads `dataTransfer`, calls `moveTab({...target})`. Reducer interprets:
- `tab-before/after` / `bar-end` → reorder (same pane) or move (cross-pane);
- `pane-zone center` → move tab into target pane;
- `pane-zone top/right/bottom/left` → splitDown/splitRight on target pane (top/left = inverse — original target ends up on bottom/right of new split), then move tab into the newly created sibling.

Inverse-split helper: when `top/left`, after split swap children to put new pane first.

---

## 5. Pane resize

A 4px handle `<div>` rendered between siblings in `hbox` / `vbox`. mousedown sets active drag with parent path; mousemove computes ratio = (mouseDelta + startRatio*containerSize)/containerSize, clamped so each child ≥ minSize (150 / 100). mouseup releases.

Min size enforcement: clamp ratio at the moment it would push a child below min. Container size measured via `ResizeObserver` on the box `<div>` (cached in component state).

---

## 6. Keyboard

Window-level keydown listener mounted in `WorkspaceShell`:
- `Cmd+W` (`metaKey && key==='w'`) → `closeTab(activePaneId, activeTabId)` if any.
- `Cmd+\\` → `splitRight(activePaneId)`.
- Chord `Cmd+K` then `Cmd+\\` → `splitDown`. Implemented as a `chordPending: 'cmd-k' | null` state with 1s timeout.
- `Cmd+P` → `window.dispatchEvent(new CustomEvent('productune:quick-open'))` — listener added later in T-P4-047. preventDefault to swallow browser print.
- All listeners check `e.metaKey` (mac) || `e.ctrlKey` (other OS) and `preventDefault` on match.

Don't trigger when target is `<input>/<textarea>/[contenteditable]` (chat textbox safety).

---

## 7. WorkspaceShell integration

- Replace `<CenterPane>` with `<MainPanel>` (new component).
- `MainPanel` reads `panes` and `activePaneId`, renders pane tree recursively via `<PaneNode>`.
- `PhaseTransitionGate` stays sticky above the pane tree (current placement preserved — gate banner OUTSIDE pane tree).
- Remove old `selectedVersionId` driving — VersionsPanel will now call `openTab('version-detail:'+id, 'version-detail', { versionId: id }, id)` instead of `setSelectedVersionId`.
- Tickets activity icon: when user clicks the Tickets icon in ActivityBar, open / focus a `'ticket-review:board'` tab in active pane (single board tab; dedupe). LeftSidebar's "Ticket board is in the center panel" hint stays.
- Keep `selectedVersionId` in store for now (legacy compat, no consumer in main pane), but remove its read from CenterPane (which gets removed). VersionsPanel highlight uses tab-id set membership instead.

---

## 8. File layout

New:
```
packages/gui/src/components/workspace/main/
  MainPanel.tsx              — root; renders PaneNode + PhaseTransitionGate sticky
  PaneNode.tsx               — recursive (hbox/vbox/leaf)
  LeafPane.tsx               — tab bar + body; active border; drop zone overlay
  TabBar.tsx                 — tab strip + close + drag listeners
  TabContent.tsx             — dispatcher
  EmptyPane.tsx              — empty-state body
  ResizeHandle.tsx           — 4px handle
  panes/
    MarkdownTab.tsx          — md-toolbar + md-view (placeholder body for non-PRD)
    VersionDetailTab.tsx     — wraps VersionDetailView
    TicketReviewTab.tsx      — wraps TicketDashboardView when no ticketId
    PlaceholderTab.tsx       — generic "T-P4-04X 에서 채워짐"
```

`packages/gui/src/store/workspace.ts` — add pane tree slice (no breaking changes to messages/poState slice).

`packages/gui/src/views/WorkspaceShell.tsx` — replace `<CenterPane>` with `<MainPanel>`, attach keyboard listener, wire ActivityBar `tickets` click.

`packages/gui/src/components/workspace/VersionsPanel.tsx` — replace `setSelectedVersionId` with `openTab`. Selected highlight reads `activeTabId` of active pane (or any tab matching `'version-detail:'+id`).

`packages/gui/src/components/workspace/CenterPane.tsx` — DELETE (or stub for fallback). Removed.

i18n (en + ko):
- `workspace.main.empty.title` "Open a file or run a command" / "파일을 열거나 명령을 실행하세요"
- `workspace.main.empty.kbd.quickOpen` / `splitRight` / `closeTab` (한글: "빠른 열기" / "오른쪽 분할" / "탭 닫기")
- `workspace.main.tab.close` aria/title "Close tab" / "탭 닫기"
- `workspace.main.placeholder.body` "Filled in {{ticket}}" / "{{ticket}} 에서 채워짐"
- `workspace.main.markdown.placeholder` "Markdown viewer — content wired in later tickets" / "마크다운 뷰어 — 추후 티켓에서 컨텐츠 연결"
- `workspace.main.tickets.boardTitle` "Tickets" / "티켓"
- `workspace.main.versionDetail.titlePrefix` (no-op — uses raw versionId)

---

## 9. Verification ordering (self-test)

1. `pnpm tsc --noEmit` (gui)
2. `pnpm -r build` (root)
3. `node packages/gui/scripts/check-locale-keys.js`
4. `bash packages/gui/scripts/check-locale-protected.sh`
5. Manual dogfood — see ticket Verification.

---

## 10. Out of scope (explicit, T-P4-046 not blocking)

- Layout persistence — Phase 5.
- Cmd+P listener — T-P4-047.
- node-pty terminal — later.
- 3+ pane complex layouts (basic 2-pane works, more not stress-tested).
- `.rp-persona-bar` — T-P4-049.
