# Promotion process — 4-quadrant classification + user-approval gate

Classify each persona-emitted candidate, surface it, and on user approval write it to the
resolved (scope, pattern) target.

## Persona contract — always emit array

Expect `promotion_candidates` as a top-level JSON array in every persona envelope
(`[]` when nothing to promote). Consume only that top-level array; treat any
`## Promotion Candidates` body section inside returned docs as secondary annotation.
Persona never writes long-term memory — you route all writes.

## 4-quadrant classification

Inspect each candidate. 2 axes × 2 values = 4 quadrants:

| Scope ↓ / Pattern → | habit (always-read, curated, no source) | bookshelf (on-demand, append + source) |
|:--|:--|:--|
| **project** (this repo) | `docs/<persona>/habit.md` | `docs/<persona>/bookshelf/<file>.md` |
| **global** (cross-project) | `~/.productune/<persona>/habit.md` | `~/.productune/<persona>/bookshelf/<file>.md` |

- **(project, bookshelf)** = **auto-write** on user `y` (low-stakes append + source label).
- **(project, habit)** + both **global** quadrants = **user-approval surface** (curated edit / lifestyle change).
- Never write global silently — persona proposes, you write only on a user decision.

## Schema (per candidate)

Each candidate object uses the canonical `scope` + `pattern` vocabulary
(`common/bookshelf/promotion-candidate-schema.md`):

```json
{
  "scope": "project" | "global",
  "pattern": "habit" | "bookshelf",
  "target": "<file path>",
  "delta": "<line / episode body>",
  "rationale": "<one-line reason>",
  "area_tag": "<kebab-area>",
  "source_ticket": "T-NNN"
}
```

Attach PO-managed lifecycle fields during disposition (not persona-emitted):
`status` (`pending|approved|dropped|edited`), `decided_at`, `final_target` (set on `edited`).

## Lifecycle

1. **Persona emits** `promotion_candidates[]` in JSON output.
2. **Capture**: can't surface inline (background turn / closed window) → enqueue to
   `po-state.json :: pending_promotions[]` with `status:"pending"`.
3. **Surface** at next turn-start — drain `pending_promotions[]` before disposition.
4. **User decides** per candidate: `y` (approve), `n` (drop), `edit` (modify delta/target).
5. **Write** per quadrant (mechanical):

| Quadrant (scope/pattern) | Mechanical write path |
|:--|:--|
| (project, bookshelf) | `printf '%s\n' "$DELTA" >> docs/<persona>/bookshelf/<file>.md` (auto on `y`) |
| (project, habit) | curated edit `docs/<persona>/habit.md` (PO shell on `y`) |
| (global, bookshelf) | append `~/.productune/<persona>/bookshelf/<file>.md` (PO shell on `y`) |
| (global, habit) | curated edit `~/.productune/<persona>/habit.md` (PO shell on `y`) |

6. **Update** `pending_promotions[].status` + `decided_at`. Set `final_target` on
   `status:"edited"` with the user-revised payload actually written.

> **Work-notes** (`docs/<persona>/R<n>-<slug>.md`) bypass this grid — the owning persona
> writes them directly; never route them through a quadrant.

## Append rules (bookshelf)

- Format: `- (YYYY-MM-DD) [T-NNN] <area-tag> · <note>`. Source label `[T-NNN]` mandatory
  in bookshelf (append-log style).
- Habit files (`docs/<persona>/habit.md`, `~/.productune/<persona>/habit.md`) are
  **curated, no source label** — rewrite for coherence on approval.
- Target bookshelf at capacity → split by topic before appending.

## Phase 5 promotion drain

At Version close, drain all `pending_promotions[]` in a single batch surface to the user.
After drain, the snapshot of `pending_promotions` with `status ∈ {approved, edited, dropped}`
∧ `decided_at ∈ [version.started_at, version.ended_at]` is the **5th retrospective read
source** (see `lifecycle-mechanics.md`).

## Refusal — direct user long-term write

User explicitly asks a persona "write this to my global memory / habit / bookshelf" → the
persona returns
`{refused: true, reason: "Long-term memory writes route through the productune promotion gate.", suggested_route: "promotion_candidates[scope:global]"}`.
