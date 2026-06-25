# P2 design sequence — per-step user-gated  (2026-06-05) [T-PATCH-DOCTRINE]

<!-- CAP: residual breach ~137/100 (was 150 pre-T-PATCH-260; body trimmed -19 while adding S1-HTML/
S2b-PNG content — no mechanic dropped to hit a number). ≤100 needs a structural split = extract the
S1 anchor pipeline to style-library/index.md or a new bookshelf doc; deferred to the backlog
cap-curation item (docs/backlog.md, T-128/129 follow-up). Do NOT gut a mechanic to reach 100. [T-260] -->

P2 runs as an ordered chain of gated steps. Each produces a named artifact, then STOPS at a user
gate — PO drives the "request to user" and waits. Never run two steps without the prior gate cleared.
Accept advances; refuse loops back.

## Branch — pick the entry step (PO selects: PRD case × version delta)

The FULL chain (new DS + full hi-fi) is a major-version event — never re-run it on every version
(T-PATCH-119). Version delta sets the ceiling; PRD case picks within it:
- **A — net-new / no `design-system.md` yet / major bump (v1.x→v2.0) / DS overhaul** → S1 → S4, S5
  **if kept**. On a minor bump, A is allowed ONLY if the PRD explicitly calls for a brand/DS overhaul
  AND the user confirms at a gate — never silently.
- **B (DEFAULT for minor bump on existing DS) — new feature** → skip S1/S2; enter at S3, S5 **if
  kept**. When kept, S5 covers ONLY the 2–3 screens the feature touches — not a full re-mock.
- **C — patch / small UI tweak / single component** → S5 only (skip S1–S4). **S5 is NOT skippable
  in C** (sole design step → keeping it guarantees ≥1 artifact; S5 skip is A/B-only). (T-PATCH-225)
- **User rejects an ADOPTED DS at ANY phase (incl. mid-P3 build)** → re-enter at S1 (not ad-hoc),
  anchor pipeline mandatory; the rejected DS's anchor + its 4 mood labels join this version's S1
  ban-list. (T-PATCH-128)

## Tickets — emit BEFORE running the chain (P2 entry, right after branch pick)

Running P2 ticketless is a violation — the statusline/GUI count `phase: 2` tickets; zero reads as
"Design (0/0)" while the phase moves (T-PATCH-118). On entry, emit the branch's design tickets
(`type: design`, `phase: 2`, `status: todo`, per `ticket-schema.md`): **A** = T1 DS+assets (S1–S2b)
· T2 mockup+flow (S3–S4) · T3 hi-fi (S5, cond.); **B** = T2 · T3; **C** = T3 only (required). Flip
`todo→in-progress` at a ticket's first step, `→done` at its last accepted gate; a refuse keeps it
`in-progress` (never reopen a done one). T3 always emitted so the phase counts; an S5 skip closes T3
`done` with a one-line outcome — no gate. (T-PATCH-225)

## Steps

### S1 — design-system proposals (RENDERED HTML, 3 up-front)  (2026-06-25 [T-PATCH-260])
Non-developers can't tell text token specs apart, so S1 surfaces **3 fully rendered HTML proposals
up-front** — `docs/artifacts/<version>/design-system-{a,b,c}.html` (one page w/ 3 sections OK).
**No text-concept narrowing, no cost-gate**: all 3 render every time (3× render cost accepted,
user-confirmed). Each is a real DS showcase (tokens / type / spacing / core components visibly
applied), not prose.
- **The 3-mix: A·B = Fit anchors · C = web-search-grounded divergence** (T-PATCH-260): **A·B** from
  the anchor pipeline below; **C bypasses the index** — each version, web-search the live design
  landscape for the surface/audience and let Claude diverge into a **genuinely new direction** (not
  a 3rd library anchor). C must read visibly distinct from A·B (≠ "same option, other color").
