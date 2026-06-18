---
ticket_id: T-PATCH-212
version: v0.5
slug: anti-default-extend-binding-and-close-gate-wire
title: Anti-default — extend producer binding to S2/S3/S5 + wire slop rubric into P3 close-gate
type: doctrine
status: done
phase: 3
assignee: pdt-designer
requires_qa: true
qa_status: pass
requires_user_gate: false
area_tag: design-quality
risk_flags: [core-doctrine]
estimated_complexity: L1
created_at: 2026-06-18T00:00:00Z
started_at:
completed_at:
duration_min:
---

# T-PATCH-212: Anti-default — extend binding to S2/S3/S5 + wire slop rubric into P3 close-gate

## Request
T-PATCH-211 shipped anti-default discipline but bound the producer self-check at the wrong/
narrow stage (labeled "S3 hi-fi" and bound to hi-fi only). Two corrections: (1) the producer
self-check (anti-default pass + §1.5.6) must bind at EVERY rendered UI design artifact — S2
(DS render) / S3 (mockup candidates) / S5 (hi-fi) — before each step's user gate; (2) wire the
3-axis slop rubric into the P3 close-gate `design_review` step, which previously scored only
DS-token compliance with no aesthetic axis. Fix the stale "S3 hi-fi" conflation (hi-fi is S5).

## Edit (doctrine — Tier0)
1. `designer/habit.md` §4 — rewrite the mockup-build binding: anti-default pass + §1.5.6
   self-check now bind at S2/S3/S5, run before that step's user gate; either fail ⇒ fix or
   flag, never surface silently. S1 (text) / S4 (flow) called out as out of binding.
2. `designer/bookshelf/anti-default.md` — fix consult-trigger line to S2/S3/S5 before each
   gate (was "every hi-fi mockup (§4 S3)").
3. `designer/bookshelf/phase3-close-gate.md` — add an AESTHETIC / anti-default checklist item
   that scores shipped critical/entry screens with the `qa/bookshelf/design-review.md` rubric
   (rubric = bands SoT, cross-persona read). Gate owns the close-FAIL threshold; added to
   checklist + execution + output-schema `outcome_items` (`aesthetic_anti_default`). No-waiver:
   any ✗ blocks close.
4. `po/bookshelf/lifecycle/p3-build.md` — assessed; no edit. Line 10 already points to
   phase3-close-gate.md as the no-waiver criteria SoT and line 12 mandates define-once.

## Acceptance
- AC-1: Given a rendered UI design artifact at S2/S3/S5, When the designer acts, Then
  habit §4 binds the anti-default pass + §1.5.6 self-check before that step's user gate; a
  fail is fixed or flagged, never surfaced silently. S1/S4 are out of the binding.
- AC-2: Given `designer/bookshelf/anti-default.md`, Then its consult-trigger reads
  S2/S3/S5-before-gate (no "hi-fi only"), ≤100 lines.
- AC-3: Given the P3 close-gate, When the designer runs it, Then `phase3-close-gate.md`
  carries an aesthetic/anti-default item scoring critical/entry screens via the design-review
  rubric, with the close-FAIL threshold defined in the gate (slop index ≥ 6 on marketing/
  entry ⇒ ✗; over-signature on utility ⇒ ✗), and `outcome_items.aesthetic_anti_default`.
- AC-4: `qa/bookshelf/design-review.md` NOT modified (at 100/100 cap); referenced only.
- AC-5: All three touched Tier0 files mirrored byte-identical to `~/.productune/doctrine/`.

## Out of scope
- `qa/bookshelf/design-review.md` — at 100/100; not edited (needs a trim first; threshold put
  in the gate doc, not the rubric).
- Re-enumerating the P3 gate sequence anywhere (p3-build.md line 12 = define-once).

## Outcome
Shipped. 3 Tier0 files edited (habit §4 rewrite, anti-default trigger fix, close-gate aesthetic
axis), all within caps, all mirrored byte-identical. p3-build.md assessed, no edit needed.

## Persona Activity
| persona | session_id | started_at | completed_at | model | effort |
|:--|:--|:--|:--|:--|:--|
| pdt-designer | — | 2026-06-18 | 2026-06-18 | opus | standard |
