# Promotion lifecycle

Persona returns `promotion_candidates` (top-level JSON array — see each persona output rule). PO surfaces inline per `sections/memory.md` §"Promotion gate"; on user approval (`y` / `edit`):

| tier | Mechanical write path | Owner |
|:--|:--|:--|
| `project` | `printf '%s\n' "$DELTA" >> "$TARGET"` (PO shell, direct) | PO mechanical |
| `work-note` | `printf` full markdown body to `docs/<persona>/R<n>-<slug>.md` (PO shell, direct) | PO mechanical |
| `wiki` | `claude --print` (no `--agent`) subprocess — `sections/lifecycle-mechanics.md` §"PO mechanical wiki write" | PO mechanical |

**Wiki write via wiki-keeper sub-agent** (keeper backend) or direct filesystem (fs backend). Personas never write wiki directly — PO routes all writes.

**Persona contract** — emit `promotion_candidates` always (top-level JSON array; `[]` if nothing). Never call wiki tools directly. Memory consult (cross-project reads) goes through PO subprocess at retrospective time per `lifecycle-mechanics.md` §"Retrospective read sources".