- **Anchor pipeline for A·B — IN ORDER** (T-PATCH-120/122): (1) **Mood brief BEFORE the index** —
  from PRD: surface type (dashboard / reading / marketing / tool), audience temperature, 3–5 mood
  adjectives, brand constraints; <2 derivable → ask ONE question, else never stop. (2) **Shortlist
  4–6 Fit anchors from `style-library/index.md`** (index ONLY — never bulk-read the library; no
  Stretch pool, divergence now lives in C). (3) **Pick A·B = 2 Fit.** Famous-brand cap: ≤1 of the 3
  total from top-tier defaults (linear / stripe / vercel / claude / notion / airbnb tier).
  **Divergence rule: ANY two of the 3 differ on ≥2 of the 4 mood labels** (`light|dark · minimal|rich
  · playful|serious · editorial|chrome`). Brand-guide exception (logo+palette+font attached to PRD):
  all 3 may be Fit, C still web-grounded off the guide. (4) **Justify BEFORE opening files** — per
  A/B write `anchor: <slug>.md — why this mood fits + what the others don't give`, open ONLY each
  proposal's own anchor file. Anchors ADAPT (palette/type/radius re-derived) — never clones.
- **Render requirements (HTML-always)** (T-PATCH-128 → -260): fonts named MUST load (webfont / local
  @font-face — bare `-apple-system` forbidden); per-proposal **font, component shape, AND layout**
  must visibly differ (not "identical except color"). Bind Tier0 `ux-principles.md` + anti-default
  pass (`anti-default.md`) per habit §4. Render-verify before the gate — undecidable = failed gate.
- **Provenance at the gate, per proposal** (T-PATCH-128 → -260): A·B carry `anchor: <slug>.md` + a
  1-line original identity + what was adapted; **C carries its web-search provenance** (what was
  searched/referenced + how it diverged, no library anchor). Read at the gate without asking.
- **Gate**: accepts 1–3. Refuse → short interview → back to S1. **Re-roll**: refused A·B anchors
  ban-listed for this version (pick fresh), C re-diverges on a fresh search — UNLESS the interview
  says a direction was right (keep it, fix the execution).

### S2 — design-system master (HTML accepted → SoT)
- S1 already renders HTML, so the accepted proposal's page IS the DS showcase — no separate render
  step unless the gate asked for fixes (then iterate). **Gate**: accept. Refuse → interview → S1.
- Write the accepted system to `docs/designer/design-system.md` (SoT, master) with its anchor line
  (`anchor: <slug>.md | web-search-C, <version>`) — the next major redesign avoids re-picking it
  (T-PATCH-122). SEED §1.5 (Tier0 ux-principles + project deltas) + §1.5.6 self-check (project-surface,
  cites Tier0 principle ids) — Tier0 does NOT auto-supply §1.5.6.

