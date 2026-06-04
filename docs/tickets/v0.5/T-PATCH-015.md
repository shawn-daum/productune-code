---
ticket_id: T-PATCH-015
version: v0.5
phase: 3
type: bug
status: done
assignee: pdt-developer
risk_flags: [data-source-incomplete, missing-tiers, account-managed-mcp, plugin-mcp, no-connection-state, ipc-reads-disk-not-runtime]
qa: true
qa_status: pass
qa_loops: 1
slug: mcp-status-empty
---

# T-PATCH-015: MCP panel shows "no servers connected" while the session has several

> Phase 3 patch. The MCP status panel reads MCP config from 3 file tiers, but the
> servers the running session actually has connected come from sources the GUI never
> reads. INVESTIGATE-confirmed on disk below; this ticket pins the root cause and
> proposes the authoritative data source.

## Request — root cause (confirmed on disk)

The data source chain is sound for ONE tier but **structurally omits the sources that hold
most of the session's connected servers**.

**Renderer**: `McpServersTab.tsx:49-61` calls `api.mcpGetServers(project?.projectDir)` and
renders the empty state (`McpServersTab.tsx:82-87`, strings `settings.mcp.emptyTitle/emptyDesc`,
`ko.json:602` "연결된 MCP 서버가 없어요.") whenever `servers.length === 0`. The palette path
(`views/workspace/shell/helpers.ts:242-254`) uses the same call via `WorkspaceShell.tsx:190`.

**Preload**: `electron/preload.ts:375` → `ipcRenderer.invoke('mcp:getServers', projectDir)`.

**Main / data source**: `electron/ipc/mcp.ts:102-141` `mcp:getServers` merges exactly **3 tiers**:
- Tier 1 productune — `~/.claude/settings.json` `.mcpServers` (`mcp.ts:107-109`)
- Tier 2 local — `~/.claude.json` `projects[projectDir].mcpServers` via `resolveLocalMcpServers`
  (`mcp.ts:49-72`, `:114-116`)
- Tier 3 project — `<projectDir>/.mcp.json` (`mcp.ts:119-127`)

