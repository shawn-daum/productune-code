# Promotion process — 4-quadrant classification + user-approval gate

Persona-emitted lessons get classified, surfaced, and (on user approval) written by PO
to the resolved (scope, pattern) target. ≤100 lines.

## Persona contract — always emit array

`promotion_candidates` is **always a top-level JSON array** in the output envelope —
never doc-only. Emit `"promotion_candidates": []` when nothing to promote. A
`## Promotion Candidates` body section inside returned docs = secondary annotation only;
PO consumes only the top-level JSON array.

Persona never writes long-term memory directly. PO routes all writes.

## 4-quadrant classification

PO inspects each candidate. 2 axes × 2 values = 4 quadrants:

| Scope ↓ / Pattern → | habit (always-read, curated, no source) | bookshelf (on-demand, append + source) |
|:--|:--|:--|
| **project** (this repo) | `docs/<persona>/habit.md` | `docs/<persona>/bookshelf/<file>.md` |
| **global** (cross-project) | `~/.productune/<persona>/habit.md` | `~/.productune/<persona>/bookshelf/<file>.md` |

- **(project, bookshelf)** = **auto-write** on user `y` (low-stakes append + source label).
- **(project, habit)** + both **global** quadrants = **user-approval surface** (curated edit / lifestyle change).
- Never silent global writes. Persona always proposes; PO never authors.

## Schema (per candidate)

Candidate object uses the canonical `scope` + `pattern` vocabulary
(see `common/bookshelf/promotion-candidate-schema.md`):

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

PO-managed lifecycle fields (not persona-emitted, attached during disposition):
`status` (`pending|approved|dropped|edited`), `decided_at`, `final_target` (set on `edited`).

## Lifecycle

1. **Persona emits** `promotion_candidates[]` in JSON output.
2. **PO captures**: if can't surface inline (background turn / closed window),
   enqueue to `po-state.json :: pending_promotions[]` with `status:"pending"`.
3. **PO surfaces** at next turn-start (drain `pending_promotions[]` before disposition).
4. **User decides** per candidate: `y` (approve), `n` (drop), `edit` (modify delta/target).
5. **PO writes** per quadrant (mechanical):

| Quadrant (scope/pattern) | Mechanical write path |
|:--|:--|
| (project, bookshelf) | `printf '%s\n' "$DELTA" >> docs/<persona>/bookshelf/<file>.md` (auto on `y`) |
| (project, habit) | curated edit `docs/<persona>/habit.md` (PO shell on `y`) |
| (global, bookshelf) | append `~/.productune/<persona>/bookshelf/<file>.md` (PO shell on `y`) |
| (global, habit) | curated edit `~/.productune/<persona>/habit.md` (PO shell on `y`) |

6. **PO updates** `pending_promotions[].status` + `decided_at`. `final_target` set on
   `status:"edited"` with the user-revised payload actually written.

> **Work-notes** (`docs/<persona>/R<n>-<slug>.md`) are a distinct artifact type written
> directly by the owning persona — **not** a promotion quadrant; they bypass this grid.

## Append rules (bookshelf)

- Format: `- (YYYY-MM-DD) [T-NNN] <area-tag> · <note>`. Source label `[T-NNN]` mandatory
  in bookshelf (append-log style).
- Habit files (`docs/<persona>/habit.md`, `~/.productune/<persona>/habit.md`) are
  **curated, no source label** — PO rewrites for coherence on approval.
- ≤100 line cap per bookshelf file → split by topic when full.

## Phase 5 promotion drain

At Version close, PO drains all `pending_promotions[]` with single user batch surface.
After drain → snapshot `pending_promotions` with `status ∈ {approved, edited, dropped}` +
`decided_at ∈ [version.started_at, version.ended_at]` = **5th retrospective read source**
(see `lifecycle-mechanics.md`).

## Refusal — direct user long-term write

User explicitly asks persona "write this to my global memory / habit / bookshelf" →
persona returns
`{refused: true, reason: "Long-term memory writes route through the productune promotion gate.", suggested_route: "promotion_candidates[scope:global]"}`.
