# T-P4-128 — Expand-on-demand popover: Tickets + Version History tabs

**Author:** pdt-designer · **Date:** 2026-05-19 · **Complexity:** L2

---

## §0 Context

T-P4-123 shipped an ⓘ-button + position:fixed popover for SkillMatrix skill descriptions.
User directive (2026-05-18): apply the same expand-on-demand pattern to truncated text
in the Tickets and Version History tabs.

---

## §1 Long-text field survey

### VersionHistoryView (`src/views/VersionHistoryView.tsx`)

Component: `TicketCard`

| Field | CSS | Truncation active? | Action |
|:--|:--|:--|:--|
| `ticket.title` | `textOverflow:'ellipsis'`, `whiteSpace:'nowrap'`, `flex:1` | **Yes** — any title >1 line is cut | ✅ InfoPopover |
| `activityResult` | `textOverflow:'ellipsis'`, `whiteSpace:'nowrap'`, `flex:1` | **Yes** — activity row result clipped | ✅ InfoPopover |

### VersionDetailView (`src/components/workspace/VersionDetailView.tsx`)

| Component | Field | CSS | Truncation active? | Action |
|:--|:--|:--|:--|:--|
| `TicketRow` | `ticket.title` | `textOverflow:'ellipsis'`, `whiteSpace:'nowrap'`, `flex:1` | **Yes** | ✅ InfoPopover |
| `ApprovedPromotionsCard` | `promoDelta` | manual `.slice(0,80)+'…'` (line 215–217) | **Yes** | ✅ InfoPopover |

### TicketDashboardView (`TicketDashboardView.tsx`)

| Component | Field | CSS | Truncation active? | Action |
|:--|:--|:--|:--|:--|
| `Card` | `ticket.title` | wraps freely (`lineHeight:1.4`, no overflow) | **No** — wraps, info visible | ❌ Skip |

Kanban card titles wrap across lines — no information hidden. Popover would be redundant here.

---

## §2 i18n decision

**T-P4-123 i18n layer (static key mapping + Google Translate)**: does NOT apply here.

Ticket titles, activity results, and promotion deltas are **user-authored content** — mixed
ko/en, user-controlled, no static translation dictionary makes sense.

**What does carry over**: the ⓘ button `aria-label` is a UI label → 1 new i18n key:

```json
// ko.json → workspace.common
"viewFullText": "전체 내용 보기"

// en.json → workspace.common
"viewFullText": "View full text"
```

No other i18n additions needed.

---

## §3 Shared component — `InfoPopover`

### Rationale

SkillMatrixTab has ~60 lines of inline popover state + logic + JSX. Applying to 2 more
files without extraction = 3× duplicate state/logic. Extract to shared component.

### Path

`packages/gui/src/components/shared/InfoPopover.tsx`

### API

```tsx
interface InfoPopoverProps {
  /** Full text to display in the popover. */
  text: string
  /** Minimum char length to render the button. Default: 50. */
  threshold?: number
  /** aria-label on the ⓘ button. Default: t('workspace.common.viewFullText') */
  ariaLabel?: string
}

export function InfoPopover({ text, threshold = 50, ariaLabel }: InfoPopoverProps)
```

**Behavior:**
- If `text.length <= threshold` → render nothing (text fits inline, no button needed).
- Else → render `<Info size={11} />` button (identical to SkillMatrix ⓘ style).
- Click → position:fixed popover below-left of button (same viewport collision logic
  as SkillMatrix: flip-right if overflow-x; flip-above if overflow-y).
- Esc or outside-click → close.
- All state (`open`, `pos`) is local to the component instance — no parent state needed.
- `aria-label` falls back to `t('workspace.common.viewFullText')`.
- `role="tooltip"` on popover div (same as SkillMatrix).

