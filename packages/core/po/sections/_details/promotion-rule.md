# Promotion candidates — output rule

`promotion_candidates` is **always a top-level JSON array** in the output envelope —
never doc-only. Emit `"promotion_candidates": []` when nothing to promote. If PO can't
surface inline (background turn / closed window), candidates are enqueued to
`po-state.json:pending_promotions[]`. A `## Promotion Candidates` body section inside
returned docs is **secondary annotation** only — PO consumes only the top-level JSON array.

See `_details/promotion-lifecycle.md` for PO-side mechanics (wiki write gate).
