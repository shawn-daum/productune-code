---
ticket_id: T-PATCH-029
version: v0.5
phase: 3
type: feature
status: ready
assignee: pdt-developer
estimated_complexity: M
risk_flags:
  - many-tab-openers-aliased
  - repo-md-loader-path-scoping
qa: true
slug: migrate-md-tabs
depends_on:
  - T-PATCH-028
---

# T-PATCH-029 — Migrate ArtifactMdTab + MarkdownTab onto MarkdownViewer

## Request

With the shared `MarkdownViewer` primitive in place (T-PATCH-028), migrate the two remaining
markdown surfaces onto it so all markdown rendering goes through one path:

- **`ArtifactMdTab`** → `MarkdownViewer` configured read-only + zoom, loading via
  `artifactsReadFile(projectDir, absPath)`.
- **`MarkdownTab`** → `MarkdownViewer` configured read-only (or editable where applicable),
  loading via the Tier-2 memory loader (`readMemoryFile`) for `~/.productune/...` paths or
  the inline `body`, AND **a new generic project-file read loader** so Explorer repo `.md`
  files (paths NOT under `~/.productune`) actually render.

This closes the QA-flagged gap from T-PATCH-027: `ExplorerPane` opens repo `.md` files as tab
type `markdown` with `{ path: <repo absPath> }`, but `MarkdownTab`'s loader only sources
`~/.productune/...` or an inline `body` — so any repo `.md` (e.g. `README.md`, a file under
`docs/` opened from Explorer) falls through to the placeholder. The generic loader makes the
catch-all markdown tab a true universal viewer for repo + memory + inline content.

To avoid touching every opener call site, keep the `markdown` and `artifact-md` `TabType`
strings as thin aliases that still dispatch to the (now migrated) tab components.

## Acceptance

- [AC-1] `ArtifactMdTab` renders via the `MarkdownViewer` primitive, `editable === false`,
  zoom enabled, loading through `artifactsReadFile(projectDir, absPath)`. Existing behaviour
  is preserved: breadcrumb from `relPath`, read-only `Lock` badge, `ZoomControls` group, and
  rich `MdRenderer` body. Zoom min/max/step/default match the current `ZOOM_*` values.
- [AC-2] `MarkdownTab` renders via the `MarkdownViewer` primitive. It resolves content by
  loader precedence:
  1. inline `body` prop (if present) — used directly, no fetch;
  2. `~/.productune/...` path → `readMemoryFile(path)` (Tier-2 memory), preserving the
     empty-file ("emptyFile") and placeholder states;
  3. any other path under the project → the NEW generic project-file read loader (AC-3).
- [AC-3] A generic project-file read loader is added so a repo `.md` path that is NOT under
  `~/.productune` renders its on-disk content instead of the placeholder. It MUST be
  project-scoped with a path-traversal guard (resolved path must stay within `projectDir`).
  Reuse the existing project-scoped reader — `artifactsReadFile(projectDir, absPath)`, whose
  main-process handler (`artifacts:readFile`) already guards `resolved.startsWith(projectDir
  + sep)` and allow-lists `.md/.mmd/.mermaid/.html` — rather than adding a new IPC channel,
  unless a new channel is justified in the PR. (If a repo path is given but `projectDir` is
  unavailable, fall back to the current placeholder rather than erroring.)
- [AC-4] Opening a repo `.md` from Explorer (`ExplorerPane` → `openTab('file:<absPath>',
  'markdown', { path: <absPath> })`) now shows the RENDERED file content (headings, lists,
  tables, code fences via `MdRenderer`), not the placeholder. Memory (`~/.productune/...`)
  and inline-`body` markdown tabs still render exactly as before.
- [AC-5] The `markdown` and `artifact-md` `TabType` strings are retained as thin aliases:
  `store/workspace.ts` `TabType` union is unchanged, `TabContent.tsx` still dispatches
  `case 'markdown'` / `case 'artifact-md'` to the migrated components, and NO opener call
  site is required to change its tab-type string (helpers.ts, ExplorerPane, TodoListPanel,
  MdRenderer `ptn:file/...`, useIpcSubscriptions all keep working untouched).
