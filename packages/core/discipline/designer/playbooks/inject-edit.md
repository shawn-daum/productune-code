---
name: inject-edit
persona: designer
when: "edit to hook-injected text — discipline · playbook · annex · agent stub · override line · hot↔cold move · corpus sweep"
model_floor: fable
effort: high
---
# Inject edit — one pen for injected text

One editor, one pass, four verdicts judged per RULE, bytes reported. Form is compressed English: operators, identifiers, numbers, conditions kept; filler cut. This file obeys itself.

## Scope and base
- Base for every path and command here: `packages/core/` of the prdt code repo — run from there. Write only `discipline/**` · `doctrine.md` · `agents/*.md`; read `scripts/prdt` · `scripts/hooks/*.sh` · `test/**`. Never `~/.prdt/**` · `~/.claude/**` · `.prdt/overrides/**`.
- Override text: never written by you. Return it as one `memory_notes[]` line — `override <machine|project>/<persona>: <line>` — the PO's inbox line that curate-wiki routes.
- No install, no commit, no mirror sync. Written ≠ effective: `discipline/contracts/definition-of-done.md`.

## Map — hot and cold
- Hot (every session start of the persona): `doctrine.md` · `discipline/contracts.md` · `discipline/<persona>/habit.md` · `discipline/<persona>/playbooks/_index.md` (po carries all four menus) · `~/.prdt/overrides/<persona>.md` · `.prdt/overrides/<persona>.md` · the playbook-override index · `agents/prdt-<persona>.md`.
- Cold (on selection or by name): `discipline/contracts/<section>.md` · `discipline/<persona>/playbooks/<name>.md` · `~/.prdt/overrides/playbooks/<name>.md` · `discipline/register/*.md` · wiki pages.
- Cold reaches an actor by one route: a hot line naming its trigger (`when`, section pointer, `machine:` cite). No hot pointer = the rule does not exist.

