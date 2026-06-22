---
ticket_id: T-PATCH-027
version: v0.5
phase: 3
type: impl
status: done
assignee: pdt-developer
qa: true
qa_status: pass
qa_loops: 1
slug: md-render-fix
---

# T-PATCH-027 — markdown shows raw, not rendered

## Request

Opening a markdown file in the tier editor (e.g. `~/.productune/po/habit.md` from the
Persona Tier Editor's LONG-TERM MEMORY rows) shows the raw markdown source instead of
rendered output. Fix the generic markdown viewer to render, and route persona Tier-2
long-term-memory rows through the proper rendered + editable tier-file tab.

## Root cause

- `MarkdownTab.tsx` rendered the body via `<pre>{body}</pre>` — never used `MdRenderer`,
  so all `markdown`-type tabs showed raw source.
- Its Preview / Edit toggle buttons were dead stubs (no `onClick`, no state).
- `PersonaDefTab.tsx` LONG-TERM MEMORY rows opened the file as tab type `markdown`
  (the broken viewer) instead of the rendered, editable `doctrine-file` tab.
- The correct pattern already existed in `ArtifactMdTab.tsx` and `DoctrineFileTab.tsx`,
  which both render through `MdRenderer` inside a block `viewerWrap`.

## What changed

- **`MarkdownTab.tsx`** — renders `body` through `MdRenderer` inside a block-layout
  `viewerWrap` (mirrors ArtifactMdTab / DoctrineFileTab so headings / tables / lists /
  code fences lay out as blocks; MdRenderer's own root is `display:inline`, tuned for
  chat). Removed the dead Preview / Edit toggle and replaced the toolbar-right with a
  read-only badge (this generic viewer is read-only by design). Kept the
  `readMemoryFile` fetch for `~/.productune/...` paths, the loading state, the empty-file
  state, and the placeholder. This fixes every `markdown` opener (Explorer helpers,
  TodoListPanel, useIpcSubscriptions, MdRenderer `ptn:file/...` links).
- **`PersonaDefTab.tsx`** — LONG-TERM MEMORY (Tier-2) rows now open as tab type
  `doctrine-file` with `{ tier: 2, persona: <dir>, absPath: <path>, relName: 'habit.md',
  editable: true }`, routing to `DoctrineFileTab` (rendered Preview via MdRenderer +
  edit + save-choice flow), consistent with the #7 tier editor. The `LT_MEMORY` config
  gained the IPC `dir` name (key→dir split: `dev` → `developer`) and `relName`.
- **`electron/ipc/doctrine.ts`** — added `expandHome()` so a leading `~` / `~/` expands
  to the user home dir before `path.resolve`, applied in the path guard and both
  `doctrine:readFile` / `doctrine:writeFile` handlers. Without this the Tier-2 tilde
  paths (`~/.productune/<persona>/habit.md`) would never match the Tier-2 containment
  root and reads/writes would be rejected.

## Acceptance

- AC-1 — `MarkdownTab` renders markdown via `MdRenderer` (no raw `<pre>` for content);
  headings / tables / lists render in the block viewer.
- AC-2 — the dead Preview / Edit toggle is removed; viewer is read-only with a badge.
- AC-3 — loading, empty-file, and placeholder states are preserved.
- AC-4 — PersonaDefTab LONG-TERM MEMORY rows open in `DoctrineFileTab` (Tier-2,
  editable) with rendered Preview, not the raw viewer.
- AC-5 — Tier-2 `~/.productune/<persona>/habit.md` paths read and write through the
  doctrine IPC (tilde expansion).
- AC-6 — ko/en i18n parity maintained; tsc + lint green.
