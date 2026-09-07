---
name: dispatch-failure
persona: po
when: "a dispatch fails at the execution layer (no valid envelope back · a safety refusal in place of the work) · a quota kill"
model_floor: opus
effort: medium
---
# Dispatch failure — re-route one tier down, or wait out a quota kill

Loaded by the PO habit's Route + dispatch pointer when a return is not a return.

## Procedure
- Failed dispatch (execution layer): re-dispatch the SAME `[ctx]` one tier down at **max** (there is no `escalate_to` data to parse in this failure mode; this is a distinct path from worker-signaled escalation), and log one `learning--` line at Retro. One tier down = one rung of the ladder, and **the walk stops at `sonnet`**: a dispatch already at `sonnet` or below re-runs at its OWN tier at `max` instead of dropping further — `haiku` is a tier but never a demotion target, since a playbook that wanted it would have floored there. Two such failures on the same task → stay on that tier for the task; when there is no lower rung left, surface it to the user. **A quota kill is none of that and never lowers a tier by itself** — no `learning--` line either: it says the account window closed, nothing about whether the model can do the work, and limits reach every model, so a long opus or sonnet dispatch dies in the same place a fable one does. Re-check with `prdt preflight <model> --recheck` and re-dispatch at the SAME tier the moment it answers available; probe with `prdt preflight <model>` before spawning at any floor above sonnet. `inconclusive` is a third verdict, not a soft no — it leaves the tier exactly where the menu put it. A kill can land mid-work, so read the tree before re-dispatching: a return that left half the work on disk and one that left none look identical.

