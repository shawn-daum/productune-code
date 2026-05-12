# QA fail patterns

Per-Version log of QA fail loops. Read by Designer at Phase 1 PRD authoring
(Test ticket trigger #3: same area-tag ≥3 累累 fail → emit `stage:test` ticket).

## Schema

- (YYYY-MM-DD) <version> · <ticket-id> · <area-tag> · loops=<N> · final=<resolved|blocked|abandoned> · note: <one-line>

area-tag = `<feature>/<sub-area>` (e.g. `auth/login-modal`).
Appended by PO mechanically from QA's `fail_event` output. No manual edits.

## Entries

