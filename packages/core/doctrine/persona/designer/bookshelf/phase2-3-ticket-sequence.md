# P2 design sequence — per-step user-gated  (2026-06-05) [T-PATCH-DOCTRINE]

P2 runs as an ordered chain of gated steps. Each step produces a named artifact, then STOPS at a
user gate — PO drives the "request to user" and waits. Never run two steps without the prior gate
cleared. Accept advances; refuse loops back.

## Branch — pick the entry step (PO selects: PRD case × version delta)

Two axes decide the branch. The FULL chain (new design system + full hi-fi) is a major-version
event — do not re-run it on every version (T-PATCH-119).

1. **Version delta** (from `po-state.current_version` vs previous):
   - **net-new product / no `docs/designer/design-system.md` yet** → A.
   - **major bump (v1.x → v2.0)** → A allowed (DS rework on the table).
   - **minor bump (v1.1, v0.6, …) with an existing design system** → B is the DEFAULT: 2–3 key
     screens mocked on the existing DS, no S1/S2. Escalate to A ONLY when the PRD explicitly calls
     for a brand / DS overhaul AND the user confirms the escalation at a gate — never silently.
   - **patch / single-surface change** → C.
   - **user rejects an ADOPTED design system at ANY phase (incl. mid-P3 build)** → re-enter the P2
     chain at S1 (not ad-hoc). Anchor pipeline mandatory — never hand-invent. The rejected DS's
     anchor + its 4 mood labels join THIS version's S1 ban-list so the re-run can't re-pick them. (2026-06-12) [T-PATCH-128]
