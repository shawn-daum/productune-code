---
ticket_id: T-PATCH-020
version: v0.5
phase: 3
type: feature
status: done
assignee: pdt-developer
estimated_complexity: L2
risk_flags: tab-type-union, dual-render-mode, tier-0-read-only, persist-partialize, onsave-seam
qa: true
qa_status: pass
qa_loops: 1
slug: doctrine-file-tab
depends_on: [T-PATCH-019]
---

# T-PATCH-020: `doctrine-file` tab type + pane (read-only T0 / editable T1·T2)

> Adds a single new `doctrine-file` tab type with two render modes driven by a
> `tier` prop: Tier-0 renders read-only (ArtifactMdTab pattern + lock badge),
> Tier-1 / Tier-2 render editable (PersonaDefTab Preview/Edit/Save pattern). Loads
> and saves via the T-PATCH-019 IPC. One tab type covers both modes to avoid two
> near-duplicate types.

## Request

Implement the main-panel surface that opens a doctrine tier file. The design fixes
Tier-0 as read-only and Tier-1 / Tier-2 as editable (firm user decision). Reuse the
two existing pane interactions: `ArtifactMdTab` (read-only viewer + Lock badge) for
T0, and the `PersonaDefTab` spec-editor (Preview ⇄ Edit toggle, monospace textarea,
Save / Cancel, inline error + "saved") for T1/T2. Wire the new type into the tab
dispatcher and the workspace store, following the exact pattern the `code-view` tab
type established in T-PATCH-016.

Leave a clean `onSave` prop seam so T-PATCH-022 can inject the direct-vs-PO-review
save dialog; the default in this ticket is a **direct write** via
`doctrine:writeFile`.

## Plan

Concrete sites (re-read against the current tree; line numbers reflect this round's
patches):

1. **Tab type union** — `packages/gui/src/store/workspace.ts`:
   - Add `| 'doctrine-file'` to the `TabType` union (currently ends at
     `'code-view'`, workspace.ts:33). Follow the exact spot/format `code-view` used.
   - Add a `defaultTitle` case in the switch (workspace.ts:641-669, sibling to the
     `code-view` case at line 666):
     `case 'doctrine-file': return (props?.relName as string) ?? (props?.path as string)?.split('/').pop() ?? 'Doctrine'`.
   - **Persist note:** the `partialize` (workspace.ts:632-638) only persists
     `panes / activePaneId / nextPaneSeq / selectedVersionId / persistedProjectDir`;
     tab `props` ride inside `panes`, so a restored `doctrine-file` tab must be able
     to **re-derive its content from props alone** (it does — it reloads from disk
     via IPC on mount). No new partialize field is needed; mirror how `code-view`
     persists. Do NOT persist file content into the store.

2. **New pane component** `packages/gui/src/components/workspace/main/panes/DoctrineFileTab.tsx`:
   - Props shape: `{ props?: Record<string, unknown> }` with expected keys
     `{ tier: 0|1|2, persona: string, absPath: string, relName: string,
        editable?: boolean, onSave?: (absPath: string, content: string, expectedMtimeMs: number | null) => Promise<{ ok: boolean; conflict?: boolean; error?: string; mtimeMs?: number }> }`.
     `editable` is derived as `tier !== 0` if not explicitly passed.
   - On mount load content via `window.api.doctrineReadFile(absPath)`; capture
     `mtimeMs` into a snapshot ref/state for conflict detection on save.
   - **T0 (read-only) mode** — reuse the `ArtifactMdTab` visual pattern
     (`ArtifactMdTab.tsx`): header bar with breadcrumb (split `relName` / `absPath`)
     + the existing Lock badge using `t('workspace.common.readOnly')`
     (ArtifactMdTab.tsx:91-94; key exists at en/ko `workspace.common.readOnly`),
     body = `MdRenderer` (`src/components/workspace/chat/MdRenderer.tsx`), no
     edit/preview toggle, no Save. Either render `ArtifactMdTab` directly when its
     props line up, or lift its read-only body markup — prefer composing
     `MdRenderer` + the same Lock badge so the load path uses `doctrineReadFile`
     (ArtifactMdTab today loads via `artifactsReadFile`, a different IPC).
   - **T1/T2 (editable) mode** — reuse the `PersonaDefTab` spec-editor interaction
     (`PersonaDefTab.tsx:206-246` for the markup; :97-141 for the
     edit/save/cancel handlers): Preview (MdRenderer) ⇄ Edit (monospace `textarea`
     seeded from the last read), Save / Cancel buttons, inline `specError` /
     `specSaved` states. Reuse the `specTextarea` / `specActionBtn` style shapes.
   - **Save handler:** call `props.onSave ?? defaultSave`, where `defaultSave =
     (absPath, content, expectedMtimeMs) => window.api.doctrineWriteFile(absPath, content, expectedMtimeMs)`.
     On `{ ok: true, mtimeMs }` → exit edit mode, show "saved", update the snapshot
     mtime. On `{ ok: false, conflict: true }` → surface a minimal inline conflict
     message for now (full `ConflictResolveModal` UX is T-PATCH-022; do not block on
     it). On `{ ok: false, error }` → inline error.
   - **Non-blocking line-cap badge (advisory only):** show a `relName — N/CAP`
     badge in the editable header where CAP = 100 for persona `habit.md` and
     bookshelf files (50 only applies to the common-habit which is out of scope
     here). Over-cap styling is advisory; it must NOT disable Save. Keep this purely
     visual; no enforcement.
   - Loading / error states: mirror `ArtifactMdTab` (`Loader2` spinner, error banner
     + retry).

