---
ticket_id: T-PATCH-012
version: v0.5
phase: 3
type: bug
status: done
assignee: pdt-developer
estimated_complexity: L3
qa: true
qa_status: pass
qa_loops: 1
completed_at: 2026-06-04
risk_flags: onboarding-flow-sequence, step-renumber, env-write
slug: onboarding-wiki-full-removal
---

# T-PATCH-012: Onboarding memory-backend / graphiti step — full removal

> Ad-hoc cleanup. T-PATCH-009 removed the wikikeeper user surface but intentionally left the
> live onboarding "Memory backend" step (Step 3 / Step 3.5) running. This ticket finishes the job.

## Request

Remove the graphiti / WIKI_BACKEND onboarding flow end-to-end so no trace remains in the renderer,
main process, or i18n files.

**Files to delete:**
- `src/views/onboarding/Step3_WikiBackend.tsx`
- `src/views/onboarding/Step3_5_LocalLLM.tsx`

**Types — `src/views/onboarding/types.ts`:**
- Remove `WikiBackend` type (`'filesystem' | 'graphiti'`)
- Remove `GraphitiConfig` interface
- Remove `LlmPhase` type
- Remove `HardwareInfo` interface (only used by the wiki-backend step)
- Update `WizardStep`: remove `3` and `'3.5'`; new sequence is `0 | 1 | 2 | 3` where the
  former Step 4 becomes Step 3.

**`src/views/OnboardingWizard.tsx`:**
- Remove all imports of `Step3_WikiBackend`, `Step3_5_LocalLLM`
- Remove all state vars for the wiki/graphiti/hardware/LLM flow:
  `wikiBackend`, `hardware`, `detectingHw`, `redetecting`, `installPhase`, `dockerLogs`,
  `installError`, `llmPhase`, `selectedModel`, `installedModels`, `llmLogs`, `llmError`,
  `graphitiConfig`
- Remove the `useEffect` hooks that gate on `step === 3` (hardware detection) and
  `step === '3.5'` (model listing), and the docker-install state-reset effect
- Remove `startDockerInstall`, `startLLMSetup`, `redetectHardware` handlers
- Remove `wikiBackend` from `completeOpts` in the step-4 completion effect; remove the
  `graphitiConfig` conditional
- Update step routing: Step 2 "Next" → `setStep(3)` (was 3, now renumbered completion step);
  renumber the old Step 4 render block to `step === 3`; update step-indicator dot array
  to `[0, 1, 2, 3]`
- The `onPrev` of the completion step should go back to `setStep(2)`

**`electron/ipc/onboarding.ts`:**
- Remove the `WIKI_BACKEND` env write (line 415–418 region: `wikiBackend`/`backendVal`/
  `WIKI_BACKEND=...`)
- Remove the `wikiBackend` field from the `completeOnboarding` options type/destructure
- Remove any IPC handlers that solely serve the wiki step:
  `detectHardware`, `installDocker`, `onDockerLog`, `installLocalLLM`, `onInstallProgress`,
  `setupGraphiti`, `onGraphitiProgress`, `registerGraphitiMCP`, `listOllamaModels`
  (confirm each is used only by the wiki flow before deleting)

**`electron/preload.ts`:**
- Remove the preload bridge entries for the IPC handlers listed above

**i18n — `src/locales/en.json` and `src/locales/ko.json`:**
- Remove the `onboarding.wiki` key tree (confirmed at `en.json:75-76` region and its full subtree)

**Remaining step count:** the wizard will show 4 dots (steps 0–3). Update the step indicator
in `OnboardingWizard.tsx` accordingly.

## Acceptance

- [ ] **[AC-1]** `Step3_WikiBackend.tsx` and `Step3_5_LocalLLM.tsx` are deleted.
- [ ] **[AC-2]** `WikiBackend`, `GraphitiConfig`, `LlmPhase`, `HardwareInfo` types are gone from
      `onboarding/types.ts`.
- [ ] **[AC-3]** `WizardStep` is `0 | 1 | 2 | 3`; step indicator shows 4 dots; completion step
      is reachable from step 2 and the wizard completes correctly end-to-end.
- [ ] **[AC-4]** `WIKI_BACKEND` is not written to the `.env` file during onboarding completion.
- [ ] **[AC-5]** No `graphiti`, `WIKI_BACKEND`, `wiki_backend`, `WikiBackend`, `wikiBackend`,
      `LlmPhase`, `GraphitiConfig`, `HardwareInfo`, `detectHardware`, `installDocker`,
      `installLocalLLM`, `setupGraphiti`, `registerGraphitiMCP` identifier remains in the GUI
      package (renderer or main process).
- [ ] **[AC-6]** `onboarding.wiki.*` i18n keys are absent from `en.json` and `ko.json`.
- [ ] **[AC-7]** `pnpm tsc --noEmit` passes with no new errors.

## Plan

1. Delete the two step files.
2. Prune `types.ts`.
3. Gut `OnboardingWizard.tsx` — remove state, effects, handlers, re-route steps 3→3 (completion),
   fix dot indicator to 4 items.
4. Prune `electron/ipc/onboarding.ts` — remove `WIKI_BACKEND` write + dead handlers (verify
   none are shared with other flows first).
5. Prune `electron/preload.ts` correspondingly.
6. Remove `onboarding.wiki` subtrees from both locale files.
7. `pnpm tsc --noEmit` green.

## Out of scope

- Changes to any wiki/memory runtime beyond the onboarding wizard (wikikeeper removal was T-PATCH-009).
- Removing the `ollamaModels` IPC if it is used elsewhere in the app outside onboarding.
