# T-P4-143 · phuryn pm-* persona mapping — path-level override
**Slug**: phuryn-persona-mapping-fix
**Date**: 2026-05-20
**Round**: phase4-r4
**Artifact**: plan (1/1)
**Status**: ready
**Origin**: T-P4-137 audit findings + user OQ-c resolution (2026-05-19)

---

## §1 Sources — verified before plan emit

### 1.1 File location

| Item | Value |
|:--|:--|
| Target file | `packages/gui/electron/main.ts` |
| Function | `inferPersonasFromPath` |
| Current phuryn rule (L1437) | `if (filePath.includes('phuryn/pm-')) return ['po', 'designer']` — blanket |
| Frontmatter check | Zero phuryn SKILL.md files carry `personas:` frontmatter (confirmed by T-P4-137 grep) → inferPersonasFromPath fires for ALL phuryn skills |

### 1.2 Active skill enumerate (non-archived)

Enumerated via `~/.claude/skills/phuryn/**/*.md` scan. Only `SKILL.md` files with both
`name:` + `description:` frontmatter are ingested by `skills:list` IPC.

| Pack | Active skill dirs | Count | OQ-c decision |
|:--|:--|:--|:--|
| `pm-data-analytics` | ab-test-analysis · cohort-analysis · sql-queries | 3 | **po only** |
| `pm-execution` | job-stories · outcome-roadmap · pre-mortem · prioritization-frameworks · release-notes · retro · test-scenarios · wwas | 8 | **po only** |
| `pm-market-research` | competitor-analysis · market-segments · market-sizing · sentiment-analysis · user-segmentation | 5 | **po only** |
| `pm-market-research` | customer-journey-map · user-personas | 2 | po+designer (keep) |
| `pm-go-to-market` | ideal-customer-profile | 1 | **po only** |
| `pm-go-to-market` | gtm-strategy | 1 | po+designer (keep) |
| `pm-product-discovery` | analyze-feature-requests · brainstorm-experiments-existing · brainstorm-experiments-new · brainstorm-ideas-existing · brainstorm-ideas-new · identify-assumptions-existing · identify-assumptions-new · interview-script · metrics-dashboard · opportunity-solution-tree · prioritize-assumptions · prioritize-features · summarize-interview | 13 | po+designer (no change) |
| `pm-product-strategy` | lean-canvas · product-vision · value-proposition | 3 | po+designer (no change) |
| `pm-marketing-growth` | north-star-metric · value-prop-statements | 2 | po+designer (no change) |

**Net impact**: 17 skills Designer → unchecked; 21 skills Designer stays checked.

### 1.3 Discrepancies flagged

| Flag | Detail |
|:--|:--|
| pm-execution count drift | [ctx] said "po only (1 skill)" — T-P4-137 audit saw only `wwas` (archiving was in progress). Current filesystem: **8 active skills**. All 8 → po only per user decision (group-level). |
| Non-existent skill refs | User OQ-c mentioned `positioning / launch-plan` (pm-go-to-market) and `pricing-strategy` as targets. None exist as active SKILL.md files today. No override needed; note for future if skills are added. |
| Estimate delta | [ctx] self-verify spec said "~9-11개 row unchecked". Actual: **17**. Difference = pm-execution was undercounted at audit time. |

---

## §2 Implementation spec

### 2.1 Change summary

**Replace** single line L1437 in `packages/gui/electron/main.ts`:

```typescript
// BEFORE (L1437 — blanket):
  if (filePath.includes('phuryn/pm-')) return ['po', 'designer']
```

**WITH** (9 lines — ordered most-specific → least-specific, blanket last):

```typescript
  // ── phuryn pm-* overrides (T-P4-143 · 2026-05-20 · OQ-c resolution) ───────
  // Groups entirely po-only
  if (filePath.includes('phuryn/pm-data-analytics/')) return ['po']
  if (filePath.includes('phuryn/pm-execution/')) return ['po']
  // pm-market-research: 5 skills po-only; customer-journey-map + user-personas → default below
  if (filePath.includes('phuryn/pm-market-research/skills/competitor-analysis/')) return ['po']
  if (filePath.includes('phuryn/pm-market-research/skills/market-segments/')) return ['po']
  if (filePath.includes('phuryn/pm-market-research/skills/market-sizing/')) return ['po']
  if (filePath.includes('phuryn/pm-market-research/skills/sentiment-analysis/')) return ['po']
  if (filePath.includes('phuryn/pm-market-research/skills/user-segmentation/')) return ['po']
  // pm-go-to-market: ideal-customer-profile po-only; gtm-strategy → default below
  if (filePath.includes('phuryn/pm-go-to-market/skills/ideal-customer-profile/')) return ['po']
  // Default phuryn fallback: po+designer
  // (covers: pm-discovery, pm-product-strategy, pm-marketing-growth,
  //  pm-market-research/{customer-journey-map,user-personas}, pm-go-to-market/gtm-strategy)
  if (filePath.includes('phuryn/pm-')) return ['po', 'designer']
```

### 2.2 Full function after change

