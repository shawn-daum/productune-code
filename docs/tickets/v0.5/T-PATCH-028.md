---
ticket_id: T-PATCH-028
version: v0.5
phase: 3
type: impl
status: done
assignee: pdt-developer
estimated_complexity: M
risk_flags:
  - shared-primitive-extraction
  - save-conflict-seam-preservation
qa: true
qa_status: pass
qa_loops: 1
slug: markdown-viewer-primitive
depends_on: []
---

# T-PATCH-028 — Generalize DoctrineFileTab into a shared MarkdownViewer primitive

## Request

We now have three near-identical markdown surfaces — `ArtifactMdTab` (read-only + zoom),
`MarkdownTab` (read-only catch-all), and `DoctrineFileTab` (read-only ⇄ editable spec
editor with conflict/save seam). They duplicate the header bar, breadcrumb, load/error
states, `MdRenderer` body, and read-only badge, and have drifted (e.g. only `ArtifactMdTab`
has zoom; only `MarkdownTab` showed raw `<pre>` until the T-PATCH-027 fix).

Extract a single shared `MarkdownViewer` primitive from the current `DoctrineFileTab`
implementation so all three can render through one component. This ticket extracts the
primitive only; migrating `ArtifactMdTab` and `MarkdownTab` onto it is T-PATCH-029.

The primitive must be:
- **loader-injectable** — the caller supplies how content is fetched (memory IPC,
  artifacts IPC, doctrine IPC, or an inline string), so the primitive carries no
  knowledge of a specific source.
- **`editable`-flagged** — when `editable` is false the primitive renders Preview-only with
  the `Lock` read-only badge and NO Edit / Save / Cancel affordances; when true it keeps
  the full Preview ⇄ Edit toggle, textarea, line-cap badge, and Save/Cancel.
- **zoom-capable** — fold in the `ZoomControls` group (from `ArtifactMdTab`) as an opt-in
  prop so read-only viewers can scale font size.
- **save/conflict-seam-preserving** — the `onSave` seam, `DoctrineSaveResult`,
  `DoctrineDirtyState` / `onDirtyChange`, and the conflict/saved/error inline states that
  `DoctrineFileTabHost` depends on MUST survive the extraction unchanged in shape, so the
  host keeps working without edits.

Preview is ALWAYS rendered via `MdRenderer` (the T-PATCH-027 invariant) — no raw `<pre>`
fallback for markdown bodies.

## Acceptance

- [AC-1] A new shared primitive component `MarkdownViewer` exists at
  `packages/gui/src/components/workspace/main/panes/MarkdownViewer.tsx`, extracted from the
  current `DoctrineFileTab.tsx` body. Its Preview body renders through `MdRenderer`; there
  is no raw `<pre>` path for the markdown body.
- [AC-2] The primitive accepts a loader prop (e.g. `load: () => Promise<{ ok: boolean;
  content?: string; mtimeMs?: number | null; error?: string }>` or equivalent injected
  fetch) and derives all on-disk content through it — the primitive itself imports no
  specific IPC channel (`doctrineReadFile` etc. move to the caller/host).
- [AC-3] The primitive accepts an `editable: boolean` prop. When `editable === false` it
  renders Preview-only + the `Lock` read-only badge, and renders NO Edit / Save / Cancel
  buttons, NO textarea, and NO line-cap badge. When `editable === true` it renders the full
  Preview ⇄ Edit flow exactly as `DoctrineFileTab` does today.
