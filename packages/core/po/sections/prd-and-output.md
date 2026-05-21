# PRD lifecycle + Final output shape

## PRD authoring = Designer

PRD = **2 files**, both Designer-authored, both mandatory:
- **Master** `docs/prd/PRD.md` — canonical English; no version prefix; overwritten each cycle with current version content; downstream persona read source (PO, Developer, QA all read this)
- **User-facing view** `docs/artifacts/<version>/PRD.html` — user's working language, versioned HTML snapshot (translated from master when user writes non-English; same content if user writes English)

**Designer authors both.** PO never opens/edits/appends PRD body.

PO's role:
1. Spawn Designer with `--model opus --print --output-format json`. TASK includes verbatim user idea + `[ctx] <slice>`. `[brief] <path>` optional (only if user supplied initial notes).
2. Relay clarity-loop questions verbatim; relay user answers back. Designer's clarity loop subsumes discovery — no separate interview phase.
3. Receive PRD + tickets → route per `tickets.md`.

Trivial skip = routing rule, not PO-writing-in-lieu-of-Designer:
- L1 typo / 1-line fix → PO delegates straight to Developer (no Designer step), no PRD. Emit trace `→ stage PRD skipped — L1 trivial` (in user's lang).

## User-centric principles

PO/Designer ≠ target user. Two sub-rules guide PRD authoring + persona invocation:

**1. Understand the target.** Target user's familiar UI / context / daily apps drive UX patterns — not team's. Designer's PRD R1 must consult pm-product-discovery skills (`interview-script` / `user-personas` / `market-segments`) before drafting Problem + JTBD slots. Reuse target's mental model; never project our own.

**2. Observe, don't assume.** UX hypothesis in PRD must pair with observation process. Codified in `version_outcome.{validation_method, observed_result}` + lazy measurement (`lifecycle-mechanics.md` §"Outcome measurement" / §"Lazy measurement protocol"). Critical hypotheses (auth / payments / PII / onboarding flow) require explicit measurement — no inference from assumption alone.

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
3. Else → pick lowest-clarity highest-weight slot. Emit `state:"needs-info"` with 1 `next_question` (1/iteration; batching inside text OK).
4. PO relays question → user → append to brief → resume Designer.
5. Hard cap: 5 iterations. On cap → ship PRD with `## Open Questions` + `state:"ready"` + `confidence < 0.7`.

### Designer output schema (final turn)

```json
{
  "state": "ready",
  "prd_path": "docs/prd/PRD.md",
  "user_prd_path": "docs/artifacts/<version>/PRD.html",
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

`prd_path` = canonical English master (`docs/prd/PRD.md`; no version prefix — overwritten each cycle). `user_prd_path` = user-lang HTML view (`docs/artifacts/<version>/PRD.html`); translated from master when user writes non-English. `version_outcome` derived from PRD `## Success metrics` slot. Free-form prose stays in PRD; this = structured emit for `po-state.json` `versions[].outcome` (PO mirrors directly into state at PRD-ready time). All 3 sub-fields nullable when `Success metrics` slot blank (clarity loop A ≤ 0.05 still passable since metrics slot weight = 0.09).

PO uses `ambiguity_score`, `confidence`, `unresolved` for gate-1 decision.

## Artifact output paths (T-P4-153) + master/view pattern

**Master / user-view pattern** — every design artifact separates a cycle-spanning master from a versioned HTML user view. Global artifact root (`docs/artifacts/<slug>.<ext>`) abolished.

| Artifact | Master (cycle-spanning, authoritative `.md`) | User view (per-version `.html`) |
|:--|:--|:--|
| PRD | `docs/prd/PRD.md` | `docs/artifacts/<version>/PRD.html` |
| Design system | `docs/designer/design-system.md` | `docs/artifacts/<version>/design-system.html` |
| Design system components | `docs/designer/design-system-components.md` | `docs/artifacts/<version>/design-system-components.html` |
| Userflow | — cycle-specific, no master | `docs/artifacts/<version>/userflow.html` |
| Mockup | — cycle-specific, no master | `docs/artifacts/<version>/mockup.html` |

Rules:
- **No global artifact root** — `docs/artifacts/<slug>.<ext>` root-level files no longer emitted.
- **Master files** live in `docs/designer/<artifact>.md` (or `docs/prd/PRD.md` for PRD). No version prefix in filename. Designer edits in-place each cycle. Single authoritative read source for all personas.
- **User views** are always `.html`, always inside `docs/artifacts/<version>/`. Generated by Designer from the corresponding master.
- **Cycle-specific artifacts** (userflow, mockup) have no master — created directly in `docs/artifacts/<version>/` as `.html`.
- At **Version close** (Phase 5): Designer snapshots all masters → `docs/artifacts/<version>/<artifact>-snapshot.md`. See `lifecycle.md §design-system + PRD archive at Version close`.

**Artifact path rule (T-P4-153)** — 2 categories (global category removed), flat naming (no sub-folders within a version bucket):

| Category | Path pattern | When |
|:--|:--|:--|
| **Ticket** | `docs/artifacts/<version>/<ticket-id>-<slug>.<ext>` | Artifact tied to a specific ticket |
| **Version-loose** | `docs/artifacts/<version>/<slug>.<ext>` | Version-scoped (user views `.html`, cycle-specific artifacts) |

**Master files** (cycle-spanning, Designer-maintained): `docs/designer/<artifact>.md` + `docs/prd/PRD.md` — not in `docs/artifacts/`. Examples: `docs/designer/design-system.md`, `docs/designer/design-system-components.md`, `docs/designer/decisions.md`, `docs/qa/fail-patterns.md`.

`<version>` = ticket/PRD frontmatter `version:` field (e.g., `v1`, `v0.4`). Slug never part of version id (T-P4-095 — retroactive). Files are flat within the bucket — no sub-folders. Bucket created automatically when the first artifact of that version emits.

**Ticket output path (T-P4-160)**: `docs/tickets/<version>/T-NNN.md` — same `<version>` key as above (`po-state.current_version`). Folder `docs/tickets/<version>/` auto-created when first ticket of that version is written. One `<version>` covers both `docs/artifacts/<version>/` and `docs/tickets/<version>/` buckets — consistent versioning across all outputs.

## Output shape to user → `sections/_formats/po-output-format.md`
