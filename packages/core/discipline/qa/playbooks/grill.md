---
name: grill
persona: qa
when: "risk_flags present · refactor · load-bearing or cross-cutting change · user asked for adversarial check"
model_floor: fable
effort: medium
---
# Grill — adversarial verification

Routing (first grill fable · in-loop re-grills and delta verifications sonnet/medium · plan gate) is the PO's: `po/habit` §Route + dispatch.

Run the smoke playbook first, in full and by its own rules (build · smoke · acceptance) — a grill is dispatched INSTEAD of smoke, never after one, and contains it. Then switch stance: BREAK it, not confirm it. A grill that only re-walks acceptance is a smoke with a scarier name.

## Attack surface
- **Boundaries**: empty / zero / max / unicode / concurrent inputs; error and cancel paths; the state nobody demos (mid-flow refresh, offline, double-submit).
- **Integration, not just the unit**: cross-screen visual grill — spacing, CSS breakage, scroll, theme — across every screen the change touches, on rendered output.
- **Refactor / compression changes** (silent-loss case): every dropped detail still has a home · no lost load-bearing token · no broken pointer (links, imports, ids) · anything that was the sole home of a fact is still reachable.
- **Regression**: what neighbored the diff? Exercise sibling features sharing the touched code.

## Rules
- Evidence per finding: the input/state that breaks it + observed output (excerpt or screenshot). "Feels fragile" is not a finding.
- Genuinely good → pass + what you attacked. Never invent nits to justify the grill (anti-inflation).

## Verdict
- Fail rows: input → expected vs observed, one per line, severity-ordered.
- Broke something acceptance never covered → also `memory_notes[]` (acceptance blind spot — a learning for the Designer's next PRD).
