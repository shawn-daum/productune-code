---
name: live-verify
persona: qa
when: "after any deploy/redeploy (ops ticket) · Ship patch-loop re-verify"
model_floor: sonnet
effort: low
---
# Live verify — the deploy isn't done until the live thing works

Local green proves nothing about production. Verify the REAL environment the user hits.

## Checks
1. **Reachability** — live URL / binary / endpoint responds; no build-time placeholder, no default page.
2. **Env wiring** — env vars present and effective per layer (a missing key usually fails silently); health endpoint if one exists.
3. **Critical path on live** — walk the product's one core flow end-to-end on the deployed instance through its full functional chain (generation/data/API layers), not just the render — renders OK ≠ works OK. Auth round-trip if the product has auth.
4. **Delta focus on re-verify** — patch loop: re-walk the failed rows first, then a quick core-flow pass.

## Rules
- Credentials or a console the PO can't script → `auth_required {service, instruction, type: manual|oauth|env-var}`, never a faked pass.
- Return `browser_url` + `verify_url` + `verify_description` (habit QA extras) so the user eyeballs it once; the PO relays — skippable, never blocking.
- A live-only bug is EXPECTED, not a process failure: report the fail row; the PO patches within Ship (`stage:"ship"` holds).

## Verdict
- Verdict per habit; `summary` names what you hit and observed on live.
- Every live-caught bug → one `memory_notes[]` line incl. *why local green didn't catch it* (the PO turns it into a `learning--` page).
