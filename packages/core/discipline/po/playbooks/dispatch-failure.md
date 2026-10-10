---
name: dispatch-failure
persona: po
when: "a dispatch fails at the execution layer · a quota kill · a `fable` floor or `escalate_to` · `[prdt plan-tier: unset]`"
model_floor: opus
effort: medium
---
# Dispatch failure — re-route one tier down, or wait out a quota kill

Loaded by the PO habit's Route + dispatch pointer when a return is not a return.

## Fable routing (moved from PO habit §Route + dispatch)
- **Fable tier**: `fable` (claude-fable-5): reserve it for deep single-shot judgment where a menu floor or a playbook step says so, never for "more quality". **Fable-excluded playbooks**: loop work — implement · bugfix · refactor · smoke · live-verify — at its existing floors; security-pass, pinned opus; in-loop re-grills/delta verifications, at sonnet/medium. An `escalate_to{model:"fable"}` from ANY excluded playbook → **opus at the requested effort** — normal routing, not a failure, no `learning--` line.
- **Fable plan gate**: fable floors apply ONLY when the user is confirmed on a **Max x20 or Team Premium** plan — the injected `[prdt plan-tier: …]` block (PO-only) resolves it at turn open: a stored value resolves silently, device-scoped, never re-asked. `unset` → ask once, then `prdt settings set plan.tier <max-x20|team-premium|other>` before proceeding. On `other`/unset every fable floor resolves to **opus at the same effort** as NORMAL routing — not a fallback, not an escalation failure, no `learning--` line. A plan change is theirs to raise, never yours to re-ask: they say so and you set it the same way, or they flip it in GUI Settings.

## Procedure
- Failed dispatch (execution layer): re-dispatch the SAME `[ctx]` one tier down at **max** (there is no `escalate_to` data to parse in this failure mode; this is a distinct path from worker-signaled escalation), and log one `learning--` line at Retro. One tier down = one rung of the ladder, and **the walk stops at `sonnet`**: a dispatch already at `sonnet` or below re-runs at its OWN tier at `max` instead of dropping further — `haiku` is a tier but never a demotion target, since a playbook that wanted it would have floored there. Two such failures on the same task → stay on that tier for the task; when there is no lower rung left, surface it to the user. **A quota kill is none of that and never lowers a tier by itself** — no `learning--` line either: it says the account window closed, nothing about whether the model can do the work, and limits reach every model, so a long opus or sonnet dispatch dies in the same place a fable one does. Re-check with `prdt preflight <model> --recheck` and re-dispatch at the SAME tier the moment it answers available. `inconclusive` is a third verdict, not a soft no — it leaves the tier exactly where the menu put it. A kill can land mid-work, so read the tree before re-dispatching: a return that left half the work on disk and one that left none look identical. A dead QA round leaves its `.prdt/scratch/` standing — no final verdict ever came, so the deleter is you (`qa/habit` Scratch): delete it on detecting the dead dispatch, before any re-dispatch or surfacing.

