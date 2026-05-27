# docs/qa/ — QA Tier 1 project memory

Per-repo QA doctrine + per-version close summaries. Read by `pdt-qa` after Tier 0 common + persona habit.

Files:

- `habit.md` — curated project-level QA rules. ≤100 lines, no source tag. PO writes on user approval. Overlays Tier 0 qa habit.
- `bookshelf/fail-patterns.md` — per-version QA fail log. Source-tagged 1-line entries, mechanically appended by PO from QA `fail_event` output. ≤100 lines. Read by Designer at Phase 1 entry.
- `version-summaries/<version>.md` — Phase 5 close summary per version (tickets verified · fail count · area hotspots · recommendations). QA-owned direct write at P5.
- Ad-hoc per-ticket test plans (`<slug>-test-plan.md`) live here too.

Persona = read-only on `habit.md`. `bookshelf/fail-patterns.md` is mechanical-append via PO; `version-summaries/<version>.md` is QA direct-write at Phase 5.

Tier map: Tier 0 SoT (`packages/core/doctrine/persona/qa/`) → Tier 1 (this dir) → Tier 2 (`~/.productune/qa/`).
