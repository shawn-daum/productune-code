---
ticket_id: T-PATCH-084
version: v0.5
slug: remove-user-mode
title: Remove User Mode entirely (settings · store · i18n resolver · modal/onboarding consumers)
type: refactor
status: done
phase: 3
assignee: pdt-developer
requires_qa: true
requires_user_gate: false
area_tag: gui-user-mode-removal
estimated_complexity: L3
risk_flags:
  - behavior-collapse-deploy-conflict-modals
  - sequence-after-T-PATCH-080-tmode-conflict
  - footprint-larger-than-prd-scope
created_at: 2026-06-10T00:00:00Z
---

# T-PATCH-084: Remove User Mode entirely

## Request

User approved removing the dead **User Mode** setting. Remove: the GeneralSettings
section, the `useUserMode` store, the `useUserModeT` resolver (replace `tMode`
call sites with plain `t`), and the `user-mode.json` read/write helpers in core.

⚠️ **Footprint is larger than the PO brief stated.** A reference scan found the
setting reaches **more consumers than "only `useUserModeT`"**, and the brief's two
factual claims are both wrong:

1. **"Zero `.dev` keys exist"** — FALSE. `en.json` (and `ko.json`) carry 6 dev-variant
   keys under `workspace.ticketDetail`: `statusBlocked.dev`, `statusUserVerify.dev`,
   `statusQaPending.dev`, `statusDone.dev`, `railActive.dev`, `railIdle.dev`. So
   `useUserModeT` is NOT inert — when mode = `developer`, `TicketDetailTab` renders
   dev-variant status/rail labels.
2. **"No behavior anywhere"** — FALSE. `DeployConfirmModal` and `ConflictResolveModal`
   read `isDev = userMode === 'developer'` and branch on it (modal title / body
   wording / ticket-id display).

**Why removal is still safe:** there is **no `setUserMode`/`getUserMode` IPC in the
electron source** (only stale `dist-electron` build artifacts). So the store's
`api.setUserMode` / `api.getUserMode` calls always throw → caught → mode never
persists and resets to the in-memory default `planner` on every launch. The dev
variants are only ever visible *within a session* after a user manually flips to
Developer in Settings. Removing the setting **collapses every consumer to its
planner / non-dev branch** — which is already the default-on-launch behavior.

This collapse is a (cosmetic) behavior change and is acknowledged here, not silent.

## Acceptance

### R2a — settings core (`packages/core/src/settings/ui-settings.ts` + `index.ts`)

- AC-1: Delete `UserMode` type, `USER_MODE_PATH`, `getUserMode()`, `setUserMode()`.
- AC-2: Remove `getUserMode`, `setUserMode`, and the `UserMode` type from
  `core/src/index.ts` exports.
- AC-3: `~/.productune/user-mode.json` is no longer read or written by any code
  path (leave any existing file on disk untouched — orphaned, harmless).

### R2b — store + resolver (delete)

- AC-4: Delete `packages/gui/src/store/useUserMode.ts`.
- AC-5: Delete `packages/gui/src/i18n/useUserModeT.ts`.

### R2c — `TicketDetailTab.tsx` (coordinate with T-PATCH-080)

- AC-6: Replace every `tMode(...)` call with `t(...)` (15 call sites + the param
  type `TModeFn` → `TFunction`); remove the `useUserModeT` import; derive `t` from
  `useTranslation()` (or keep existing `t`).
- AC-7: `buildRail` / `deriveNextAction` signatures take `t` instead of `tMode`.
- AC-8: Delete the 6 `.dev` keys (`statusBlocked.dev`, `statusUserVerify.dev`,
  `statusQaPending.dev`, `statusDone.dev`, `railActive.dev`, `railIdle.dev`) from
  both `en.json` and `ko.json`. **Also delete `showFullSpec.dev` / `hideFullSpec.dev`
  if T-PATCH-080 added them** (see §coordination) and convert T-080's two new
  `tMode` calls to `t`.

### R2d — GeneralSettings.tsx

- AC-9: Remove the User-Mode section (lines ~49-71), the surrounding `divider`,
  the `useUserMode`/`UserMode` imports, the `mode`/`setMode` selectors, and
  `handleModeChange`. The Language section and `ClaudeConnection` remain.

### R2e — modal consumers (behavior collapse to non-dev)

- AC-10: `ConflictResolveModal.tsx` — remove `useUserMode` import + `userMode`/`isDev`;
  delete the `isDev && <span style={devHint}> (conflict)</span>` (collapses to the
  planner branch = hint hidden). Remove now-unused `devHint` style if orphaned.
