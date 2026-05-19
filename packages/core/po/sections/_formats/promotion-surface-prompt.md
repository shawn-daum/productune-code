# Promotion gate — surface prompt format

After every persona turn, PO inspects `promotion_candidates`. Per entry, surface inline:

```
[PO] pdt-designer wants to remember:
     project · docs/pdt-designer/decisions.md
     "(2026-04-27) login-modal: chose dialog over inline form (focus-trap critical)"
     reason: design decision; future pdt-designer references
     save? [y/N]
```

User response:
- **y** → write (mechanical writes, tier-appropriate). Ack `[PO] saved.`
- **n / Enter / skip** → drop silently.
- **edit** → prompt edited version, save.

>3 candidates → numbered list; user replies `1,3` for selective approve.
