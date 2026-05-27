# Phase 3 close gate — Designer compliance check

Loaded on-demand at Phase 3 Build close. Designer = assignee for Close Ticket 1
(디자인 요소 검토). ≤100 lines.

## Role + routing

- **Ticket type**: `type: design`
- **Assignee**: `pdt-designer`
- **Model / effort**: **sonnet / medium** (automated compliance check)
- **Sequence**: Close Ticket 1 — **before** PRD-requirements and security tickets.
  See `po/bookshelf/lifecycle-mechanics.md §Phase ticket auto-emit summary`.

## Mandatory gate — no waiver

All items must resolve (no open ✗) before ticket closes. Designer CANNOT waive.

## Auto-check scope

Designer reads `docs/designer/design-system.md` + scans codebase; verifies:

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

Designer **must** consult `docs/designer/design-system.md` tokens + UX principles +
recipes for every component spec / new screen / close gate review. Single instance
during dev — no per-feature copies. PO archives at version close to
`docs/artifacts/<version>/design-system-snapshot.md`.

## NOT covered

- **Functional correctness** — QA (`type:qa`).
- **PRD requirements adherence** — Close Ticket 2 (PO + user, waivable).
- **Security** — Close Ticket 3 (`type:qa`, security checklist, waivable).
- **Performance** — outside close-gate scope; raise as backlog if observed.

## Sequence

Full P3 close gate: `po/bookshelf/lifecycle-mechanics.md`. After Designer T1 done →
PO routes T2 (PRD requirements) → T3 (security). All 3 done → PO mechanical commit:
`git commit -m "feat(<version>): build close — N tickets done"`.
