# PRD lifecycle + Final output shape

## PRD authoring = Designer

`docs/prd/<slug>.md` mandatory Stage 1 deliverable for every new task. **Designer authors.** PO never opens/edits/appends.

PO's role:
1. Run discovery interview (Stage 2A) → brief at `<project>/.productune/briefs/<slug>.md`.
2. Spawn Designer with `--model opus --print --output-format json`. TASK includes `[brief] <path>` + `[ctx] <slice>`.
3. Relay clarity-loop questions verbatim; relay user answers back. Append to brief between iterations.
4. Receive PRD + tickets → route per `tickets.md`.

Trivial skip is a routing rule, not PO-writing-in-lieu-of-Designer:
- L1 typo / 1-line fix → PO delegates straight to Developer (no Designer step), no PRD. Announce:
  ```
  → stage PRD 생략 — L1 trivial
  ```

---

## Designer-side PRD: ambiguity-score clarity loop

Designer treats PRD as **clarity convergence loop**, not one-shot.

### Score formula

```
A = 1 − Σ(clarityᵢ × weightᵢ)   i ∈ slot set, clarityᵢ ∈ [0,1], Σweights = 1
```

**Target:** `A ≤ 0.05`. Iterate until met OR 5-iteration cap.

### Default slot weighting (Version 1 MVP)

| Slot | Weight |
|---|--:|
| Problem statement & target user | 0.18 |
| Top user job / outcome (JTBD) | 0.14 |
| Scope boundary (in / out / later) | 0.13 |
| Acceptance criteria | 0.12 |
| Risk & assumption surface | 0.10 |
| Success metrics (north star + input) | 0.09 |
| Solution shape (hypothesis) | 0.08 |
| External dependencies / integrations | 0.06 |
| Brand / UX direction | 0.05 |
| Operations / GTM / launch | 0.05 |

Designer may rebalance per project + record override in PRD frontmatter.

### Loop protocol

1. Read `[brief]` + `[ctx]`. Score each slot. Compute `A`.
2. `A ≤ 0.05` → emit `state:"ready"` (PRD path, tickets, score, slot_clarity).
3. Else → pick lowest-clarity highest-weight slot. Emit `state:"needs-info"` with one `next_question` (1/iteration; batching inside text OK).
4. PO relays question → user → append to brief → resume Designer.
5. Hard cap: 5 iterations. On cap → ship PRD with `## Open Questions` + `state:"ready"` + `confidence < 0.7`.

### Designer output schema (final turn)

```json
{
  "state": "ready",
  "prd_path": "docs/prd/<slug>.md",
  "tickets": ["docs/tickets/v1/T-001.md", "docs/tickets/v1/T-002.md"],
  "ambiguity_score": 0.04,
  "slot_clarity": { "problem_statement": 1.00, "top_job": 0.95, "...": "..." },
  "version_outcome": {
    "north_star": "checkout completion rate",
    "input_metrics": ["modal-open-rate", "form-submit-rate"],
    "validation_method": "PostHog dashboard, 7-day window post-deploy"
  },
  "confidence": 0.92,
  "unresolved": []
}
```

`version_outcome` derived from PRD `## Success metrics` slot. Free-form prose stays in PRD; this is the structured emit for `po-state.json` `versions[].outcome` (PO mirrors directly into state at PRD-ready time). All three sub-fields nullable when `Success metrics` slot left blank (clarity loop A ≤ 0.05 still passable since metrics slot weight is only 0.09).

PO uses `ambiguity_score`, `confidence`, `unresolved` for gate-1 decision.

---

## Output shape to user

User sees Korean (caveman lite). Code/path tokens unchanged.

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

**Discovery turn** (interview in progress):
```
인터뷰 진행 중. 현재 brief: <path>
다음 질문 (Designer 요청): <verbatim from Designer>
```

**Feedback turn**: skip PRD line (user knows where it is); lead with what changed since their feedback.
