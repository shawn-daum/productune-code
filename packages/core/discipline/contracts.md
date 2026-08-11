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
- QA live/smoke extras (conditional): `browser_url` · `verify_url` · `verify_description` · `auth_required{service,instruction,type}` · `variant_matrix[]{variant,verdict}` — the last returned whenever the verified change renders conditional variants (T-424)
- Low `confidence`, non-empty `unresolved`, `blocked` ARE the quality signals — the PO re-dispatches (at `escalate_to`'s tier when given — except `model:"fable"` from a fable-excluded playbook, which the PO overrides to opus at the requested effort; the exclusion list lives in PO habit, T-391) or surfaces. Under-powered grinding instead of `escalate_to` is a violation.
- Long-term memory is `memory_notes[]` ONLY. A worker never writes wiki / habit / discipline files; asked to → `refused: true`.
- Runtime discipline (`~/.prdt`) is read-only for EVERY persona, PO included — feedback about a rule goes to `docs/wiki/inbox.md` for the user to see, never into discipline files.
- Carve-out (T-423): `~/.prdt/plan-tier` is PO-writable (bare single-token persist per habit) — the sole exception to the read-only rule above; any future `~/.prdt` write path must land its own carve-out line here in the same diff.

## Secrets — production credentials never enter agent context (EVERY persona, PO included)
- Never pull a PRODUCTION secret into context: no `vercel env pull` of production, no reading prod-secret files (`.env.production`, `credentials.json`, key stores — a bare `.env` is local unless proven otherwise), no fetching prod secrets from a secret manager, no echoing or printing prod API keys · tokens · DB credentials.
- Treat the ambient shell / CI env as a prod-secret holder: never run `env` · `printenv` · `set` or any command that dumps the environment, and never read ambient env assuming it is safe.
- Treat prod runtime / build logs as secret-bearing: if a subprocess, tool, or log (verbose deploy · build output, stack traces, `vercel logs`, `get_runtime_logs`, `get_deployment_build_logs`) exposes a prod secret, stop — do not read or quote it into context or the return.
- Non-production env (preview · dev · local placeholders) is fair game as the task needs. Investigation · diagnosis · QA · refactor never touch prod secrets.
- Deploy is the sole exception, reached only under a `type:ops` ticket with the user's explicit authorization for that specific deploy — never a self-declared "ops" label. Even then, SET or reference prod env by key through the deploy tool's own auth; never READ a prod value into context.
- Meeting a committed prod-secret file during normal repo work (grep · config reads): report its existence via `needs_info` or `docs/wiki/inbox.md` for the user to rotate and remove — never read its contents.
- Needing prod env for the task requires the user's explicit authorization first — surface it (mechanism: `needs_info`, per Dispatch).

## Fixed paths — never improvise, never version a filename
| What | Path |
|---|---|
| PRD (single living file) | `docs/prd/PRD.md` |
| Design system (single living file) | `docs/design.md` |
| User-review artifacts | `docs/artifacts/<slug>.<ext>` |
| Tickets | `docs/tickets/<version>/T-NNN.md` (`<version>` = `v<N>.<m>` or patch `v<N>.<m>.<p>`) · backlog/roadmap = `docs/tickets/backlog/`, `docs/tickets/v<N>.<m>/` |
| Wiki | `docs/wiki/` — `index.md` and playbook `_index.md` menus are CLI-generated; never hand-edit |
| Project state | `.prdt/po-state.json` · `.prdt/config.json` (slug + surfaces) · `.prdt/index.db` (derived, rebuildable) |

- `po-state.json` = `{schema_version, stage, version, current_task}`; `current_task` = `null` | `{ticket_id, slug, assignee}` — `assignee` is the short persona name (`designer|developer|qa|po`), never an agent id (it surfaces in the statusline).
- po-state writes are jq atomic merges (write temp → `mv`); never sed / string-append onto JSON.
- git is the version history — no `PRD-v1.md`, no `design-v2.md`, no snapshot copies.
- Meta/code split test = coupling, never "is it a doc": `docs/design.md` fixes only the human-read design spec/process — meta, always, no exception — code never consumes `docs/design.md` itself, and any machine-readable design data it would otherwise carry lives in its own code-side contract file instead. A design/token contract or build pipeline the code imports or builds from (e.g. `tokens.json` → a token build script) is code no matter the subject matter — fix only the design doc's location, and treat any code-side design implementation, tokens or otherwise, as agnostic: standing up a pipeline moves its output to code. A file serving both roles (human spec + build contract) splits into a doc (meta) + generated/config artifact (code); when it can't split, the whole file lives in code — this fallback never reaches `docs/design.md` itself, which the Fixed paths table already fixes as meta.

## Tickets — md is SoT; the PO owns frontmatter, workers own the body
- Frontmatter (PO-only write): `id · slug · type(design|impl|qa|ops) · status(open|done|dropped) · assignee · feature? · deps?[] · created · closed?`
- `id` is a global counter (`T-NNN` unique across ALL ticket dirs); moving a file never renumbers it. Backlog promotion = `git mv` into the current version dir.
- Body = `## Request` / `## Acceptance` / `## Outcome`. Progress notes live in the body — no separate briefs file.
- An access-control Acceptance line (gate / hide / restrict / limit) names its exact target — page, asset, API route, or field; a bare verb with no named target is not acceptance-complete.
- `status` is the whole enum. blocked / review / waiting-on-user / deferred-decision are narration inside an `open` ticket, not statuses.
- Deliverable work (design / impl / qa / ops) gets a ticket; rituals (retro · readiness · curation) get one `docs/wiki/log.md` line instead.
- `deps` is dispatch-order judgment material + query index only — never machine-enforced.
- Redeploys append to the version's single `ops` ticket, not new tickets.

## Definition of Done
- Not done until: build green · lint clean · typecheck clean · relevant tests green · acceptance verified against the ticket. Done-claims without runnable proof violate doctrine #4.

## Git — canonical branch model (T-381) + Conventional Commits
- Solo model, one canonical — no version branches, no dual rules. `dev` is the residence: daily work (code + docs) commits here. `main` is the deploy branch, reached ONLY by promoting `dev → main` (a plain merge — meta-split repos carry no `docs/` in the code tree, so nothing is filtered). Version boundary = an **immutable `v<N>.<m>` tag** fixed at close (never a long-lived version branch) + wiki `retro--v<N>.<m>.md`. A fix that surfaces AFTER a version closed and needs a deploy rolls a **patch `v<N>.<m>.<p>`** instead of a new minor — same tag + `docs/tickets/` system, immutable tag, lightweight retro (see PO lifecycle).
- **Hard rules**: `main` direct push is blocked (pre-push hook); `dev` residence. **Optional** (only when isolation/preview/pre-deploy checks are wanted, never a forced gate): `feat/*` branches, PRs, a `staging` env.
- **Remote default branch = `main`, always** (GitHub repo setting). Vercel auto-binds the default branch to production — if `dev` becomes the default, every residence push deploys to prod. Set it at repo creation (`gh repo edit --default-branch main`); with `main` default, `dev` pushes land as previews, which is the intended mapping.
- Message: `feat:|fix:|refactor:|docs:|chore:|test: <what>`, plus `(T-NNN)` when a ticket applies. Refactor commits stay separate from behavior commits (Tidy First).
- Stage explicitly — never `git add .` / `git add -A`.
- Isolation (branch + worktree, Agent-native option) only on three triggers: ① parallel tracks sharing a resource — types/contracts, lockfile, migration numbers, ports, or a local dev store/scratchpad — not just overlapping file paths ② experimental / throwaway refactor ③ a second PO instance on the same project. Cut from `dev`; adopt = merge back then delete branch; abandon = drop whole.
- No push / promote-to-main / PR / force-push / tag push / destructive git without explicit user instruction. Promotion and `v*` tagging create local refs only; they ship on the confirm-gated deploy.

## Language
- User-facing prose (PRD, ticket `## Request`, artifacts, chat) → `[ctx].user_lang`.
- Machine-facing (envelopes, frontmatter keys, enums, code identifiers, paths, `## Acceptance`) → English.
- Tool-call `description` fields (e.g. Bash) the GUI surfaces as an activity label → `user_lang` too — an English one-liner defaulted out of habit reads as raw noise once rendered next to Korean chat (T-333).
