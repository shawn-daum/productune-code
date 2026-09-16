---
name: build-entry
persona: po
when: "Build entry (Define close — PRD version scope approved)"
model_floor: opus
effort: medium
---
# Build-entry — slice the approved scope before work starts

Soft ritual: nothing blocks mechanically; every skip is a judgment + one `wiki/log.md` line. Findings become the slice itself (findings-not-tickets, same as readiness/retro): this ritual emits no tickets of its own — only the split result does.

## Screen set — what the user approves Define against
Define closes on the user's approval of the version's screens, never of the PRD alone. The set — each item with what stays unseen without it:
1. **DS showcase** — rendered HTML (`ds-3up`), the pick settled in `docs/design.md`: color · type · density · tone. Without it a prototype deviation and a DS choice look the same. Approved at its own fork (DS direction approval), before any prototype exists.
2. **Navigable prototype** — one artifact (`hifi`) the user operates like the product: pressing a control moves to the screen it names; a screen list beside it is the roster of every screen the version adds or changes, each entry with a one-line structure note; a description panel changes with the selected screen. Without it the user cannot tell which screens exist, how they connect, or how they feel — and cannot reject structure before accepting the render.
- Roster and render are one set: a roster entry with nothing rendered behind it, or a rendered screen the roster lacks, is not the set. Product coverage beyond that is not judged here.
- The set is Define work — design tickets of the version, produced BEFORE this ritual, never among the tickets step 3 emits. Set absent → Define is not closed: no confirm, no stage write; dispatch the designer (menu match on `change_meta`) and re-enter.

## N/A — a screen fact, never a user fact
- N/A only when the version's What names no page or window a person opens; a CLI whose output layout is the deliverable has screens (its prototype = a rendered sample). Discipline text · hooks · a field added to an existing line → N/A. A version with no screen still has users.
- N/A → the confirm carries the What lines themselves; the log line says `screens: n/a — <what the user saw instead>`.

## Sequence
1. **Slice the approved PRD version scope** into tickets by type (`design`/`impl`/`qa`/`ops`), including `deps` wherever one ticket's work gates another. Slice at the grain the version actually needs — don't over-split trivial work or under-split a large surface.
2. **Merge the split proposal into the existing Build-entry confirm fork** (PO habit Lifecycle: "entering Build with real scope" is already a load-bearing confirm) — present the ticket breakdown alongside that same ask; one confirm covers scope, screens and ticket shape, never a second round-trip. The confirm HANDS the set: one `[label](file://<absolute-path>)` per artifact (habit Deliverables form) — a file on disk the user got no link to is unseen. `hifi`'s skip/keep judgment picks the page: a fresh render when kept, the existing prototype/DS-showcase page when legitimately skipped — never a prose description alone. Then ask, in `user_lang`, whether Build opens on these screens.
3. Approval = the user's affirmative in the transcript AFTER the links were handed, naming nothing to change. A reply naming a change → designer re-render → re-hand → re-ask. An affirmative before the links, silence, or a re-entry without a reply → no approval, stage stays. On approval: write the tickets (`docs/tickets/<version>/T-NNN.md`, PO-authored frontmatter per contracts) and the stage write (`po-state.json` stage → `build`).

## Exception — emergent work
- Defects/discoveries surfacing DURING Build (dogfood bugs, unplanned findings) are NOT pre-sliced by this ritual — ticket them as found, exactly as today. This ritual front-loads only the APPROVED scope; it never blocks or delays reacting to the unplanned. After the gate is met, a product-shape one takes the section below.

## Gate met — the default flips to next version
- The state change, one-way: the open PRD section's gate literal holds — a `prdt doctor` verdict (`verdict=clean`) is read off doctor, any other literal checked as written. No gate line → every ticket of the Build-entry slice (the id range the ritual-close line names) is `done`/`dropped`. Say it in the reply you observe it and put `gate met <date>` on the PRD's gate line (Triage's scope-decision log).
- From then, a product-shape ticket (Triage) is put to the user as going to the NEXT version. Ground that reverses it — a fact you check, never a weight: (1) `deps` — an open ticket of THIS version lists it, so this round cannot close without it; (2) double move — a named outside project or repo already carries what the item changes (name it and the file/heading), so a next-round landing changes it twice. `ground: none` for "important" · "systemic" · "small" · "half done" · "while we're at it". The user overriding without a ground → admitted, row says `ground: none`.
- Not this section — none is a product-shape change: a gate blocker (same work — patch it) · a regression this round caused (`patch-cycle` in-build opening, or the in-ship loop) · a scoped ticket's deeper cause (rewrite that ticket's premise, count unchanged).
- Destination: next → the ticket file in `docs/tickets/v<N>.<m+1>/` (or the later dir a decision page already names), frontmatter as usual, never `backlog/` — backlog holds the unjudged; a judged ticket is that version's Define input (its section's What lists or drops it). Admitted → this version's dir.
- Record: one row in the open PRD section per item — What row + the ground, or Non-goals row `T-NNN → v<N>.<m+1> (gate met <date>, ground: none|<literal>)`. At Ship entry an open ticket the ship leaves behind takes the same fork (`readiness-dispatch` step 5).

## After
- Ritual close: ONE `wiki/log.md` line — `(date) build-entry v<N>.<m>: sliced N tickets T-<a>–T-<b> (design/impl/qa/ops) · screens approved <n>` or `· screens: n/a — <reason>` — or the judged-skip line if the user chose to slice ad-hoc instead.

## Rules
- This ritual emits NO tickets for itself — only the slice IS its output.
- A judged skip is logged, not defended — the user can decline pre-slicing and cut tickets as work proceeds; note it and move on. The slice is skippable; the screen set is not — a skipped slice still hands the set and takes the approval.
