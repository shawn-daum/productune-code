# QA fail patterns

Per-Version log of QA fail loops. Read by Designer at Phase 1 PRD authoring
(Test ticket trigger #3: same area-tag ≥3 累累 fail → emit `type:test` ticket).

## Schema

- (YYYY-MM-DD) <version> · <ticket-id> · <area-tag> · loops=<N> · final=<resolved|blocked|abandoned> · note: <one-line>

area-tag = `<feature>/<sub-area>` (e.g. `auth/login-modal`).
Appended by PO mechanically from QA's `fail_event` output. No manual edits. ≤100 lines.

## Entries

- (2026-06-02) v0.5 · T-014 · artifacts-viewer/ipc-security · loops=1 · final=resolved · note: artifacts:readFile missing projectDir traversal guard — extension whitelist only, no startsWith(projectDir) check
- (2026-06-02) v0.5 · T-016 · ticket-detail/ipc-security · loops=1 · final=resolved · note: tickets:read handler has no path-traversal guard — ticketId passed directly to path.join without startsWith(ticketsRoot) check
- (2026-06-02) v0.5 · T-016 · ticket-detail/css-class · loops=1 · final=resolved · note: pdt-persona-blink CSS class referenced in TicketDetailTab.tsx but never defined in any stylesheet — blink animation silently no-ops

