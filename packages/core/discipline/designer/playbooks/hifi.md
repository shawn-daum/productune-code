---
name: hifi
persona: designer
when: "Define screen set — the version's navigable prototype · user-facing screens after a DS direction is settled · new visual pattern or complex interaction to convey"
model_floor: sonnet
effort: high
---
# Hi-fi — only when it earns its render cost

## Skip/keep judgment (run it first, say the call in `summary`)
- **Skip** when existing mockups / the DS file already convey interaction + states, no new visual pattern, no complex state transitions — the build proceeds from what exists; one line why. The Define screen set (`build-entry` §Screen set names the version's prototype) is a keep every time: render it in the order below, on the skeleton below.
- **Keep** when: several new screens · complex interaction / state machines · a new pattern · a brand-heavy surface · this is the sole design artifact of the change.
- Genuinely ambiguous → `needs_info` with the 2-option question (hi-fi first vs build from current mockups), your recommendation first.

## Define screen set — the order: criteria → skeleton → screens
`build-entry` §Screen set names what the user operates and what closes Define; this names what you build for it, in a fixed order. One dispatch renders one file. The order never runs backwards: a shell change after a screen exists is a lost round — say so in `summary`.
1. **Criteria** — `docs/artifacts/<version>/<slug>-criteria.md` before any screen is drawn: the coverage unit (what counts as one screen: surface × condition · flow branch · reachable state) · the condition set, CLOSED (e.g. default · empty · error · max), each pair kept only with the repository evidence it exists (a path, a count) · the interactive minimum bought (transitions press · state changes show · the reviewer edits in place). The roster derives from this table: one row per screen, its evidence, drawn / not drawn + why.
2. **Skeleton** — copy `~/.prdt/discipline/designer/screen-set/skeleton.html` to `docs/artifacts/<version>/<slug>.html`; fill only the spec layer (head · roster · conditions · descriptions), frames empty. Run the two checks below on the empty set — the shell is settled here and not re-argued once screens exist.
3. **Screens** — fill each frame from the DS (§Build), one per roster row, then transitions, then states: a string the label table owns renders as `data-label="<key>"` from `#labels`, a value from data carries `data-value` — the skeleton's edit bar edits labels in place, marks both apart and downloads the change list (key · old · new); the page never writes. Run the two checks again before returning.

## Define screen set — the shell (what the skeleton gives)
- **One file**, self-contained, ONE scrolling page: no fixed-height pane, `overflow:hidden` only where nothing can overflow. Top the head — the set's ID · a one-line definition · the decide block (one line per thing the user decides, its recommendation on the line; a pure screen set has none) — then three columns: left the screen list, center ONE screen inside the product frame at its own height, right its description; list and description stick to the viewport. Selecting a list entry swaps center and right in place, the page stays where it is. A condition radio sits on the stage, outside the frame, and swaps that screen's conditions the same way. Scope · rules · provenance · history fold under `<details>`, closed on load — never in the head.
- **Two layers, told apart by structure, never by typeface**: the spec layer (head · decide block · list · radio · description) keeps the skeleton's own palette and uses no product component; the product DS lives only inside `.frame`. Spec vocabulary — screen names, condition labels, `#N` row numbers, this document's own facts (how many screens, which PRD items) — never renders inside a frame: not in a sidebar, a crumb, a card.
- **Check 1, layer leak**: `python3 ~/.prdt/discipline/designer/screen-set/layer-leak-sweep.py <file>` reads that vocabulary off the spec layer (`.r-name` · `.cond-name` · `[data-spec-fact]`) and sweeps every frame's visible text; exit 0 and its `hits: 0` line go in `summary`, one hit is a fail. Real repository text rendered inside a screen carries `data-content="repo"` (excluded); a product label that IS the same string as a spec term → `--allow <term>`, the reason in `summary`.
- **Check 2, key equality**: each screen renders as `id="screen-<key>"`, its roster entry carries `data-screen="<key>"`, `<key>` identical on both sides — `grep -o 'data-screen="[^"]*"'` and `grep -o 'id="screen-[^"]*"'` over the file return the same set (the sweep prints it too); that equality IS "roster and render are one set".
- **Roster**: left pane, one entry per screen this version adds or changes, ordered as the user meets them. Entry = screen name + its structure line; the user counts the entries to judge coverage.
- **Structure line**, one per entry, ≤120 chars, written in `[ctx].user_lang`: the screen's regions in reading order, `>` for what sits inside what, `·` between siblings, a count where the count is the point, `→` before the control that leads to another screen. It carries region names, nesting and counts — the reader accepts or rejects layout and information order from this line with the render hidden, which is what pays for dropping the wireframe. English shape: `top bar > logo · search · body = card grid (12) · right = filter panel → "Export"`.
- **Transitions**: every control a structure line marks `→` moves — `data-open="<key>"` on the control renders that screen and moves the roster selection with it. The press is the evidence the transition exists.
- **Description panel**: changes with the selection — the structure line, then labelled bullets in the skeleton's fixed category order (`changed` · `layout` · `action` · `goto` · `states` · `data`), each ≤120 chars, a category with nothing to say omitted; purpose, provenance and history under its `background` fold.
- **DS first**: the DS pick sits in `docs/design.md` before this renders (`ds-3up` settles it, its own user fork). No DS there → `needs_info`, one question: settle the DS direction first.

## Build
- `docs/artifacts/<version>/<slug>.<ext>` — interactive HTML preferred (use the `frontend-design` skill when available). Define screen set → the shell above. A design or decision document (not a screen set) → the skeleton's document shape: decide block → one options table per decision, the recommended column marked → evidence (the list · screen · description block when screens exist, tables and measurements otherwise) — never the screen columns as the outer shape. Otherwise — drafts of several surfaces, candidates compared — the tab shell: a sticky top `role="tablist"`, one `role="tab"` per draft in the order the user meets them, its pane below with its own decide line (habit Artifacts); a later dispatch adds its tab and leaves the others untouched; a superseded tab is removed, git holds it.
- **Bind the DS**: every token, component shape, type choice and product string comes from `docs/design.md` — strings in its voice section's register and per-surface form. A value or string the DS doesn't have → `unresolved[]` for the DS, don't improvise it into the mockup.
- **All states, not the happy path**: loading / empty / error / skeleton for every data surface; disabled and pressed for controls; realistic content (no lorem walls, no perfect-length labels).
- Anti-default pass + ux-principles bound (`style-library/`), signature bar by surface type: entry/marketing needs a signature move; utility UI earns restraint.
- Render-verify (screenshot and read it) before returning.

## Return
- Print the absolute artifact path on its own line + a `file://` line (rendered view).
- `summary`: skip/keep call · screens covered · states covered · both check results · any DS gaps flagged.
- Direction-level choices you made without the user (layout paradigm, nav model) → `memory_notes[]`.
- This artifact is what the PO's Build-entry confirm shows the user — never let Build start on a prose description of it instead.
