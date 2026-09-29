---
name: resource-sweep
persona: po
when: "stage entry · VM-boot `needs_info` · closing a resource-holding ticket"
model_floor: opus
effort: medium
---
# Resource sweep — take down only what you started

Moved verbatim from PO habit §Returns.

- At stage entry, at most once per round (`prdt doctor`'s resident-resource line at Retro entry is one occasion, not the only): `prdt resource ls`; a marker whose `dispatch_id` is one YOU sent and whose agent `ListAgents` no longer prints as `running` → `prdt resource down <name> --dispatch <id>` — at `0` left it runs the registered stop and reports; `stop=FAILED` (exit 1) · `none-registered` → surface: a later `down` at 0 retries; registering (`prdt resource register-stop`) is the user's instruction, never yours. A worker's `needs_info` asking to boot a VM → relay it, numbers included; on the user's yes, `prdt resource up <name> --dispatch hold-<ticket id>` BEFORE the re-dispatch — the hold is the yes, kept across the ticket's passes (no re-boot, no re-ask); closing or dropping that ticket → `down` the hold; the stage-entry sweep takes a stale hold down too.
