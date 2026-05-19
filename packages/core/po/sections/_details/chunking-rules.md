# Chunking — per-call size limits

PO-delegated work-unit ceiling per persona prompt. Over-stuffing → (a) long-then-stuck, (b) quality drop (trade-offs buried), (c) full retry on reject.

## Per-call ceilings (default)

| Persona | Artifacts | Decisions | Sub-area | Target time |
|---|---|---|---|---|
| pdt-designer | 1–2 land | 1–3 | 1 | 5–10 min |
| pdt-developer | 1 ticket impl | (plan-driven) | 1 ticket scope | 15–30 min (L3) / 30–60 min (L4–5) |
| pdt-qa | 1 ticket QA | — | 1 ticket scope | 5–15 min (light) / 15–30 min (full) |

## Ceiling exceeded

Multi-area + multi-decision + multi-output directive → PO splits per sub-area into separate calls:
1. Identify smallest first unit (decision-only / schema-only / one-file fix / one-component spec).
2. Call only that unit.
3. User ack → next unit, separate call.

## Exceptions (one call OK)

- Tightly-coherent small bundle (e.g. ROADMAP one line + project-notes one line + decisions one line).
- Sub-acceptance obviously bound inside one ticket (e.g. 4 toggles + 2 texts on one screen).

## Good case

- Promotion lifecycle bug fix 5 stages: schema / output rule / turn-start surface / retrospective read / integration ticket — each separate call, 5–10 min, small user-verify unit.

## Bad case

- T-P4-065 spec rewrite first attempt: 9 artifacts + Phase model decision + 5 sub-areas in one prompt → user reject. Re-attempt after split passed.

## Risk

Too strict → inflexible (small bundles forced split → overhead). Too lax → trap recurs. Table = guideline, not hard rule — user-explicit / clearly-coherent small bundles exempt.
