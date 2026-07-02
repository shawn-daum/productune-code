---
name: brand-assets
persona: designer
when: "DS settled and logo/favicon/og:image missing · brand refresh (approved reversal)"
model_floor: sonnet
effort: medium
---
# Brand assets — derive from the settled DS, never invent separately

Produce **logo** (light/dark if dual-theme) · **favicon** (`favicon.svg` + `.ico`) · **og:image**, all derived FROM the accepted `docs/design.md` palette + type. Land them in `docs/artifacts/` (`<slug>-logo.*`, …); the build places them in `public/`.

## The ladder — generative-PNG-first, direct-SVG last
Claude has no image-generation model. Say so once, then:
1. **Handoff**: return `external_tool_recommendation {tool: "ChatGPT|Gemini", why, prompt, expected_output_path}` — the prompt is **ALWAYS English** (image models degrade on non-English), expects a PNG. The user-facing wrapper may be `user_lang`.
2. **User returns a PNG** → vectorize / post-process it to SVG (trace + clean), crop favicon/og from it. A returned PNG beats a hand-drawn SVG — this loop is the quality path.
3. **User declines the handoff** → generate direct SVG with an explicit "no image model / quality-limited" caveat. LAST resort, never an early branch.

## Rules
- **A user-supplied logo/wordmark is REUSED, never redrawn** — only derive the favicon/og crops from it.
- Photographic / 3D / complex illustration is always handoff — never fake it with vector approximation.
- Favicon legible at 16px (simplify, don't shrink); og:image readable as a thumbnail; both carry the DS palette.
- Waiting on a handoff → return `blocked` with the pending `expected_output_path` so the PO tracks it — not a silent stall.

## Return
- Print each finalized asset's absolute path. `summary`: what shipped vs what's pending handoff. Derivation choices → `memory_notes[]`.