- [AC-4] The primitive accepts an optional zoom capability sourced from the existing
  `ZoomControls` component (and its `ZOOM_*` constants). When zoom is enabled the controls
  render in the header-right group and scale the Preview body font size (reflow via
  `font-size`, NOT `transform: scale`, matching `ArtifactMdTab`'s `BASE_FONT_PX` approach).
  When zoom is not enabled no zoom controls render and behaviour is unchanged.
- [AC-5] The save/conflict seam is preserved with identical shapes: `onSave`
  (`DoctrineOnSave`), `DoctrineSaveResult`, `DoctrineDirtyState`, and `onDirtyChange` keep
  their current signatures and semantics (dirty = editing && draft !== content; conflict /
  saved / error inline states; `snapshotMtimeRef` flow). These types remain exported and
  importable by `DoctrineFileTabHost` without changing the host.
- [AC-6] `DoctrineFileTab` is refactored to be a thin wrapper that composes `MarkdownViewer`
  with the doctrine loader (`doctrineReadFile`) and the doctrine default save
  (`doctrineWriteFile`), preserving its current public `Props`
  (`{ props?, onDirtyChange? }`) and `tier`-derived `editable` default. The
  `doctrine-file` tab type continues to render via `DoctrineFileTabHost` → `DoctrineFileTab`
  with no behavioural change (read-only Tier 0, editable Tier 1/2, save-choice dialog,
  dirty-close guard, conflict modal all still work).
- [AC-7] No change to `store/workspace.ts` `TabType`, to `TabContent.tsx` dispatch, or to
  any tab opener in this ticket — extraction is internal. (`ArtifactMdTab` / `MarkdownTab`
  migration is deferred to T-PATCH-029.)
- [AC-8] `pnpm -C packages/gui tsc --noEmit` (or the repo's typecheck script) passes with no
  new errors.
- [AC-9] `pnpm -C packages/gui lint` (the repo's lint script) passes with no new errors.

## Plan

Re-read current sources before editing; line refs are from the snapshot at ticket time.

1. **Read the donor + seam files.**
   - `packages/gui/src/components/workspace/main/panes/DoctrineFileTab.tsx` — donor body.
     Exported seam types live at lines 26–47 (`DoctrineSaveResult`, `DoctrineOnSave`,
     `DoctrineDirtyState`). Editable/read-only branching at lines 64–69, 197–229, 253–288.
     Load flow 87–114; default save 116–122; dirty report 168–171; line-cap badge 199–205,
     360–375; styles 294–499.
   - `packages/gui/src/components/workspace/main/panes/ArtifactMdTab.tsx` — zoom source:
     `ZoomControls` import + `ZOOM_*` (line 13), zoom state + handlers (33–39),
     `BASE_FONT_PX = 13` (line 23), applied at 121–124 via inline `fontSize`.
   - `packages/gui/src/components/workspace/main/panes/ZoomControls.tsx` — the control group
     + `ZOOM_STEP/MIN/MAX/DEFAULT` exports (lines 13–16).
   - `packages/gui/src/components/workspace/main/panes/DoctrineFileTabHost.tsx` — the seam
     consumer. It imports `DoctrineFileTab, { DoctrineDirtyState, DoctrineOnSave }` (line 22)
     and passes `props={{ ...tabProps, onSave }}` + `onDirtyChange` (lines 329–333). This
     host MUST keep compiling unchanged.

2. **Create `MarkdownViewer.tsx`.** Lift the donor's header bar (breadcrumb + header-right),
   load/error/loading states, Preview (`MdRenderer`) + textarea Edit flow, line-cap badge,
   and all styles. Parameterize:
   - `loader` injected fetch (replaces the inlined `doctrineReadFile` call at 93–110).
   - `editable: boolean` (replaces the `tier`-derived default at 64–69 — the primitive takes
     a plain boolean; tier mapping stays in the `DoctrineFileTab` wrapper).
   - optional zoom (enable flag → render `ZoomControls` in `headerRight`, scale Preview
     `viewerWrap` font-size by `zoom * BASE_FONT_PX`).
   - `onSave` / `onDirtyChange` props unchanged; keep `snapshotMtimeRef`, conflict/saved/
     error states, and the `dirty` derivation (line 168) intact.
   - Re-export the seam types (`DoctrineSaveResult`, `DoctrineOnSave`, `DoctrineDirtyState`)
     from here OR keep them in a small shared module so the host import path stays valid.

3. **Refactor `DoctrineFileTab.tsx` into a thin wrapper.** Keep its `Props`
   (`{ props?, onDirtyChange? }`), read `tier`/`absPath`/`relName`/`projectDir`/`editable`/
   `onSave` from `tabProps` as today (lines 64–70), build the doctrine `loader`
   (`doctrineReadFile(absPath, projectDir)`) and the doctrine default save
   (`doctrineWriteFile`, lines 116–122), and render `MarkdownViewer` with `editable` derived
   from `tier !== 0` (the existing default) and zoom disabled. Forward `onDirtyChange` and
   `onSave` unchanged so `DoctrineFileTabHost` keeps working untouched.

4. **Verify** `DoctrineFileTabHost` still type-checks against the re-exported seam types;
   run typecheck (AC-8) and lint (AC-9).

## Out of scope

- Migrating `ArtifactMdTab` and `MarkdownTab` onto the primitive (→ T-PATCH-029).
- Any `TabType` change, opener change, or new IPC channel (→ T-PATCH-029 adds the generic
  project-file loader on the consumer side).
- Changing the save-choice dialog, conflict modal, or dirty-close guard behaviour in
  `DoctrineFileTabHost` (T-PATCH-022 contract is frozen here).
- The common-habit 50-line cap; the 100-line advisory cap behaviour is carried as-is.
- Visual redesign of the header / badges / zoom group beyond what extraction requires.
