---
name: tickets
section: Tickets
when: "writing or reading a ticket body or frontmatter — any key · raising a fork to the user (`type: decision`) · an `acceptance` line changes after its first dispatch · `feature:` names a spec file · splitting or carrying over a ticket · reading `deps` · redeploying a version"
---
# Contracts §Tickets — annex

Continues `contracts.md` §Tickets; binds every persona the same way, loaded on demand at the moment `when` names.

## The frame — H2 keys, this order, nothing else at H2
| key | holds | writer |
|---|---|---|
| `problem` | `As-is` · `To-be` · the analysis | PO |
| `options` | the scaffolded table filled — one cell per fork per row, `recommend` with its 1-line why | PO |
| `related` | hand-written: stakeholders · purpose · out-of-scope. Version position and feature map are DRAWN by the viewer from `prd_item` · `feature` · `deps` — never written | PO |
| `acceptance` | the target; later additions as `###` | PO |
| `evidence` | verbatim quotes · measurements | PO · designer |
| `outcome` | the result; one `###` per slice | worker |
| `log` | one dated line per entry | anyone |
- No `## status`, no fold line in the file: the viewer draws both from frontmatter and key order.
- `prdt tickets new --type <type> --slug <slug>` writes the frame (frontmatter · keys in order · the `options` table for `decision`); `prdt tickets fmt <id…> --check` names every violation — order · spelling · alias · a missing required key — and bare `fmt` rewrites headings only. Both skip a ticket created before 2026-09-24: an older ticket keeps its headings as written — the viewer's alias table renders them.
- Labels live outside the ticket: the file carries keys, the viewer holds the words (one label table); a ticket names roles (`user` · `po` · `designer` · `developer` · `qa`), never a person.

## Purpose · out-of-scope · unobserved — three rows, three slots
- Purpose (what the work protects or prevents, never what it builds — that is `acceptance`) → `related`; out-of-scope (each aim excluded, with the reason — the row a later worker would otherwise optimize for) → `related`; unobserved (each fact the purpose assumes that no one has measured — a candidate ticket, never a claim) → `evidence`.
- Owed on two triggers: an `acceptance` line changes after its first dispatch → written before the next dispatch · `feature:` names an existing `docs/features/<f>.md` → written at creation, the purpose row naming the spec fact `(vX~)` it changes. No trigger → the rows are optional.
- A worker never edits these rows; a result contradicting them goes to `unresolved[]`.

## `type: decision` — a fork the PO puts to the user
- `assignee: user` always; `options` is its centre; every ticket the answer blocks names it in ITS `deps` — the viewer draws the reverse edge; no `blocks` key.
- Any other `assignee: user` body: `contracts/user-tickets.md`.
- Closes only on the user's own reply, quoted verbatim into `outcome` by the PO. Its `done` records a direction: consent for push · deploy · destructive git is the user's own words in the live session (contracts §Overrides floor) — no option cell, `direction_pin` or ticket status is that consent.

## `feature:` — the graph key
- On `status: done`, the purpose row of a spec-backed feature lands as a `(vX~)` fact in `docs/features/<f>.md` (authoring: `contracts/fixed-paths.md`); no spec file → it stays in the ticket and the value counts toward promotion (`prdt doctor`, fixed-paths annex).
- `deps` is the one precedence source: `prdt schedule` computes the critical path from it, and a PRD precedence row lands as a `deps` entry, never a second list — it ranks dispatches, never blocks one. A carry-over ticket's `deps` names the ticket it continues; a `done` dep reads as continued from.

## Redeploys
- Redeploys append to the version's single `ops` ticket, not new tickets.

## The ticket rules (moved from contracts.md §Tickets)
- Frontmatter (PO-only write): `id · slug · type(design|impl|qa|ops|decision) · status(open|done|dropped) · assignee(designer|developer|qa|po|user — user = work only the person's own hands can do) · feature? · prd_item?(v<N>.<m>#<key>) · deps?[] · created · closed?`. `id` is a global counter (`T-NNN` unique across ALL ticket dirs); moving a file never renumbers it. Backlog promotion = `git mv` into the current version dir.
- Body = the frame: H2 = its keys in its order, nothing else; slices and amendments are `###` inside a key. Keys · required-by-condition · the purpose/out-of-scope/unobserved rows owed when an `acceptance` line changes after first dispatch or `feature:` names a spec file · `deps` · redeploys: `contracts/tickets.md`. Progress notes = `log` — no briefs file.
- An access-control `acceptance` line (gate / hide / restrict / limit) names its exact target — page, asset, API route, or field; a bare verb with no named target is not acceptance-complete.
- Deliverable work (design / impl / qa / ops) and a user fork (decision) get a ticket; rituals (retro · readiness · curation) get one `docs/wiki/log.md` line instead.
- `type: decision`: `assignee: user`; closed only by the user's reply, quoted verbatim into `outcome` — a direction, never consent (§Overrides floor); form: `contracts/tickets.md`.
- `feature` is the graph key: a ticket split from another carries the parent's value — neither has one → the PO names one, set on both. Carry-over of unfinished work IS a split, with `deps: [<parent>]`; a `done` dep reads as continued from.
