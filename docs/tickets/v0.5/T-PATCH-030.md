---
ticket_id: T-PATCH-030
version: v0.5
phase: 3
type: impl
status: done
assignee: pdt-developer
estimated_complexity: S
risk_flags:
  - tab-dispatcher-removal
qa: true
qa_status: pass
qa_loops: 1
slug: code-text-viewer
depends_on: []
---

# T-PATCH-030 — Normalize CodeViewTab → CodeTextViewer and fold in BinaryTab

## Request

Unify the read-only file-viewing surface (B-scope file-viewer unification). Today there
are two near-duplicate fallbacks for non-rendered files:

- `CodeViewTab` — read-only monospace + line gutter + Lock badge, with a built-in
  `binary file` no-preview state (loaded via the project-scoped `search:readFileLines`
  IPC, which is size/line-capped and binary-guarded).
- `BinaryTab` — a separate, dead-end pane that renders a color emoji (`📄`, U+1F4C4) +
  filename + "no preview" text. The `📄` violates the house no-color-emoji rule, and the
  pane is functionally a strict subset of CodeViewTab's existing `isBinary` branch.

Fold BinaryTab's no-preview state into CodeViewTab (rename the surface to
`CodeTextViewer`), add `ZoomControls` for parity with the other viewers, replace the
color emoji with a lucide `FileX` icon, and delete BinaryTab plus its `'binary'`
dispatcher path. After this there is one canonical read-only text/code viewer; binary
files surface a graceful no-preview state inside it instead of a separate tab type.

Parallel to T-PATCH-028 / T-PATCH-029 (no shared files, `depends_on: []`).

## Acceptance

- **AC-1** — `CodeViewTab.tsx` is renamed to `CodeTextViewer` (component + default export
  + its `code-view` dispatch in `TabContent.tsx`). It remains read-only: monospace body,
  line-number gutter, and the `Lock` Read-only badge are preserved exactly as today.
- **AC-2** — The binary no-preview state is folded into the viewer's existing `isBinary`
  branch and presented with a centered layout matching BinaryTab's intent: a lucide
  `FileX` icon (NO color emoji — the `📄` U+1F4C4 glyph must not appear anywhere in the
  final code), the file name, and the no-preview hint. Reuse the existing
  `workspace.codeView.binaryNoPreview` i18n key; no new color glyphs introduced.
- **AC-3** — `ZoomControls` (from `./ZoomControls`) is wired into the viewer toolbar for
  parity with `ImageTab` / artifact viewers. Zoom scales the monospace body's font-size
  (or transform) and respects `ZOOM_MIN` / `ZOOM_MAX` / `ZOOM_STEP` / `ZOOM_DEFAULT`
  exports. Gutter alignment must stay intact at all zoom levels; the line-cap / truncated
  behavior is unchanged.
- **AC-4** — `BinaryTab.tsx` is deleted. Its `import` and the `case 'binary':` arm in
  `TabContent.tsx` are removed. The `'binary'` member is removed from the `TabType` union
  and from the `defaultTitle` switch in `store/workspace.ts`.
- **AC-5** — Confirm (and the implementer must re-verify by grep before deleting) that
  `'binary'` is referenced ONLY in: `store/workspace.ts` (TabType union + defaultTitle),
  `TabContent.tsx` (dispatcher), and `BinaryTab.tsx`. No Explorer route emits `'binary'`
  today (Explorer's unknown/binary fallback already routes to `code-view`), so no opener
  rewiring is required. If any other `'binary'` reference is found, STOP and flag it.
- **AC-6** — `workspace.explorer.binaryNoPreview` i18n key (en + ko) is removed only if no
  other consumer remains after BinaryTab deletion; otherwise left untouched. ko/en parity
  maintained.
- **AC-7** — `pnpm -C packages/gui tsc --noEmit` (or repo-standard tsc) passes; lint
  passes (no unused `BinaryTab` import, exhaustiveness on the `TabType` switch holds with
  `'binary'` removed).

## Plan

Re-read each file at implementation time; line numbers below reflect current `main`.

1. **`packages/gui/src/components/workspace/main/panes/CodeViewTab.tsx`** (1–199) — rename
   to `CodeTextViewer`. Keep the `search:readFileLines` load (L48), the loading / error /
   truncated branches, gutter rows (L86–94), and the `Lock` Read-only badge (L73–76).
   - Enrich the `isBinary` branch (currently L81–82, a single `<p>` hint) into the
     centered no-preview block: lucide `FileX` icon + file name (derive from `absPath`
     like BinaryTab L10) + `t('workspace.codeView.binaryNoPreview')`.
   - Add `import ZoomControls, { ZOOM_DEFAULT, ZOOM_MAX, ZOOM_MIN, ZOOM_STEP } from './ZoomControls'`
     (mirror `ImageTab.tsx` L12, L49), a `zoom` state, and apply it to the monospace body
     (`code` style L150) without breaking gutter alignment.
2. **`packages/gui/src/components/workspace/main/panes/BinaryTab.tsx`** — delete the file.
3. **`packages/gui/src/components/workspace/main/TabContent.tsx`** — remove the
   `import BinaryTab` (L9) and the `case 'binary':` arm (L42); update the `code-view`
   dispatch (L59–60) to the renamed component. Verify the `default` exhaustiveness arm
   still type-checks once `'binary'` leaves the union.
4. **`packages/gui/src/store/workspace.ts`** — remove `| 'binary'` from `TabType` (L24)
   and the `case 'binary':` arm in `defaultTitle` (L661).
5. **i18n** — `packages/gui/src/locales/{en,ko}.json` — remove
   `workspace.explorer.binaryNoPreview` (en L387 / ko L387) only after confirming no other
   consumer; keep `workspace.codeView.binaryNoPreview` (en/ko L418) as the canonical key.
6. Grep `'binary'` / `"binary"` repo-wide to satisfy AC-5 before deleting anything.

## Out of scope

- HTML / `.html` preview routing — owned by T-PATCH-032.
- Syntax highlighting, editing, or save for the code viewer (it stays read-only).
- Changes to `CodeSearchTab` (the search variant) or to the `search:readFileLines` IPC
  caps/guards.
- Image / markdown / artifact viewers beyond importing the shared `ZoomControls`.
