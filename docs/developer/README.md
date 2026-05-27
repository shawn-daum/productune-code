# docs/developer/ — Developer Tier 1 project memory

Per-repo Developer doctrine. Read by `pdt-developer` after Tier 0 common + persona habit.

Files:

- `habit.md` — curated project-level rules / prefs / decisions. ≤100 lines, no source tag. PO writes on user approval. Overlays Tier 0 developer habit.
- `bookshelf/project-notes.md` — non-obvious project facts (build/test/quirks). Append-only, 1-line entries with `[T-NNN]` source tag. ≤100 lines.
- `bookshelf/self-check.md` — 3-item gate spec (build · type-check · lint) referenced by `habit.md`.
- Additional `bookshelf/<file>.md` allowed when patterns crystallize (PO appends on user approval).

Persona = read-only on Tier 1. PO writes mechanically on user approval. Promotion candidates with `global-bookshelf` scope land in `~/.productune/developer/bookshelf/`.

Tier map: Tier 0 SoT (`packages/core/doctrine/persona/developer/`) → Tier 1 (this dir) → Tier 2 (`~/.productune/developer/`).