- [AC-6] No regression in the doctrine path: `doctrine-file` →
  `DoctrineFileTabHost` → `DoctrineFileTab` still renders and saves (T-PATCH-028 contract
  intact); this ticket does not touch the host.
- [AC-7] `pnpm -C packages/gui tsc --noEmit` (or the repo's typecheck script) passes with no
  new errors.
- [AC-8] `pnpm -C packages/gui lint` (the repo's lint script) passes with no new errors.

## Plan

Re-read current sources before editing; line refs are from the snapshot at ticket time.

1. **`ArtifactMdTab.tsx`** (`.../panes/ArtifactMdTab.tsx`). Replace the body with a
   `MarkdownViewer` render: `editable={false}`, zoom enabled, `loader` =
   `() => api.artifactsReadFile(projectDir, absPath)` (current call at lines 48–49). Drop the
   now-duplicated local header/load/error/zoom scaffolding (lines 31–131) in favour of the
   primitive's; keep reading `absPath`/`relPath`/`projectDir` from `tabProps` (27–29) and the
   `ZOOM_*` defaults via the primitive. Pass `relPath` as the breadcrumb source.

2. **`MarkdownTab.tsx`** (`.../panes/MarkdownTab.tsx`). Replace the body with a
   `MarkdownViewer` render, `editable` = false by default (keep current read-only behaviour;
   accept an editable variant only if a caller passes it — see TabType-alias note). Build the
   loader by precedence (AC-2): inline `body` (current `inlineBody`, line 26) →
   `readMemoryFile` for `~/.productune/...` (current effect at lines 33–50) → the generic
   project-file loader for other repo paths. Preserve the loading / error / empty-memory /
   placeholder states (lines 52–77). The `projectDir` for the generic loader comes from the
   workspace store (`useWorkspace().project` — see `ExplorerPane` line 35 for the pattern);
   thread it in.

3. **Generic project-file loader (AC-3).** Wire `MarkdownTab`'s non-memory, non-inline branch
   to `api.artifactsReadFile(projectDir, absPath)`. Confirm against
   `packages/gui/electron/ipc/artifacts.ts` lines 90–110 that the handler is a generic
   project-scoped reader (projectDir-prefix traversal guard at line 99; ext allow-list at
   105) — it is NOT limited to `docs/artifacts/`, so it serves any repo `.md` under the
   project. If `projectDir` is missing, fall back to the existing placeholder.

4. **TabType aliases (AC-5).** Leave `store/workspace.ts` `TabType` (lines 10–35) and the
   `TabContent.tsx` dispatch (`case 'markdown'` line 36, `case 'artifact-md'` lines 51–52)
   as-is so every existing opener (e.g. `helpers.ts` line 191; `ExplorerPane` lines 83–92,
   which maps `.md/.mdx` → `{ type: 'markdown' }`; `TodoListPanel`; `MdRenderer`;
   `useIpcSubscriptions`) keeps compiling and opening the same tab strings.

5. **Verify** the three open paths manually-equivalent in code: artifact open (artifact-md),
   Explorer repo `.md` (markdown → generic loader), memory `~/.productune` (markdown →
   readMemoryFile), inline `body` (markdown). Run typecheck (AC-7) and lint (AC-8).

## Out of scope

- Changing any `TabType` string or any opener call site (aliases stay; openers untouched).
- Adding a brand-new IPC channel when `artifacts:readFile` already covers project-scoped
  reads (only add one if a concrete need surfaces in the PR, with justification).
- `DoctrineFileTab` / `DoctrineFileTabHost` behaviour (frozen by T-PATCH-028 / T-PATCH-022).
- Making `MarkdownTab` editable for repo files (repo `.md` stays read-only here; doctrine
  editing remains the `doctrine-file` path).
- Reading files outside `projectDir` or outside the existing ext allow-list.
- Mermaid / image / binary tab surfaces.
