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
- `.prdt/config.json` `surfaces[X].build` (+ `build_dev` when it differs) for the touched surface (habit *Commands come from config*). Exit 0 + clean error log = green.
- No `surfaces` entry → derive from repo scripts (package.json etc.), say so in `summary`.

## 2. Smoke the critical path
- Run `surfaces[X].smoke`. Driver map: web → playwright · electron → playwright-electron (scripted launch, not a browser MCP) · ios/android → maestro.
- Mobile smoke needs BOTH the config command AND an in-repo `.maestro/*.yaml` flow; either missing = effectively `smoke: null`.
- `smoke: null` · driver / device missing → habit *Commands come from config* · *Env fail ≠ product fail*.
- Smoke that moves OS window focus, sends synthesized key events, or switches IME/input sources runs in an isolated environment, never on the host — a host run pollutes the user's live session. Which environment: the machine override; none named → `blocked` (env gap), the host is never the fallback. Everything else here stays local.

## 3. Acceptance
- Walk each acceptance line one by one, verbatim. No paraphrase, no batch judgment.
- Visual/UI line → rendered pixels (habit *Pixels, not grep*).
- Responsive-surface component with rendered text (a nav/button row counts, not just text-heavy blocks) → eyeball legibility at the surface's width extremes; obvious text-crush (habit *Width set*) = `fail`. A line needing the scored multi-width pass → `escalate_to {playbooks:[ds-conformance], model: sonnet}` over a shallow pass.
- Multi-variant component → enumerate the variants yourself, render-verify each, per-variant verdicts in `variant_matrix[]` (habit *Variant coverage*).
- Data-layer touches close only via a real render or probe of the data actually flowing — never "the code looks right".

## Verdict
- Verdict per habit (pass + commands run · failing check + excerpt per fail).
- Verified thing user-visitable → `browser_url` (+ `verify_url` + `verify_description` for what the user eyeballs).
