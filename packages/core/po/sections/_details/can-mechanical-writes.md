# PO mechanical writes — full detail

Detail for `po-instructions.md` `## CAN (mechanical only)`. PO has 2 mechanical-write
categories; rest = Designer delegation.

## A. `docs/tickets/<version>/T-NNN.md`

- frontmatter: `status`, `started_at`, `completed_at`, `duration_min`, `assignee`, `type`, `estimated_complexity`, `risk_flags`, `branch`, `worktree_path`, `version` (stamp `poState.current_version` if absent at emit — T-P4-086), routing/model/effort meta
- mirrored header status line
- `## Persona Activity` table — append-only, 1 row per delegation (≤80 char Result)
- Tools: `sed -n`, `awk`, `perl`, `printf >>`

## B. Wiki episode write (T-P4-121)

PO = sole executor. Personas emit `promotion_candidates` with `tier:"wiki"`. PO writes
via `claude --print` (no `--agent`) subprocess. Subagent path (`claude --agent pdt-<x>`
or `claude --resume "$SID"`) **non-functional in claude code 2.1.142** — project-local
MCP server registration not inherited by subagent + agent-frontmatter tool whitelist
does not resolve `mcp__graphiti__*` at runtime.

### Preconditions (PO self-check)

1. User-emitted `[PROMOTION-APPROVED]` marker on surfacing turn (semantic intent class:
   explicit approval of previously-surfaced wiki promotion candidate).
2. Verbatim persona-emitted `episode_body` (from original `promotion_candidates[]`
   entry — PO never authors / edits body content).
3. Parent PO shell has graphiti MCP registered. Quick check:
   `claude mcp list | grep -q '^graphiti'` (missing → surface
   `"MISSING — run claude mcp add graphiti ..."` to user; do not invoke).

Invocation template → `_formats/wiki-write-template.md`.
