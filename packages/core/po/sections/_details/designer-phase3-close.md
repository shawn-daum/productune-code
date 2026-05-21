# type:design Phase 3 close — Designer compliance check (amended v2)

Loaded on-demand at Phase 3 Build close.

## Role

Designer = **assignee for Close Ticket 1** (디자인 요소 검토). Ticket `type: design`. Model/effort = **sonnet/medium** (automated compliance check).

## Auto-check scope

Designer reads `docs/designer/design-system.md` + codebase; verifies all items:

- [ ] **Design system consistency** — color tokens, spacing tokens, typography scale match `design-system.md` across all screens/components; no off-spec values
- [ ] **Typography** — correct font family + scale applied; no residual system default font (`font-family: sans-serif` unset etc.)
- [ ] **Color palette** — brand colors applied throughout; no off-palette hex or Tailwind default colors in critical UI
- [ ] **Spacing** — design token spacing values in use; no magic-number px in critical layout
- [ ] **Logo** (SVG/PNG) present + referenced in code
- [ ] **Favicon** (`/public/favicon.ico` or equivalent) in place
- [ ] **`og:image`** / Open Graph image configured
- [ ] **Meta tags** — `<title>`, `<meta description>`, OG tags (`og:title`, `og:description`, `og:image`) present in entry HTML
- [ ] **App icons / splash screens** if applicable (mobile / Electron)

## Resolution rule

Mark each ✓ done / N/A / ✗ fail in ticket `## Outcome`. All items must resolve (no open ✗) before ticket closes. **Mandatory gate — no waiver.**

## Sequence reference

Full Phase 3 close gate sequence (T1 / T2 / T3): `~/.productune/sections/po-loop.md §Phase 3 Build close gate`.
