# PO mechanical writes — full detail

Detail for `po-instructions.md` `## CAN (mechanical only)`. PO has 2 mechanical-write
categories; rest = Designer delegation.

## A. `docs/tickets/<version>/T-NNN.md`

- frontmatter: `status`, `started_at`, `completed_at`, `duration_min`, `assignee`, `type`, `estimated_complexity`, `risk_flags`, `branch`, `worktree_path`, `version` (stamp `poState.current_version` if absent at emit), routing/model/effort meta
- mirrored header status line
- `## Persona Activity` table — append-only, 1 row per delegation (≤80 char Result)
- Tools: `sed -n`, `awk`, `perl`, `printf >>`

## B. Wiki episode write

PO = sole executor. Personas emit `promotion_candidates` with `tier:"wiki"`. PO routes
via `pdt-wiki-keeper` sub-agent (keeper backend) or direct filesystem (fs backend).

### Preconditions (PO self-check)

1. User-emitted `[PROMOTION-APPROVED]` marker on surfacing turn (semantic intent class:
   explicit approval of previously-surfaced wiki promotion candidate).
2. Verbatim persona-emitted `episode_body` (from original `promotion_candidates[]`
   entry — PO never authors / edits body content).

Invocation template → `_formats/wiki-write-template.md`.
