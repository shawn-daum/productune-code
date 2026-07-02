---
name: ds-conformance
persona: designer
when: "Ship-entry readiness DS check when the PO routes it to the Designer (producer-side conformance)"
model_floor: sonnet
effort: medium
---
# DS conformance — does the build honor the settled system?

Producer-side checklist: read `docs/design.md`, scan the BUILT product (rendered, not source-only), mark each ✓ / N/A / ✗. Soft ritual — you report; the PO judges what to fix or forgive. (The independent anti-slop review rubric is QA's `ds-conformance` — don't duplicate its scoring here.)

## Items
1. **Tokens** — color / spacing / typography values in the build match `docs/design.md`; no off-spec magic numbers in critical layout.
2. **Typography** — the specified family + scale actually load and render; no silent system-default fallback (check the rendered font, not the CSS declaration).
3. **Color** — brand palette holds in critical UI; no framework-default colors leaking in.
4. **Components** — core components match the DS recipes (shape, radius, states); one-off variants flagged.
5. **Assets** — logo present and referenced · favicon · og:image · title/description/OG meta tags.
6. **Hi-fi match** — build matches the approved hi-fi where one exists (none produced → this item N/A, keep checking the rest).
7. **Anti-default** — entry/critical screens pass the `style-library/anti-default.md` self-check; forced signature on a calm utility surface is a demerit too.

## Rules
- Judge on rendered output (screenshots) with source as supporting evidence.
- ✗ rows: one line each — item · where · expected vs observed. No waiver field: the PO decides what slides and logs it.
- Drift traced to a DS gap (the DS never specified it) → that's YOUR fix: update `docs/design.md`, note it in `summary`.

## Return
- Table item → ✓/N/A/✗ + ✗ detail lines. The PO slices patches → developer → re-check ✗ items only.
