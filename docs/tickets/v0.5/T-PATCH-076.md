---
ticket_id: T-PATCH-076
version: v0.5
phase: 3
type: impl
status: done
assignee: pdt-developer
created_at: 2026-06-09T00:00:00Z
estimated_complexity: L3
risk_flags: [security]
slug: project-env-viewer-editor
qa_status: pass
requires_qa: true
requires_user_gate: false
area_tag: gui-side-panel
---

# T-PATCH-076: Build-target project .env viewer/editor (side panel)

## Request

shawn (Plan A ad-hoc): add a viewer/editor for the **managed (build-target) project's own root `.env`** directly under the current-version card in the side panel.

Scope clarifications (load-bearing — do not conflate three different env files):
- THIS ticket = the build-target project's root `.env` (`<project.projectDir>/.env`). Project-scoped, history-independent.
- NOT productune engine env (`~/.productune/productune.env`, `MY_PO_ENGINE`).
- NOT MCP env.

The project `.env` holds secrets (DB URL, API keys), so values must be masked by default with explicit click-to-reveal, and writes must be mode `0600`.

## Acceptance

- AC-1 (placement): Given a project is open, the env panel renders as its own `sp-section` directly UNDER `SidePanelCurrentVersion` in the side panel, using the existing section header + card visual language.
- AC-2 (list keys): Given `<projectDir>/.env` exists with `KEY=value` lines, When the panel loads, Then every key is listed one row per key, in file order. Comment lines (`#…`) and blank lines are preserved on save but not shown as editable rows.
- AC-3 (masked by default): Given the panel rendered, Then every value is masked (e.g. `••••••••`) by default — NO plaintext secret is ever rendered in the always-visible state. (security)
- AC-4 (click-to-reveal per row): Given a masked row, When the user clicks the reveal control (lucide `Eye` → `EyeOff`) on that row, Then only that row's value becomes visible; other rows stay masked. Re-click re-masks. Revealed state is transient (in-memory only; reset on panel unmount/project switch).
- AC-5 (edit + add): Given the panel, When the user edits a value, pastes a value, or adds a new `KEY`/value pair, Then the change is staged locally and a "save" affordance becomes enabled (dirty state). Empty key is rejected; duplicate key is rejected with an inline message.
- AC-6 (save via IPC, 0600): Given staged changes, When the user saves, Then an IPC handler writes `<projectDir>/.env` with `fs.writeFileSync(path, content, { mode: 0o600 })` (mirroring the onboarding `productune.env` write), preserving comments/blank lines and key order, and returns `{ ok: true }`. After save the panel reloads from disk and dirty state clears. (security)
- AC-7 (empty/missing state): Given `<projectDir>/.env` is missing or empty, Then the panel shows an empty-state ("no .env / no keys") with an affordance to add the first key; first save creates the file at `0600`.
- AC-8 (no leak on error): Given any read/write error, Then the panel surfaces a non-secret error message (e.g. `e.message`) and never logs or renders the secret values to console.

## Out of scope

- productune engine env (`~/.productune/productune.env`) and MCP env editing — not this ticket.
- `.env` syntax beyond simple `KEY=value` (no multi-line values, no `export ` prefix parsing, no variable interpolation). Document the limitation in the empty/help text.
- Encryption-at-rest / OS keychain integration — masking + `0600` only for this pass.
- Git-ignore management for `.env` (assume already ignored).
- Per-version or history-scoped env — this is project-root scoped only.

## Plan

**New IPC handler — `packages/gui/electron/ipc/project.ts` (or a new `projectEnv.ts` registered alongside it):**

Reuse the `path`/`fs`/`{ mode: 0o600 }` pattern already proven in `electron/ipc/onboarding.ts` (`onboarding:complete` writes `productune.env` at `0o600`).

- `projectEnv:read` `(projectDir: string)` → `{ exists: boolean, entries: Array<{ key: string; value: string }>, raw: string }`. Parse `<projectDir>/.env` line-by-line; collect `KEY=value` into `entries`; keep `raw` for round-trip of comments/blank lines. Return `{ exists: false, entries: [], raw: '' }` when absent. NEVER log values.
- `projectEnv:write` `(projectDir: string, entries: Array<{key,value}>)` → `{ ok: boolean; error?: string }`. Re-serialize: walk the previous `raw` lines, replace the value for keys still present (in original position), append new keys at end, drop removed keys; preserve comment/blank lines. `fs.writeFileSync(path.join(projectDir, '.env'), content, { mode: 0o600 })`. On existing file, also `fs.chmodSync(path, 0o600)` to enforce perms even if the file pre-existed with looser mode. Wrap in try/catch → `{ ok:false, error: e.message }`.

**Preload — `packages/gui/electron/preload.ts`:** expose on `window.api`:
- `projectEnvRead: (projectDir) => ipcRenderer.invoke('projectEnv:read', projectDir)`
- `projectEnvWrite: (projectDir, entries) => ipcRenderer.invoke('projectEnv:write', projectDir, entries)`

**Renderer component — new `packages/gui/src/components/workspace/SidePanelProjectEnv.tsx`:**
- Read `projectDir` from `useWorkspace((s) => s.project)?.projectDir` (same source `SidePanelCurrentVersion` uses for the ticket scan).
- Render as a sibling `sp-section` immediately AFTER `<SidePanelCurrentVersion/>` in the side-panel container (find the parent that renders `SidePanelCurrentVersion` and insert below it). Reuse `sectionWrap` / `secHdrStatic` / `secHdrText` visual tokens from `SidePanelCurrentVersion.tsx` for consistency.
- State: `entries`, `revealed: Set<index>` (transient), `dirty`. Load on mount + on `projectDir` change; clear `revealed` on `projectDir` change.
- Per-row: key label (monospace, muted) + value field. Masked display when `!revealed.has(i)`; show real value only when revealed. Reveal toggle = lucide `Eye`/`EyeOff` icon button (per project icon doctrine — lucide-react, no color emoji).
- Save button enabled only when `dirty`; calls `projectEnvWrite`, then reloads + clears dirty. Inline validation for empty/duplicate key.
- Empty/missing → empty-state row + "add key" affordance.
- i18n: add keys under `settings`/`workspace` namespace as appropriate (follow existing `t('…')` usage); KO + EN strings.

### QA scope

| Area | Check |
|:--|:--|
| security | values masked on load; reveal is per-row + transient; written file is `0600` (`stat -f '%Lp'` → `600`); no secret in console/logs |
| round-trip | comments + blank lines + key order preserved across read→edit→write→read |
| edge | missing `.env`, empty `.env`, duplicate key rejected, empty key rejected, first-save creates file at 0600 |
| regression | side panel layout unaffected; current-version card unchanged above it |

## Outcome

null

## Persona Activity

| persona | session_id | started_at | completed_at | model | effort |
|:--|:--|:--|:--|:--|:--|
