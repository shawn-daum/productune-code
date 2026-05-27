# docs/designer/ — Designer Tier 1 project memory

Per-repo Designer doctrine + master artifacts. Read by `pdt-designer` after Tier 0 common + persona habit.

Files:

- `habit.md` — curated project-level rules. ≤100 lines, no source tag. PO writes on user approval. Overlays Tier 0 designer habit.
- `bookshelf/<file>.md` — append-with-source patterns (e.g. `decisions.md`, project-specific design rules). 1-line entries with `[T-NNN]` or `(project · date)` source tag.
- `design-system.md` — single global DS instance for this project (tokens · UX principles · recipes). Consulted at every component spec / new screen / Phase 3 close gate.
- `feature-history.md` — version decision log. Phase 1 read, Phase 5 5a write (`- (YYYY-MM-DD) <version> · <area> · <type> · note: …`).
- `R<n>-<slug>.md` — round-scoped work notes (richer per-task artifacts, PO writes on user approval).

Persona = read-only on Tier 1. PO appends on user approval. Promotion candidates with `global-bookshelf` scope land in `~/.productune/designer/bookshelf/`.

Tier map: Tier 0 SoT (`packages/core/doctrine/persona/designer/`) → Tier 1 (this dir) → Tier 2 (`~/.productune/designer/`).
