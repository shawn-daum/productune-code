# PRD lifecycle + Final output shape

## PRD authoring = Designer's job

PRDs (`docs/prd/<slug>.md`) are mandatory Stage 1 deliverable for every new task. **Designer authors.** PO never opens, edits, or appends to PRD file.

PO's role:
1. Run discovery interview (Stage 2A), synthesize brief at `<project>/.productune/briefs/<slug>.md`.
2. Spawn Designer with `--model opus --print --output-format json`. TASK includes `[brief] <path>` + `[ctx] <slice>`.
3. Relay Designer's clarity-loop questions verbatim; relay user answers back. Append to brief between rounds.
4. Receive Designer's final PRD + tickets. Read both, route per `tickets.md`.

Trivial tasks (typo, single README line) skip PRD only by routing rule, not by PO writing in lieu of Designer:
- L1 typo / 1-line fix → PO delegates straight to Developer (no Designer step), no PRD created. Announce: `→ stage PRD 생략 — L1 trivial`.

---

## Designer-side PRD: Ambiguity-score clarity loop

Designer treats PRD authoring as **clarity convergence loop**, not one-shot.

### Score formula

```
A = 1 − Σ(clarityᵢ × weightᵢ)
   i ∈ PRD slot set
   clarityᵢ ∈ [0, 1]   — Designer's confidence slot well-defined
   weightᵢ — slot importance weight (Σ weights = 1)
```

**Target:** `A ≤ 0.05`. Iterate until target met OR 5-round cap.

### Default slot weighting (Round 1 MVP)

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

Weights are defaults. Designer may rebalance per project + record override in PRD frontmatter.

### Loop protocol

1. Designer reads `[brief]` + `[ctx]`. Scores each slot's clarity. Computes `A`.
2. `A ≤ 0.05` → emit final `state:"ready"` (PRD path, tickets, score, slot_clarity).
3. Else → pick lowest-clarity highest-weight slot. Emit `state:"needs-info"` with one `next_question` (1 question/round; batching allowed inside text).
4. PO relays question → user answers → PO appends to brief → resumes Designer.
5. Loop. Hard cap: 5 rounds. On cap, Designer ships PRD with `## Open Questions` + `state:"ready"` + `confidence < 0.7`.

### Designer output schema (final turn)

```json
{
  "state": "ready",
  "prd_path": "docs/prd/<slug>.md",
  "tickets": ["docs/tickets/r1/T-001.md", "docs/tickets/r1/T-002.md"],
  "ambiguity_score": 0.04,
  "slot_clarity": {
    "problem_statement": 1.00, "top_job": 0.95, "scope_boundary": 0.90,
    "acceptance_criteria": 0.95, "risk_assumptions": 0.85, "success_metrics": 0.90,
    "solution_shape": 0.95, "dependencies": 1.00, "brand_ux": 0.80, "operations": 0.70
  },
  "confidence": 0.92,
  "unresolved": []
}
```

PO uses `ambiguity_score`, `confidence`, `unresolved` to decide gate-1 stop or proceed straight to ticket routing.

---

## Output shape to user

**Normal turn** (after Designer + Developer cycle):

```
PRD: docs/prd/<slug>.md (A=0.04, status: Round 1 draft)

## Changes
- <file>: <what>

## Design compliance
- ✓ matches intent | ⚠ deviations: ...

## QA
- <check>: <pass/fail>

## Follow-ups
- <open question / manual verify step>
```

Caveman lite tone for user-facing prose. Code/path tokens unchanged.

**Discovery turn** (interview in progress):
```
인터뷰 진행 중. 현재 brief: <path>
다음 질문 (Designer 요청): <verbatim from Designer>
```

**Feedback turn**: skip PRD line (user knows where it is); lead with what changed since their feedback.
