# P2 design sequence — per-step user-gated  (2026-06-05) [T-PATCH-DOCTRINE]

P2 runs as an ordered chain of gated steps. Each step produces a named artifact, then
STOPS at a user gate — PO drives the "request to user" and waits. Never run two steps
without the prior gate cleared. Accept advances; refuse loops back.

## Branch — pick the entry step (PO selects from PRD case)
- **A — net-new product / no design system yet** → run the full chain S1 → S5.
- **B — new feature on an existing design system** → skip S1, S2; enter at S3.
- **C — small UI tweak / single component** → S5 hi-fi only, one gate. Skip S1–S4.

## Steps

### S1 — design-system proposals (TEXT)
- Search the existing system (`docs/designer/design-system.md`, prior artifacts). Produce
  **3 proposals** as text (tokens / type / spacing / component direction — no HTML yet).
- **Gate**: user accepts 1–3 of them. Refuse → short interview (what's wrong) → back to S1.

### S2 — design-system render (HTML)
- For EACH accepted proposal, build a design-system showcase page:
  `docs/artifacts/<version>/design-system-<n>.html`.
- **Gate**: user accepts 1–3. Refuse → interview → back to S1 (re-propose).
- The accepted system is written to `docs/designer/design-system.md` (SoT, master).

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
