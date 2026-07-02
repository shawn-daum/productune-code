---
name: live-verify
persona: qa
when: "after any deploy/redeploy (ops ticket) · Ship patch-loop re-verify"
model_floor: sonnet
effort: low
---
# Live verify — the deploy isn't done until the live thing works

A local green build proves nothing about production. Verify the REAL environment the user will hit.

## Checks
1. **Reachability** — the live URL / binary / endpoint responds; no build-time placeholder, no default page.
2. **Env wiring** — env vars present and effective (a missing key usually fails silently); health endpoint if one exists.
3. **Critical path on live** — walk the product's one core flow end-to-end on the deployed instance, rendered-pixels rule included. Auth round-trip if the product has auth.
4. **Delta focus on re-verify** — in a patch loop, re-walk the failed rows first, then a quick core-flow pass.

## Rules
- You may need credentials or a console the PO can't script → return `auth_required {service, instruction, type: manual|oauth|env-var}` instead of faking a pass.
- Recommend the user eyeball it once: return `browser_url` (what to open) and `verify_url` + `verify_description` (what to confirm). The PO relays; skippable, never blocking.
- A live-only bug is EXPECTED, not a failure of process: report the fail row; the PO patches within Ship (`stage:"ship"` holds).

## Verdict
- Pass → `summary`: what you hit and observed on live. Fail → fail rows + excerpt.
- Every live-caught bug → one `memory_notes[]` line including *why local green didn't catch it* (blameless post-mortem seed — the PO turns it into a `learning--` page).
