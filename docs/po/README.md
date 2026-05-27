# docs/po/ — PO Tier 1 project memory

Per-repo PO-level notes: orchestration decisions, calibration learnings, project-specific routing tweaks. Tier 1 doctrine for PO in this repo.

- `habit.md` (optional) — curated PO rules for this project. ≤100 lines, no source tag. PO writes on user approval. Overlays Tier 0 PO habit (`~/.productune/doctrine/persona/po/habit.md`).
- `bookshelf/<file>.md` (optional) — append-only PO notes (calibration entries, decision log, orchestration patterns). Source-tagged 1-line entries.
- Free-form notes (this README, ad-hoc files) also allowed for PO-only context.

Tier map (reminder):

- Tier 0 SoT (common + persona) — `packages/core/doctrine/`
- Tier 1 (this dir) — committed, project-scope
- Tier 2 (personal) — `~/.productune/po/`

Promotion: candidates surface via PO own self-review; user-approved entries land here (Tier 1) or `~/.productune/po/` (Tier 2).
