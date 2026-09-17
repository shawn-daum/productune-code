---
name: tickets
section: Tickets
when: "writing or reading a ticket's `## Why` · closing a ticket whose `feature:` names a spec file · splitting a ticket · reading `deps` · redeploying a version"
---
# Contracts §Tickets — annex

Continues `contracts.md` §Tickets; binds every persona the same way, loaded on demand at the moment `when` names.

## `## Why` — three answers, PO-written, above `## Acceptance`
- Purpose: one sentence — what the work protects or prevents, never what it builds (that is `## Acceptance`).
- Not-purpose: each aim the work excludes, with the reason — the row a later worker would otherwise optimize for.
- Unobserved: each fact the purpose assumes that no one has measured — a row here is a candidate ticket, never a claim.
- On the `feature:` trigger the Purpose sentence names the spec fact `(vX~)` it changes.
- A worker never edits `## Why`; a result contradicting it goes to `unresolved[]`.
- No trigger → no section: `## Request` states the problem, `## Acceptance` the target.

## `feature:` — the graph key
- On `status: done`, a `## Why` on a spec-backed feature lands as a `(vX~)` fact in `docs/features/<f>.md` (authoring: `contracts/fixed-paths.md`); no spec file → the Why stays in the ticket and the value counts toward promotion (`prdt doctor`, fixed-paths annex).
- `deps` is dispatch-order judgment material + query index only — never machine-enforced.

## Redeploys
- Redeploys append to the version's single `ops` ticket, not new tickets.
