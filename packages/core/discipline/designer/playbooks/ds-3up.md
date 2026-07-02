---
name: ds-3up
persona: designer
when: "no design system yet · DS overhaul (approved reversal) · user rejected the adopted DS"
model_floor: opus
effort: high
---
# DS proposals — rendered options before any hi-fi

Non-developers can't tell text token-specs apart. Surface RENDERED HTML design-system proposals → the PO gets the user's pick (a load-bearing fork) → only then does hi-fi exist.

## Branch on user direction
- **User has a direction** (names a look, supplies a brand guide) → ONE DS mockup in that direction. A supplied logo/palette/font is honored exactly — deviating there is a miss, not creativity.
- **No direction** → 3 options (3안), built as below.

## The 3-mix (A·B = Fit anchors · C = searched divergence)
1. **Mood brief first**, from the PRD: surface type (dashboard / reading / marketing / tool) · audience temperature · 3–5 mood adjectives · brand constraints. Under 2 derivable → ONE `needs_info` question; otherwise never stop.
2. **A·B**: shortlist 4–6 Fit anchors from `style-library/index.md` (index only — never bulk-read the library), pick 2, and ADAPT them — palette/type/radius re-derived, not clones. Open only each pick's own anchor file.
3. **C**: web-search the live design landscape for this surface/audience and diverge into a genuinely new direction — visibly distinct from A·B, not "same option, other color".
- **Famous-brand cap ≤1** of the three from top-tier defaults (linear/stripe/vercel/claude/notion/airbnb tier).
- **Divergence rule**: any two of the three differ on ≥2 of the 4 mood labels (`light|dark · minimal|rich · playful|serious · editorial|chrome`) AND visibly differ in font, component shape, layout.

## Render requirements
- `docs/artifacts/<slug>-ds-{a,b,c}.html` (one page with 3 sections is fine) — a real showcase: tokens / type / spacing / core components visibly applied, not prose.
- Named fonts actually load (webfont/@font-face; bare `-apple-system` forbidden; Pretendard leads UI text). Anti-default pass (`style-library/anti-default.md`) + `style-library/ux-principles.md` bound. Render-verify (screenshot yourself) before returning — undecidable render = not done.
- Per proposal, one provenance line: A·B `anchor: <slug> — why this mood fits · what was adapted`; C `searched: <what> — how it diverges`.

## On the user's pick / rejection
- **Pick** → write the settled system into `docs/design.md` (tokens · core components · rationale · anchor line) — the single living DS.
- **Rejection** → the PO interviews and re-dispatches: rejected anchors + their mood labels join this version's ban-list; C re-diverges on a fresh search — unless the interview says the direction was right (keep it, fix execution).
- Durable direction decisions (picked + rejected-why) → `memory_notes[]`.
