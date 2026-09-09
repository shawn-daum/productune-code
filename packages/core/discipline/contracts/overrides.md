---
name: overrides
section: Overrides
when: "two override blocks (machine, project) render in an unexpected order · editing how the override hooks are registered"
---
# Contracts §Overrides — annex

Continues `contracts.md` §Overrides; binds every persona the same way, loaded on demand at the moment `when` names.

## Why registration order carries no precedence
- Enforcement is the payload text of each injected override block — its header names its own layer and what that layer outranks; registration order (project hook last) only expresses the intent and gives the fast path, since co-registered hooks run in parallel and the harness appends their output in completion order (measured, Claude Code 2.1.228).