3. **Dispatcher** — `packages/gui/src/components/workspace/main/TabContent.tsx`:
   - Add `import DoctrineFileTab from './panes/DoctrineFileTab'` with the other pane
     imports (TabContent.tsx:1-21).
   - Add `case 'doctrine-file': return <DoctrineFileTab props={tab.props} />` in the
     switch, sibling to the `code-view` case (TabContent.tsx:58-59).

4. **i18n** — add minimal keys under `workspace` in `src/locales/en.json` and
   `src/locales/ko.json` for the editable mode if not already covered by the reused
   `PersonaDefTab` keys (`workspace.personaDef.specEdit` / `specSave` / `specSaved`
   exist and may be reused; if reused as-is no new keys needed). Add an over-cap
   advisory tooltip string only if introduced. Korean strings stay conversational;
   protected vocab (Tier 0/1/2, paths) stays in English.

5. **Open path (caller seam, not the navigator):** the navigator that lists files
   and calls `openTab(tabId, 'doctrine-file', { tier, persona, absPath, relName, editable }, title)`
   is T-PATCH-021. This ticket only needs a way to exercise the tab — a temporary
   dev trigger or a unit-level open is sufficient for QA; do not build the
   navigator here. The `openTab` store action (workspace.ts:372-394) already
   dedupes by tab id, so use a stable `tabId` like `doctrine:<absPath>`.

### Acceptance Criteria

- [AC-1] Opening a `doctrine-file` tab with `tier: 0` renders the file read-only via
  `MdRenderer` with the Lock / read-only badge and shows **no** edit, preview-toggle,
  or Save affordance.
- [AC-2] Opening a `doctrine-file` tab with `tier: 1` or `tier: 2` renders a
  Preview ⇄ Edit toggle, a monospace textarea seeded with on-disk content, and
  Save / Cancel controls (PersonaDefTab pattern).
- [AC-3] Saving in editable mode calls the injected `onSave` (default =
  `doctrineWriteFile`), passing the read-time `expectedMtimeMs`; on success the tab
  exits edit mode, shows "saved", and updates its snapshot mtime.
- [AC-4] A save that returns `{ conflict: true }` does not silently overwrite; the
  tab surfaces a conflict indication (inline is acceptable in this ticket; full
  modal is T-PATCH-022).
- [AC-5] The editable header shows a non-blocking `N/CAP` line-count badge that
  never disables Save (advisory only).
- [AC-6] `doctrine-file` is added to the `TabType` union with a `defaultTitle` case;
  the `TabContent` switch stays exhaustive; a restored (sessionStorage-rehydrated)
  `doctrine-file` tab reloads its content from disk via props alone (no content
  persisted in the store).
- [AC-7] `onSave` is an injectable prop with a direct-write default — the
  direct-vs-PO-review decision is reachable without touching this component
  (clean seam for T-PATCH-022).
- [AC-8] `pnpm tsc --noEmit` passes.
- [AC-9] `pnpm lint` passes.

## Out of scope

- The `doctrine` Activity icon + left-sidebar persona/tier navigator (→ T-PATCH-021).
- Conflict-resolution modal, dirty-close guard (`BaseDirtyModal`), and saved/error
  toasts (→ T-PATCH-022). This ticket only emits the inline conflict/error signal
  and the `onSave` seam.
- The final save semantics choice (direct write vs promotion-gate). Default is
  direct write; the alternative is wired via `onSave` in T-PATCH-022.
- Line-cap **enforcement** / save blocking (badge is advisory only).
- Bookshelf file create / delete.
- Any change to the T-PATCH-019 IPC contract.