**Mutex note:** Each instance owns its state. Clicking a new ⓘ while another is open:
outside-click handler on the first fires (new button is outside first's ref) → first
closes. Then second opens. Effective mutex without shared state.

### SkillMatrixTab refactor

Remove inline popover state/logic from `SkillMatrixTab.tsx`:
- Remove: `openSkillId`, `popoverPos`, `popoverRef`, `handleInfoClick`, popover JSX block
  (currently ~60 lines: lines 43–44, 46–47, 127–154, 262–287).
- Replace the `<button>` + popover block in the skill row with:
  ```tsx
  <InfoPopover text={t(`skills.descriptions.${skillIdToI18nKey(skill.id)}`,
    { defaultValue: skill.description })} />
  ```

Net: SkillMatrixTab loses ~55 lines; gets a 1-line import + 1-line usage.

---

## §4 Apply to VersionHistoryView

### TicketCard — title

Current:
```tsx
const cardTitle: React.CSSProperties = {
  flex: 1, fontSize: 12, color: '#E0E0E0', fontWeight: 500,
  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
}
// renders: <span style={cardTitle}>{ticket.title}</span>
```

Change: add `<InfoPopover text={ticket.title} />` adjacent to the title span (same row):
```tsx
<div style={cardHeader}>
  <span style={cardTicketId}>{ticket.ticket_id}</span>
  {ticket.title && (
    <>
      <span style={cardTitle}>{ticket.title}</span>
      <InfoPopover text={ticket.title} />
    </>
  )}
  <span style={statusPill(status)}>{statusLabel(status)}</span>
</div>
```

### TicketCard — activityResult

Current:
```tsx
const activityResult: React.CSSProperties = {
  color: '#A0A0A0', flex: 1, overflow: 'hidden',
  textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%',
}
// renders: <span style={activityResult}>{row.result}</span>
```

Change:
```tsx
<div style={activityRow} key={i}>
  <span style={activityPersona}>{row.persona}</span>
  <span style={activityResult}>{row.result}</span>
  <InfoPopover text={row.result} threshold={40} />
</div>
```

Activity rows are short context — lower threshold (40 chars) avoids button on trivial entries.

---

## §5 Apply to VersionDetailView

### TicketRow — title

Current (`ticketTitle` style, lines 445–451):
```tsx
const ticketTitle: React.CSSProperties = {
  color: '#E0E0E0', flex: 1,
  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
}
// renders: <span style={ticketTitle}>{ticket.title ?? ticket.slug ?? '(no title)'}</span>
```

Change:
```tsx
<div style={ticketRow}>
  <span style={ticketId}>{ticket.ticket_id}</span>
  <span style={ticketTitle}>{ticket.title ?? ticket.slug ?? '(no title)'}</span>
  <InfoPopover text={ticket.title ?? ticket.slug ?? ''} />
  <span style={statusBadge(status)}>{status}</span>
  ...
</div>
```

### ApprovedPromotionsCard — promoDelta

Current (lines 215–217):
```tsx
<span style={promoDelta} title={p.final_target ?? p.delta}>
  {(p.final_target ?? p.delta).slice(0, 80)}{((p.final_target ?? p.delta).length > 80) ? '…' : ''}
</span>
```

Change — remove manual slice, let CSS ellipsis handle display, add InfoPopover:
```tsx
<span style={promoDelta}>
  {p.final_target ?? p.delta}
</span>
<InfoPopover text={p.final_target ?? p.delta} threshold={80} />
```

`promoDelta` CSS already has `flex:1 + overflow:hidden + textOverflow:ellipsis + whiteSpace:nowrap`.

---

## §6 UX consistency check (§1.5 checklist)

| Principle | Applied |
|:--|:--|
| **Few things** | 1 new shared component; only truncated fields get button |
| **Familiar** | Same ⓘ icon + popover visual as SkillMatrix; users already know this pattern |
| **Predictability** | Button only appears when text is actually truncated (threshold guard) |
| **Feedback** | Button active-state styling (same `infoBtnStyle(active)` as SkillMatrix) |
| **Escape** | Esc key + outside-click close — identical to SkillMatrix |

ⓘ button style (identical to SkillMatrix — copy to `InfoPopover`):
```tsx
// InfoPopover button — mirrors SkillMatrixTab infoBtnStyle
{
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: 18, height: 18, borderRadius: 3, border: 'none',
  background: open ? '#2A3A5A' : 'transparent',
  color: open ? '#60A5FA' : '#404040',
  cursor: 'pointer', padding: 0, verticalAlign: 'middle', flexShrink: 0,
}
```

---

## §7 Edge cases

| Case | Handling |
|:--|:--|
| `text.length <= threshold` | Return `null` from InfoPopover — no button rendered |
| `text` empty string | `''.length <= 50` → null — safe |
| Popover overflow right | Flip left: `left = rect.right - POPOVER_WIDTH` |
| Popover overflow bottom | Flip above: `top = rect.top - POPOVER_MAX_HEIGHT - 4` |
| Multiple open | Outside-click closes previous before new opens (see §3 mutex note) |

---

## §8 Files to touch

| File | Change type |
|:--|:--|
| `packages/gui/src/components/shared/InfoPopover.tsx` | **NEW** — extracted shared component |
| `packages/gui/src/components/workspace/main/panes/SkillMatrixTab.tsx` | **REFACTOR** — remove inline popover, use InfoPopover |
| `packages/gui/src/views/VersionHistoryView.tsx` | **ADD** — InfoPopover on TicketCard title + activityResult |
| `packages/gui/src/components/workspace/VersionDetailView.tsx` | **ADD** — InfoPopover on TicketRow title + promoDelta |
| `packages/gui/src/locales/ko.json` | `workspace.common.viewFullText` key |
| `packages/gui/src/locales/en.json` | `workspace.common.viewFullText` key |

---

## §Out of scope

- Ticket schema changes
- TicketDashboardView (kanban) — title wraps freely, no info hidden
- LLM translation of user-authored content
- i18n key mapping for ticket/version content (user-authored)

---

## §QA scope

| Field | Value |
|:--|:--|
| **QA invoke** | `manual smoke only` |
| **test target** | `VersionHistoryView.TicketCard`, `VersionDetailView.TicketRow` + `ApprovedPromotionsCard` |
| **사용자 dogfood** | VersionHistory 탭: 긴 제목 ticket 카드에서 ⓘ 클릭 → popover 노출 확인; activity result ⓘ 확인; VersionDetail 탭: ticket row 제목 ⓘ, promoDelta ⓘ 확인; Esc / 외부 클릭 닫힘 확인 |
| **regression check** | SkillMatrixTab popover — InfoPopover 추출 후 기존 동작 (Esc / outside-click / viewport flip) 동일 확인 |
