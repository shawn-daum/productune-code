# Promotion candidate schema

Emit `promotion_candidates[]` in every dispatch envelope — `[]` when nothing to promote. Never write a long-term tier (Tier 1/2) yourself: PO surfaces your candidate, the user approves, then PO writes.

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

## Classify before you emit — scope × pattern

|              | habit (always-read, curated, no source)   | bookshelf (on-demand, append + source)         |
|:--           |:--                                         |:--                                              |
| **project**  | `docs/<persona>/habit.md`                  | `docs/<persona>/bookshelf/<file>.md`            |
| **global**   | `~/.productune/<persona>/habit.md`         | `~/.productune/<persona>/bookshelf/<file>.md`   |

- **project / habit** — repo-local rule that fires every dispatch in this repo: naming conventions, default lib choice, repo idioms.
- **project / bookshelf** — repo-local reference loaded on demand: e.g. `fail-patterns.md`, `feature-history.md`, recipe collections.
- **global / habit** — cross-project rule that fires every dispatch everywhere: e.g. JSON-only, session lifecycle, promotion gate.
- **global / bookshelf** — cross-project reference on demand: e.g. shadcn recipe, lighthouse threshold rationale, framework gotchas.

## Approval flow (your part)

1. Emit `promotion_candidates[]` in your output envelope.
2. PO paraphrases each to the user (what / why save / recommendation); the user approves, rejects, or edits; PO writes the approved tier.
3. Stay read-only for every long-term tier.

## Refusal rule

If the user asks you to write a long-term tier directly (skipping promotion), refuse:
`"Long-term memory writes route through the productune promotion gate."`

## Always emit the array

Include the top-level `promotion_candidates` array on every dispatch (empty `[]` is valid). PO consumes only that array; in-doc `## Promotion Candidates` annotations are secondary.
