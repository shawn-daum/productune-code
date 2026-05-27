# PRD clarity loop — ambiguity-score convergence

Designer treats PRD as clarity convergence loop, not one-shot. P1 mandatory. ≤100 lines.

## Score formula

```
A = 1 − Σ(clarityᵢ × weightᵢ)   i ∈ slot set, clarityᵢ ∈ [0,1], Σweights = 1
```

**Target:** `A ≤ 0.05`. Iterate until met OR 5-iter hard cap.

## Default slot weighting (V1 MVP)

Override per project via PRD frontmatter `weights_override:`.

| Slot | Weight |
|:--|--:|
| Problem statement & target user | 0.18 |
| Top user job / outcome (JTBD) | 0.14 |
| Scope boundary (in / out / later) | 0.13 |
| Acceptance criteria | 0.12 |
| Risk & assumption surface | 0.10 |
| Success metrics (north star + input) | 0.09 |
| Solution shape (hypothesis) | 0.08 |
| External deps / integrations | 0.06 |
| Brand / UX direction | 0.05 |
| Operations / GTM / launch | 0.05 |

## Loop protocol

1. Read `[brief]` + `[ctx]`. **P1 entry also read:**
   `docs/designer/feature-history.md` (prior version decisions) +
   `docs/qa/bookshelf/fail-patterns.md` (QA failure clusters).
2. Score each slot. Compute `A`.
3. `A ≤ 0.05` → emit `state:"ready"`.
4. Else → pick **lowest-clarity × highest-weight** → `state:"needs-info"` + 1
   `next_question` (1 per iter; batching inside text OK).
5. PO relays Q → user → append to brief → resume Designer (`--resume`).
6. **Hard cap 5 iter.** On cap → ship `## Open Questions` + `state:"ready"` +
   `confidence < 0.7`.
7. **PO "finalize"** → resume body: `"finalize PRD with current state. Move unresolved
   into ## Open Questions."`

## P1 N+1 outcome chase

At new version P1: scan prev tickets for `outcome.observed_result: null` +
`validation_method` set → ask user → write answer. Additive (not 5-iter cap).

## Output schemas

**Ready:**
```json
{ "state": "ready", "prd_path": "docs/prd/PRD.md",
  "user_prd_path": "docs/artifacts/<version>/PRD.html",
  "tickets": ["docs/tickets/v1/T-001.md"],
  "ambiguity_score": 0.04, "slot_clarity": { "problem_statement": 1.00 },
  "version_outcome": { "north_star": "...", "input_metrics": ["..."],
    "validation_method": "PostHog 7-day post-deploy" },
  "confidence": 0.92, "unresolved": [] }
```

**Needs-info:**
```json
{ "state": "needs-info", "ambiguity_score": 0.18,
  "slot_clarity": { "problem_statement": 0.30 },
  "next_question": "Who is the primary target — solo founders or small teams?",
  "iter": 2, "max_iter": 5 }
```

- `prd_path` = English master (overwritten each cycle).
- `user_prd_path` = user-lang HTML view.
- `version_outcome` derived from PRD `## Success metrics`; PO mirrors into
  `po-state.json :: versions[].outcome` at PRD-ready.
- Sub-fields nullable. PO uses `ambiguity_score` / `confidence` / `unresolved` for gate.

## User-centric principles (mandatory)

PO/Designer ≠ target user.

1. **Understand the target.** Target user's familiar UI drives UX patterns. R1 consults
   `pm-product-discovery` skills (`interview-script` / `user-personas` /
   `market-segments`) before Problem + JTBD slots.
2. **Observe, don't assume.** UX hypothesis pairs with observation
   (`version_outcome.{validation_method, observed_result}` + lazy measurement).
   Critical (auth / payments / PII / onboarding) require explicit measurement.

## PRD files (Designer-authored both)

| File | Path | Lang | Lifecycle |
|:--|:--|:--|:--|
| Master | `docs/prd/PRD.md` | English | Overwritten each cycle |
| User view | `docs/artifacts/<version>/PRD.html` | User lang | Translated |

PO never opens / edits PRD body.

## Auto-ticket (P1 entry)

New version P1 entry → PO emits T-NNN `type:design` "PRD 작성" immediately.
Ticket = comms vehicle. `## Plan` = clarity loop. V1 = opus/max · V2+ = opus/xhigh.
