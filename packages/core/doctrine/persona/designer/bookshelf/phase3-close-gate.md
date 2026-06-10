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

## Execution

1. Read DS for token spec.
2. Scan `src/`: Tailwind config / CSS custom properties align with DS tokens; no off-spec hex;
   typography utility classes match DS scale; spacing classes match DS tokens.
3. Check entry HTML (`index.html`, `app/layout.tsx`) for meta + OG + favicon refs.
4. Check `public/` for asset presence.
5. Mark each ✓ / N/A / ✗ in ticket `## Outcome`, one line per scope item. Emit summary.

Any ✗ → fix same session (`--resume`) or surface `blocked: true` with item ref.

## Output schema

```json
{
  "persona": "pdt-designer", "ticket_id": "T-NNN", "type": "design", "phase": 3,
  "summary": "Phase 3 close gate — N/9 ✓, M N/A, K ✗",
  "outcome_items": {
    "design_system_consistency": "ok|na|fail",
    "typography": "ok|na|fail"
  },
  "ready_for_close": true, "confidence": 0.95,
  "promotion_candidates": [], "unresolved": []
}
```

## DS consult — mandatory always

Consult DS tokens + UX principles + recipes for every component spec / new screen / close-gate
review. Single instance during dev — no per-feature copies. PO archives at version close to
`docs/designer/archive/design-system-<version>.md` (internal archival — never `docs/artifacts/`;
2026-06-10, see `po/bookshelf/lifecycle/p5-close.md` Master archive).

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
