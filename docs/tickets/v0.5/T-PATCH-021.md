---
ticket_id: T-PATCH-021
version: v0.5
phase: 3
type: feature
status: done
assignee: pdt-developer
estimated_complexity: M
risk_flags: []
qa: true
qa_status: pass
qa_loops: 1
slug: doctrine-team-nav
depends_on: [T-PATCH-019, T-PATCH-020]
---

# T-PATCH-021 — Doctrine tier navigator inside TeamPanel

## Request

Extend the existing **Team** sidebar panel so each of the 4 personas can be
expanded into a per-persona doctrine navigator that lists all 3 tiers
(T0 / T1 / T2) and their `.md` files. Clicking a file opens it in the
`doctrine-file` main tab (from T-PATCH-020). Tier 0 is read-only (lock icon);
Tier 1 / Tier 2 are editable. Empty tiers and missing files render explicit
muted states.

This implements **ENTRY decision = option B** (user-firm): there is **no new
Activity icon**. The doctrine navigator is integrated into the current
`TeamPanel.tsx`, which already lists the 4 personas as `PersonaRow`s. The
side-by-side 3-column layout from the design artifact is **not** used here; the
sidebar is narrow, so tiers render as a vertical expandable tree under each
persona row (T0 → T1 → T2, each with its file list). This keeps the persona →
tier → file mental model while fitting the existing single-column sidebar.

Data source: `doctrine:listTiers(personaKey)` (T-PATCH-019), which enumerates
T0/T1/T2 `habit.md` + `bookshelf/*.md` per persona with an `editable` flag and
the resolved absolute path per file.

## Acceptance criteria

- [AC-1] Each `PersonaRow` in `TeamPanel.tsx` gains an expand/collapse affordance
  (chevron, lucide `ChevronRight` / `ChevronDown`). Collapsed by default; only
  the persona-def open behavior of the row's main area is preserved (see AC-9).
- [AC-2] On first expand of a persona, the panel calls
  `api.doctrineListTiers(personaKey)` once and caches the result in component
  state; re-expand does not refetch unless an explicit refresh occurs.
- [AC-3] Expanded view renders three tier groups in order **T0 (doctrine) →
  T1 (project) → T2 (personal)**, each with a tier header showing the tier label
  and a state glyph: T0 = lucide `Lock` (color `--color-lock` `#707070`),
  T1/T2 = lucide `Pencil` (color `--color-edit` `#34D399`). No color emoji.
- [AC-4] Under each tier header, files render as rows: `habit.md` first, then
  `bookshelf/<file>.md` entries (indented under a `bookshelf/` sub-label). Each
  file row is a button; file basename is shown, full path on `title`.
- [AC-5] Clicking any file row calls `openTab` with a stable tab id
  `doctrine-file:<absolutePath>`, type `'doctrine-file'`, props
  `{ path, tier, personaKey, editable }`, and a title of the file basename —
  matching the T-PATCH-020 tab contract. T0 files open read-only, T1/T2 editable
  (the tab itself branches on `tier`/`editable`; this ticket only passes props).
- [AC-6] Empty tier → a single muted row `t('workspace.doctrine.emptyTier')`
  ("이 계층에 파일 없음" / "No files in this tier"), styled like the existing
  muted nav text (`#606060`, fontSize 11). Missing `habit.md` (tier exists but
  file absent) → muted `t('workspace.doctrine.missingHabit')` row that is **not**
  clickable.
- [AC-7] persona-key → directory mapping is honored: runtime key `dev` maps to
  dir `developer`. The navigator passes the runtime `PersonaKey` (`'po' |
  'designer' | 'dev' | 'qa'`) to `doctrineListTiers`; the IPC (T-PATCH-019) owns
  the dir resolution. Do not duplicate the mapping in the renderer.
- [AC-8] Loading state: between expand and `listTiers` resolution, show a muted
  `t('common.loading')` row. IPC failure → muted error row
  `t('workspace.doctrine.loadError')`; never throw out of the panel.
- [AC-9] The existing persona-def open behavior is preserved: clicking the main
  body of a `PersonaRow` still opens `persona-def:<id>` (unchanged). Only the new
  chevron toggles the tier tree. Both affordances coexist on the row.
- [AC-10] Visual parity with existing `TeamPanel` patterns: reuse
  `sectionWrap` / `navRowBtn` / muted-text conventions, indentation via
  left-padding, `transition: background 0.1s` hover to `#1A1A1A`. New i18n keys
  added under `workspace.doctrine.*` in **both** `ko.json` and `en.json`
  (ko/en parity).
- [AC-11] `pnpm tsc --noEmit` passes.
- [AC-12] `pnpm lint` passes.

## Plan (re-read current files before editing)

- `packages/gui/src/components/workspace/TeamPanel.tsx`
  - `PersonaRow` (lines 48–76): add an expand chevron as a distinct hit-target
    so the row's main click still routes to `persona-def` (TeamPanel.tsx:116–123
    `handlePersonaClick`). Lift `expanded` + cached `tiers` into per-persona state
    in the parent (keyed by `def.key`), or hold a small child sub-component owning
    its own expand/fetch state. Prefer a child `PersonaDoctrineTree` sub-component
    to keep `TeamPanel` lean.
  - Personas section render (lines 137–149): wrap each `PersonaRow` so the new
    tier tree renders directly beneath the expanded row inside the same
    `sectionWrap`.
  - `openTab` is already imported (TeamPanel.tsx:86); reuse it for AC-5. Signature
    confirmed at `packages/gui/src/store/workspace.ts:119`
    `openTab(tabId, type, props?, title?)`.
  - Styles block (lines 186–322): add tier-header, file-row, and indent styles
    following the existing `React.CSSProperties` const pattern.
- IPC seam (assume from T-PATCH-019): `api.doctrineListTiers(personaKey)` →
  `Array<{ tier: 'T0'|'T1'|'T2'; editable: boolean; habit: { path: string;
  exists: boolean } | null; bookshelf: Array<{ path: string; name: string }> }>`
  (exact shape owned by T-PATCH-019; if it differs, adapt the consumer and note
  it). Preload binding expected as `appendPendingPromotion`-style camelCase
  (`doctrineListTiers`), mirroring `packages/gui/electron/preload.ts`.
- Tab contract (assume from T-PATCH-020): `TabType` union includes
  `'doctrine-file'`; pane reads `{ path, tier, personaKey, editable }` props.
- lucide icons: import `ChevronRight`, `ChevronDown`, `Lock`, `Pencil` from
  `lucide-react` (matches `PromotionCard.tsx:21` import convention,
  strokeWidth default).
- i18n: add `workspace.doctrine.{emptyTier,missingHabit,loadError,tierT0,
  tierT1,tierT2,bookshelfLabel}` to `packages/gui/src/locales/ko.json` and
  `packages/gui/src/locales/en.json` (reuse existing `common.loading`).

## Out of scope

- The `doctrine-file` tab rendering, edit/preview/save UI, line-cap badge — owned
  by T-PATCH-020.
- The save-choice dialog, conflict modal, dirty-close guard — owned by
  T-PATCH-022.
- The `doctrine:listTiers/readFile/writeFile` IPC + path whitelist — owned by
  T-PATCH-019.
- Bookshelf file create/delete, common Tier-0 pseudo-persona, T2 non-doctrine
  state files (`*-state.json`, env) — all out of v1 per the design artifact.
- No new Activity icon / `LeftSidebar` panel (superseded by ENTRY option B).
