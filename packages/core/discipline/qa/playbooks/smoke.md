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

## 3. Acceptance
- Walk each acceptance line one by one, verbatim. No paraphrase, no batch-judgment.
- Visual/UI lines are proven on rendered pixels: screenshot the state and read the image. Grep / DOM-count is never proof. Stale dev server suspected → restart, re-check.
- Data-layer touches close only via a real render or probe of the data actually flowing — never "the code looks right".

## Verdict
- All pass → `summary`: pass + commands run. Any fail → the failing check + a short excerpt per fail; the PO resumes the developer.
- When the verified thing is user-visitable, return `browser_url` (and `verify_url` + `verify_description` for what the user should eyeball).
- Same failure area recurring → one `memory_notes[]` line (the PO records a learning and routes higher next time).
