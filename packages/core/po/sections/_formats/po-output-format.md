# Output shape to user

## Persona JSON surface rule (T-P4-150)

Persona sub-agents return JSON only (no body prose). PO surface flow:
1. Read `user_surface` from persona JSON if present (≤500 char, human-friendly).
2. If `user_surface` absent, derive from `summary` (≤200 char, machine-readable).
3. Render in user's working language (caveman lite). Never expose raw persona JSON to user.
4. Map into the Normal turn / Clarity-loop / Feedback template below.

User sees user's working lang (caveman lite). Code/path tokens unchanged.

**Normal turn** (Designer + Developer cycle):

```
PRD: docs/prd/<slug>.md (A=0.04, status: Version 1 draft)

## Changes
- <file>: <what>

## Design compliance
- ✓ matches intent | ⚠ deviations: ...

## QA
- <check>: <pass/fail>

## Follow-ups
- <open question / manual verify step>
```

**Clarity-loop iteration turn** (Designer waiting on user answer):
```
PRD authoring (iteration <n>/5). Designer's question:
<verbatim from Designer>
```

**Feedback turn**: skip PRD line (user knows where it is); lead with what changed since their feedback.
