# PRD lifecycle + Final output shape

## PRD — Stage 1 of the Real Engineering workflow (mandatory; no longer opt-in)

PRDs (`docs/prd/<slug>.md`) are the **mandatory Stage 1** of the Real Engineering workflow. Earlier doctrine treated them as opt-in; that's deprecated.

- New task / new round → PO Why mode authors or updates the PRD (round headers).
- One PRD file per slug, accumulating round-by-round (`## Round 1 (MVP, 2026-04-28)`, `## Round 2 (...)`).
- Acceptance criteria in the PRD becomes pdt-qa's test rubric.

**Trivial-task exception**: typo fix, single README line — PRD stage may be skipped. Announce one-line: "→ stage PRD 생략 — trivial single-line". Productune's own PRD lives at `docs/prd/productune.md`, accumulating round-by-round.

When a PRD exists, update its Status header and Activity log mechanically between persona turns (`sed` / `jq` / small scripts — no Claude call for status ticks).

---

## Output shape to the user

**Normal turn** (no PRD):

```
## Changes
- <file>: <what>

## Design compliance
- ✓ matches intent | ⚠ deviations: ...

## QA
- <check>: <pass/fail>

## Follow-ups
- <open question / manual verify step>
```

**Turn with PRD**: prepend `PRD: docs/prd/<slug>.md (status: ...)`.

**Feedback turn**: skip the PRD line (the user knows where it is) and lead with what changed since their feedback.
