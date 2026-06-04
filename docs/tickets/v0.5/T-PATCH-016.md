---
ticket_id: T-PATCH-016
version: v0.5
phase: 3
type: bug
status: done
assignee: pdt-developer
estimated_complexity: L2
qa: true
qa_status: pass
qa_loops: 1
risk_flags: tab-routing, ipc-reuse, hidden-file-extension
slug: explorer-file-viewer
---

# T-PATCH-016: Explorer — generic text/code files open in a readable code viewer

> Opening `.env`, `.json`, and other generic text/code files from the Explorer either shows
> a blank placeholder or (for unknown extensions) a binary "no preview" card. They should
> open in a code-editor-like viewer: monospace, line numbers, scrollable, read-only.

## Request

In the Explorer, clicking a non-markdown / non-special file (e.g. `.env`, `.json`, `.yml`,
`.sh`, `.ts`) should open it in a readable code viewer that looks like a normal editor pane
(monospace font, line-number gutter, scrollable). Today these files do not render their
content.

### Root cause (investigated)

The Explorer open path is:
`FileRow.tsx onClick -> onOpen` → `ExplorerPane.tsx handleOpenFile` (line 80) →
`resolveTabKind()` (line 20) → `openTab(tabId, type, { path, readonly })`.

`resolveTabKind` (ExplorerPane.tsx:20-27) maps text/code extensions in `TEXT_EXTS`
(line 13-16, which includes `.env`, `.json`, `.yml`, `.ts`, `.sh`, etc.) to
`{ type: 'markdown', readonly: true }`. The tab then renders via
`TabContent.tsx:34` → `MarkdownTab`.

The bug: `MarkdownTab.tsx` (lines 26-45) only ever fetches file content when the path
starts with `~/.productune/` (Tier-2 memory via `readMemoryFile`). For a real project file
like `.env`, `inlineBody` is null and `path` does not start with `~/.productune/`, so the
effect returns early, `body` stays null, and the pane shows
`t('workspace.tab.markdown.placeholder')` — i.e. blank. MarkdownTab has **no project-file
read path at all**.

Additionally, any extension NOT in `MD_EXTS` / `HTML_EXTS` / `IMAGE_EXTS` / `TEXT_EXTS`
falls through to `{ type: 'binary' }` (line 26) → `BinaryTab.tsx`, which shows a document
emoji + "no preview" even for plain-text files (e.g. `Dockerfile`, `.gitignore`, `.toml`,
extensionless files).

Note on `.env`: it is plain text, not binary. The extension parse
`filePath.slice(filePath.lastIndexOf('.'))` yields `'.env'` for a file literally named
`.env` (lastIndexOf('.') === 0), so `.env` IS matched by `TEXT_EXTS` and routed to
`markdown` — it is not an extension-detection failure; it fails purely because MarkdownTab
never loads the body. (Caveat: the Explorer tree must also be showing hidden files for
`.env` to appear — controlled by `showHidden` in `useExplorer`; verify a dotfile is even
clickable in the tree before testing.)

### Existing pattern to reuse

`CodeSearchTab.tsx` is already a read-only code viewer: monospace, line-number gutter,
scrollable, loads content via the `search:readFileLines` IPC
(`electron/ipc/search.ts:251-276`). That IPC is project-dir scoped (path-traversal guard),
size-capped (`MAX_FILE_BYTES`), binary-guarded (`looksBinary` → returns `binary file`),
line-capped (`READ_FILE_MAX_LINES`), and returns `{ ok, lines, truncated }`. It is exposed
as `api.searchReadFileLines(projectDir, absPath)` (preload.ts:714). `.env` passes the
binary guard, so this backend already handles the target files.

### Read-only vs editable decision

Read-only. Matches existing patterns: `resolveTabKind` already sets `readonly: true` for all
`TEXT_EXTS`, `CodeSearchTab` is read-only, and `ArtifactMdTab` enforces a read-only
invariant (Lock badge). No editing IPC exists for arbitrary project files. Keep this ticket
read-only; an editable editor is out of scope.

## Plan

Recommended approach: introduce a dedicated read-only code-viewer tab type and route generic
text/code + unknown-but-text files to it, reusing the `search:readFileLines` IPC.

1. **New tab type `code-view`** in `store/workspace.ts`:
   - Add `'code-view'` to the `TabType` union (workspace.ts:7-30).
   - Add a `defaultTitle` case (workspace.ts:600-626) → basename of `props.path`.
2. **New pane component** `components/workspace/main/panes/CodeViewTab.tsx`:
   - Adapt `CodeSearchTab.tsx` (drop the match/highlight/scroll-to-line logic; keep
     monospace + gutter + scroll). Props: `{ projectDir, path }`.
   - Load via `api.searchReadFileLines(projectDir, absPath)`; render `lines` with the
     line-number gutter. Handle `ok:false` errors (incl. `'binary file'` → show a small
     "binary, no preview" state, replacing the old BinaryTab behavior for true binaries).
   - Toolbar: relPath crumb + read-only badge (mirror CodeSearchTab toolbar styles).
3. **Wire dispatcher**: `TabContent.tsx:33` switch — add
   `case 'code-view': return <CodeViewTab props={tab.props} />`.
4. **Update routing** in `ExplorerPane.tsx`:
   - `resolveTabKind` (line 20): change `TEXT_EXTS` branch (line 25) to return
     `{ type: 'code-view' }` instead of `{ type: 'markdown', readonly: true }`.
   - Change the fallback (line 26) from `{ type: 'binary' }` to `{ type: 'code-view' }` so
     unknown/extensionless text files also open in the code viewer; let the IPC's
     `looksBinary` guard decide whether to show the binary-no-preview state. (Keep `image`
     routing as-is.)
   - `handleOpenFile` (line 80-90) must pass `projectDir` in props for the new type
     (currently only passes `{ path, readonly }`). Add `props.projectDir = projectDir`.
5. Leave `MarkdownTab` / `BinaryTab` as-is (still used by `markdown` and any remaining
   `binary` routes); only the Explorer routing changes.

### Acceptance Criteria

- [AC-1] Opening `.env` from the Explorer renders its full text content in a monospace,
  line-numbered, scrollable read-only viewer (not blank, not a binary card).
- [AC-2] Opening `.json`, `.yml`, `.sh`, `.ts` and an extensionless text file (e.g.
  `Dockerfile`) likewise renders content in the code viewer.
- [AC-3] A genuinely binary file (e.g. `.png` is still routed to `image`; a `.bin`/binary
  blob) shows a graceful "no preview" state via the IPC's `binary file` result — no crash,
  no blank.
- [AC-4] The viewer is read-only (no edit affordance), consistent with `CodeSearchTab` /
  `ArtifactMdTab`.
- [AC-5] Markdown (`.md`/`.mdx`), HTML, and image files continue to open in their existing
  viewers unchanged.
- [AC-6] `pnpm tsc --noEmit` passes (new tab type added to the union, `defaultTitle`, and
  the `TabContent` switch remain exhaustive).

## Out of scope

- Editable / save-to-disk editing of project files.
- Syntax highlighting / tokenization (monospace + line numbers only; a future ticket).
- Changing the Explorer hidden-file (`showHidden`) default.
- Markdown rendering changes.
