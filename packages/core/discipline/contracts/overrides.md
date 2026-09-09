---
name: overrides
section: Overrides
when: "two override blocks (machine, project) render in an unexpected order · editing how the override hooks are registered · a `[prdt discipline — playbook overrides …]` index names a playbook you are about to run · writing a rule that governs one playbook"
---
# Contracts §Overrides — annex

Continues `contracts.md` §Overrides; binds every persona the same way, loaded on demand at the moment `when` names.

## Why registration order carries no precedence
- Enforcement is the payload text of each injected override block — its header names its own layer and what that layer outranks; registration order (project hook last) only expresses the intent and gives the fast path, since co-registered hooks run in parallel and the harness appends their output in completion order (measured, Claude Code 2.1.228).

## Playbook-scoped overrides — one index per session, the body on selection
- Store: `~/.prdt/overrides/playbooks/<name>.md`, `<name>` a playbook file name (`<persona>/playbooks/<name>.md`); machine layer only, no project pair. Same ≤20-line cap, same content rule (facts about this machine, never a register rule), same three sanctioned write moments, PO-written only.
- Delivery: the machine-overrides hook appends an index — which of this persona's playbooks have an override, names only — to its session-start output; an empty store appends nothing (zero bytes). The worker that selects a listed playbook renders the body at that moment with `bash ~/.prdt/hooks/prdt-overrides-inject.sh --playbook <name>` and reads the result as that playbook's override block: same gutter, same withheld notices, its own header naming scope and layer. A bare `cat` of the file carries none of that and is never how the body is read. A rule the index does not name binds nobody — `prdt doctor` names a store file that matches no persona's playbook.
- Precedence, restated for the case: machine `playbooks/<name>.md` > machine `<persona>.md` > canonical playbook body, only while `<name>` runs; a project `<persona>.md` still outranks all three (layer beats scope); the floor moves for none of them.
