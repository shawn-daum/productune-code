---
name: grill
persona: qa
when: "risk_flags present · refactor · load-bearing or cross-cutting change · user asked for adversarial check"
model_floor: opus
effort: medium
---
# Grill — adversarial verification

Routing (first grill opus — temporary stand-in for fable until T-737 configurable routing · in-loop re-grills and delta verifications sonnet/medium · plan gate) is the PO's: `po/habit` §Route + dispatch.

Run the smoke playbook first, in full and by its own rules (build · smoke · acceptance) — a grill is dispatched INSTEAD of smoke, never after one, and contains it. Then switch stance: BREAK it, not confirm it. A grill that only re-walks acceptance is a smoke with a scarier name.

## Attack surface
- **Boundaries**: empty / zero / max / unicode / concurrent inputs; the state nobody demos (mid-flow refresh, offline, double-submit).
- **Stop points**: list every point the changed flow can stop — error · cancel · kill mid-write · a cleanup step failing · a second write failing. Per point, leave the state it leaves and run the next invocation: what it reads to find the resource or decision · a missing, half-written or unreadable state file → refuse, never proceed on a marker alone · an older run's state never beats a newer one.
- **Integration, not just the unit**: cross-screen visual grill — spacing, CSS breakage, scroll, theme — across every screen the change touches, on rendered output.
- **Refactor / compression changes** (silent-loss case): every dropped detail still has a home · no lost load-bearing token · no broken pointer (links, imports, ids) · anything that was the sole home of a fact is still reachable.
- **Regression**: what neighbored the diff? Exercise sibling features sharing the touched code.
- **Class, not the named case**: a fix for a named input · path · caller → name its class (spellings · expansions · aliases · callers · readers · writers · other copies of the same check), grep to list the members, probe ≥1 member the dispatch never named. Parser-shaped guard → probe a count invariant (markers in raw vs parsed) over enumerated shapes.

## Rules
- Evidence per finding: the input/state that breaks it + observed output (excerpt or screenshot). "Feels fragile" is not a finding.
- Genuinely good → pass + what you attacked. Never invent nits to justify the grill (anti-inflation).

## Verdict
- Fail rows: input → expected vs observed, one per line, severity-ordered.
- Broke something acceptance never covered → also `memory_notes[]` (acceptance blind spot — a learning for the Designer's next PRD).
