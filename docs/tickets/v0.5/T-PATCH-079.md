---
ticket_id: T-PATCH-079
version: v0.5
phase: 3
type: build
status: done
assignee: pdt-developer
created_at: 2026-06-09T00:00:00Z
estimated_complexity: L3
risk_flags: []
slug: auto-surface-review-artifact
qa_status: pass
requires_qa: true
requires_user_gate: false
area_tag: gui-artifacts
---

# T-PATCH-079: Auto-surface artifact to main pane when user confirmation is needed

## Request

shawn (Plan B ad-hoc): when an artifact is generated AND it needs user review/confirmation, auto-open it in the main pane instead of waiting for a manual sidebar click, and visibly mark it as needing review. Must NOT spam: dedupe already-seen artifacts, surface only genuinely new ones, and not steal focus destructively while the user is mid-edit. Reuse the existing artifact scan (`artifactsListScoped`), the `artifacts:reload` window event, the `openTab` extension routing, and ticket frontmatter `requires_user_gate` (via `useTicketScan`). There is currently NO auto-surface logic (manual click only).

## Acceptance

- AC-1 (exact trigger condition): An artifact is auto-surfaced iff ALL hold:
  1. it appears in `artifactsListScoped(projectDir, current_version)` after an `artifacts:reload` (i.e. file-watcher-driven, a genuinely new scan entry);
  2. it is NOT in the per-project "surfaced-seen" set (AC-4);
  3. it is review-gated — its owning ticket has frontmatter `requires_user_gate: true` AND ticket `status === 'user-verify'`. Ownership is resolved by matching the artifact filename prefix to a ticket id (artifact name convention `<ticket-id>-<slug>.<ext>`, e.g. `T-PATCH-077-foo.html` → `T-PATCH-077`), cross-referenced against `useTicketScan`.
