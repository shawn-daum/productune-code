---
ticket_id: T-PATCH-009
version: v0.5
phase: 3
type: bug
status: done
assignee: pdt-developer
estimated_complexity: L5
qa: true
qa_status: pass
qa_loops: 1
completed_at: 2026-06-04
risk_flags: dead-path, enum-drift, broad-component-touch, onboarding-seed
slug: gui-doctrine-migration-debt
---

# T-PATCH-009: GUI doctrine-migration debt + MCP detection (#11, #5a, #5b, #7)

> Phase 3-B patch. Four confirmed bugs left by the doctrine redesign + MCP detection.
> Grounded in code; do NOT re-investigate from scratch — sites are listed.

## Request

GUI still references doctrine artifacts that were deleted/renamed in the 4-tier redesign, leaks the
abolished `wiki-keeper` persona, mismatches persona ids end-to-end, and fails to detect a registered
MCP server. Repoint / remove / normalize / fix-detection.

### #11 — Long-term memory viewer dead path
- `~/.productune/po-memory.md` is DEAD. Repoint every persona to its Tier-2 long-term memory file
  `~/.productune/<persona>/habit.md` (PO → `~/.productune/po/habit.md`).
- Sites: `PersonaDefTab.tsx:68` (`LT_MEMORY.po`), `TeamWikiTab.tsx:91` (user-memory row),
  `en.json:110` / `ko.json:110` ("Initialize PO memory (po-memory.md)" → habit.md wording).
- `onboarding.ts:466-468` re-seeds `po-memory.md` from a template — retire that seed (the Tier-2
  habit.md is installed by the doctrine install path, not GUI-seeded).
- Verify each persona's Tier-2 file under the 4-tier model and repoint all four LT_MEMORY rows
  consistently (po/designer/dev/qa).

### #5b — Abolished wiki surface still present
- The wiki tier was abolished (T-017). Remove the wiki surface so `wikikeeper` no longer appears
  in the search palette, tabs, or onboarding.
- Sites: `helpers.ts:146` (`PERSONAS` includes `'pdt-wiki-keeper'`) + `:284` (its dot mapping);
  `TeamWikiTab.tsx`; onboarding `Step3_WikiBackend.tsx`, `Step3_5_LocalLLM.tsx`,
  `onboarding/types.ts`; `store/workspace.ts` wiki refs (`team-wiki` tab type/title :543);
  `OnboardingWizard.tsx`; locale wiki strings. Retire the surface (remove or hide end-to-end).

### #5a — Palette persona → "unknown persona"
- Palette emits `persona:pdt-*` slugs (`helpers.ts:280-295`); `settings.ts:19` allowlist is
  `pdt-po|pdt-designer|pdt-developer|pdt-qa`. The abolished `pdt-wiki-keeper` hard-fails, and the
  short-id (`po|designer|dev|qa`) vs full-id (`pdt-*`, `dev` vs `developer`) split causes mismatch.
- Normalize the id mapping end-to-end (palette item → openTab persona-def → `persona:readSpec`).
  Single source of truth for the 4 canonical ids; no `wiki-keeper`.

### #7 — "No MCP servers connected" (detection bug)
- INVESTIGATE FIRST, then fix. Confirmed on disk: `~/.claude.json`
  `projects[<productune dir>].mcpServers` contains `playwright`, but GUI shows none.
- `mcp:getServers` (mcp.ts:70-105) keys the local tier by exact `projectDir`
  (`claudeJson.projects?.[projectDir]?.mcpServers`). Confirm the caller passes the correct
  `projectDir` (preload.ts:430) and that key normalization (trailing slash / realpath / casing)
  matches the `~/.claude.json` key. Fix the mismatch so registered servers surface.
- Note genuine gap: `graphiti` (referenced in `PersonaDefTab` `mcpServers`) is NOT registered in
  any tier — flag as not-a-bug (config gap), do not fabricate it.

## Acceptance

- [ ] **[AC-1]** Long-term memory viewer opens the live Tier-2 file for each persona
      (PO → `~/.productune/po/habit.md`); no `po-memory.md` reference remains in `packages/gui`.
- [ ] **[AC-2]** `onboarding.ts` no longer seeds `po-memory.md`.
- [ ] **[AC-3]** `wikikeeper` / wiki surface no longer appears in search palette, tabs, or onboarding.
- [ ] **[AC-4]** Selecting any of the 4 personas in the palette (`p:`) opens its spec — no
      "unknown persona".
- [ ] **[AC-5]** With `playwright` registered for the productune dir, the MCP panel/palette lists it.
- [ ] **[AC-6]** `pnpm tsc --noEmit` passes; no dead i18n keys left dangling.

## Plan

1. #11: introduce/confirm a single `LT_MEMORY` map → `~/.productune/<persona>/habit.md`; repoint
   TeamWikiTab user-memory row; fix en/ko strings; remove onboarding po-memory seed.
2. #5b: delete `pdt-wiki-keeper` from `PERSONAS`; remove wiki tab type + TeamWikiTab + onboarding
   wiki steps + store wiki refs + locale wiki keys.
3. #5a: define canonical ids once; ensure palette slug == allowlist id end-to-end.
4. #7: log the `projectDir` actually passed vs the `~/.claude.json` key, normalize, fix; verify
   playwright surfaces; document graphiti as a config gap.

## Out of scope

- doctrine *content* changes; registering `graphiti` (config, not GUI).