### S2b — brand assets (Branch A only, after the S2 gate)  (2026-06-17 [T-206] · 2026-06-25 [T-260])
DS accepted (palette + type locked) → produce the assets the P3 close-gate checks for, derived FROM
the accepted DS, never invented separately (the gate verifies these; this step is their producer):
**logo** (light/dark if dual-theme) · **favicon** (`favicon.svg` + `.ico`) · **`og:image`**. Land in
`docs/artifacts/<version>/` (`<ticket-id>-logo.*`, …), manifest `kind: "asset"`; P3 places them in
`public/`. **Notice once on entry** — "Claude has no image-generation model" — so designer does NOT
auto-draw; production is **delegation-first, generative-PNG-first**, direct-SVG is the LAST fallback
(T-PATCH-226). **Brand-guide input** (S1 exception): a supplied logo/wordmark is REUSED, never
re-drawn — only derive the favicon/og crop (no delegation branch).
- **Fallback ladder — generative PNG first, direct-SVG last** (T-PATCH-260):
  1. **Codex available** → delegate logo/og to Codex (image-gen skill → real raster PNG unless quota
     spent). On failure (quota/error) → step 2, NOT direct-SVG.
  2. **No Codex** → hand the user a ChatGPT (https://chatgpt.com/) / Gemini
     (https://gemini.google.com/app) **prompt + `expected_output_path` (expecting a PNG)** via
     `external_tool_recommendation` (habit §5). The P3 close-gate item stays `blocked` until it lands.
  3. **User returns a PNG** → Claude **vectorizes / post-processes it to SVG** (trace + clean up,
     tool/method = P3) + crops favicon/og from it. This loop keeps quality high and blocks the early
     SVG-direct fallback — a returned PNG beats hand-drawn SVG.
  4. **User declines the handoff entirely** → Claude generates directly (SVG) with a "no image model
     / quality-limited" caveat. LAST resort, not an early branch.
- **Handoff prompts are ALWAYS English** — regardless of `user_lang` (image models degrade on
  non-English). `external_tool_recommendation.prompt` is English even in a Korean session (the
  user-facing wrapper may be `user_lang`). SoT = habit §5; S2b references it. (T-PATCH-260)
- **OQ** (default = handoff-PNG, last = direct-SVG): "Claude는 이미지 생성 모델이 없어요. ChatGPT/Gemini에
  넣을 프롬프트(PNG로 받아요)를 드릴까요? PNG를 돌려주시면 제가 SVG로 다듬을게요. 아니면 (퀄리티는
  떨어지지만) 저희가 바로 만들까요?" — beyond own ability (3D / photographic / complex illustration)
  always routes to handoff first.
- **Gate**: accept the set (or a handoff recorded `blocked`). Refuse → interview → re-derive. Branch
  B/C skip — assets exist; a deliberate brand change is a major-version event that re-enters at A.

### S3 — mockup candidates (HTML)
Mock 1–2 key pages, candidates in parallel collapsed into ONE page
`docs/artifacts/<version>/mockup_candidates.html`. **Gate**: accept. Refuse → interview → re-render.

### S4 — user flow (HTML)
`docs/artifacts/<version>/userflow.html` — screen-to-screen flow over the accepted mockup.
**Gate**: accept. Refuse → interview → re-render.

### S5 — hi-fi mockup  (CONDITIONAL — decide skip/keep after the S4 gate)  (2026-06-22 [T-PATCH-225])
After S4 accepts, judge skip vs keep — never auto-produce a hi-fi when S3+S4 already carry the build.
- **Branch C exempt — S5 NOT skippable in C** (C runs S5-only; skip = zero artifact). Skip is
  **A/B-only**, where the accepted S4 mockup carries the build.
- **Skip** (A/B: S4 → P3, no S5) when ALL hold: S3+S4 already convey interaction + states · no new
  visual pattern · no complex interaction (requires an accepted S4 to skip onto). **Keep** when ANY:
  branch C · several new screens · complex interaction / state transitions · new pattern ·
  brand-heavy surface. **Ambiguous** → 2-option OQ, designer's call first: "hi-fi 목업까지 만들까요? /
  지금 mockup으로 충분하면 바로 빌드할까요?"
- **On keep** — interactive hi-fi via `frontend-design` skill:
  `docs/artifacts/<version>/<ticket-id>-mockup.{html,tsx}`. Stack: shadcn/ui + react-icons (default)
  / lucide-react (productune-internal per `feedback_icon_set`). **Gate**: accept → P3. **On skip** —
  close T3 `done` with a one-line outcome (`S5 skipped: <criterion>`); the P3 close-gate reads hi-fi
  as conditional (`phase3-close-gate.md`) — a skip never blocks the gate.

## Per-step archive + refuse loop
At EACH gate accept, adopt the chosen option per `bookshelf/artifact-manifest-schema.md` — promote
to flat `docs/artifacts/<version>/` + manifest; non-adopted candidates stay in `…/archive/`. A refuse
never advances: short interview (1–2 questions, what's wrong / wanted) → re-enter at the step named
above (S1 for S1/S2; same step for S3/S4/S5). (Branch B/C run only their steps.)
