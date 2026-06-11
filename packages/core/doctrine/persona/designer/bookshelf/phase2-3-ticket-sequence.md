# P2 design sequence — per-step user-gated  (2026-06-05) [T-PATCH-DOCTRINE]

P2 runs as an ordered chain of gated steps. Each step produces a named artifact, then
STOPS at a user gate — PO drives the "request to user" and waits. Never run two steps
without the prior gate cleared. Accept advances; refuse loops back.

## Branch — pick the entry step (PO selects: PRD case × version delta)

Two axes decide the branch. The FULL chain (new design system + full hi-fi) is a
major-version event — do not re-run it on every version (T-PATCH-119).

1. **Version delta** (from `po-state.current_version` vs previous):
   - **net-new product / no `docs/designer/design-system.md` yet** → A.
   - **major bump (v1.x → v2.0)** → A allowed (DS rework on the table).
   - **minor bump (v1.1, v0.6, …) with an existing design system** → B is the DEFAULT:
     2–3 key screens mocked on the existing DS, no S1/S2. Escalate to A ONLY when the
     PRD explicitly calls for a brand / design-system overhaul AND the user confirms the
     escalation at a gate — never silently.
   - **patch / single-surface change** → C.
2. **PRD case** (within the delta's ceiling):
   - **A — net-new product / DS overhaul** → run the full chain S1 → S5.
   - **B — new feature on an existing design system** → skip S1, S2; enter at S3.
     S5 hi-fi covers ONLY the 2–3 screens the feature touches — not a full re-mock.
   - **C — small UI tweak / single component** → S5 hi-fi only, one gate. Skip S1–S4.

## Tickets — emit BEFORE running the chain (P2 entry, right after branch pick)

Running P2 ticketless is a violation — the statusline/GUI progress counts `phase: 2`
tickets, and zero tickets reads as "Design (0/0)" while the phase moves (T-PATCH-118).
On P2 entry, emit the design tickets for the steps the chosen branch actually runs
(`type: design`, `phase: 2`, `status: todo`, per `ticket-schema.md`):

| branch | tickets emitted |
|:--|:--|
| A | T1 design system (S1–S2) · T2 mockup + user flow (S3–S4) · T3 hi-fi (S5) |
| B | T2 (S3–S4) · T3 (S5) |
| C | T3 (S5) only |

Flip each ticket `todo → in-progress` when its first step starts, `→ done` when its last
gate is accepted. A refuse loop keeps the ticket `in-progress` — never reopen a done one.

## Steps

### S1 — design-system proposals (TEXT)
- Search the existing system (`docs/designer/design-system.md`, prior artifacts). Produce
  **3 proposals** as text (tokens / type / spacing / component direction — no HTML yet).
- **Diversity is mandatory — anchor on the style library** (T-PATCH-120). Read
  `bookshelf/style-library/index.md` (index ONLY — never bulk-read the library) and pick
  **3 divergent anchors from 3 DIFFERENT categories**, biased to the product's domain plus
  at least one deliberately-distant category. Each proposal names its anchor
  (`anchor: <slug>.md — <why this mood fits>`) and opens ONLY its own anchor file.
  Anchors are mood/token starting points to ADAPT (palette, type, radius re-derived for
  the product) — never brand clones. Three proposals that read as the same mood = redo S1.
- **Gate**: user accepts 1–3 of them. Refuse → short interview (what's wrong) → back to S1.

### S2 — design-system render (HTML)
- For EACH accepted proposal, build a design-system showcase page:
  `docs/artifacts/<version>/design-system-<n>.html`.
- **Gate**: user accepts 1–3. Refuse → interview → back to S1 (re-propose).
- The accepted system is written to `docs/designer/design-system.md` (SoT, master).
- When authoring it, SEED §1.5 (apply Tier0 ux-principles + project deltas) + §1.5.6 self-check (project-surface, cites Tier0 principle ids) — Tier0 does NOT auto-supply §1.5.6.

### S3 — mockup candidates (HTML)
- Mock 1–2 key pages, candidates in parallel, collapsed into ONE page:
  `docs/artifacts/<version>/mockup_candidates.html`.
- **Gate**: user accepts. Refuse → interview → re-render S3.

### S4 — user flow (HTML)
- `docs/artifacts/<version>/userflow.html` — screen-to-screen flow over the accepted mockup.
- **Gate**: user accepts. Refuse → interview → re-render S4.

### S5 — hi-fi mockup
- Interactive hi-fi via the `frontend-design` skill:
  `docs/artifacts/<version>/<ticket-id>-mockup.{html,tsx}`.
- Stack: shadcn/ui + react-icons (default) / lucide-react (productune-internal per
  `feedback_icon_set`).
- **Gate**: user accepts → P2 exits to P3.

## Per-step archive (at EACH gate, immediately)
On every gate accept, move the candidates NOT chosen at that step into
`docs/artifacts/<version>/archive/` right then — do NOT defer to P2 close. The adopted
artifact stays flat in `docs/artifacts/<version>/`. (Branch B/C archive only the steps they run.)

## Refuse loop
A refuse never advances. Run a short interview (1–2 questions, what's wrong / what's wanted),
then re-enter at the step named above (S1 for S1/S2; same step for S3/S4/S5).
