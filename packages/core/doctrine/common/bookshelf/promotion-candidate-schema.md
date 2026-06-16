# Promotion candidate schema

Field schema + classification for `promotion_candidates[]` (emit-only gate: `common/habit.md` §3). Emit the array every dispatch — `[]` when nothing to promote. PO consumes only the array; in-doc `## Promotion Candidates` notes are secondary.

## 10 fields per candidate

```json
{
  "scope": "project" | "global",
  "pattern": "habit" | "bookshelf",
  "persona": "po" | "designer" | "developer" | "qa",
  "target": "docs/<persona>/habit.md | docs/<persona>/bookshelf/<file>.md | ~/.productune/<persona>/habit.md | ~/.productune/<persona>/bookshelf/<file>.md",
  "title": "<short human-readable name of the entry/rule>",
  "delta": "<verbatim text to add or curate — append-only for bookshelf>",
  "rationale": "<why now, anchored to current ticket>",
  "expected_effect": "<forward-looking outcome if adopted — what improves / what bug-class is prevented>",
  "area_tag": "<kebab-area>",
  "source_ticket": "T-NNN"
}
```

- `persona` — the persona whose doctrine the candidate targets (`po` | `designer` | `developer` | `qa`); makes explicit what the `target` path only implied.
- `title` — short human-readable name of the entry / rule; distinct from `area_tag` (the kebab area tag).
- `expected_effect` — forward-looking outcome if adopted (what improves / what bug-class is prevented); distinct from `rationale` (why now, anchored to the ticket).

## Classify before emit — scope × pattern

|              | habit (always-read, curated, no source)   | bookshelf (on-demand, append + source)         |
|:--           |:--                                         |:--                                              |
| **project**  | `docs/<persona>/habit.md`                  | `docs/<persona>/bookshelf/<file>.md`            |
| **global**   | `~/.productune/<persona>/habit.md`         | `~/.productune/<persona>/bookshelf/<file>.md`   |

- **project / habit** — repo-local rule firing every dispatch in this repo: naming conventions, default lib, repo idioms.
- **project / bookshelf** — repo-local on-demand reference: `fail-patterns.md`, `feature-history.md`, recipe collections.
- **global / habit** — cross-project rule firing every dispatch everywhere: JSON-only, session lifecycle, promotion gate.
- **global / bookshelf** — cross-project on-demand reference: shadcn recipe, lighthouse threshold rationale, framework gotchas.

`scope` is `project`|`global` only — **Tier 0 core doctrine is NOT a promotion target**. A rule all subagents must read routes via the Designer doctrine-editing flow on user approval, not this gate.

## Refusal

User asks to write a long-term tier directly (skip the gate) → refuse:
`"Long-term memory writes route through the productune promotion gate."`
