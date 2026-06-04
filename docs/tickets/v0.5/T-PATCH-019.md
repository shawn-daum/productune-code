---
ticket_id: T-PATCH-019
version: v0.5
phase: 3
type: feature
status: done
assignee: pdt-developer
estimated_complexity: L2
risk_flags: ipc-path-whitelist, read-only-enforcement-in-main, persona-key-dir-split, t2-state-file-exclusion, conflict-detection
qa: true
qa_status: pass
qa_loops: 1
slug: doctrine-fs-ipc
depends_on: []
---

# T-PATCH-019: Doctrine tier filesystem + IPC layer

> Adds the Electron main-process IPC + fs layer that backs the Persona Tier Editor
> (feature #7). Enumerates each persona's 3 doctrine tiers and their `.md` files,
> reads any of them, and writes Tier-1 / Tier-2 files only — Tier-0 writes are
> rejected in the **main process**, not just hidden in the UI. No renderer / UI
> work in this ticket.

## Request

Introduce three new IPC channels (`doctrine:listTiers`, `doctrine:readFile`,
`doctrine:writeFile`) plus their preload bindings, with a strict per-persona
tier-root path whitelist. This is the first **human-direct full-file write** to
doctrine tier files (the only existing doctrine write is the promotion-gate
*append* in `electron/mechanical-write.ts`; `persona:writeSpec` writes agent
pointers under `~/.claude/agents/`, not doctrine). The renderer tab (T-PATCH-020)
consumes this layer.

### Tier → disk map (the whitelist this ticket enforces)

For each persona `<p>` ∈ { `po`, `designer`, `developer`, `qa` }. Note the runtime
persona-key → directory split already encoded in the GUI: the key `dev` maps to
the dir `developer` (see `PersonaDefTab.tsx` `LT_MEMORY`, lines 62-67). The IPC
takes the **dir name** (`developer`), and the caller is responsible for the
key→dir mapping; document this on the channel so T-PATCH-020 passes `developer`.

| Tier | Role       | Root pattern                                | Files                          | Writable |
|------|------------|---------------------------------------------|--------------------------------|----------|
| T0   | doctrine   | `~/.productune/doctrine/persona/<p>/`       | `habit.md`, `bookshelf/*.md`   | NO (read-only) |
| T1   | project    | `<projectDir>/docs/<p>/`                     | `habit.md`, `bookshelf/*.md`   | YES |
| T2   | personal   | `~/.productune/<p>/`                         | `habit.md`, `bookshelf/*.md`   | YES (`.md` only) |

Exclusions (must never appear in `listTiers`, must be rejected by `writeFile`):
- T2 non-doctrine runtime state: `po-state.json`, `usage-state.json`, any `*.json`,
  any `*.env` / env file, and any `state/**` subtree. Only `habit.md` and
  `bookshelf/*.md` are doctrine.
- The shared common Tier-0 (`~/.productune/doctrine/common/`) is not per-persona
  and is **out of scope** for this surface (open question deferred to design).

## Plan

Concrete sites (re-read against current files; line numbers below reflect the
current tree after this round's patches):

1. **New IPC module** `packages/gui/electron/ipc/doctrine.ts` exporting
   `register(): void` — mirror the shape of `electron/ipc/settings.ts`.
   - Persona dir whitelist: `const PERSONA_DIRS = new Set(['po','designer','developer','qa'])`.
     (Mirror `PERSONA_SPEC_IDS`, settings.ts:19.)
   - Tier-root resolver helper, e.g.
     `tierRoot(persona, tier): string | null` returning the absolute root for a
     `(persona, tier)` pair or `null` if persona unknown / projectDir missing:
     - T0 → `path.join(os.homedir(), '.productune', 'doctrine', 'persona', persona)`
     - T1 → `path.join(projectDir, 'docs', persona)`
     - T2 → `path.join(os.homedir(), '.productune', persona)`
   - Shared guard helper `isAllowedDoctrinePath(absPath, { write }): { ok; tier?; error? }`
     that, given a *resolved* absolute path:
     - `path.resolve()` the candidate, then confirm it equals one of the tier roots'
       allowed files **or** sits under `<root>/bookshelf/` — reject `..` traversal by
       containment check `resolved === root || resolved.startsWith(root + path.sep)`
       (clone the `memory:readFile` guard, settings.ts:122-125), AND additionally
       require the only allowed nesting be the immediate file under root
       (`habit.md`) or one level under `bookshelf/` (`bookshelf/<name>.md`).
     - require `path.extname(resolved).toLowerCase() === '.md'` (clone settings.ts:126-128).
     - reject T2 excluded patterns (`*.json`, env files, `state/**`) — by virtue of
       the `.md` + `habit.md | bookshelf/*.md` shape these are already excluded, but
       assert it explicitly so a future relaxation can't leak them.
     - if `write === true` and the resolved path is inside a **T0** root → return
       `{ ok: false, error: 'tier 0 is read-only' }`. This is the load-bearing
       main-process read-only enforcement.

2. **`doctrine:listTiers`** — `ipcMain.handle('doctrine:listTiers', (_e, persona, projectDir) => ...)`.
   - Reject unknown persona.
   - For each tier T0/T1/T2: build the root; enumerate `habit.md` (include row with
     `exists` flag even if absent so the navigator can render the "—" empty state)
     and `bookshelf/*.md` (filter to `.md`, sorted; tolerate a missing `bookshelf/`
     dir → empty list; `developer`/`qa` T0 have no bookshelf — must not throw).
   - Return shape (per file row): `{ tier: 0|1|2, persona, role, absPath, relName,
     editable: tier !== 0, exists, mtimeMs, sizeBytes }` plus a per-tier `root`.
     Group as `{ tiers: [{ tier, role, root, editable, files: [...] }] }`.
   - `mtimeMs` comes from `fs.statSync`; used by T-PATCH-020 conflict detection.

3. **`doctrine:readFile`** — `ipcMain.handle('doctrine:readFile', (_e, absPath) => ...)`.
   - Run `isAllowedDoctrinePath(absPath, { write: false })`; reject on failure.
   - If missing → `{ ok: true, content: '', exists: false, mtimeMs: null }`
     (clone settings.ts:130-131).
   - On success return `{ ok: true, content, exists: true, mtimeMs }` where `mtimeMs`
     is read from the same `statSync` used to read, so the renderer captures a
     read-time snapshot stamp for conflict detection.

4. **`doctrine:writeFile`** — `ipcMain.handle('doctrine:writeFile', (_e, absPath, content, expectedMtimeMs?) => ...)`.
   - Run `isAllowedDoctrinePath(absPath, { write: true })` — rejects all T0 paths,
     non-`.md`, traversal, and excluded T2 files.
   - **Conflict check (optional arg):** if `expectedMtimeMs` is provided and the file
     exists, compare against current `fs.statSync(absPath).mtimeMs`; if they differ
     return `{ ok: false, error: 'conflict', conflict: true, currentMtimeMs }` WITHOUT
     writing. (The on-disk file may have changed since read, e.g. an agent promotion
     append.) Leave this as the seam T-PATCH-022 will surface as a conflict modal.
   - **Atomic write:** `mkdirSync(dirname, { recursive: true })`, write to
     `absPath + '.tmp'`, `renameSync` into place — clone `persona:writeSpec`
     (settings.ts:99-102).
   - Return `{ ok: true, mtimeMs }` (the post-write stat mtime) so the renderer can
     refresh its snapshot without a re-read.

5. **Register the module** in `packages/gui/electron/main.ts`:
   - Add `import { register as registerDoctrine } from './ipc/doctrine'` alongside
     the other IPC imports (main.ts:5-19).
   - Add `registerDoctrine()` alongside the other `register*()` calls (main.ts:42-56).

6. **Preload bindings** in `packages/gui/electron/preload.ts` (add a
   "Doctrine tiers (T-PATCH-019, #7)" section near the persona-spec / memory
   bindings, preload.ts:470-479):
   - `doctrineListTiers: (persona: string, projectDir: string): Promise<{ tiers: Array<{ tier: 0|1|2; role: string; root: string; editable: boolean; files: Array<{ tier: 0|1|2; persona: string; role: string; absPath: string; relName: string; editable: boolean; exists: boolean; mtimeMs: number | null; sizeBytes: number | null }> }> } & { ok: boolean; error?: string }> => ipcRenderer.invoke('doctrine:listTiers', persona, projectDir)`
   - `doctrineReadFile: (absPath: string): Promise<{ ok: boolean; content?: string; exists?: boolean; mtimeMs?: number | null; error?: string }> => ipcRenderer.invoke('doctrine:readFile', absPath)`
   - `doctrineWriteFile: (absPath: string, content: string, expectedMtimeMs?: number | null): Promise<{ ok: boolean; mtimeMs?: number; conflict?: boolean; currentMtimeMs?: number; error?: string }> => ipcRenderer.invoke('doctrine:writeFile', absPath, content, expectedMtimeMs)`

### Acceptance Criteria

- [AC-1] `doctrine:listTiers('designer', projectDir)` returns three tiers; T0 files
  carry `editable: false`, T1/T2 files carry `editable: true`; bookshelf files are
  enumerated; a persona/tier with no `bookshelf/` dir (e.g. `developer` T0) returns
  an empty bookshelf list without throwing; `habit.md` rows are present with an
  `exists` flag even when absent.
- [AC-2] No T2 non-doctrine file (`po-state.json`, `usage-state.json`, any `*.json`,
  env files, `state/**`) ever appears in a `listTiers` result.
- [AC-3] `doctrine:writeFile` on any T0 path (resolved under
  `~/.productune/doctrine/persona/<p>/`) returns `{ ok: false }` with a read-only
  error and performs no disk write — verified by the main-process guard, independent
  of any UI.
- [AC-4] `doctrine:writeFile` on a valid T1 (`docs/<p>/habit.md`) and T2
  (`~/.productune/<p>/bookshelf/<f>.md`) path writes the full file atomically
  (tmp+rename) and returns the new `mtimeMs`.
- [AC-5] Path-traversal (`../`), non-`.md`, files outside the per-persona tier roots,
  and unknown personas are rejected by both `readFile` and `writeFile`.
- [AC-6] `doctrine:writeFile` with a stale `expectedMtimeMs` (file changed on disk
  since the captured stamp) returns `{ ok: false, conflict: true, currentMtimeMs }`
  and does NOT overwrite.
- [AC-7] `doctrine:readFile` / `writeFile` return an `mtimeMs` usable as a read-time
  snapshot stamp for conflict detection.
- [AC-8] `pnpm tsc --noEmit` passes (new preload method types compile).
- [AC-9] `pnpm lint` passes.

## Out of scope

- All renderer / UI: tab type, pane component, navigator, dispatcher wiring
  (→ T-PATCH-020 / T-PATCH-021).
- The save-flow choice (direct write vs PO-review). This ticket exposes a plain
  whitelisted `writeFile`; the direct-vs-gate decision lives behind the
  T-PATCH-020 `onSave` seam and is finalized in T-PATCH-022.
- Conflict-resolution **UX** (modal). This ticket only returns the `conflict` signal;
  the modal is T-PATCH-022.
- Bookshelf file create / delete (v1 edits existing files only).
- Shared common Tier-0 (`~/.productune/doctrine/common/`) and any 5th "common"
  pseudo-persona (deferred open question).
- Doctrine line-cap (50/100/100) computation / advisory badge (UI concern,
  T-PATCH-020).