## Verdict 1 — hot or cold, per rule
- Act = what the rule's own line says its subject does, object included; the object fixes the grain (`escalation for this playbook` = one act per playbook · bare `escalate` = one act of the persona) — never widened or narrowed to move a count. A body that tells the worker to run another body performs only its own acts; the run body's acts stay its own (grill running smoke adds no dependent to a smoke rule).
- Fix the persona before counting: list every persona whose bodies perform the act, whichever file you opened. All → contracts (Verdict 2). One → that persona. Several → owner = the persona whose act is last to change the outcome (model choice: the PO, routing after a worker's `escalate_to`); each other persona keeps its act-specific delta plus a pointer in its own home. (d) counts the owner's cold bodies only.
- Judge the RULE once; every copy follows the one verdict. Hot when one holds: (a) recognition — the actor must notice the situation before any lookup (stage regression, self-promotion, consent gates) · (b) binds every turn or every return (floor, secrets, envelope shape, language) · (c) it IS the ≤1-line trigger pointer to a cold body · (d) two or more cold bodies of the owner perform the act.
- Dependent = a cold body whose procedure performs the act (runs the command · renders · writes the file · returns the verdict), whether or not it names the rule. Grep for identifiers finds copies, never dependents: list the owner's cold bodies and read each for the act.
- Hot survivor → every cold copy keeps only its act-specific delta (a step, a field, a number) plus a pointer; a restated kernel is deleted.
- Cold survivor (a–d all fail, exactly one dependent) → body moves into that dependent; hot side keeps ≤1 line naming the trigger, never a bare path. Zero dependents → deletion, reported as one.

## Verdict 2 — file and layer, one home
- Binds every persona → `discipline/contracts.md` hot / `discipline/contracts/<section>.md` cold. One persona → its `habit.md` / its playbook; several → the owner's (Verdict 1). Belief, not rule → `doctrine.md`. Fact of this machine or project → override line (Scope). Rule scoped to one playbook → that body, or `overrides/playbooks/<name>.md` when it is a machine fact.
- Before any new line: grep the behavior's key words across `discipline/**` · `agents/` · `scripts/hooks/*.sh`. Clause exists → sharpen it in place. New line only when no clause covers the behavior; new file only when no home exists.
- One rule, one body. A second statement keeps at most a pointer. Persona variants survive only where the difference is real (numbers, actions), never a restated kernel.

## Verdict 3 — byte budget
- Gate — owner `scripts/hooks/prdt-session-start.sh` (`PRDT_INJECT_PART_BUDGET_BYTES`; `slots` = registered part hooks, `scripts/hook-manifest.json`): every rendered part ≤ its `limit` · `oversized` empty · `parts_needed` ≤ `slots`. Advisory caps — owner `CAPS` in `scripts/prdt`: line caps per file kind · `agent_stub_bytes` · `register_body_bytes`.
- Hot edit → net `docs_bytes` growth 0 by default. Growth only for a Verdict-1 hot rule, paid first by cuts in the same file, then in the persona's set. Exempt: the (c) pointer a new cold body needs — minimize its `when`; report its bytes. Folded into an existing line or not, report the bytes.
- Measure, never estimate. Scratch `H` (never `~/.prdt`) at the reference `PRDT_HOME` length, 25 chars — `/private/tmp/prdt-injectH`, or any path padded to 25; another length only with the length reported: `cp -R discipline H/ && cp doctrine.md H/`. Per persona whose set moved (a worker menu or habit moves po too), read-only: `PRDT_HOME=H bash scripts/hooks/prdt-session-start.sh --plan <persona> </dev/null`. Whole roster (line caps · agent stubs · register bodies): `PRDT_HOME=H PRDT_DISCIPLINE=H/discipline CLAUDE_DIR=<empty dir> python3 scripts/prdt doctor` (read its `discipline delivery` line + advisories) — a WRITER: rebuilds `.prdt/index.db`, regenerates `docs/wiki/index.md`, installs `code/.git/hooks/pre-push` where absent, in the OUTERMOST `.prdt` above cwd (from `packages/core/` = the real project); run it only when those writes are wanted, else `wc -l` per file against `CAPS`. Bare `prdt doctor` / `--plan` read `~/.prdt`, not your edit.
- THE reported pair, actionable on every machine: `docs_bytes` per persona (path-free) · `parts_needed` against `slots` at the reference length. Path-free too: `wc -c` per touched file · line counts. Path-dependent — `wire_bytes` · per-part `bytes` · largest part · `oversized` at the margin: report each with its length, compare before/after at one length only; the gate holds for the length measured.

## Verdict 4 — relation to the rest of the corpus
- Duplicate: grep the rule's identifiers and numbers; a second statement → Verdict 2.
- Contradiction: two lines, one situation, different verdicts → higher document wins (doctrine → contracts → habit → playbook; override above, floor immovable). Fix the lower; a fix belonging to PO or user → `unresolved[]`.
- Orphan pointer, three directions, checked after the edit: every hot pointer resolves to an existing file or section · every cold file has a hot pointer naming its trigger · every sentence assigning an act to ANOTHER persona (`the PO relays` · `the PO deletes` · `the PO judges … then resumes`) resolves in that persona's own set — its hot files (Map), or a cold body its own hot line already leads to — and the landing names the trigger in the reader's kernel (a return arrives · a dispatch fails · `blocked` surfaces), never a step of the writer's procedure. Unresolved → land the line there, or rewrite so no other persona must act. An envelope key no rule in the reader's set names is information: fold it into `summary`, never a key.
- Pinned literals: hooks and tests bind some lines byte-for-byte (`CLAUSE_*` in `scripts/hooks/`, `test/**`). Grep the exact old sentence there — a hit means same-diff edit of hook + test, or the line stays byte-identical.

## Form — compressed English
- Instruct by act: a line states what the actor produces in the situation — opener, sentence, label, field; an operator (never · only · before · ≤) bounds an act the same line states. A literal rides as the contrast beside the produced form — inline `<produced form> for "<literal>"`, or a table whose produced-form column precedes the literal column, a situation column allowed to lead them when the produced form is slot-dependent — and keeps its meaning-check row (literal → produced form): it marks the misread the act was written against. A literal list headed banned/forbidden is the form this line converts: write the produced form, keep every string, order the table produced side before literal.
- Keep: actor · situation → act · every operator (never, only, every, before, unless, ≤, =) · every identifier, path, number, enum, cap · every condition with its consequence · every literal the text names — identifier, enum value, quoted label — verbatim: an instance listed under a mechanism marks where that mechanism was misread, and the file is its only record once the envelope is gone · every named mechanism (resolver, preference order, fallback, threshold) until the meaning check clears it.
- Cut: articles · hedges · "in order to" · context the heading already gives · justification ("because", "why we") · a second phrasing that names no literal · history — source, precedent, date, ticket id, who decided, how it was measured. History goes to ticket Outcome or wiki via `memory_notes[]`. A `machine:fact--*` cite a rule needs for its facts is a pointer, not history.
- Meaning check, per clause: decision table (situation → required act, modifiers included) from the old text, then from the new; tables match 1:1 or the cut is reverted. Rows come from three sources — the situations the text lists · every branch of every mechanism it names (each branch is a row, spelled out or not) · every named literal, one row each (literal → verdict), and the new text carries that row only by naming the literal: deriving it from the mechanism is the misread the literal was written against. A `because` carrying a mechanism is a condition, not justification: compress it to the mechanism's identifier only after each branch has its row in the new text. A dropped word that flips a verdict — degree, scope, "only", "never" — is meaning lost. Then replay the incident the envelope gives against the new text alone: same verdict required. None given (a sweep) → the literals are the incident: each, read alone, must yield its row.

## Run
1. State the behavior: one line, situation → act at the line's own grain, and every persona performing it (Verdict 1). Grep for its home (Verdict 2).
2. Verdicts 1–4, one line of grounds each → envelope `decisions[]`; Verdict 1 names the dependents.
3. Draft compressed. Keep/cut list. Meaning check.
4. Measure before (Verdict 3): `wc -c` on touched files · `--plan` per affected persona at the reference length (or the one length you report).
5. Land in the source tree. Frontmatter touched → `PRDT_DISCIPLINE=$PWD/discipline python3 scripts/prdt menus`. Pinned literals in the same diff.
6. Measure after, same commands, same path length. `parts_needed` > `slots` · `oversized` non-empty · a part over its `limit` → cut more; never ship it.
7. Return: `bytes[]{file,before,after}` · per persona before/after `docs_bytes` · `parts_needed`/`slots`, path length · `decisions[]` · meaning check · `memory_notes[]` carrying the history and any override line. A multi-clause or hot edit is cross-cutting: say so in `summary`.

## Sweep mode — whole corpus
- Order: hot files by `wc -c` × personas whose set carries the file (Map), largest first · cold bodies restating hot lines · annexes. One file per diff, each diff grill-sized.
- Per file: Verdict 1 per rule with every copy open — a hot line with its cold copies, a cold body with its hot line — before either is touched. Decision table once for the whole file, then cut, re-derive, diff tables. Bytes before/after per file and per part in the return.
- Never move a recognition rule cold to buy bytes. Never merge two layers. A rule nothing can trigger after the sweep is a deletion — report it as one.
