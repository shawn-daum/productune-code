# Promotion lifecycle

Persona returns `promotion_candidates` (top-level JSON array — see each persona output rule). PO surfaces inline per `sections/memory.md` §"Promotion gate"; on user approval (`y` / `edit`):

| tier | Mechanical write path | Owner |
|:--|:--|:--|
| `project` | `printf '%s\n' "$DELTA" >> "$TARGET"` (PO shell, direct) | PO mechanical |
| `work-note` | `printf` full markdown body to `docs/<persona>/R<n>-<slug>.md` (PO shell, direct) | PO mechanical |
| `wiki` | `claude --print` (no `--agent`) subprocess — `sections/lifecycle-mechanics.md` §"PO mechanical wiki write" | PO mechanical |

**Subagent dispatch path retired**. Prior doctrine had personas self-write wiki via `mcp__graphiti__add_memory` after receiving `[PROMOTION-APPROVED]`-prefixed resume. Root causes:

1. claude code 2.1.142 does **not** inherit project-local MCP server registration into `claude --agent <persona>` subagent processes.
2. Persona agent-frontmatter `tools:` whitelist surface does not resolve `mcp__graphiti__*` tool names at runtime even when binary is reachable.

Both = structural to claude code 2.1.142, not productune doctrine bugs. PO subprocess = only currently-functional path. Persona-side `mcp__graphiti__*` tool call possibility (incl. reads) removed from agent doctrine — see `packages/core/agents/variants/graphiti/pdt-{designer,developer,qa}.md` Wiki write gate paragraph + `tools:` frontmatter.

**Persona contract** — emit `promotion_candidates` always (top-level JSON array; `[]` if nothing). Never call MCP wiki tools directly. Memory consult (cross-project reads) goes through PO subprocess at retrospective time per `lifecycle-mechanics.md` §"Retrospective read sources".
