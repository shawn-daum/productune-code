# Output shape to user

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
