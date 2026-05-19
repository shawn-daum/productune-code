# retrospective.md template

`docs/retrospectives/<version>.md`, written by Designer in Phase 5 step 5c (sonnet + medium):

```markdown
# Retrospective — <version>

**Period**: YYYY-MM-DD ~ YYYY-MM-DD  **PRD**: docs/prd/<slug>.md  **Tickets**: <N> done / <M> blocked

## Outcome
- north_star: <target> → <observed | "pending next Version"> [hit / miss / ?]
- input metrics:
  - <metric>: <observed | pending>

## What worked
- ...

## What didn't
- area X: <fail pattern>, N cumulative loops (cross-Version)

## Carry to next Version
- deferred from this Version: ...
- new test ticket candidate: area Y (≥3 cumulative fails)
- new hypothesis: ...

## Approved doctrine promotions (this Version)
- pdt-<persona> · project · `docs/<persona>/<file>.md`: "<delta>" (decided <date>)
- pdt-<persona> · wiki · <target>: "<episode_name>" (decided <date>)

## Repeated patterns
- recent_turns: <persona> ≥3 fails on `<area-tag>` (last <N> turns)
- fail-patterns: `<area>` cumulative <M> across versions
- po-memory pushback: "<verbatim>" (≥2 occurrences)

## Surfaced for next Version
- dropped/deferred promotions: list (next Phase 1 disposition input)
```
