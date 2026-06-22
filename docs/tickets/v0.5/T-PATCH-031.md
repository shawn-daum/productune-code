---
ticket_id: T-PATCH-031
version: v0.5
phase: 3
type: impl
status: done
assignee: pdt-developer
qa: true
qa_status: pass
qa_loops: 1
slug: viewer-polish
---

# T-PATCH-031 — file-viewer unify polish + 1 edge fix

## Request

Finish the file-viewer unification (T-027~032) with two polish items and one
edge-case fix, plus a cross-consistency sanity pass:

1. **persona-spec editor preview.** `PersonaDefTab.tsx` carried an inline
   persona-spec editor (`~/.claude/agents/<id>.md` via `readPersonaSpec` /
   `writePersonaSpec`) that was a raw `<textarea>` with NO rendered preview.
   Route it through the shared `MarkdownViewer` primitive (`panes/MarkdownViewer.tsx`,
   landed T-028): `editable=true`, loader wrapping `readPersonaSpec`, save wrapping
   `writePersonaSpec`. Persona spec now renders Preview by default + raw Edit toggle
   + Save, consistent with the doctrine-file viewer.

2. **edge fix (from T-027).** A T2 personal-memory file
   (`~/.productune/<persona>/habit.md`) opened as a `doctrine-file` has NO
   `projectDir`. Picking the "PO 검토 요청" path in the save-choice dialog hit
   `runReviewEnqueue`, which short-circuits to a `'no project'` toast. FIX: when
   `projectDir` is absent, the save-choice dialog must NOT offer PO-review — show
   direct-save only. Direct save still works; the review option is hidden when
   inapplicable.

3. **cross-consistency sanity.** Verify each file type renders via one primitive
   everywhere (md → `MarkdownViewer`, code → `CodeTextViewer`, html → `HtmlViewer`).

## Changes

- `PersonaDefTab.tsx`
  - Replaced the bespoke persona-spec editor state (`specEditing`/`specDraft`/
    `specLoading`/`specSaving`/`specError`/`specSaved`) and its inline `<textarea>`
    + Edit/Save/Cancel buttons with a single `<MarkdownViewer editable>` instance.
  - Added `loadSpec` (wraps `readPersonaSpec` → `MarkdownLoadResult`, `mtimeMs:null`)
    and `saveSpec` (wraps `writePersonaSpec` → `DoctrineSaveResult`-shaped result)
    seam adapters. The persona IPC carries no mtime, so `mtimeMs:null` makes
    `MarkdownViewer`'s conflict pre-check a no-op (no false conflicts).
  - Framed the viewer in a bounded `specViewerWrap` box so its internal
    Preview/Edit body scrolls independently inside the scrolling detail pane.
  - Dropped the now-unused styles (`specBtnGroup`, `specActionBtn`, `specTextarea`,
    `specErrorText`, `specSavedText`) and the `useState` / `Pencil` / `Save` / `X`
    imports.
  - Fixed three broken i18n key references that pointed at the non-existent
    `workspace.personaDef.*` namespace; they now read the existing
    `workspace.team.personaDef.*` keys (`modelHint`, `specHeader`, `specSaved`).

- `DoctrineSaveChoiceModal.tsx`
  - Added a `showReview` prop (default `true`). When `false`, the "PO 검토 요청"
    button is not rendered and the body copy swaps to
    `workspace.doctrine.save.bodyDirectOnly` (single-path explanation).

- `DoctrineFileTabHost.tsx`
  - Passes `showReview={!!projectDir}` to the modal, so a no-project T2 file shows
    direct-save only and the `'no project'` toast path is unreachable.

- `locales/en.json`, `locales/ko.json`
  - Added `workspace.doctrine.save.bodyDirectOnly` (en + ko). Key sets stay
    identical (693 keys, en/ko parity).

### Cross-consistency note

Confirmed single-primitive-per-type holds: md tabs (`DoctrineFileTab`,
`ArtifactMdTab`, `MarkdownTab`) all route through `MarkdownViewer`; code/text via
`CodeTextViewer` (`CodeViewTab` + `CodeSearchTab` share the renderer); html via
`HtmlViewer` (delegating http(s) to `BrowserTab`). The one stray — PersonaDefTab's
raw persona-spec textarea — is removed by change 1. No further strays found.

## Acceptance

- AC-1: Opening a persona detail shows the persona spec rendered (Preview) by
  default via `MarkdownViewer`, with a raw Edit toggle and Save, matching the
  doctrine-file viewer.
- AC-2: Editing + saving the persona spec persists via `writePersonaSpec`; errors
  surface inline in the viewer.
- AC-3: A T2 personal-memory file opened without a `projectDir` shows the
  save-choice dialog with NO "PO 검토 요청" option — direct save only — and the
  body copy explains why. Direct save still writes successfully.
- AC-4: A doctrine file opened WITH a `projectDir` still shows both paths
  (direct + PO review) unchanged.
- AC-5: Each file type renders via one primitive (md→MarkdownViewer,
  code→CodeTextViewer, html→HtmlViewer); no stray bespoke renderers remain.
- AC-6: `tsc --noEmit` green; `pnpm --filter @productune/gui lint` green; lucide
  icons only, no color emoji; en/ko parity.
