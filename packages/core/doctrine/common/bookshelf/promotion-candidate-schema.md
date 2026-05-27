# Promotion candidate schema

Persona emits `promotion_candidates[]` in every dispatch envelope (`[]` when empty).
PO surfaces to user; user approves → PO writes directly (project + global both file-based).
Persona never writes long-term tier directly. ≤100 lines.

## 7 fields per candidate

```json
{
  "scope": "project" | "global",
  "pattern": "habit" | "bookshelf",
  "target": "docs/<persona>/habit.md | docs/<persona>/bookshelf/<file>.md | ~/.productune/<persona>/habit.md | ~/.productune/<persona>/bookshelf/<file>.md",
  "delta": "<verbatim text to add or curate — append-only for bookshelf>",
  "rationale": "<why now, anchored to current ticket>",
  "area_tag": "<kebab-area>",
  "source_ticket": "T-NNN"
}
```

## 4-quadrant classification (scope × pattern)

|              | habit (always-read, curated, no source)   | bookshelf (on-demand, append + source)         |
|:--           |:--                                         |:--                                              |
| **project**  | `docs/<persona>/habit.md`                  | `docs/<persona>/bookshelf/<file>.md`            |
| **global**   | `~/.productune/<persona>/habit.md`         | `~/.productune/<persona>/bookshelf/<file>.md`   |

- **project / habit** — repo-local rule, every dispatch in this repo. Naming conventions, default lib choice, repo idioms.
- **project / bookshelf** — repo-local reference, loaded on demand. e.g. `fail-patterns.md`, `feature-history.md`, recipe collections.
- **global / habit** — cross-project rule, every dispatch everywhere. e.g. JSON-only, session lifecycle, promotion gate.
- **global / bookshelf** — cross-project reference, on demand. e.g. shadcn recipe, lighthouse threshold rationale, framework gotchas.

## Approval flow

1. Persona emits `promotion_candidates[]` in output envelope.
2. PO surfaces to user with paraphrase (what / why save / recommendation).
3. User approves / rejects / edits.
4. PO writes (project tier OR global tier — both direct file write).
5. Persona is read-only for long-term tiers.

## Refusal rule

Direct user → long-term write request (skipping promotion) → persona refuses:
`"Long-term memory writes route through the productune promotion gate."`

## Append rule (bookshelf)

- Format: `- (YYYY-MM-DD) [T-NNN] <delta>` (one line per entry, source attribution mandatory).
- 100-line cap. Over cap → oldest entries graduate (project bookshelf → global bookshelf) or archive to `docs/artifacts/<version>/<file>-archive.md`.

## Curate rule (habit)

- Habit edits are curated rewrites (terse, no source attribution).
- 50-line cap for common habit. 100-line cap for persona habit.
- Over cap → demote oldest / least-active rule to bookshelf with retroactive source attribution.

## Cross-cutting reminder

Every dispatch output MUST include `promotion_candidates` (even empty `[]`). PO consumes only the top-level array; in-doc `## Promotion Candidates` annotations are secondary.
