---
ticket_id: T-PATCH-024
version: v0.5
phase: 3
type: bug
status: done
assignee: pdt-developer
estimated_complexity: L3
risk_flags: [doctrine-coupling, ux-copy]
qa: false
slug: model-effort-source
---

# T-PATCH-024 — Team panel per-persona model/effort label is hardcoded & misleading

## Request

The Team panel renders a per-persona model + effort label next to each persona
row — "PO opus / xhigh", "Designer opus / xhigh", "Developer sonnet / high",
"QA haiku / low". The user reports these as **hardcoded** and wants them fixed:
the values are not driven by anything real, and they imply each persona has one
fixed model when routing actually decides model × effort dynamically per task.

## Root cause

The labels are literal strings baked into the GUI in two places, with no link
to any config, doctrine file, or runtime signal:

- `packages/gui/src/components/workspace/TeamPanel.tsx:48-51`
  — the `PERSONAS` array; each row carries `modelSummary: 'opus / xhigh'` etc.
  Rendered at `TeamPanel.tsx:114` (`<span style={personaModel}>{def.modelSummary}</span>`).
- `packages/gui/src/components/workspace/main/panes/PersonaDefTab.tsx:28,36,44,52`
  — the `PERSONA_META` record duplicates the same `modelSummary` literals
  (`opus / xhigh`, `opus / xhigh`, `sonnet / high`, `haiku / low`).

These are duplicated, drift-prone, and contradict the actual routing model.

## Why the current label is incorrect

The real routing doctrine is
`packages/core/doctrine/persona/po/bookshelf/routing.md` (mirrored at runtime to
`~/.productune/doctrine/persona/po/bookshelf/routing.md`). It establishes:

1. **There is no single fixed per-persona model.** Routing scores task
   complexity on an L1–L7 scale, starts from a *per-persona floor* (the
   default), then applies **step-up / step-down** adjustments (risk area,
   artifact count, intent keywords, calibration history, recovery) to pick the
   final model × effort per task.
2. **The hardcoded GUI values do not even match the documented floors.** Per
   `routing.md`:
   - Designer floor varies by task: `opus + max` (PRD R1 MVP), `opus + high`
     (R2+ / single screen), `sonnet / medium` (token / DS compliance). The GUI
     shows a flat `opus / xhigh`, which is not any of the Designer floor rows.
   - Developer floor = `sonnet / medium`; GUI shows `sonnet / high`.
   - QA floor = `haiku / low`; GUI matches.
   - PO has no floor row at all (PO is the orchestrator that *does* the routing,
     not a routed persona); GUI invents `opus / xhigh`.
3. **No per-persona model default exists anywhere on disk.** Agent pointer files
   `packages/core/agents/pdt-*.md` carry no `model:` frontmatter — and
   `routing.md` explicitly states "Agents carry no `model:` frontmatter, so the
   floor below is the only fallback — always pass `--model` explicitly." There
   is no settings.json / config key holding a per-persona model either.
4. **The GUI runner never captures the actually-used model/effort.** A grep of
   `packages/gui/electron/po-runner.ts` finds no `--model` / model / effort
   handling — the GUI does not currently observe what model a delegated run
   used. So a truthful "live model in use" label has no data source today.

Net: the label asserts a fixed per-persona model that is doctrinally wrong and
unsupported by any real source. It should not present a static model as fact.

## Source of truth (analysis)

- Real, authoritative: `routing.md` per-persona **floor** table (the documented
  default) + the dynamic step-up/down rules. This is per-task, not per-persona-fixed.
- Real, runtime: the model/effort actually passed to the delegated agent — NOT
  currently captured by the GUI (`po-runner.ts` has no hook).
- The current GUI literals are the *only* place these strings live, and they are
  fabricated — so they are not a source of truth, they are noise.

## Proposed fix

Recommended: **option (c) — remove the misleading per-persona model/effort label
from the Team panel row**, and reframe it in `PersonaDefTab` (where there is room
for nuance) as a **"default floor (routing decides per task)"** value, not a
flat fact.

Rationale:
- The user's stated intent is "don't hardcode it." A label that claims a single
  fixed model per persona is *inherently* wrong under dynamic routing — there is
  no correct static string to substitute, so swapping one hardcoded value for
  another (option b, an editable config) would re-encode the same false premise
  and invite drift from doctrine.
- The truthful dynamic value (option a) requires a runtime signal the GUI does
  not yet have (`po-runner.ts` captures no model/effort), so it is out of scope
  for a patch and would be a larger feature.
- Removing the row label is the smallest correct change and eliminates the
  duplicated literals. The detail view (`PersonaDefTab`) can keep an honest,
  doctrine-sourced "floor / default" hint with explicit "routing decides per
  task" framing, so users still get context without a false fixed-model claim.

The choice between (a)/(b)/(c) has product/UX consequences, so it is logged in
open_questions for PO confirmation before implementation. Implementation should
not begin until PO picks the option.

## Acceptance

- [ ] The Team panel persona row (`TeamPanel.tsx`) no longer renders a hardcoded
      flat model/effort string as if it were a fixed fact. (Exact treatment per
      the PO-selected option.)
- [ ] No hardcoded `modelSummary` literal remains as a load-bearing factual
      claim in `TeamPanel.tsx` and `PersonaDefTab.tsx`; if any default is shown,
      it is sourced from / consistent with `routing.md` floors AND labeled as a
      per-task default, not a fixed model.
- [ ] The two definitions are de-duplicated (single owner) if any value is kept.
- [ ] PO-chosen option (a/b/c) is reflected; no new false per-persona-fixed claim
      is introduced.

## Plan

1. PO selects option (a/b/c) from open_questions.
2. Remove `modelSummary` from the `PERSONAS` array and its render site
   (`TeamPanel.tsx:48-51`, `:114`, `personaModel` style at `:554`).
3. In `PersonaDefTab.tsx`, replace the flat `modelSummary` literals with the
   PO-chosen treatment (remove, or doctrine-sourced "floor (default; routing
   decides per task)" wording). De-duplicate so one definition owns it.
4. Update any i18n strings if a new label is introduced.

## Out of scope

- Capturing the *actually-used* live model/effort from delegated runs
  (`po-runner.ts` instrumentation) — that is option (a) and a separate feature
  ticket if PO wants it.
- Any change to `routing.md` doctrine or the routing algorithm itself.
- `permissionMode` / `mcpServers` fields in `PersonaDefTab` (separate concern).

## open_questions

- **PO — pick the label treatment:**
  (a) defer/feature: capture and show the live actually-used model/effort
      (needs `po-runner.ts` instrumentation; larger);
  (b) show an editable per-persona default from a config file the user can edit
      (note: risks re-encoding a false "fixed model" premise and drifting from
      `routing.md`);
  (c) **[designer-recommended]** remove the flat row label; in the detail view
      show a doctrine-sourced "floor / default — routing decides per task" hint.
- If (c): keep any "floor" hint only in `PersonaDefTab`, or drop the model
  display entirely from both surfaces?
