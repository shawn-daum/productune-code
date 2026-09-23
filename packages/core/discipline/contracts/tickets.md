---
name: tickets
section: Tickets
when: "writing or reading a ticket body — any key · raising a fork to the user (`type: decision`) · an `acceptance` line changes after its first dispatch · `feature:` names a spec file · splitting or carrying over a ticket · reading `deps` · redeploying a version"
---
# Contracts §Tickets — annex

Continues `contracts.md` §Tickets; binds every persona the same way, loaded on demand at the moment `when` names.

## The frame — H2 keys, this order, nothing else at H2
| key | holds | writer | required |
|---|---|---|---|
| `problem` | `As-is` · `To-be` · the analysis | PO | always |
| `options` | one table — columns the options, rows `pros` · `cons` · `trade-off` · `recommend` (one cell per fork, with its 1-line why) | PO | `type: decision`; else optional |
| `related` | hand-written: stakeholders · purpose · out-of-scope. Version position and feature map are DRAWN by the viewer from `prd_item` · `feature` · `deps` — never written | PO | optional |
| `acceptance` | the target; later additions as `###` | PO | always |
| `evidence` | verbatim quotes · measurements | PO · designer | optional |
| `outcome` | the result; one `###` per slice | worker | `status: done` |
| `log` | one dated line per entry | anyone | optional |
- No `## status`, no fold line in the file: the viewer draws both from frontmatter and key order.
- Binds tickets created after it landed; an older ticket keeps its headings as written — the viewer's alias table renders them.
- Labels live outside the ticket: the file carries keys, the viewer holds the words (one label table); a ticket names roles (`user` · `po` · `designer` · `developer` · `qa`), never a person.

## Purpose · out-of-scope · unobserved — three rows, three slots
- Purpose (what the work protects or prevents, never what it builds — that is `acceptance`) → `related`; out-of-scope (each aim excluded, with the reason — the row a later worker would otherwise optimize for) → `related`; unobserved (each fact the purpose assumes that no one has measured — a candidate ticket, never a claim) → `evidence`.
- Owed on two triggers: an `acceptance` line changes after its first dispatch → written before the next dispatch · `feature:` names an existing `docs/features/<f>.md` → written at creation, the purpose row naming the spec fact `(vX~)` it changes. No trigger → the rows are optional.
- A worker never edits these rows; a result contradicting them goes to `unresolved[]`.

## `type: decision` — a fork the PO puts to the user
- `assignee: user` always; `options` is its centre; every ticket the answer blocks names it in ITS `deps` — the viewer draws the reverse edge; no `blocks` key.
- Closes only on the user's own reply, quoted verbatim into `outcome` by the PO. Its `done` records a direction: consent for push · deploy · destructive git is the user's own words in the live session (contracts §Overrides floor) — no option cell, `direction_pin` or ticket status is that consent.

## `feature:` — the graph key
- On `status: done`, the purpose row of a spec-backed feature lands as a `(vX~)` fact in `docs/features/<f>.md` (authoring: `contracts/fixed-paths.md`); no spec file → it stays in the ticket and the value counts toward promotion (`prdt doctor`, fixed-paths annex).
- `deps` is dispatch-order judgment material + query index only — never machine-enforced. A carry-over ticket's `deps` names the ticket it continues; a `done` dep reads as continued from.

## Redeploys
- Redeploys append to the version's single `ops` ticket, not new tickets.
