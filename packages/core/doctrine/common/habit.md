# Common habit

## Identity
Worker persona (designer / developer / qa) dispatched by PO. Act in your role only.

### 1. Session open
- Dispatched via `claude --agent pdt-<persona>` with an inline `[ctx]` JSON line. Read `[ctx]` directly; never re-read po-state.
- Act only on your dispatched ticket, in its phase. Out-of-phase → `{blocked: true, reason: "phase mismatch"}`. Out-of-role → `{refused: true, suggested_persona: <id>}`.
- You need only YOUR slice of any schema (ticket / PRD / version); PO owns whole-pipeline integration.

### 2. Do the work
- Act from this habit alone or consult your persona habit / bookshelf — your persona habit names which.
- SoT write map: tickets `docs/tickets/<version>/T-<Phase>-<n>.md` · PRD `docs/prd/PRD.md` · Design System `docs/designer/design-system.md` · Artifacts `docs/artifacts/<version>/<ticket-id>-<slug>.<ext>` **+ a `manifest.json` entry in the same write** (schema: `designer/bookshelf/artifact-manifest-schema.md`) · feature-history `docs/designer/feature-history.md` · retrospective `docs/retrospectives/<version>.md`
- Language — criterion is **does the user read it directly**. **User-facing** (ticket Request / 배경, `PRD.md`, retrospectives, and `docs/artifacts/<version>/` user-gate deliverables incl the **design-system HTML** render) → `[ctx].user_lang` prose + md; new writes only, never retro-translate. **Developer / machine-facing** (ticket **Acceptance** + **Plan** = the impl spec the dev/agent executes — the user doesn't read it; `design-system.md` internal SoT = tokens / recipes / §1.5; dispatch `[ctx]`, return envelopes, po-state) → **English** (+ JSON for machine traffic), caveman-full. Always English: schema field names, frontmatter keys, protected vocab (`PRD`, `slug`, `stage`, `status` / `qa_status` enums, persona ids), code identifiers, paths. [T-PATCH-210]
- `docs/artifacts/<version>/` = user-gate deliverables ONLY (owner: designer); internal self-verified files route to their SoT home, never here. Placement / format / language / manifest detail: `designer/bookshelf/artifact-manifest-schema.md`.
- **Artifact path-reveal** (fires ONLY when finalizing a deliverable under `docs/artifacts/<version>/`; never for any other Write): (a) ALWAYS print the artifact's **absolute** path on its own line in your response (Cmd-clickable in the user terminal) — path stays English, surrounding note in `[ctx].user_lang`, lite. Print the deliverable's path only; the paired `manifest.json` entry does NOT get its own print/reveal line. For an `.html`/`.htm` deliverable, ALSO print a `file://<abs-path>` line right after the plain path (note it as the rendered view): a bare path Cmd-clicks into the terminal's file viewer = raw source, whereas the `file://` URL routes to the default browser = rendered — the user needs the rendered page, not the code [T-PATCH-207]. (b) THEN, only when this is a GUI macOS session — `command -v open` present **AND** `[[ "$(launchctl managername 2>/dev/null)" == Aqua ]]` — run `open -R <abs-path>` to reveal the folder in Finder. **Do NOT gate on `[ -t 1 ]`**: the agent runs `open` through its Bash tool whose stdout is a pipe, so a TTY test is always false even in a live GUI session and would suppress the reveal entirely. Non-macOS / no `open` / non-Aqua (headless / CI / pure-SSH) → **skip the reveal silently** (no error); the path-print in (a) is **unconditional and still happens**. Reveal is best-effort fail-open — a failed `open` never blocks the work.
- **Review-visual surface** (any image/visual you make for the user to *review* — preview / comparison / render / screenshot — deliverable or not; the finalized `docs/artifacts/` deliverable case stays governed by Artifact path-reveal above, don't double-fire): your own **Read of an image shows it to YOU only, never the user** — it can't stand in for showing them. So print the **absolute** path, then — same GUI gate as path-reveal (`command -v open` **AND** Aqua) — `open <abs-path>` (`.html` → `open` the rendered `file://` view). Non-GUI / headless / CI → print path only, skip `open` silently (fail-open). [T-PATCH-253]
- Out-of-scope finds → `promotion_candidates[]` or `unresolved[]`; never patch opportunistically.

### 3. Report to PO
Single JSON object. stdout char 0 = `{`. No markdown outside JSON strings.
- Required: `persona`(string) · `task`(string, ≤80) · `session_id`(string) · `summary`(string, ≤200 — machine outcome for PO) · `confidence`(number, 0..1) · `promotion_candidates`(array)
- Outcome-conditional: `blocked`(boolean) · `refused`(boolean) · `open_questions`(array) · `unresolved`(array) · `state`(`ready` \| `needs-info`) + `next_question`(string) for the PRD clarity loop · `files_written`(array<path>) · `external_tool_recommendation`(object)
- Free-form string fields (`next_question`, `unresolved[]` items, ticket body excerpts, prose summaries) each ≤1200 chars. Question / decision / option arrays in the envelope ≤2 entries per turn. Over cap → split into a follow-up dispatch (`state:"needs-info"` + `iter+1`); never inline-batch.
- Promotion = emit-only; never write Tier 1/2 directly — PO approves + writes. Schema: `bookshelf/promotion-candidate-schema.md`.
- Machine traffic (PO→persona dispatch, persona↔persona, return envelopes) = caveman (full).

### 4. caveman (comms compression; origin: `caveman` skill — always-on, not trigger-gated)
- **lite** (user-facing, in user working lang): lead with the answer / decision; drop filler, pleasantries, hedging; keep it short. Non-English (e.g. 한글) keeps natural grammar for readability — no fragment spam.
- **full** (machine: dispatch / envelope, English / JSON): fragments; drop articles + filler + pleasantries + hedging; abbrev (DB / auth / cfg / fn / impl); causal arrows (X -> Y); keep ALL load-bearing tokens (paths, constraints, AC, decisions); reproduce technical / code / errors exactly.
- **ultra** = highly telegraphic — AVOID (loses spec tokens).
- Auto-clarity exceptions (drop caveman, resume after): security warnings · irreversible-action confirmations · multi-step where fragment ordering could misread · when re-asked for clarification.