- AC-2 (auto-open): Given a triggered artifact, When surfaced, Then it opens in the main pane via the SAME extension routing `ArtifactsPane` uses: `.html`→`'preview'` (LocalHtmlViewer), `.mmd`/`.mermaid`→`'artifact-mermaid'`, else→`'artifact-md'`, with identical `tabId` (`artifact:<relPath>`) and props, so it dedupes against a manually-opened tab.
- AC-3 (visible needs-review mark): Given an auto-surfaced tab, Then it carries a visible "needs review" marker (amber dot/badge using `var(--health-warn, #F59E0B)`, lucide only — no color emoji) on the tab AND/OR a one-line review banner in the pane. The marker clears once the user focuses that tab (becomes the active tab in its pane).
- AC-4 (dedupe / seen mechanism): A persisted per-project set of surfaced artifact relPaths (keyed by `projectDir`) records every artifact that has been auto-surfaced. Mechanism: a small zustand store persisted to `localStorage` (key `pdt:surfaced-artifacts:<projectDir>`), mirroring the persist pattern already used in `store/workspace.ts`. An artifact is surfaced at most once per project for its lifetime in the set; re-scans, app restarts, and repeated `artifacts:reload` events do NOT re-surface a seen artifact.
- AC-5 (no spam on first load / bulk): Given the FIRST scan after the project opens (no prior seen-set, or many pre-existing gated artifacts), Then pre-existing artifacts are seeded into the seen-set WITHOUT auto-opening (only artifacts that newly appear in a subsequent reload surface). At most ONE artifact is auto-activated per reload event; any additional newly-gated artifacts in the same batch are opened in the background (AC-6 rules) and counted as surfaced.
- AC-6 (don't steal focus mid-edit): Given the user is mid-edit — the active tab is a dirty/editable tab (e.g. a `doctrine-file` tab reported dirty by the existing `tabCloseGuard` / `canCloseTab`, or an editable markdown tab with unsaved input) — When an artifact triggers, Then the artifact tab is created in the BACKGROUND (added to a pane WITHOUT changing `activePaneId`/`activeTabId`) and shows the needs-review marker; it must not become the focused/active tab and must not interrupt typing. When NOT mid-edit, the artifact tab may be opened and activated normally.
- AC-7 (single source of trigger): Auto-surface logic lives in ONE place (a `useAutoSurfaceArtifacts` hook mounted once near the workspace shell), subscribing to `artifacts:reload`. It must not run per-row or fire from `ArtifactsPane` rendering. Manual sidebar click behavior in `ArtifactsPane` is unchanged.
- AC-8 (no gate → no surface): Given a new artifact whose owning ticket is missing, has `requires_user_gate: false`, or is not in `user-verify` status, Then it is NOT auto-surfaced (it still appears in the sidebar list as before). It is NOT added to the seen-set (so it can surface later if its ticket later enters the gated state).
- AC-9 (resilience): Given `artifactsListScoped` errors, the ticket scan is empty, or IPC is unavailable, Then no tab is force-opened and no throw escapes; auto-surface silently no-ops and the rest of the UI is unaffected.
- AC-10 (i18n): The needs-review marker tooltip / banner text uses `t(...)` keys present in KO + EN.

## Out of scope

- Adding a new "needs review" persona→GUI IPC — trigger is derived client-side from the existing scan + ticket frontmatter.
- A full review/approve action (accept/reject buttons that mutate ticket status) — this ticket only surfaces + marks; gate resolution stays in the existing PO/chat flow.
- Auto-surfacing non-gated artifacts or surfacing on every envelope (`po:artifact-files` / `useArtifacts.pushFiles`) — trigger is strictly the gated condition in AC-1.
- Toast/notification-center infrastructure (the in-tab marker + optional pane banner is the only required affordance).
- Changing `ArtifactsPane` manual-click routing or the `SidePanelArtifacts` session list.

## Plan

**New hook** — `packages/gui/src/views/workspace/shell/useAutoSurfaceArtifacts.ts`, mounted once in the workspace shell (alongside `useIpcSubscriptions`):
- Inputs: `projectDir`, `poState.current_version`, `tickets` from `useTicketScan(projectDir)`.
- Subscribe to `window` event `artifacts:reload` (same event `ArtifactsPane` listens to). On fire (and once on mount), call `api.artifactsListScoped(projectDir, current_version)` → `ArtifactEntry[]`.
- Build a gated-ticket-id set: `tickets.filter(t => t.requires_user_gate === true && t.status === 'user-verify').map(t => t.ticket_id)`. (Confirm `useTicketScan`/`Ticket` type exposes `requires_user_gate`; if absent, extend the main-process `scanTickets` parse to include that frontmatter flag — minimal addition.)
- For each entry: derive owning ticket id from the basename prefix (regex `^(T-(?:PATCH-)?\d+)` against the convention `<ticket-id>-<slug>.<ext>`). Triggered = id ∈ gated set AND relPath ∉ seen-set.
- First run after project open (seen-set has no record for this project) → seed ALL current entries into seen-set, open NOTHING (AC-5).
- Otherwise: among triggered entries, add all to seen-set; open each via the routing copied from `ArtifactsPane.handleRowClick`; activate at most the first one, and only if not mid-edit (AC-6) — the rest go to background.

**Background-open support** — `store/workspace.ts`:
- Add an `openTabBackground(tabId, type, props, title)` action (or an `activate?: boolean` option on `openTab`) that appends the tab to the target leaf WITHOUT changing `activePaneId`/`activeTabId` (existing global tab-id dedupe still applies).
- Add a `needsReview: boolean` flag on `Tab` (or a `reviewTabIds: Set<string>` slice). Set true when auto-surfaced; clear when the tab becomes active (in the existing setActiveTab path). Render an amber dot in the tab strip when set.
- Mid-edit detection: reuse the existing dirty signal — `tabCloseGuard` / `canCloseTab` already track dirty `doctrine-file` editors; expose an `isActiveTabDirty()` selector to gate activation.

**Seen-set store** — `store/useSurfacedArtifacts.ts` (new), zustand + `persist`/`createJSONStorage(localStorage)` keyed per `projectDir`:
- `seen: Record<projectDir, string[]>`; `has(projectDir, relPath)`, `add(projectDir, relPath[])`, `seedIfEmpty(projectDir, relPath[])`.
- Persisted so restarts don't re-surface (AC-4).

**Reuse**: scan = `artifactsListScoped`; event = `artifacts:reload`; routing = copy `ArtifactsPane.handleRowClick` ext→TabType map; ticket gate = `useTicketScan` + `requires_user_gate` frontmatter. No new persona/GUI IPC.

### QA scope

| Area | Check |
|:--|:--|
| trigger | only artifacts whose owning ticket is `requires_user_gate:true` AND `user-verify` surface; non-gated never surface (AC-8) |
| dedupe | seen-set persists across reloads + app restart; a surfaced artifact never re-opens; first-load seeds without opening (AC-4/AC-5) |
| anti-spam | at most one tab auto-activated per reload; extra gated artifacts open in background |
| mid-edit | active dirty editor → artifact opens background, never steals focus / interrupts typing (AC-6) |
| routing | `.html`→preview, `.mmd`→mermaid, `.md`→artifact-md; same tabId dedupes vs manual open |
| marker | amber needs-review dot shows on surfaced tab, clears on focus; lucide only, no color emoji |
| resilience | scan/ticket-scan/IPC failure → no throw, no forced tab (AC-9) |
| i18n | KO + EN keys for marker tooltip / banner |

## Outcome

Implemented. 9 files changed (2 new). `useAutoSurfaceArtifacts` hook mounts in WorkspaceShell; subscribes to `artifacts:reload`; seeds seen-set on first load (AC-5); auto-opens gated artifacts with amber `needsReview` dot; respects dirty-tab guard (AC-6). `useSurfacedArtifacts` persists to localStorage per projectDir. `requires_user_gate` parsed in main-process `tickets:scan`. tsc 0 errors, build green.

## Persona Activity

| persona | session_id | started_at | completed_at | model | effort |
|:--|:--|:--|:--|:--|:--|
| pdt-developer | T-PATCH-079 | 2026-06-09T00:00:00Z | 2026-06-09T00:00:00Z | claude-sonnet-4-5 | high |