**Disk reality (productune dir, 2026-06-04)**:
- `~/.claude/settings.json` `mcpServers` = `[]` (empty)
- `~/.claude.json` `projects[/Users/.../productune].mcpServers` = `['playwright']` ONLY
- `<productune>/.mcp.json` = does not exist
- `realpath(productune)` == the stored key exactly → `resolveLocalMcpServers` DOES resolve
  `playwright` (the T-PATCH-009 #7 normalization is working; **not** the bug here).

**But `claude mcp list` for the session shows ~13 servers connected**, e.g. `claude.ai Notion`
(✓), `claude.ai Figma` (✓), `playwright` (✓), `plugin:vercel-plugin:vercel`, plus several
needing auth. These come from **two source classes the GUI never reads**:

1. **Account-managed / remote `claude.ai *` servers** — registered at the Claude account level,
   NOT in `projects[].mcpServers` / `settings.json` / `.mcp.json`. `~/.claude.json` only carries
   the marker `claudeAiMcpEverConnected` (= `['claude.ai Figma','claude.ai Gmail',...]`); the
   actual server configs are account-synced state, not local config files.
2. **Plugin-provided MCP servers** — e.g. `plugin:vercel-plugin:vercel`, defined in
   `~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/.mcp.json` and activated via
   `~/.claude/plugins/installed_plugins.json`. The GUI never walks the plugins tree.

**Root cause**: `mcp:getServers` (`mcp.ts:102-141`) re-derives MCP state by parsing only the
three local config-file tiers, so for a project whose only file-tier server is `playwright` it
returns a 1-element (or, if `projectDir` is ever stale, 0-element) list — under-reporting vs the
session. The authoritative, session-matching list is what **`claude mcp list`** reports.

**Secondary correctness bug**: even for servers it DOES return, the backend never sets a
`connected` field. `mcp.ts:138-140` returns `{ name, config, source }` only; the palette
(`helpers.ts:248-249`) reads `server.connected` (optional, `helpers.ts:134`), so every server
renders as **"disconnected"** — i.e. "no servers *connected*" is literally true in the UI even
when servers are listed.

## Acceptance

- [ ] **[AC-1]** With the productune dir open and `playwright` registered, the MCP panel and
      palette list `playwright` (regression guard — the file-tier path must keep working).
- [ ] **[AC-2]** Servers the running session has connected (account-managed `claude.ai *` and
      plugin-provided, as reported by `claude mcp list`) surface in the MCP panel — the panel is
      no longer empty/under-populated when the session has connected servers. (If a source cannot
      be read reliably, see open question — do not silently drop it.)
- [ ] **[AC-3]** Each listed server shows a correct connection state: a connected server is
      rendered "connected" (the `connected` field on the IPC entry is populated, not left
      `undefined`), so `helpers.ts:248-249` no longer shows everything as "disconnected".
- [ ] **[AC-4]** The empty state (`McpServersTab.tsx:82-87`) appears only when there are
      genuinely zero servers.
- [ ] **[AC-5]** `pnpm tsc --noEmit` passes.

## Plan — file:line sites

1. **Decide the data source** (key decision — see open questions). Preferred: shell out to
   `claude mcp list` (optionally `--json` if supported) from the main process — it is the only
   source that matches the session 1:1 (account-managed + plugin + file tiers + live health).
   Parse name + endpoint + connection state. Fallback / supplement the existing 3-tier file read
   for offline/structural data.
2. **Extend `mcp:getServers`** (`electron/ipc/mcp.ts:102-141`): add the chosen source(s); set a
   real `connected` boolean per entry. Keep `resolveLocalMcpServers` (`mcp.ts:49-72`) as the
   file-tier path so `playwright`/`.mcp.json` keep working (AC-1).
3. **Add plugin-tier read** (if not using `claude mcp list`): walk
   `~/.claude/plugins/installed_plugins.json` → each enabled plugin's `installPath`/`.mcp.json`
   `mcpServers`, source = `plugin`.
4. **Type updates**: add `connected: boolean` to the `McpServerEntry` returned by `mcp.ts:16-20`
   and reflected in `src/views/workspace/shell/helpers.ts:124-135` and
   `src/components/workspace/main/panes/McpServersTab.tsx:15-26` (a new `source: 'plugin'` /
   `'managed'` variant if those tiers are added — update the `[source]` pill at
   `McpServersTab.tsx:97` and the modal type `McpServerModal.tsx:21,30`).
5. **Verify** end-to-end: panel + palette (`helpers.ts:242-254`) show the session's servers with
   correct connected dots.

## Out of scope

- Implementing live process-spawn health checks beyond what `claude mcp list` already reports
  (`mcp:testConnection` MVP stub at `mcp.ts:225-235` stays as-is unless the chosen source needs it).
- Editing/registering new MCP servers (`mcp:save`/`mcp:rename` paths unchanged).
- The persona tab-identity bug (T-PATCH-014).

## Open questions

- **Q1 (data source / blocking design decision)**: should the GUI adopt `claude mcp list`
  (and/or `--json`) as the source of truth, or extend the file-tier reader to also parse the
  plugins tree + an account-managed source? `claude mcp list` matches the session exactly but
  (a) requires shelling out per poll and (b) `--json` support / output schema must be confirmed
  against the installed Claude Code version. The account-managed `claude.ai *` configs were NOT
  found in any local file (only the `claudeAiMcpEverConnected` marker), so a pure file-read
  approach likely cannot surface them — needs product/owner decision.
- **Q2**: should account-managed/remote and plugin servers be **editable** in the panel, or
  read-only (the existing edit/rename paths only write the file tiers)? If read-only, the row
  UI (`McpServersTab.tsx:90-99`) and `McpServerModal` need a non-editable affordance.
