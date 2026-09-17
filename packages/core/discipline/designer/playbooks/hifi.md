---
name: hifi
persona: designer
when: "Define screen set — the version's navigable prototype · user-facing screens after a DS direction is settled · new visual pattern or complex interaction to convey"
model_floor: sonnet
effort: high
---
# Hi-fi — only when it earns its render cost

## Skip/keep judgment (run it first, say the call in `summary`)
- **Skip** when existing mockups/DS showcase already convey interaction + states, no new visual pattern, no complex state transitions — the build proceeds from what exists; one line why. The Define screen set (`build-entry` §Screen set names the version's prototype) is a keep every time: render it to the shell below.
- **Keep** when: several new screens · complex interaction / state machines · a new pattern · a brand-heavy surface · this is the sole design artifact of the change.
- Genuinely ambiguous → `needs_info` with the 2-option question (hi-fi first vs build from current mockups), your recommendation first.

## Define screen set — the prototype's shell
`build-entry` §Screen set names what the user operates and what closes Define; this names what you build for it. One dispatch renders one file.
- **One file**: `docs/artifacts/<version>/<slug>.html`, self-contained — roster, screens, description panel and transitions all inside it. The key binds the two sides within the page, so the set stays one artifact.
- **Key per screen**: each screen renders as `id="screen-<key>"`, its roster entry carries `data-screen="<key>"`, `<key>` identical on both sides. Verify before returning: `grep -o 'data-screen="[^"]*"'` and `grep -o 'id="screen-[^"]*"'` over the file return the same set — that equality IS "roster and render are one set".
- **Roster**: left pane, one entry per screen this version adds or changes, ordered as the user meets them. Entry = screen name + its structure line; the user counts the entries to judge coverage. Selecting one shows that screen and swaps the description panel.
- **Structure line**, one per entry, ≤120 chars, written in `[ctx].user_lang`: the screen's regions in reading order, `>` for what sits inside what, `·` between siblings, a count where the count is the point, `→` before the control that leads to another screen. It carries region names, nesting and counts — the reader accepts or rejects layout and information order from this line with the render hidden, which is what pays for dropping the wireframe. English shape: `top bar > logo · search · body = card grid (12) · right = filter panel → "Export"`.
- **Transitions**: every control a structure line marks `→` moves — pressing it renders that screen and moves the roster selection with it. The press is the evidence the transition exists.
- **Description panel**: changes with the selection — the selected screen's structure line, what the screen is for, and which states it shows.
- **Order**: the DS pick sits in `docs/design.md` before this renders (`ds-3up` settles it, its own user fork). No DS there → `needs_info`, one question: settle the DS direction first.

## Build
- `docs/artifacts/<version>/<slug>.<ext>` — interactive HTML preferred (use the `frontend-design` skill when available). Define screen set → the shell above. Otherwise one page per key screen or a linked set; keep candidates collapsed into one page when comparing.
- **Bind the DS**: every token, component shape, type choice and product string comes from `docs/design.md` — strings in its voice section's register and per-surface form. A value or string the DS doesn't have → `unresolved[]` for the DS, don't improvise it into the mockup.
- **All states, not the happy path**: loading / empty / error / skeleton for every data surface; disabled and pressed for controls; realistic content (no lorem walls, no perfect-length labels).
- Anti-default pass + ux-principles bound (`style-library/`), signature bar by surface type: entry/marketing needs a signature move; utility UI earns restraint.
- Render-verify (screenshot and read it) before returning.

## Return
- Print the absolute artifact path on its own line + a `file://` line (rendered view).
- `summary`: skip/keep call · screens covered · states covered · any DS gaps flagged.
- Direction-level choices you made without the user (layout paradigm, nav model) → `memory_notes[]`.
- This artifact is what the PO's Build-entry confirm shows the user — never let Build start on a prose description of it instead.
