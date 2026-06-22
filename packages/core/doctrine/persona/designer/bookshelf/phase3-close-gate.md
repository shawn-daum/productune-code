# Phase 3 close gate — design compliance check

Phase 3 Build Close Ticket 1: automated design-compliance check. `type: design`,
sonnet/medium. Sequence + waiver status + personas: `po/bookshelf/lifecycle/p3-build.md`
(this T+0 is **mandatory, no waiver** — resolve every item, no open ✗, before close).

## Auto-check scope

Read `docs/designer/design-system.md` (DS), scan codebase, verify each:

- [ ] **Design system consistency** — color/spacing/typography tokens match DS. No off-spec values.
- [ ] **Typography** — correct family + scale. No system default.
- [ ] **Color palette** — brand colors throughout. No off-palette hex / Tailwind default in critical UI.
- [ ] **Spacing** — DS token values. No magic-number px in critical layout.
- [ ] **Logo** — SVG/PNG present + referenced.
- [ ] **Favicon** — `/public/favicon.ico` or equivalent.
- [ ] **`og:image`** — configured + referenced.
- [ ] **Meta tags** — `<title>`, `<meta name="description">`, OG tags (`og:title`, `og:description`, `og:image`) in entry HTML.
- [ ] **App icons / splash** — mobile / Electron / PWA if applicable.
- [ ] **Aesthetic / anti-default** — score each shipped critical / entry screen with the 3-axis
  rubric in `qa/bookshelf/design-review.md` (cross-persona read; that rubric is the bands SoT).
  **Close-FAIL threshold (the gate owns this):** any marketing / landing / entry surface with
  AI-slop index ≥ 6 = ✗; utility UI judged on restraint — over-signature (a forced loud move on
  a calm surface) = ✗ too. A11y/usability regression flagged by the rubric = ✗. Below the bar on
  every scored screen = ✓.

> Producer of the Logo / Favicon / `og:image` / app-icon items = **P2 S2b (brand assets)**
> (`phase2-3-ticket-sequence.md`). A missing item here means S2b was skipped (wrong branch) or
> its delegation / `external_tool_recommendation` handoff (Codex or ChatGPT/Gemini) is still
> `blocked` (asset not landed) — surface it, never silently pass. (T-PATCH-226)
> **Hi-fi mockup (S5) is NOT a close-gate item** — it is a conditional P2 step. An absent hi-fi
> means S5 was skipped per its criteria, which is valid; never block close on a missing hi-fi.
> The scope items above (DS / type / color / assets) are verified against the shipped build
> regardless of whether a hi-fi was produced. (T-PATCH-225)

## Execution

1. Read DS for token spec.
2. Scan `src/`: Tailwind config / CSS custom properties align with DS tokens; no off-spec hex;
   typography utility classes match DS scale; spacing classes match DS tokens.
3. Check entry HTML (`index.html`, `app/layout.tsx`) for meta + OG + favicon refs.
4. Check `public/` for asset presence.
5. Score the shipped critical / entry screens with the `design-review.md` 3-axis rubric; apply the
   threshold above (slop index ≥ 6 on a marketing/entry surface, or over-signature on utility = ✗).
6. Mark each ✓ / N/A / ✗ in ticket `## Outcome`, one line per scope item. Emit summary.

Any ✗ → fix same session (`--resume`) or surface `blocked: true` with item ref.

## Output schema

```json
{
  "persona": "pdt-designer", "ticket_id": "T-NNN", "type": "design", "phase": 3,
  "summary": "Phase 3 close gate — N/10 ✓, M N/A, K ✗",
  "outcome_items": {
    "design_system_consistency": "ok|na|fail",
    "typography": "ok|na|fail",
    "aesthetic_anti_default": "ok|na|fail"
  },
  "ready_for_close": true, "confidence": 0.95,
  "promotion_candidates": [], "unresolved": []
}
```

## DS consult — mandatory always

Consult DS tokens + UX principles + recipes for every component spec / new screen / close-gate
review. Single instance during dev — no per-feature copies. PO archives at version close to
`docs/designer/archive/design-system-<version>.md` (internal archival — never `docs/artifacts/`;
see `po/bookshelf/lifecycle/p5-close.md` Master archive).

## NOT covered (route elsewhere)

- **Functional correctness** — QA (`type:qa`).
- **PRD requirements adherence** — Close Ticket 2 (PO + user, waivable).
- **Security** — Close Ticket 3 (`type:qa`, security checklist, waivable).
- **Performance** — out of close-gate scope; raise as backlog if observed.

Sequence handoff (T+0 → T+1 → T+2): `po/bookshelf/lifecycle/p3-build.md`.

**Build-close commit** (after all close-gate tickets `done`, before P4 exit — the
version-level aggregate, distinct from the per-ticket `[T-N] <request_summary>` form in
`po/bookshelf/lifecycle/ticket-ops.md`):

```
git commit -m "feat(<version>): build close — N tickets done"
```
