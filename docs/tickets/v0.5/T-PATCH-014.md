---
ticket_id: T-PATCH-014
version: v0.5
phase: 3
type: impl
status: done
assignee: pdt-developer
estimated_complexity: L2
risk_flags: [tab-identity, dual-open-path, dedup-key]
qa: true
qa_status: pass
qa_loops: 1
slug: persona-tab-unify
---

# T-PATCH-014: Persona tab identity — palette vs TeamPanel spawn divergent duplicates

> Phase 3 patch. Same persona opened from two surfaces produces two different tabs
> instead of focusing the one existing tab. Root cause is a tab-id mismatch, not a
> render bug — content renders fine in both because `PersonaDefTab` already accepts
> both prop shapes.

## Request — root cause

The persona-def tab is opened from **two divergent code paths that compute different tab ids**.
`openTab` dedup (`store/workspace.ts:344-357`) matches on **exact `tab.id`**, so the two ids
never coalesce and a duplicate tab is spawned.

- **Search palette path** — `views/workspace/shell/helpers.ts:297`
  ```
  open: () => openTab(`persona-def:${slug}`, 'persona-def', { persona: slug }, slug)
  ```
  `slug` comes from `PERSONAS = ['pdt-po', 'pdt-designer', 'pdt-developer', 'pdt-qa']`
  (`helpers.ts:149`), so tab id = **`persona-def:pdt-po`**, prop key = `persona`, title = `pdt-po`.

- **TeamPanel persona-row path** — `components/workspace/TeamPanel.tsx:114-121`
  ```
  openTab(`persona-def:${def.key}`, 'persona-def', { personaKey: def.key }, t(def.nameKey))
  ```
  `def.key` is the short key (`po|designer|dev|qa`), so tab id = **`persona-def:po`**,
  prop key = `personaKey`, title = localized name.

Result: opening "pdtpo" from the palette creates `persona-def:pdt-po`; the "PO" persona
row creates `persona-def:po`. Two distinct ids → two tabs for the same persona. Contents
render in both because `PersonaDefTab.tsx:97-100` derives `personaId` from **either** prop
(`persona` direct, or `personaKey` via `KEY_TO_ID`, `PersonaDefTab.tsx:10-15`) — masking the
identity split.

T-PATCH-009 #5a normalized the palette **slug → `persona:readSpec`** id mapping but did NOT
unify the **tab id** between the two open paths; the TeamPanel path was out of that ticket's
scope. This ticket closes that gap.

## Acceptance

- [ ] **[AC-1]** Opening a persona from the search palette (`persona:pdt-po`) and from the
      TeamPanel persona row resolve to the **same** tab id; opening one while the other is
      already open **focuses the existing tab** (no duplicate).
- [ ] **[AC-2]** A single canonical tab-id scheme for `persona-def` is used by both
      `helpers.ts` and `TeamPanel.tsx` (one source of truth — full canonical id
      `pdt-*`, consistent with `helpers.ts:149` `PERSONAS`).
- [ ] **[AC-3]** Both paths pass a prop shape `PersonaDefTab` resolves to the same
      `personaId` (no `Unknown persona` for either entry point), and the tab title is
      consistent across both surfaces.
- [ ] **[AC-4]** `defaultTitle` for `persona-def` (`store/workspace.ts:607`) still yields a
      sensible title under the unified prop shape.
- [ ] **[AC-5]** `pnpm tsc --noEmit` passes.

## Plan — file:line sites

1. **Choose the canonical tab-id scheme** = full id `persona-def:pdt-<persona>` (matches the
   palette `PERSONAS` ids and the `KEY_TO_ID` target). Document it once.
2. **TeamPanel** (`components/workspace/TeamPanel.tsx:114-121`): change `handlePersonaClick`
   to open `persona-def:${def.id}` (full `pdt-*` id, already on `PersonaDef.id` `TeamPanel.tsx:26,34-37`)
   and pass the same prop key the palette uses (`{ persona: def.id }`) so both ids and props match.
3. **helpers.ts** (`views/workspace/shell/helpers.ts:289-298`): leave the palette id scheme as
   `persona-def:${slug}` (already full id) — only verify it equals the scheme TeamPanel now uses.
4. **Verify dedup** at `store/workspace.ts:344-357` now coalesces (no code change expected —
   it already matches on `tab.id`; the fix is making the two ids equal).
5. **Optional cleanup**: if both paths now pass `{ persona }`, the `personaKey` branch in
   `PersonaDefTab.tsx:98-100` + `KEY_TO_ID` become dead — remove only if no other caller
   passes `personaKey` (grep `personaKey` first; keep if WorkspaceShell or others rely on it).

## Out of scope

- Changing `PersonaDefTab` rendering / spec content.
- The MCP empty-list bug (T-PATCH-015).
- Persona presence dot / activity-meta logic.