- AC-11: `DeployConfirmModal.tsx` — remove `useUserMode` import + `userMode`/`isDev`;
  collapse `title`, `bodyIntro`, and the `isDev && <span>{tk.id}</span>` to their
  non-dev (planner) branches. Remove now-unused dev-only styles/strings if orphaned.

### R2f — orphaned components (delete)

- AC-12: `Step0_5UserMode.tsx` (onboarding step) — confirmed **not imported**
  anywhere → delete the file.
- AC-13: `UserModeBanner.tsx` — confirmed **not mounted** and references
  `workspace.userModeBanner.*` keys that **do not exist** in the locales → delete
  the file. (No banner locale keys to remove — they were never added.)

### R2g — verification

- AC-14: Repo-wide grep for `useUserMode`, `useUserModeT`, `tMode`, `UserMode`,
  `getUserMode`, `setUserMode`, `user-mode`, `userMode`, `settings.general.userMode`
  returns **zero hits in source** (`packages/*/src`, `packages/gui/electron`,
  excluding `dist-electron` build output).
- AC-15: `settings.general.userMode.*` removed from `en.json` + `ko.json`.
- AC-16: `tsc`/build passes; GUI mounts; Deploy + Conflict modals render their
  planner-variant copy; TicketDetail renders planner-variant status/rail labels.

## Out of scope

- Deleting the stale `dist-electron/*.js` artifacts (regenerated on next build).
- Deleting any existing `~/.productune/user-mode.json` on a user's disk.
- Re-designing the Deploy / Conflict modal copy beyond collapsing the branch.
- Adding a replacement preference for the removed dev/planner distinction.

## Plan

### §coordination — CRITICAL
- **Sequence AFTER T-PATCH-080.** T-080 (R3) ADDS two new `tMode` calls at the
  showFullSpec line plus `showFullSpec.dev` / `hideFullSpec.dev` locale keys. This
  ticket removes `tMode` wholesale. Running T-084 first would be undone by T-080.
  Order: **T-080 → T-084**. T-084 owns the final `tMode → t` sweep INCLUDING T-080's
  two additions, and deletes the two `.dev` keys T-080 introduces.
- **Shared file w/ T-PATCH-083** — both edit `GeneralSettings.tsx` + locales.
  Recommended global order: **T-080 → T-084 → T-083**.
- If the team prefers, T-080 + T-084 may be **merged into one developer session** on
  `TicketDetailTab.tsx` to avoid the add-then-remove churn (PO decision).

| # | File | Change |
|---|---|---|
| 1 | `core/src/settings/ui-settings.ts` | Delete `UserMode`, `USER_MODE_PATH`, `getUserMode`, `setUserMode` (AC-1). |
| 2 | `core/src/index.ts` | Drop the 2 fn + `UserMode` type exports (AC-2). |
| 3 | `gui/src/store/useUserMode.ts` | Delete file (AC-4). |
| 4 | `gui/src/i18n/useUserModeT.ts` | Delete file (AC-5). |
| 5 | `gui/src/components/workspace/main/panes/TicketDetailTab.tsx` | `tMode → t` sweep, signatures, import removal (AC-6/7); incl. T-080's 2 new calls. |
| 6 | `gui/src/components/workspace/GeneralSettings.tsx` | Remove User-Mode section + wiring (AC-9). |
| 7 | `gui/src/components/workspace/ConflictResolveModal.tsx` | Remove isDev + dev hint (AC-10). |
| 8 | `gui/src/components/workspace/DeployConfirmModal.tsx` | Remove isDev, collapse title/body/ticketId (AC-11). |
| 9 | `gui/src/components/onboarding/Step0_5UserMode.tsx` | Delete file (AC-12). |
| 10 | `gui/src/components/workspace/UserModeBanner.tsx` | Delete file (AC-13). |
| 11 | `gui/src/locales/en.json` | Remove `settings.general.userMode.*` + 6 ticketDetail `.dev` keys (+ T-080's 2 `.dev` keys) (AC-8/15). |
| 12 | `gui/src/locales/ko.json` | Same removals as en.json. |

### §QA scope
| Area | Check |
|---|---|
| grep-clean | AC-14 grep returns zero source hits. |
| build | `tsc` + GUI build pass; no dangling imports of deleted modules. |
| deploy modal | Renders planner-variant title/body; no ticket-id dev span; no console errors. |
| conflict modal | Renders without the `(conflict)` dev hint. |
| ticket detail | Status + rail labels render planner variants; no missing-key fallback. |
| onboarding | Onboarding flow runs end-to-end with Step0_5 gone (confirm it was never in the sequence). |
| settings | General tab shows Language + Claude connection only (+ Notifications if T-083 merged); no User-Mode block. |

## Outcome
<null — Phase 5>

## Persona Activity
<PO-managed>
