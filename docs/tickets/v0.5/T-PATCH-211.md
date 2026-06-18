---
ticket_id: T-PATCH-211
version: v0.5
slug: anti-ai-default-design-discipline
title: Anti-AI-default (anti-slop) design discipline — producer guard + reviewer rubric
type: doctrine
status: done
phase: 3
assignee: pdt-designer
requires_qa: true
qa_status: pass
requires_user_gate: false
area_tag: design-quality
risk_flags: [core-doctrine]
estimated_complexity: L2
created_at: 2026-06-18T00:00:00Z
started_at:
completed_at:
duration_min:
---

# T-PATCH-211: Anti-AI-default (anti-slop) design discipline

## Request
Phase2 hi-fi mockups render OK but converge on the generic "AI default" look (over-reliant
on Tailwind defaults — indigo/violet gradients, rounded-2xl + shadow card spam, max-w-7xl
3-up feature grids). Codify an anti-default guard on BOTH sides: PRODUCER (designer) bakes
AI-default awareness into hi-fi mockup build; REVIEWER (QA) gets an independent scored
design-review pass to catch slop before ship. Adapt the Korean seed
(`design-review-prompt-v2.md`) into English act-time doctrine — not verbatim.

## Edit (doctrine — Tier0)
1. NEW `designer/bookshelf/anti-default.md` (81 lines) — producer-side AI-default detector:
   Tailwind tells, the 3 convergent default looks, "escape on free axes / follow brief on
   pinned axes", reverse-slop check (function-breaking weirdness fails like blandness),
   signature-by-artifact-type (marketing/hero ⇒ required; utility UI ⇒ restraint, over-
   signature penalized). Drift note → act-time ("treat newly-converged patterns as tells").
2. BIND `designer/habit.md` §4 (mockup-build binding) — every hi-fi mockup ALSO runs the
   anti-default pass (consult new bookshelf) BEFORE surfacing; either check fail ⇒ fix or
   flag, never surface silently.
3. NEW `qa/bookshelf/design-review.md` (99 lines) — reviewer-side scored rubric: 3 independent
   axes (AI-slop /10 higher=worse, system·finish /5, a11y·usability /5), calibration bands,
   anti-inflation guard (no invented nits, no slop ⇒ low index, evidence required no vibes),
   render-screenshot primary / code secondary, batch JSON schema, human-report format.
4. WIRE `qa/habit.md` §2 — visual/UI trigger inside existing BASIC/GRILL modes (not a 3rd
   mode): when artifact is visual/UI, run design-review pass, return 3-axis verdict as its
   own line alongside AC pass/fail.

## Acceptance
- AC-1: Given a hi-fi mockup build (designer S3), When the designer acts, Then habit §4
  binds the anti-default pass before surfacing and a converged/function-breaking result is
  fixed or flagged, never surfaced silently.
- AC-2: Given `designer/bookshelf/anti-default.md`, Then it carries the Tailwind tells, the
  3 convergent looks, free-vs-pinned-axis rule, reverse-slop check, and signature-by-type
  rule, in act-time English, ≤100 lines.
- AC-3: Given a visual/UI artifact under QA, When QA verifies, Then per `qa/habit.md` §2 it
  runs `qa/bookshelf/design-review.md` and returns a 3-axis verdict (slop /10, system /5,
  a11y /5 + band reason) alongside the AC result.
- AC-4: Given `qa/bookshelf/design-review.md`, Then it carries 3 axes, calibration bands,
  anti-inflation guard, evidence-priority (render primary), batch JSON schema, and the
  human-report format, ≤100 lines.
- AC-5: All four touched Tier0 files mirrored byte-identical to `~/.productune/doctrine/`.

## Out of scope
- PO lifecycle docs (`po/bookshelf/lifecycle/p3-build.md`, `phase3-close-gate.md`). The
  P3 close-gate `design_review` step COULD adopt this rubric as its criteria — noted for PO
  to wire; not edited here (designer must not edit PO lifecycle).
- `ux-principles.md` — left untouched (already 104 lines; dedicated bookshelf created instead).

## Outcome
Shipped. 4 files (2 new bookshelves + 2 habit binds), all within caps, all mirrored.

## Persona Activity
| persona | session_id | started_at | completed_at | model | effort |
|:--|:--|:--|:--|:--|:--|
| pdt-designer | — | 2026-06-18 | 2026-06-18 | opus | standard |
