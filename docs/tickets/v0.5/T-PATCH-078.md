---
ticket_id: T-PATCH-078
version: v0.5
phase: 3
type: build
status: done
assignee: pdt-developer
created_at: 2026-06-09T00:00:00Z
estimated_complexity: L3
risk_flags: []
slug: per-version-prd-viewer
qa_status: pass
requires_qa: true
requires_user_gate: false
area_tag: gui-version-viewer
---

# T-PATCH-078: Per-version PRD viewer in main pane

## Request

shawn (Plan B ad-hoc): from the current version OR any version-history row, open a main-pane view that shows THAT version's PRD section first, then that version's tickets in id order. Ticket rows show id + title + status; clicking a ticket opens it. PRD render is read-only. Reuse existing version entry points (`SidePanelCurrentVersion`, `VersionsPanel`, `VersionHistoryView`), the ticket scan helper (`useTicketScan`), and the existing markdown render path (`MarkdownViewer` / `DoctrineFileTab` / `artifact-md`). PRD lives at `docs/prd/productune.md` with per-version anchors; tickets live at `docs/tickets/<version>/`.

## Acceptance

- AC-1 (new tab type): Given a version id `V`, When the PRD-viewer affordance is triggered, Then `openTab('version-prd:V', 'version-prd', { versionId: V }, V)` opens a single main-pane tab. Re-triggering for the same `V` focuses the existing tab (relies on `openTab`'s global tab-id dedupe) — it does not duplicate.
- AC-2 (entry — current version): Given `SidePanelCurrentVersion`'s detail card is rendered, Then a distinct secondary affordance (lucide `FileText` icon-button, tooltip "버전 PRD") opens `version-prd:<currentVersionId>`. The existing card-body click → `ticket-review:<v>` behavior is preserved unchanged (the new affordance must not hijack it; click must `stopPropagation`).
- AC-3 (entry — history rows): Given a row in the version list (`VersionsPanel` / each `VersionRow` surfaced by `VersionHistoryView`), Then the same `FileText` affordance on the row opens `version-prd:<thatRowVersionId>` for that row's version (not the current version).
- AC-4 (PRD section first): Given the `version-prd` tab for `V` mounts, Then it reads `docs/prd/productune.md` and renders ONLY the section anchored to `V` (heading whose text matches `V`, e.g. `v0.5`, down to the next sibling heading of equal/higher level), rendered read-only via the existing markdown renderer used by `artifact-md` / `MarkdownViewer`. No edit affordance is shown.
- AC-5 (anchor miss fallback): Given `V` has no matching anchor in the PRD, Then the PRD region shows a non-blocking inline notice ("이 버전의 PRD 섹션을 찾을 수 없습니다") and the ticket list below still renders. The tab does not throw or render blank.
- AC-6 (tickets after PRD, id order): Given the tab is rendered, Then below the PRD section a "Tickets" list shows every ticket from `useTicketScan` where `ticket.version === V`, sorted by id (numeric-aware: `T-001` < `T-010`; `T-PATCH-005` < `T-PATCH-078`). Each row shows id + title + a status badge using the canonical 7-status vocabulary (reuse the existing status-badge styling used by `ticket-review` / `VersionDetailView`).
- AC-7 (ticket open): Given a ticket row, When clicked, Then it opens that ticket in the main pane using the existing ticket-open route (`openTab('ticket-detail:<id>', 'ticket-detail', { ticketId, version: V }, <id>)`, matching how `ticket-review` opens a ticket). The PRD-viewer tab remains open.
- AC-8 (empty tickets): Given `V` has zero scanned tickets, Then the Tickets list shows the standard empty state (text only, no CTA) and the PRD section still renders above it.
- AC-9 (read-only invariant): No create / edit / delete affordance appears anywhere in the `version-prd` tab.
- AC-10 (i18n): All static labels (tab affordance tooltip, "Tickets" header, anchor-miss notice, empty state) use `t(...)` keys present in both KO and EN.

## Out of scope

- Editing the PRD or tickets from this view (read-only render only).
- Adding/altering PRD per-version anchors or the PRD file format.
- A diff/compare-across-versions mode (single version per tab only).
- Changing the existing `ticket-review` tab or `VersionDetailView` behavior beyond adding the new entry affordance.
- Rendering artifacts in this tab (that is T-PATCH-079's surface).

## Plan

**New TabType** — add `'version-prd'` to the `TabType` union in `packages/gui/src/store/workspace.ts` and register a `defaultTitle` case (title = versionId). Route it in the main-pane tab renderer (the switch that maps `tab.type` → pane component, same place `artifact-md` / `ticket-review` are routed).

**New view component** — `packages/gui/src/components/workspace/main/panes/VersionPrdPane.tsx`:
- Props: `{ versionId: string }` (from `tab.props`).
- Read PRD: reuse the existing file-read path that `artifact-md` / `MarkdownViewer` already use (read `docs/prd/productune.md` via the established `window.api` file-read IPC — do NOT add a new IPC if an existing read is available). Resolve the path against `useWorkspace((s)=>s.project).projectDir`.
- Slice the version section client-side: find the markdown heading line whose trimmed text equals `versionId` (case-insensitive, tolerate leading `#`s and a leading `v`), take everything until the next heading of the same or higher level. Render that slice with the same markdown renderer component used by `artifact-md` (read-only). On miss → AC-5 notice.
- Tickets: `const { tickets } = useTicketScan(projectDir)`; `tickets.filter(t => t.version === versionId)` then sort by an id comparator (split prefix vs trailing integer, compare numerically). Render rows reusing the status-badge + row styling from `ticket-review` / `VersionDetailView` (extract a shared `TicketStatusBadge` if not already shared — no visual redesign).
- Ticket row click → `openTab('ticket-detail:'+id, 'ticket-detail', { ticketId:id, version:versionId }, id)` (mirror existing ticket-open call site).

**Entry affordances** (icon-only `FileText`, lucide, no color emoji; reuse existing icon-button hover styling):
- `SidePanelCurrentVersion.tsx` — add the affordance inside the detail card header row; `onClick` must `e.stopPropagation()` then `openTab('version-prd:'+currentVersionId, ...)` so the card's own `ticket-review` click still works.
- `VersionsPanel.tsx` / `VersionRow` (consumed by `VersionHistoryView.tsx`) — add the same affordance per row, opening the row's own version id.

**Reuse / no new IPC**: ticket list via `useTicketScan` (already fs-scan + watcher-debounced); markdown render + file read via the existing `artifact-md` path; tab open/dedupe via `openTab`. No main-process changes expected beyond confirming the PRD-file read IPC already exists (if not, add a minimal read scoped to `docs/prd/*.md`).

### QA scope

| Area | Check |
|:--|:--|
| flow | affordance on current-version card AND on a history row each open `version-prd:<correct-version>`; re-trigger focuses, no dup tab |
| isolation | new affordance does not break the card's existing `ticket-review` click (stopPropagation verified) |
| render | correct PRD anchor slice shown for v0.5 and an older version (e.g. v0.3); next-heading boundary respected |
| ordering | tickets sorted id-ascending with numeric-aware compare across `T-NNN` and `T-PATCH-NNN` |
| resilience | missing anchor → inline notice + list still renders; zero tickets → empty state + PRD still renders; no throw |
| reuse | uses `useTicketScan`, existing md renderer, existing ticket-open route; read-only (no edit affordance) |
| i18n | KO + EN keys present for all static strings |

## Outcome

null

## Persona Activity

| persona | session_id | started_at | completed_at | model | effort |
|:--|:--|:--|:--|:--|:--|
