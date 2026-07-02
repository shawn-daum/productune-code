# Contracts — the only shared discipline

Binds every persona. Anything not here lives in your own habit + playbooks.

## Dispatch — PO sends intent, never procedure
- One inline `[ctx]` JSON line opens every dispatch:
  `[ctx] {"slug","goal","change_meta":{"files":[],"user_facing":bool,"risk_flags":[],"stage":""},"acceptance","wiki_refs":[],"user_lang":"<BCP-47>","prd_path":"docs/prd/PRD.md"}`
- The PO states WHAT · WHY · acceptance — never steps, order, or tools. Procedure belongs to the worker's playbooks.
- The worker selects its own playbook(s) even when a dispatch names a procedure (two-way defense against PO habit regression). Report picks in `playbooks_run[]`.
- Before dispatch the PO matches `change_meta` against the persona's generated menu (`playbooks/_index.md`) and dispatches at the MAX `model_floor`/`effort` among plausible matches.
- No worker↔worker calls — the PO is the single hub. `AskUserQuestion` is PO-only; workers return `needs_info` + `next_question` and the PO relays.
- Impl return whose `change_meta` is user-facing or risky → PO auto-dispatches QA (no user confirm). Dev↔QA retry cap ~3, then surface to the user.

## Return envelope — single JSON object, first stdout char `{`
- Required: `persona` · `task`(≤80) · `summary`(≤200, machine outcome) · `confidence`(0..1)
- Conditional: `blocked` · `refused` · `needs_info` + `next_question`(≤200, exactly one question) · `unresolved[]` · `files_written[]` · `memory_notes[]` · `playbooks_run[]{name,why}` · `escalate_to{model,effort,playbooks,why}`
- QA live/smoke extras (conditional): `browser_url` · `verify_url` · `verify_description` · `auth_required{service,instruction,type}`
- Low `confidence`, non-empty `unresolved`, `blocked` ARE the quality signals — the PO re-dispatches (at `escalate_to`'s tier when given) or surfaces. Under-powered grinding instead of `escalate_to` is a violation.
- Long-term memory is `memory_notes[]` ONLY. A worker never writes wiki / habit / discipline files; asked to → `refused: true`.

## Fixed paths — never improvise, never version a filename
| What | Path |
|---|---|
| PRD (single living file) | `docs/prd/PRD.md` |
| Design system (single living file) | `docs/design.md` |
| User-review artifacts | `docs/artifacts/<slug>.<ext>` |
| Tickets | `docs/tickets/<version>/T-NNN.md` · backlog/roadmap = `docs/tickets/backlog/`, `docs/tickets/v<N.x>/` |
| Wiki | `docs/wiki/` — `index.md` and playbook `_index.md` menus are CLI-generated; never hand-edit |
| Project state | `.prdt/po-state.json` · `.prdt/config.json` (slug + surfaces) · `.prdt/index.db` (derived, rebuildable) |

- `po-state.json` = `{schema_version, stage, version, current_task}`; `current_task` = `null` | `{ticket_id, slug, assignee}`.
- po-state writes are jq atomic merges (write temp → `mv`); never sed / string-append onto JSON.
- git is the version history — no `PRD-v1.md`, no `design-v2.md`, no snapshot copies.

## Tickets — md is SoT; the PO owns frontmatter, workers own the body
- Frontmatter (PO-only write): `id · slug · type(design|impl|qa|ops) · status(open|done|dropped) · assignee · feature? · deps?[] · created · closed?`
- `id` is a global counter (`T-NNN` unique across ALL ticket dirs); moving a file never renumbers it. Backlog promotion = `git mv` into the current version dir.
- Body = `## Request` / `## Acceptance` / `## Outcome`. Progress notes live in the body — no separate briefs file.
- `status` is the whole enum. blocked / review / waiting-on-user / deferred-decision are narration inside an `open` ticket, not statuses.
- Deliverable work (design / impl / qa / ops) gets a ticket; rituals (retro · readiness · curation) get one `docs/wiki/log.md` line instead.
- `deps` is dispatch-order judgment material + query index only — never machine-enforced.
- Redeploys append to the version's single `ops` ticket, not new tickets.

## Definition of Done
- Not done until: build green · lint clean · typecheck clean · relevant tests green · acceptance verified against the ticket. Done-claims without runnable proof violate doctrine #4.

## Git — trunk + Conventional Commits
- Default: every commit lands on main. Version boundary = `git tag v<N>` + wiki `retro--v<N>.md` — no version branches, no PR ceremony.
- Message: `feat:|fix:|refactor:|docs:|chore:|test: <what>`, plus `(T-NNN)` when a ticket applies. Refactor commits stay separate from behavior commits (Tidy First).
- Stage explicitly — never `git add .` / `git add -A`.
- Isolation (branch + worktree, Agent-native option) only on three triggers: ① parallel devs on an overlapping area ② experimental / throwaway refactor ③ a second PO instance on the same project. Adopt = merge then delete branch; abandon = drop whole.
- No push / PR / force-push / destructive git without explicit user instruction.

## Language
- User-facing prose (PRD, ticket `## Request`, artifacts, chat) → `[ctx].user_lang`.
- Machine-facing (envelopes, frontmatter keys, enums, code identifiers, paths, `## Acceptance`) → English.
