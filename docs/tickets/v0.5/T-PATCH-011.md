---
ticket_id: T-PATCH-011
version: v0.5
phase: 3
type: impl
status: done
assignee: pdt-developer
estimated_complexity: L2
qa: true
qa_status: pass
qa_loops: 1
completed_at: 2026-06-04
risk_flags: cross-project-schema
slug: issue-tracker-unknown-status
---

# T-PATCH-011: issue-tracker unknown-status fallback (#12)

> Phase 3-B patch. Investigation-first, then decide fix locus.

## Request

The issue-tracker project shows a ticket whose status falls back to `todo` ("unknown status").
The R2 synonym map (T-017: `planned→todo`, `qa-pending→review`, `user-pending→user-verify`,
`cancelled→abandoned`) did not cover the value issue-tracker uses.

issue-tracker is a SEPARATE Next.js project; its ticket schema may differ from productune doctrine.

INVESTIGATE FIRST:
1. Identify the exact status value(s) issue-tracker tickets carry that the GUI fails to map.
2. Decide the fix locus:
   - If it's a legitimate synonym of a canonical 7-status → extend the GUI synonym map.
   - If it's malformed / project-specific data → fix the project's ticket data (out of GUI scope;
     report as a finding, do not silently absorb arbitrary values).

## Acceptance

- [ ] **[AC-1]** The offending status value(s) are identified and documented in the ticket/return.
- [ ] **[AC-2]** Either the GUI synonym map is extended to map it to a canonical status, OR a clear
      "fix in issue-tracker data" finding is reported with the offending value — decision justified.
- [ ] **[AC-3]** If map extended: the issue-tracker ticket renders with the correct status (not the
      `todo` fallback); `pnpm tsc --noEmit` passes.

## Plan

1. Open the issue-tracker tickets, find the unmapped status string.
2. Compare against canonical 7-status + existing synonym map.
3. Extend map (preferred if a clean synonym) or file a data-fix finding.

## Out of scope

- Restructuring issue-tracker's ticket schema; broad status-model changes.
