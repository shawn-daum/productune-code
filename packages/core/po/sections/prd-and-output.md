# PRD lifecycle + Final output shape

## PRD authoring = Designer

PRD = **2 files**, both Designer-authored, mandatory:
- **Master** `docs/prd/PRD.md` — canonical English; no version prefix; overwritten each cycle; downstream persona read source (PO / Developer / QA).
- **User view** `docs/artifacts/<version>/PRD.html` — user-lang HTML snapshot; translated from master when user non-English.

**Designer authors both.** PO never opens/edits PRD body.

PO role:
1. Spawn Designer `--model opus --print --output-format json`. TASK = verbatim user idea + `[ctx] <slice>`. `[brief] <path>` optional.
2. Relay clarity-loop Qs verbatim ↔ user answers. Clarity = discovery (no separate interview).
3. Receive PRD + tickets → route per `tickets.md`.

Trivial skip = routing, not PO-write-in-lieu: L1 typo / 1-line → PO → Developer direct (no PRD). Trace `→ stage PRD skipped — L1 trivial`.

## User-centric principles

PO/Designer ≠ target user.

**1. Understand the target.** Target user's familiar UI / context drives UX patterns — not team's. Designer PRD R1 must consult pm-product-discovery skills (`interview-script` / `user-personas` / `market-segments`) before Problem + JTBD slots.

**2. Observe, don't assume.** UX hypothesis pairs with observation. Codified in `version_outcome.{validation_method, observed_result}` + lazy measurement (`lifecycle-mechanics.md §Outcome measurement` / `§Lazy measurement protocol`). Critical hypotheses (auth / payments / PII / onboarding) require explicit measurement.

## Designer-side PRD: ambiguity-score clarity loop

Designer treats PRD as clarity convergence loop, not one-shot.

### Score formula

```
A = 1 − Σ(clarityᵢ × weightᵢ)   i ∈ slot set, clarityᵢ ∈ [0,1], Σweights = 1
```

**Target:** `A ≤ 0.05`. Iterate until met OR 5-iter cap.

### Default slot weighting (V1 MVP) — Designer may rebalance per project + record override in PRD frontmatter

| Slot | Weight |
|---|--:|
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

### Loop protocol

1. Read `[brief]` + `[ctx]`. Score each slot. Compute `A`.
2. `A ≤ 0.05` → emit `state:"ready"` (PRD path, tickets, score, slot_clarity).
3. Else → pick lowest-clarity highest-weight slot → emit `state:"needs-info"` + 1 `next_question` (1/iter; batching inside text OK).
4. PO relays Q → user → append to brief → resume Designer.
5. Hard cap 5 iter. On cap → ship PRD with `## Open Questions` + `state:"ready"` + `confidence < 0.7`.

### Designer output schema (final turn)

```json
{ "state": "ready", "prd_path": "docs/prd/PRD.md",
  "user_prd_path": "docs/artifacts/<version>/PRD.html",
  "tickets": ["docs/tickets/v1/T-001.md"],
  "ambiguity_score": 0.04,
  "slot_clarity": { "problem_statement": 1.00, "top_job": 0.95 },
  "version_outcome": { "north_star": "checkout completion rate",
    "input_metrics": ["modal-open-rate", "form-submit-rate"],
    "validation_method": "PostHog 7-day post-deploy" },
  "confidence": 0.92, "unresolved": [] }
```

`prd_path` = English master (overwritten each cycle). `user_prd_path` = user-lang HTML. `version_outcome` derived from PRD `## Success metrics`; PO mirrors into `po-state.json versions[].outcome` at PRD-ready. Sub-fields nullable (weight 0.09 still passable). PO uses `ambiguity_score` / `confidence` / `unresolved` for gate-1.

## Artifact output paths + master/view pattern

Every design artifact = cycle-spanning master + versioned HTML user view. Global root abolished.

| Artifact | Master (`.md`, cycle-spanning) | User view (`.html`, per-version) |
|:--|:--|:--|
| PRD | `docs/prd/PRD.md` | `docs/artifacts/<version>/PRD.html` |
| Design system | `docs/designer/design-system.md` | `docs/artifacts/<version>/design-system.html` |
| DS components | `docs/designer/design-system-components.md` | `docs/artifacts/<version>/design-system-components.html` |
| Userflow / Mockup | — cycle-specific, no master | `docs/artifacts/<version>/{userflow,mockup}.html` |

Rules: no global root · masters in `docs/designer/<artifact>.md` (or `docs/prd/PRD.md`), no version prefix, Designer in-place · user views always `.html` inside `docs/artifacts/<version>/`, generated from master · cycle-specific (userflow / mockup) = direct `.html` · Version close (Phase 5): Designer snapshots masters → `docs/artifacts/<version>/<artifact>-snapshot.md` (see `lifecycle.md §Master archive at Version close`).

**Path rule** — 2 categories, flat (no sub-folders within version bucket):

| Category | Path | When |
|:--|:--|:--|
| Ticket | `docs/artifacts/<version>/<ticket-id>-<slug>.<ext>` | Tied to specific ticket |
| Version-loose | `docs/artifacts/<version>/<slug>.<ext>` | Version-scoped (views / cycle-specific) |

Masters (cycle-spanning, Designer-maintained): `docs/designer/<artifact>.md` + `docs/prd/PRD.md` — not in `docs/artifacts/`. `docs/designer/decisions.md` + `docs/qa/fail-patterns.md` = same category. `<version>` = ticket/PRD frontmatter `version:` (e.g. `v1`, `v0.4`). Slug never part of version id (retroactive). Bucket auto-created at first emit. **Ticket output**: `docs/tickets/<version>/T-NNN.md` — same `<version>` (`po-state.current_version`). One `<version>` covers both buckets.

## Output shape to user → `_formats/po-output-format.md`
