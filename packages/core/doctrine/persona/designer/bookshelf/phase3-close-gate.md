# Phase 3 close gate — design compliance check

Assignee for Phase 3 Build Close Ticket 1 (design element review): an automated
design-compliance check.

## Routing

- **Ticket type**: `type: design`
- **Model / effort**: **sonnet / medium**
- **Sequence**: Close Ticket 1 — run **before** PRD-requirements and security tickets.
  See `po/bookshelf/lifecycle-mechanics.md §Phase ticket auto-emit summary`.

## Mandatory gate — no waiver

Resolve every item (no open ✗) before you close the ticket. You CANNOT waive.

## Auto-check scope

Read `docs/designer/design-system.md`, scan the codebase, verify:

- [ ] **Design system consistency** — color / spacing / typography tokens match
  `design-system.md`. No off-spec values.
- [ ] **Typography** — correct font family + scale. No residual system default.
- [ ] **Color palette** — brand colors throughout. No off-palette hex / Tailwind
  defaults in critical UI.
- [ ] **Spacing** — design token values. No magic-number px in critical layout.
- [ ] **Logo** — SVG/PNG present + referenced.
- [ ] **Favicon** — `/public/favicon.ico` or equivalent.
- [ ] **`og:image`** — Open Graph image configured + referenced.
- [ ] **Meta tags** — `<title>`, `<meta name="description">`, OG tags (`og:title`,
  `og:description`, `og:image`) in entry HTML.
- [ ] **App icons / splash** — mobile / Electron / PWA if applicable.

## Resolution rule

Mark each ✓ / N/A / ✗ in ticket `## Outcome`:

```markdown
## Outcome
- [x] Design system consistency ✓
- [x] Typography ✓
- [x] Color palette ✓
- [x] Spacing ✓
- [x] Logo ✓
- [x] Favicon ✓
- [x] og:image ✓
- [x] Meta tags ✓
- [x] App icons N/A (web-only)
```

Any ✗ → fix in same session (`--resume`) or surface `blocked: true` with item ref.

## Execution

1. Read `docs/designer/design-system.md` for current token spec.
2. Scan `src/` for token usage:
   - Tailwind config / CSS custom properties align with DS tokens.
   - No off-spec color hex.
   - Typography utility classes match DS scale.
   - Spacing classes match DS spacing tokens.
3. Check entry HTML (`index.html`, `app/layout.tsx`) for meta + OG + favicon refs.
4. Check `public/` for asset presence.
5. Fill `## Outcome` checklist. Emit summary.

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

Consult `docs/designer/design-system.md` tokens + UX principles + recipes for every
component spec / new screen / close gate review. Single instance during dev — no
per-feature copies. PO archives at version close to
`docs/artifacts/<version>/design-system-snapshot.md`.

## NOT covered (route elsewhere)

- **Functional correctness** — QA (`type:qa`).
- **PRD requirements adherence** — Close Ticket 2 (PO + user, waivable).
- **Security** — Close Ticket 3 (`type:qa`, security checklist, waivable).
- **Performance** — outside close-gate scope; raise as backlog if observed.

## Sequence handoff

After your T1 is done → PO routes T2 (PRD requirements) → T3 (security). All 3 done → PO
commits: `git commit -m "feat(<version>): build close — N tickets done"`. Full gate:
`po/bookshelf/lifecycle-mechanics.md`.
