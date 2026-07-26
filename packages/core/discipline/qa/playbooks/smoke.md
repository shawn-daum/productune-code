---
name: smoke
persona: qa
when: "default verification · impl return with user_facing/risky change_meta · dev↔QA loop"
model_floor: haiku
effort: low
---
# Smoke — acceptance-fit verification

Three checks, in order. Report what you ran, not what you assume.

## 1. Build
- Resolve commands from `.prdt/config.json` `surfaces{}`: the touched surface's `build` (+ `build_dev` when it differs). Exit 0 + clean error log = green.
- No `surfaces` entry → derive from repo scripts (package.json etc.) and say so in `summary`.

## 2. Smoke the critical path
- Run `surfaces[X].smoke`. Driver map: web → playwright · electron → playwright-electron (scripted launch, not a browser MCP) · ios/android → maestro.
- Mobile smoke needs BOTH the config command AND an in-repo `.maestro/*.yaml` flow; either missing = effectively `smoke: null`.
- `smoke: null` / driver unavailable / missing device → manual fallback, documented in `summary` — never a silent skip, never a product `fail` for an env gap.
- Electron smoke that drives window focus, System Events synthetic keys, or IME/input-source switching runs inside the isolated cua VM on this machine, never on the host (`fact--qa-cua-vm`); everything else in this playbook stays local.

## 3. Acceptance
- Walk each acceptance line one by one, verbatim. No paraphrase, no batch-judgment.
- Visual/UI lines are proven on rendered pixels: screenshot the state and read the image. Grep / DOM-count / aria-existence is never proof — an element that renders can still be visually broken, so existence alone MUST NOT pass a visual line. Stale dev server suspected → restart, re-check.
- Any responsive-surface component with rendered text (a nav/button row counts, not just text-heavy blocks) → eyeball legibility at the surface's width extremes (habit's width-set rule). Obvious text-crush — character-level wrap, a vertically-split label, meaning-dropping truncation, overlap — is a `fail`. The full scored multi-width pass is ds-conformance's (sonnet), so when a line needs that depth cue `escalate_to {playbooks:[ds-conformance], model: sonnet}` over a shallow pass. No PRD target surface → check at responsive-web full span and record the gap in `unresolved[]`, never skip. (2026-07-23) [T-411]
- An acceptance line covering a multi-variant component → enumerate the variants yourself and render-verify each; report per-variant verdicts via `variant_matrix[]`. (2026-07-24) [T-424]
- Data-layer touches close only via a real render or probe of the data actually flowing — never "the code looks right".

## Verdict
- All pass → `summary`: pass + commands run. Any fail → the failing check + a short excerpt per fail; the PO resumes the developer.
- When the verified thing is user-visitable, return `browser_url` (and `verify_url` + `verify_description` for what the user should eyeball).
- Same failure area recurring → one `memory_notes[]` line (the PO records a learning and routes higher next time).
