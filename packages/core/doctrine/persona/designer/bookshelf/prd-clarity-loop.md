# PRD clarity loop — ambiguity-score convergence

Run the PRD as a clarity convergence loop, not one-shot. Mandatory at P1.

For how the PRD must read on the page (heading rhythm, bullet/inline-code discipline, tables), apply `bookshelf/prd-markdown-style.md` alongside this loop.

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

1. Read `[brief]` + `[ctx]` (P1-entry reads per `habit.md §2`). Score each slot → compute `A`.
2. `A ≤ 0.05` → emit `state:"ready"`.
3. Else → pick **lowest-clarity × highest-weight** slot → emit `state:"needs-info"` +
   1 `next_question`: single string ≤200 chars, exactly one question (no batching / comma-joined sub-asks).
4. PO renders Q in `user_lang` → appends answer to brief → `--resume`.
5. **Hard cap 5 iter.** On cap → ship `## Open Questions` + `state:"ready"` + `confidence < 0.7`.
6. On PO "finalize" → resume body: `"finalize PRD with current state. Move unresolved into ## Open Questions."`

## P1 N+1 outcome chase

At new version P1: scan prev tickets for `outcome.observed_result: null` + `validation_method` set →
ask user → write answer. Additive (not 5-iter cap).

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

- `prd_path` = the user-lang master (overwrite each cycle). `user_prd_path` = optional disposable HTML render for the gate (manifest `kind: prd-view` + `source_hash`), null when the gate reviews the md directly.
- Derive `version_outcome` from PRD `## Success metrics`; PO mirrors into `po-state.json :: versions[].outcome` at PRD-ready.
- Sub-fields nullable. PO reads `ambiguity_score` / `confidence` / `unresolved` for gate.

## User-centric principles (mandatory)

You are not the target user.

1. **Understand the target.** Let the target user's familiar UI drive UX patterns. At R1 consult
   `pm-product-discovery` skills (`interview-script` / `user-personas` / `market-segments`) before
   scoring Problem + JTBD slots.
2. **Observe, don't assume.** Pair every UX hypothesis with observation
   (`version_outcome.{validation_method, observed_result}` + lazy measurement). For critical flows
   (auth / payments / PII / onboarding) set explicit measurement.

## PRD file — single SoT

| File | Path | Lang | Lifecycle |
|:--|:--|:--|:--|
| Master | `docs/prd/PRD.md` | `[ctx].user_lang` | Overwrite each cycle — the GUI renders it directly |
| (optional) gate render | `docs/artifacts/<version>/PRD.html` | user lang | Disposable; manifest `kind: prd-view` + `source_hash`; never a second source |

PO never opens / edits PRD body. Closed-version snapshots: `docs/prd/versions/<v>.md` (P5, hook-enforced).

## Auto-ticket (P1 entry)

PO emits T-NNN `type:design` "Author PRD" — your comms vehicle, `## Plan` = this clarity loop.
V1 = opus/max · V2+ = opus/xhigh.