2. **PRD case** (within the delta's ceiling):
   - **A — net-new product / DS overhaul** → run S1 → S4, then S5 **if kept** (S5 is conditional — see its step).
   - **B — new feature on an existing design system** → skip S1, S2; enter at S3, then S5 **if kept**.
     When kept, S5 covers ONLY the 2–3 screens the feature touches — not a full re-mock.
   - **C — small UI tweak / single component** → S5 only (skip S1–S4). S5 is NOT skippable in C —
     it is the sole design step, so keeping it guarantees ≥1 design artifact. (S5 skip is an A/B-only
     option, where an accepted S4 mockup already carries the build.) (T-PATCH-225)

## Tickets — emit BEFORE running the chain (P2 entry, right after branch pick)

Running P2 ticketless is a violation — the statusline/GUI counts `phase: 2` tickets, and zero
tickets reads as "Design (0/0)" while the phase moves (T-PATCH-118). On P2 entry, emit the design
tickets for the steps the chosen branch runs (`type: design`, `phase: 2`, `status: todo`, per
`ticket-schema.md`):

| branch | tickets emitted |
|:--|:--|
| A | T1 design system + brand assets (S1–S2b) · T2 mockup + user flow (S3–S4) · T3 hi-fi (S5, conditional) |
| B | T2 (S3–S4) · T3 (S5, conditional) |
| C | T3 (S5 — required, not skippable) only |

Flip each ticket `todo → in-progress` when its first step starts, `→ done` when its last
gate is accepted. A refuse loop keeps the ticket `in-progress` — never reopen a done one.
The S5 ticket (T3) is always emitted so the phase counts (no "Design (0/0)"); when S5 is skipped
per its criteria, T3 closes `done` with a one-line skip outcome — no gate. (T-PATCH-225)

## Steps

### S1 — design-system proposals (TEXT)
- Search the existing system (`docs/designer/design-system.md`, prior artifacts). Produce
  **3 proposals** as text (tokens / type / spacing / component direction — no HTML yet).
- **Anchor selection pipeline — run IN ORDER** (T-PATCH-120/122):
  1. **Mood brief BEFORE opening the index** — derive from the PRD: surface type (dashboard /
     reading / marketing / tool), audience temperature, 3–5 mood adjectives, brand constraints.
     <2 adjectives derivable → ask the user ONE question; otherwise never stop.
  2. **Shortlist 6–9 from `bookshelf/style-library/index.md`** (index ONLY — never bulk-read the
     library): a Fit pool (4–6, matches the brief) + a Stretch pool (2–3, contradicts ≥1 brief
     adjective but plausible for the audience).
  3. **Pick 3 = Fit 2 + Stretch 1** (fixed mix). Sole exception: a brand guide document (logo +
     palette + font, attached to the PRD) → Fit 3 allowed. Famous-brand cap: ≤1 of the 3 from
     top-tier defaults (linear / stripe / vercel / claude / notion / airbnb tier). **Divergence
     rule: ANY two of the 3 anchors must differ on ≥2 of the 4 mood labels** (`light|dark ·
     minimal|rich · playful|serious · editorial|chrome` — from the index). Category variety is a
     soft preference, not a rule.
  4. **Justify BEFORE opening files** — per anchor write `anchor: <slug>.md — why this mood fits +
     what the other two don't give`, then open the 3 anchor files (each proposal reads ONLY its own).
  Anchors are mood/token starting points to ADAPT (palette, type, radius re-derived) — never clones.
- **Anchor provenance — surface it at the gate, per proposal** (2026-06-12) [T-PATCH-128]: every
  proposal MUST carry `anchor: <slug>.md` · a 1-line original identity ("what this anchor is") ·
  what you adapted for this product. Step-4 justification isn't enough — the user reads the
  provenance at the gate without asking.
- **If a visual preview accompanies the S1 text** (2026-06-12) [T-PATCH-128]: the fonts named MUST
  actually load (webfont link / local @font-face) — bare `-apple-system` is forbidden. Per-proposal
  type and component-shape differences MUST visibly render, so proposals don't collapse into
  "identical except color". Render-verify before surfacing — an undecidable gate is a failed gate.
- **Gate**: user accepts 1–3. Refuse → short interview (what's wrong) → back to S1. **Re-entry
  re-roll**: refused anchors go on a ban list for this version's S1 — pick fresh ones, UNLESS the
  interview says a direction was right (keep that anchor, fix the execution).

### S2 — design-system render (HTML)
- For EACH accepted proposal, build a design-system showcase page:
  `docs/artifacts/<version>/design-system-<n>.html`.
- **Gate**: user accepts 1–3. Refuse → interview → back to S1 (re-propose).
- The accepted system is written to `docs/designer/design-system.md` (SoT, master), with its
  anchor line (`anchor: <slug>.md, <version>`) — the next major redesign reads this and avoids
  re-picking the previous anchor (T-PATCH-122).
- When authoring it, SEED §1.5 (apply Tier0 ux-principles + project deltas) + §1.5.6 self-check (project-surface, cites Tier0 principle ids) — Tier0 does NOT auto-supply §1.5.6.

### S2b — brand assets (Branch A only, after the S2 gate)  (2026-06-17) [T-PATCH-206]
Once the DS is accepted (palette + type locked), the brand assets the P3 close-gate later checks
for must be produced — derived FROM the accepted DS, never invented separately (this step exists
because the close-gate verifies these but no step used to make them — gate-without-producer).
Assets: **logo** (light/dark if dual-theme) · **favicon** (`favicon.svg` + `.ico`) · **`og:image`**
(social card). Land in `docs/artifacts/<version>/` (`<ticket-id>-logo.*`, …), manifest
`kind: "asset"`; P3 build places them in `public/`.
- **Notice once on entry** — "Claude has no image-generation model" — so designer does NOT
  auto-draw. Production is **delegation-first**; Claude-direct is the explicit fallback. (2026-06-22) [T-PATCH-226]
- **Brand-guide input** (S1 Fit-3 exception): a supplied logo/wordmark is REUSED, never re-drawn —
  only derive the favicon/og crop. (No delegation branch.)
- **① Codex agent available** → delegate logo/og to Codex (it has an image-gen skill — real raster
  output unless quota spent). On failure (quota / error) → fall back to ②, not to Claude-direct.
- **② No Codex** → hand the user a ChatGPT (https://chatgpt.com/) / Gemini
  (https://gemini.google.com/app) **prompt + `expected_output_path`** via `external_tool_recommendation`
  (habit §5). The matching P3 close-gate item stays `blocked` until the asset lands.
- **③ User declines** → Claude generates directly (SVG), with a "no image model / quality-limited" caveat.
- **②/③ as a 2-option OQ** (default = handoff, fallback = direct): "Claude는 이미지 생성 모델이 없어요.
  ChatGPT/Gemini에 넣을 프롬프트를 드릴까요? 아니면 (퀄리티는 떨어지지만) 저희가 직접 만들까요?" —
  beyond own ability (3D / photographic / complex illustration) always routes ② first.
- **Gate**: user accepts the set (or the ②-handoff is recorded blocked). Refuse → interview → re-derive.
Branch B/C skip this — assets already exist; a deliberate logo/brand change is a major-version
event that re-enters at A.

### S3 — mockup candidates (HTML)
- Mock 1–2 key pages, candidates in parallel, collapsed into ONE page:
  `docs/artifacts/<version>/mockup_candidates.html`.
- **Gate**: user accepts. Refuse → interview → re-render S3.

### S4 — user flow (HTML)
- `docs/artifacts/<version>/userflow.html` — screen-to-screen flow over the accepted mockup.
- **Gate**: user accepts. Refuse → interview → re-render S4.

### S5 — hi-fi mockup  (CONDITIONAL — decide skip/keep after the S4 gate)  (2026-06-22) [T-PATCH-225]
S5 is no longer always-on. After S4 accepts, judge skip vs keep — never auto-produce a hi-fi when
S3+S4 already carry the build.
- **Branch C is exempt — S5 is NOT skippable in C.** C runs S5-only (no S1–S4), so skipping it
  would leave P2 with zero design artifact. C always keeps S5 → guarantees ≥1 design output.
  Skip applies to **A/B only**, where the accepted S4 mockup already carries the build.
- **Skip** (A/B: accept S4 → P3 build, no S5) when ALL hold: S3+S4 already convey the interaction
  + states the build needs · no new visual pattern · no complex interaction. (Requires an accepted
  S4 to skip onto — never skip when no mockup/flow was produced.)
- **Keep** when ANY holds: branch C · several new screens · complex interaction / state transitions ·
  a new design pattern · brand-heavy surface.
- **Ambiguous** (criteria don't decide cleanly) → 2-option OQ, designer's criteria call first:
  "hi-fi 목업까지 만들까요? / 지금 mockup으로 충분하면 바로 빌드할까요?"
- **On keep** — interactive hi-fi via the `frontend-design` skill:
  `docs/artifacts/<version>/<ticket-id>-mockup.{html,tsx}`. Stack: shadcn/ui + react-icons
  (default) / lucide-react (productune-internal per `feedback_icon_set`). **Gate**: user accepts → P3.
- **On skip** — close T3 `done` with a one-line outcome (`S5 skipped: <criterion>`); P2 exits to P3
  with no hi-fi. The P3 close-gate reads hi-fi as conditional (`phase3-close-gate.md`) — a skip
  never blocks the gate.

## Per-step archive (at EACH gate, immediately)
On every gate accept, adopt the chosen option per `bookshelf/artifact-manifest-schema.md` — promote
it to flat `docs/artifacts/<version>/` + manifest; the non-adopted candidates stay in
`docs/artifacts/<version>/archive/` (no keep-vs-discard). (Branch B/C run only their steps.)

## Refuse loop
A refuse never advances. Run a short interview (1–2 questions, what's wrong / what's wanted),
then re-enter at the step named above (S1 for S1/S2; same step for S3/S4/S5).
