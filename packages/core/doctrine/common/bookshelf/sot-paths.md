# SoT (Source of Truth) paths

Read each artifact at its one canonical location. Edit only at the SoT, keep no copies during dev. At version-close PO snapshots to `docs/artifacts/<version>/`.

## Doctrine (Tier 0 — always read)

| role | SoT path — read from mirror `~/.productune/doctrine/...` |
|:--|:--|
| common habit | `packages/core/doctrine/common/habit.md` |
| common bookshelf | `packages/core/doctrine/common/bookshelf/*.md` |
| persona habit | `packages/core/doctrine/persona/<persona>/habit.md` |
| persona bookshelf | `packages/core/doctrine/persona/<persona>/bookshelf/*.md` |

## Project memory (Tier 1 — this repo)

| role | path |
|:--|:--|
| persona habit | `docs/<persona>/habit.md` |
| persona bookshelf | `docs/<persona>/bookshelf/<file>.md` |

## Long-term memory (Tier 2 — cross-project)

| role | path |
|:--|:--|
| persona habit | `~/.productune/<persona>/habit.md` |
| persona bookshelf | `~/.productune/<persona>/bookshelf/<file>.md` |

Read-only here — PO writes Tier 1/2 directly.

## Product artifacts (this repo)

| path | owner | when |
|:--|:--|:--|
| `docs/prd/PRD.md` | pdt-designer | Phase 1 ready |
| `docs/designer/design-system.md` | pdt-designer | Phase 2 T1 / DS evolution |
| `docs/designer/feature-history.md` | pdt-designer | Phase 5 direct write |
| `docs/qa/bookshelf/fail-patterns.md` | pdt-qa | append on test fail (designer reads at Phase 1) |
| `docs/qa/version-summaries/<version>.md` | pdt-qa | Phase 5 close |
| `docs/tickets/<version>/T-NNN.md` | persona-routed | per ticket (folder auto-created) |
| `docs/artifacts/<version>/<ticket-id>-<slug>.<ext>` | pdt-designer | Phase 2 ticket artifact (flat) |
| `docs/artifacts/<version>/<slug>.<ext>` | pdt-designer | version-loose artifact |
| `docs/artifacts/<slug>.<ext>` | pdt-designer | global artifact |
| `docs/artifacts/<version>/design-system-snapshot.md` | pdt-po | version-close DS copy |
| `docs/retrospectives/<version>.md` | pdt-designer (5c) | Phase 5 |

## State files (machine-managed)

| path | owner |
|:--|:--|
| `.productune/po-state.json` | pdt-po (versions, current_version, ticket lifecycle, pending_promotions) |

## Cross-tier read order

Read in order each dispatch:

1. **Tier 0 doctrine** (always) — common habit + persona habit (from mirror).
2. **Tier 1 project** (always) — `docs/<persona>/habit.md` + relevant bookshelf files per current ticket / phase.
3. **Tier 2 long-term** (conditional) — `~/.productune/<persona>/{habit,bookshelf}.md`; consume the slices PO injects via `[ctx]` global memory payload. Do not auto-fetch.

## Flat-folder rule

Keep `docs/artifacts/<version>/` flat — no sub-folders during dev. Carry grouping in the name (`<ticket-id>-<slug>.<ext>`).
