---
ticket_id: T-PATCH-032
version: v0.5
phase: 3
type: feature
status: ready
assignee: pdt-developer
estimated_complexity: M
risk_flags:
  - filesystem-write
  - webview-local-file
  - dangling-tabtype-resolve
qa: true
slug: html-viewer
depends_on: []
---

# T-PATCH-032 — HtmlViewer for local .html files + resolve the dangling `preview` TabType

## Request

User-review artifacts are `.html` files, but opening one from the Explorer is currently
broken. `resolveTabKind` routes `HTML_EXTS` (`.html` / `.htm`) to TabType `'preview'`, and
`'preview'` has NO real pane — in `TabContent.tsx` it falls through to `PlaceholderTab`,
which renders the dead "filled by T-P4-053" placeholder. So every local `.html` open is a
dangling / broken tab.

Build an `HtmlViewer` that renders local `.html` files as a **Preview by default**, with a
**raw-source Edit toggle** and **Save** (md-style editable, per user — model the
edit/save/dirty flow on the existing `DoctrineFileTab` / `DoctrineFileTabHost` pattern).
Wire the dangling `'preview'` TabType to this viewer (route `.html` here, not Placeholder).
Also handle `http(s)` URLs through the existing `BrowserTab` / Electron `<webview>` path so
the `'preview'` type cleanly covers both local-file and remote-URL inputs.

Parallel to the other B-scope tickets (`depends_on: []`).

## Acceptance

- **AC-1** — Opening a local `.html` / `.htm` file from the Explorer opens an `HtmlViewer`
  tab (TabType `'preview'`), NOT `PlaceholderTab`. The dangling `'preview'` →
  `PlaceholderTab` fall-through is removed from `TabContent.tsx`.
- **AC-2** — Preview is the DEFAULT mode: the local file's rendered HTML is shown via an
  Electron `<webview>` (preferred, `webviewTag` is already enabled in `main.ts`) or a
  sandboxed `<iframe>` pointed at the local file. Implementer picks one; if `<iframe>`,
  it must be sandboxed and must not break on `file://` local loads.
- **AC-3** — A Preview / Edit toggle (lucide icons, e.g. `Eye` / `Pencil` — no color
  emoji) switches between rendered Preview and an editable raw-source textarea, mirroring
  the doctrine/md editable pattern.
- **AC-4** — Save writes the edited raw HTML back to the file on disk through a
  project-scoped, path-guarded IPC (model on `doctrine:writeFile` in
  `electron/ipc/doctrine.ts`: containment check + mtime-conflict guard + temp-file write).
  After a successful save the Preview reflects the new content (reload the webview/iframe).
- **AC-5** — Dirty-state handling matches the house pattern: unsaved edits register a
  close-guard and surface the dirty modal (reuse `GenericDirtyModal` / the
  `DoctrineFileTabHost` dirty-close approach). mtime conflict on save is surfaced, not
  silently overwritten.
- **AC-6** — `http(s)` URL inputs (TabType `'preview'` with a `url` prop) render through
  the existing `BrowserTab` / `<webview>` path rather than the local-file branch; the
  viewer branches on local-path vs. http(s)-URL props. Reuse `BrowserTab.tsx`'s webview
  setup rather than duplicating nav logic where practical.
- **AC-7** — Security: local file load is read from the project-scoped IPC / a guarded
  `file://` path only; the webview/iframe does not get unrestricted node integration, and
  the save IPC rejects paths outside the project dir (path-traversal guard).
- **AC-8** — ko/en i18n parity for all new strings (toggle labels, save/dirty/error
  toasts, load-error state). `pnpm -C packages/gui tsc --noEmit` passes; lint passes.

## Plan

Re-read each file at implementation time; line numbers below reflect current `main`.

1. **`packages/gui/src/components/explorer/ExplorerPane.tsx`** — `resolveTabKind` (L20–29)
   already maps `HTML_EXTS` → `'preview'` (L23); keep that mapping. In `handleOpenFile`
   (L82–95) pass `projectDir` + `path` for the local-`.html` case the same way `code-view`
   does (L91), so the viewer + save IPC can scope to the project dir.
2. **`packages/gui/src/components/workspace/main/TabContent.tsx`** — remove `'preview'`
   from the `PlaceholderTab` fall-through group (currently L63–68) and add a dedicated
   `case 'preview': return <HtmlViewer tabId={tab.id} props={tab.props} />`. Add the
   import alongside the other pane imports (L2–22).
3. **NEW `packages/gui/src/components/workspace/main/panes/HtmlViewer.tsx`** — the viewer.
   Branch on props: local file (`path` + `projectDir`) → Preview(webview/iframe) + Edit
   toggle + Save; http(s) `url` → delegate to / reuse `BrowserTab`. Model the
   edit/save/dirty/conflict flow on `DoctrineFileTab` + `DoctrineFileTabHost` (the
   established editable-with-save pattern; the host owns the IPC + dirty guard + modal,
   the editor stays prop-driven).
4. **`packages/gui/src/components/workspace/main/panes/BrowserTab.tsx`** (1–255) — reuse
   its `<webview>` + nav setup for the http(s)-URL branch (the `tabDragActive` pointer-
   events handling at L47/L169 should be preserved if the webview is reused).
5. **`packages/gui/src/store/workspace.ts`** — `'preview'` already exists in `TabType`
   (L20) and `defaultTitle` (L657); no union change needed. Confirm `defaultTitle` returns
   a sensible title for the local-file case (derive from `path` like `code-view` L672).
6. **`electron/ipc/`** — add a project-scoped, mtime-guarded HTML write handler modeled on
   `doctrine:writeFile` (`electron/ipc/doctrine.ts` L252–272: containment + mtime check +
   temp-file write) and expose it via `electron/preload.ts` (mirror the `doctrineWriteFile`
   exposure at L518–524). Reuse an existing project-scoped read IPC for the source load.
7. **i18n** — add new keys to `packages/gui/src/locales/{en,ko}.json` (a new
   `workspace.htmlViewer.*` block); maintain ko/en parity.

## Out of scope

- The read-only code/text viewer + BinaryTab fold — owned by T-PATCH-030.
- Markdown rendering changes (handled by `markdown` / `MarkdownTab`).
- Syntax highlighting of the raw-HTML edit textarea.
- A new general-purpose project file-write IPC beyond what the HTML save needs (keep the
  write handler scoped to this viewer's use case).
- Re-architecting `BrowserTab` nav UX beyond what reuse for the http(s) branch requires.