```typescript
/** Infer personas from file path when frontmatter `personas:` is absent. */
function inferPersonasFromPath(filePath: string): SkillPersona[] {
  // ── mattpocock rules (unchanged) ─────────────────────────────────────────
  if (filePath.includes('mattpocock/skills/productivity/')) return ['po', 'designer', 'dev', 'qa']
  if (filePath.includes('mattpocock/skills/engineering/')) return ['dev']
  if (filePath.includes('mattpocock/skills/deprecated/')) return []
  if (filePath.includes('mattpocock/skills/misc/')) return ['dev']
  if (filePath.includes('mattpocock/skills/personal/')) return []
  // ── phuryn pm-* overrides (T-P4-143 · 2026-05-20 · OQ-c resolution) ───────
  if (filePath.includes('phuryn/pm-data-analytics/')) return ['po']
  if (filePath.includes('phuryn/pm-execution/')) return ['po']
  if (filePath.includes('phuryn/pm-market-research/skills/competitor-analysis/')) return ['po']
  if (filePath.includes('phuryn/pm-market-research/skills/market-segments/')) return ['po']
  if (filePath.includes('phuryn/pm-market-research/skills/market-sizing/')) return ['po']
  if (filePath.includes('phuryn/pm-market-research/skills/sentiment-analysis/')) return ['po']
  if (filePath.includes('phuryn/pm-market-research/skills/user-segmentation/')) return ['po']
  if (filePath.includes('phuryn/pm-go-to-market/skills/ideal-customer-profile/')) return ['po']
  if (filePath.includes('phuryn/pm-')) return ['po', 'designer']
  return []
}
```

### 2.3 Ordering rationale

Rules are evaluated top-to-bottom. Specific skill paths (e.g.
`phuryn/pm-market-research/skills/competitor-analysis/`) must precede the
group-level path (`phuryn/pm-market-research/`) which in turn must precede
the blanket (`phuryn/pm-`). The current implementation uses `String.includes()`
so substring length determines specificity — a longer substring is always
checked first.

For pm-data-analytics and pm-execution, group-level checks are sufficient because
ALL skills in those groups are po-only; no skill-level exceptions needed.

### 2.4 No frontmatter changes

None of the phuryn SKILL.md files need `personas:` frontmatter added. The
path-inference fallback is the intended mechanism. Adding frontmatter would
require touching ~38 files; path inference changes 1 function.

---

## §3 Expected state after fix

### Designer column — unchecked (17 rows)

| Pack | Skills |
|:--|:--|
| pm-data-analytics (3) | ab-test-analysis · cohort-analysis · sql-queries |
| pm-execution (8) | job-stories · outcome-roadmap · pre-mortem · prioritization-frameworks · release-notes · retro · test-scenarios · wwas |
| pm-market-research (5) | competitor-analysis · market-segments · market-sizing · sentiment-analysis · user-segmentation |
| pm-go-to-market (1) | ideal-customer-profile |

### Designer column — still checked (21 rows)

| Pack | Skills |
|:--|:--|
| pm-market-research (2) | customer-journey-map · user-personas |
| pm-go-to-market (1) | gtm-strategy |
| pm-product-discovery (13) | (all 13 active skills) |
| pm-product-strategy (3) | lean-canvas · product-vision · value-proposition |
| pm-marketing-growth (2) | north-star-metric · value-prop-statements |

### mattpocock rules — unchanged

productivity/* → 4 persona · engineering/* → dev only · misc/* → dev only ·
deprecated/* → none · personal/* → none.

---

## §Out of scope

- Adding `personas:` frontmatter to individual SKILL.md files.
- Archived skills (`.archived-skills/phuryn/`) — already excluded from `collectMdFiles`.
- `pm-toolkit` pack — no SKILL.md files with name+description; not rendered in SkillMatrixTab.
- Non-phuryn persona rules (mattpocock) — no change.
- i18n changes — none.
- Future skills (`positioning`, `launch-plan`, `pricing-strategy` referenced by user) — not yet active; can be added to override map when SKILL.md is created.

## §QA scope

| Field | Value |
|:--|:--|
| **QA invoke** | `manual smoke only` |
| **test target** | `inferPersonasFromPath` in `packages/gui/electron/main.ts` · `SkillMatrixTab` Designer column |
| **사용자 dogfood** | SkillMatrixTab 열어서: (1) pm-data-analytics 3개 · pm-execution 8개 · pm-market-research 5개 (competitor-analysis/market-segments/market-sizing/sentiment-analysis/user-segmentation) · pm-go-to-market/ideal-customer-profile → Designer 컬럼 unchecked 확인. (2) customer-journey-map · user-personas · gtm-strategy · pm-discovery 전체 · pm-product-strategy 전체 · pm-marketing-growth 전체 → Designer 여전히 checked 확인. (3) PO 컬럼은 위 17개 포함 전부 checked (po-only → PO ✓, Designer ✗). |
| **regression check** | mattpocock 규칙 영향 없음: productivity/* 4-persona / engineering+misc dev-only / personal+deprecated empty — 각 1개 샘플씩 확인. `skills:list` IPC return count 변화 없음 (persona 변경만, 스킬 수 변화 없음). |

## §Build verify

```bash
pnpm -F gui build
# expect: 0 TS errors in packages/gui/electron/main.ts
```

TypeScript: `filePath` is `string`, `SkillPersona[]` type unchanged. No new imports
required. Risk: none.
