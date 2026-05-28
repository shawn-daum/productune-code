# Promotion process — 4-quadrant classification + user-approval gate

Classify each persona-emitted candidate, surface it, and on user approval write it to the
resolved (scope, pattern) target.

## Persona contract — always emit array

Expect `promotion_candidates` as a top-level JSON array in every persona envelope
(`[]` when nothing to promote). Consume only that top-level array; treat any
`## Promotion Candidates` body section inside returned docs as secondary annotation.
Persona never writes long-term memory — you route all writes.

## 4-quadrant classification

Inspect each candidate. 2 axes × 2 values = 4 quadrants. Classify it, then write to the
resolved target on user `y`:

| Quadrant (scope/pattern) | Target path | Write |
|:--|:--|:--|
| (project, bookshelf) | `docs/<persona>/bookshelf/<file>.md` | **auto** on `y` — append + habit-index sync (§ below) |
| (project, habit) | `docs/<persona>/habit.md` | curated edit (PO shell on `y`) |
| (global, bookshelf) | `~/.productune/<persona>/bookshelf/<file>.md` | append + habit-index sync (PO shell on `y`) |
| (global, habit) | `~/.productune/<persona>/habit.md` | curated edit (PO shell on `y`) |

- **(project, bookshelf)** = **auto-write** on user `y` (low-stakes append + source label).
- **(project, habit)** + both **global** quadrants = **user-approval surface** (curated edit / lifestyle change).
- Never write global silently — persona proposes, you write only on a user decision.

## Habit-as-index — bookshelf 와 habit 은 한 쌍

bookshelf = 본문 (on-demand), 같은 layer 의 habit = 그 인덱스 (always-read).
Personas only ever read habit on session start; if habit carries no cross-link to a
bookshelf file, the bookshelf exists but is never consulted (orphan). Every bookshelf
write therefore pairs with a habit-index action:

- **New bookshelf file (first entry)** — add a one-line index in the same-layer habit:
  `- <topic 요약> → \`bookshelf/<file>.md\`` so the persona opens it when that topic
  comes up. (Tier 0 standard files = doctrine SoT habit; project = Tier 1; personal =
  Tier 2 — the layer the bookshelf lives in is the layer the index belongs in.)
- **Append to existing bookshelf** — leave the index line as-is (the one-line topic
  summary doesn't change with each entry).
- **Bookshelf split (cap ≥100 reached)** — split the habit index line too so each
  resulting bookshelf file gets its own pointer.

The index entry is **curated** (no `[T-NNN]` source), even when the bookshelf append
itself is `auto`. PO writes it directly during the same approval turn.

| Quadrant | bookshelf write target | same-layer habit to keep in sync |
|:--|:--|:--|
| (project, bookshelf) | `docs/<persona>/bookshelf/<file>.md` | `docs/<persona>/habit.md` |
| (global, bookshelf)  | `~/.productune/<persona>/bookshelf/<file>.md` | `~/.productune/<persona>/habit.md` |

## Schema (per candidate)

Each candidate uses the canonical `scope` + `pattern` vocabulary —
`common/bookshelf/promotion-candidate-schema.md`. Attach PO-managed lifecycle fields during
disposition (not persona-emitted): `status` (`pending|approved|dropped|edited`), `decided_at`,
`final_target` (set on `edited`).

## Lifecycle

1. **Persona emits** `promotion_candidates[]` in JSON output.
2. **Capture**: can't surface inline (background turn / closed window) → enqueue to
   `po-state.json :: pending_promotions[]` with `status:"pending"`.
3. **Surface** at next turn-start — drain `pending_promotions[]` before disposition.
4. **User decides** per candidate: `y` (approve), `n` (drop), `edit` (modify delta/target).
5. **Write** per the 4-quadrant table above (mechanical).
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
