---
ticket_id: T-PATCH-035
version: v0.5
phase: 3
type: impl
status: done
assignee: pdt-developer
qa: true
slug: persona-tab-title
---

# T-PATCH-035: Persona-def tab title diverges by entry point

> Follow-up to T-PATCH-014. T-014 unified the persona-def **tab id**
> (`persona-def:pdt-<persona>`) so palette + Team panel dedup-focus the SAME tab.
> This ticket unifies the **title** of that one tab.

## Request — root cause

The deduped persona-def tab showed a different name depending on which surface
opened it first, because the three title sources disagreed for the same tab id:

- **Search palette** (`views/workspace/shell/helpers.ts:298`) passed title `slug`
  → `"pdt-po"` (raw id).
- **Team panel** (`components/workspace/TeamPanel.tsx`) passed title `t(def.nameKey)`
  → `"PO"` (localized name).
- **defaultTitle** (`store/workspace.ts` `persona-def` case) returned
  `props.persona` → `"pdt-po"` (raw id).

`openTab` dedup (`store/workspace.ts:373-394`) focuses the existing tab and never
re-applies the incoming title, so the displayed name was whatever the first opener
supplied → same tab, two possible names = 혼란.

## Acceptance

- [x] **[AC-1]** One canonical persona-def tab title regardless of entry point
      (palette vs Team panel) — the deduped tab shows ONE stable name.
- [x] **[AC-2]** Single source of truth: `personaDefTitle(personaId)` in
      `store/workspace.ts`, used by `defaultTitle('persona-def')`. Both callers
      omit their explicit title arg and fall through to it.
- [x] **[AC-3]** Canonical title = localized persona name (consistent with the
      Team panel rows), via existing `workspace.team.persona.<bare>.name` keys —
      ko/en parity, no new keys.
- [x] **[AC-4]** Unknown / missing persona id falls back to the raw id (never the
      literal i18n key path).
- [x] **[AC-5]** `pnpm tsc --noEmit` green · `pnpm lint` green.

## Plan — file:line sites

1. `store/workspace.ts`: add exported `personaDefTitle(id)` — maps full `pdt-*`
   id → `i18next.t('workspace.team.persona.<bare>.name')`, with raw-id fallback on
   i18n miss. `pdt-developer` → `developer` bare key (locale namespace uses the
   doctrine dir name, not the `dev` dot-key).
2. `store/workspace.ts` `defaultTitle` `persona-def` case → `personaDefTitle(props.persona)`.
3. `helpers.ts:298` (palette): drop the trailing `slug` title arg → fall through
   to `defaultTitle`.
4. `TeamPanel.tsx` `handlePersonaClick`: drop the trailing `t(def.nameKey)` title
   arg → fall through to `defaultTitle`. (`t` still used elsewhere in the file.)

## Out of scope

- Tab id scheme (already unified in T-PATCH-014).
- PersonaDefTab rendering / spec content.

## QA hint

Open a persona from the search palette (e.g. type "pdtpo"), then open the same
persona's row in the Team panel (and vice versa): exactly one tab, and its title
stays the localized name ("PO") for both entry orders. In `en` and `ko` the title
is the same localized persona name; switching locale re-derives via defaultTitle on
next open.
