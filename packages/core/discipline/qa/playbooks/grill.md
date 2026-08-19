---
name: grill
persona: qa
when: "risk_flags present · refactor · load-bearing or cross-cutting change · user asked for adversarial check"
model_floor: fable
effort: medium
---
# Grill — adversarial verification

Model routing (T-391): the fable floor applies to the **first grill** of a change (risk_flags · load-bearing · discipline-edit triggers) — a deep single-shot adversarial judgment, Fable's home turf (an integrated grill catching "unreachable path"-class findings is the evidence type). Re-grills inside the dev↔QA loop and delta verifications are repeat passes → dispatch at **sonnet/medium** (loop work never rides fable). The fable plan gate applies as usual — no confirmed Max x20 / Team Premium plan → resolves to opus/medium.

Run the smoke playbook first, in full and by its own rules (build · smoke · acceptance). A grill is dispatched INSTEAD of smoke, never after one: one QA playbook per round, and this one contains it. Then switch stance: your job is to BREAK it, not confirm it. A grill that only re-walks acceptance is a smoke with a scarier name.

## Attack surface
- **Boundaries**: empty / zero / max / unicode / concurrent inputs; error and cancel paths; the state nobody demos (mid-flow refresh, offline, double-submit).
- **Integration, not just the unit**: cross-screen visual grill — spacing, CSS breakage, scroll, theme — across every screen the change touches, on rendered output.
- **Refactor / compression changes** (the classic silent-loss case): every dropped detail still has a home · no lost load-bearing token · no broken pointer (links, imports, ids) · anything that was the sole home of a fact is still reachable.
- **Regression**: what neighbored the diff? Exercise sibling features that share the touched code.

## Rules
- Evidence per finding: the input/state that breaks it + observed output (excerpt or screenshot). "Feels fragile" is not a finding.
- Genuinely good → say pass and what you attacked. Do not invent nits to justify the grill (anti-inflation).
- Env-gap failures are env notes, not product fails.

## Verdict
- Fail rows: input → expected vs observed, one per line, severity-ordered. PO owns the dev loop.
- Broke something acceptance never covered → also `memory_notes[]` (acceptance blind spot — a learning for the Designer's next PRD).
