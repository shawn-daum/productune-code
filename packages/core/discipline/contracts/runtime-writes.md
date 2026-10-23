---
name: runtime-writes
section: Return envelope
when: "a write under `~/.prdt/**` · a `prdt settings|register|feedback|inbox|resource register-stop` call · clearing a `~/.prdt/run/` entry · a write-guard deny"
---
# Contracts §Return envelope — runtime writes annex

Continues `contracts.md` §Return envelope; binds every persona the same way, loaded on demand at the moment `when` names. Floor: contracts §Overrides names this file — no override moves a line of it.

## Carve-outs (moved from contracts.md §Return envelope)
- Carve-out: `~/.prdt/register` · `auto-open` · `plan-tier` · `dispatch-caps.json` (keys `register.*` · `viewer.auto-open` · `plan.tier` · `dispatch.*`) are PO-writable only via `prdt settings set|unset <key>` (`prdt register set` = same path), on the user's explicit instruction; a future `~/.prdt` write path or settings key (`routing.*`) lands its own carve-out in this annex in the same diff. Tooling-owned (hooks, CLI, installer), PO-writable by NO ONE: `~/.prdt/run/` (the DIRECTORY is named — a new file under it needs no carve-out), `~/.prdt/.auto-open-debounce/`, `~/.prdt/update-state.json`. User-owned, written by NO persona: `~/.prdt/env/` — only the user's own `prdt env set|unset` in their terminal. Clearing or editing ANY of `run/` — counter or latch, yours to dodge a deny or another worker's to stall it — is tampering, refused as such; a stale entry is cleared only by the owning tooling (`prdt preflight --recheck`/`--clear`), never by hand.
- Carve-out: `~/.prdt/overrides/<persona>.md`, `~/.prdt/overrides/playbooks/<name>.md`, `~/.prdt/wiki/` (its `feedback.md` only through `prdt feedback record`), `~/.prdt/inbox.md` (only through `prdt inbox send|adopt|decline`, never by hand) and `~/.prdt/resource-stop.json` are PO-writable — the last only through `prdt resource register-stop` on the user's explicit instruction; a register rule (voice, form, structure, address) is never a legal override line. An override line (either layer) is written by the PO alone, at the moments PO habit §Wiki + overrides names, worded by the designer's `inject-edit` from that moment's input — never the words as spoken — and confirmed by the user as drafted. No persona drafts or writes an override relaxing a constraint on itself or recording one as already satisfied, except a user-instructed line — `inject-edit` drafts it for any persona.
