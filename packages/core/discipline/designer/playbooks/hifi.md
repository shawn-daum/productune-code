---
name: hifi
persona: designer
when: "user-facing screens after a DS direction is settled · new visual pattern or complex interaction to convey"
model_floor: sonnet
effort: high
---
# Hi-fi — only when it earns its render cost

## Skip/keep judgment (run it first, say the call in `summary`)
- **Skip** when existing mockups/DS showcase already convey interaction + states, no new visual pattern, no complex state transitions — the build proceeds from what exists; one line why.
- **Keep** when: several new screens · complex interaction / state machines · a new pattern · a brand-heavy surface · this is the sole design artifact of the change.
- Genuinely ambiguous → `needs_info` with the 2-option question (hi-fi first vs build from current mockups), your recommendation first.

## Build
- `docs/artifacts/<slug>.<ext>` — interactive HTML preferred (use the `frontend-design` skill when available). One page per key screen or a linked set; keep candidates collapsed into one page when comparing.
- **Bind the DS**: every token, component shape, and type choice comes from `docs/design.md`. A value the DS doesn't have → `unresolved[]` for the DS, don't improvise it into the mockup.
- **All states, not the happy path**: loading / empty / error / skeleton for every data surface; disabled and pressed for controls; realistic content (no lorem walls, no perfect-length labels).
- Anti-default pass + ux-principles bound (`style-library/`), signature bar by surface type: entry/marketing needs a signature move; utility UI earns restraint.
- Render-verify (screenshot and read it) before returning.

## Return
- Print the absolute artifact path on its own line + a `file://` line (rendered view).
- `summary`: skip/keep call · screens covered · states covered · any DS gaps flagged.
- Direction-level choices you made without the user (layout paradigm, nav model) → `memory_notes[]`.
