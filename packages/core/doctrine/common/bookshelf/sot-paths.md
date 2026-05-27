# SoT (Source of Truth) paths

One canonical location per artifact. No copies during dev. Edit at SoT. ≤100 lines.
Version-close = PO snapshots to `docs/artifacts/<version>/`.

## Doctrine (Tier 0 — always-read)

| role | SoT path (mirror = ~/.productune/doctrine/...) |
|:--|:--|
| common habit | `packages/core/doctrine/common/habit.md` |
| common bookshelf | `packages/core/doctrine/common/bookshelf/*.md` |
| persona habit | `packages/core/doctrine/persona/<persona>/habit.md` |
| persona bookshelf | `packages/core/doctrine/persona/<persona>/bookshelf/*.md` |

Repo = SoT. `~/.productune/doctrine/` = byte-identical live mirror, 동일 path 구조.

## Project memory (Tier 1 — per repo)

| role | path | cap | mode |
|:--|:--|:--|:--|
| persona habit | `docs/<persona>/habit.md` | 100 lines | curated, no source |
| persona bookshelf | `docs/<persona>/bookshelf/<file>.md` | 100 lines | append + source `[T-NNN]` |

## Long-term memory (Tier 2 — cross-project)

| role | path | cap | mode |
|:--|:--|:--|:--|
| persona habit | `~/.productune/<persona>/habit.md` | 100 lines | curated, no source |
| persona bookshelf | `~/.productune/<persona>/bookshelf/<file>.md` | 100 lines | append + source `[T-NNN]` |

Write path: PO direct file write only. Persona is read-only.

## Product artifacts (per repo)

| path | owner | when |
|:--|:--|:--|
| `docs/prd/PRD.md` | pdt-designer | Phase 1 ready |
| `docs/designer/design-system.md` | pdt-designer | Phase 2 T1 / DS evolution |
| `docs/designer/feature-history.md` | pdt-designer | Phase 5 direct write |
| `docs/qa/bookshelf/fail-patterns.md` | pdt-qa | append on test fail (read-only by designer at Phase 1) |
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
| `.productune/po-state.json` | pdt-po (mechanical lifecycle: versions, current_version, ticket lifecycle, pending_promotions) |

## Cross-tier read order

Persona dispatch reads in order:

1. **Tier 0 doctrine** (always) — common habit + persona habit (from mirror).
2. **Tier 1 project** (always) — `docs/<persona>/habit.md` + relevant bookshelf files per current ticket / phase.
3. **Tier 2 long-term** (conditional) — `~/.productune/<persona>/{habit,bookshelf}.md`; PO file-reads ahead and injects relevant slices via `[ctx]` global memory payload. Persona does not auto-fetch.

## Flat-folder rule

`docs/artifacts/<version>/` is flat. No sub-folders during dev. Naming carries grouping (`<ticket-id>-<slug>.<ext>`).
