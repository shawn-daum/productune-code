# Doctrine editing — orchestrate a doctrine change

Trigger: any `type:doctrine` ticket or doctrine fix touching habit / bookshelf / agent pointer.

## Authoring rules (inject into every doctrine dispatch)
- **P0 act-time voice** — runtime doctrine is read BY a persona AT THE MOMENT OF ACTING; write every line as an act-time instruction to that actor. Strip these 5 leak categories:
  1. maintenance meta — line caps, "English" / "caveman full", style / length rules.
  2. structure exposition — "this is Tier 0", "PO not bound by common", layering explanation.
  3. migration / history — "replaces old X", "TBD", "legacy", "previously at …".
  4. design justification — "why we split it this way".
  5. just-in-case — fields / options never used in action.
- **caps** — common habit ≤50 · persona habit ≤100 · bookshelf ≤100 · agent pointer ≤30. Over cap → curate down (habit) / graduate or archive (bookshelf).
- **layering** — a bookshelf on a hot read path (e.g. `routing.md`) splits by ACCESS LOGIC, not topic or cap: lean hot core holds per-action machinery; move turn-open / task-close / problem-only detail to named cold companions (`routing.md` → `calibration.md` → `escalation.md`). Stay slightly over cap when one topic reads all at once; split when parts read at different moments.
- **mode** — habit = curated rewrite, no source tag. bookshelf = append or extend-in-place + `(YYYY-MM-DD) [T-NNN]` source.
- **language** — doctrine body (every tier, habit + bookshelf) = English only — personas re-read it every session. Applies to new writes; never retro-translate existing entries. User-lang belongs in artifacts (tickets / PRD / DS), not doctrine. EXCEPTION: a negative-example LITERAL — the exact non-English string the actor must suppress or match against — stays verbatim in its emitted form; the literal IS the load-bearing anchor and translating it breaks the match. English-only still governs instruction prose + *illustrative / good-example* text (those go English or language-neutral). Keep the literal to the matched substring ONLY — never wrap surrounding non-English prose under the anchor banner. So: banned-string / match-target literals → keep verbatim (minimal substring) · good-example phrasing → English. <!-- (2026-06-30) [T-PATCH-277] -->
- **structure** — Tier 0 = `packages/core/doctrine/` (SoT) + `~/.productune/doctrine/` (byte-identical mirror, `install.sh` cp) · Tier 1 = `docs/<persona>/{habit,bookshelf}` · Tier 2 = `~/.productune/<persona>/{habit,bookshelf}` · agent pointers = `packages/core/agents/pdt-<role>.md`.

## Process
1. **SSoT-first** — before authoring / adding doctrine, LOCATE any existing authoritative home for the concern: a managed SSoT artifact (e.g. `docs/designer/design-system.md`), an existing bookshelf, or a persona doc — and READ it. Route the change INTO that home. Create a NEW doctrine file ONLY when no home exists. <!-- (2026-06-05) [T-PATCH-DOCTRINE] -->
2. **Delegate** (hold no Write/Edit): prose / content → designer · hooks / scripts / init → developer. Inject the rules above (P0 + target cap + mode) into the dispatch body.
3. **Verify + mirror** on return: cap held · actor-voice (no leak category) · mirror SoT `packages/core/doctrine/` → `~/.productune/doctrine/` byte-identical (or confirm assignee did).

## Impact checklist — sweep on every doctrine / layout change
Not done until each surface is applied or marked n/a:
- Tier 0 SoT `packages/core/doctrine/` + mirror `~/.productune/doctrine/` (byte-identical)
- Tier 1 `docs/<persona>/` · Tier 2 `~/.productune/<persona>/` (stale copies of the changed rule)
- Agent pointers `packages/core/agents/pdt-<role>.md`
- `packages/core/src/init.ts` — fresh init must embody the new layout (incl. latest `schema_v` stamp)
- `packages/core/scripts/install.sh` — install / update path
- `packages/core/migrations/` — existing projects need a migration when layout changes. A migration that touches `.productune/config.json` MUST merge in place (`jq` set only the changed keys), NEVER rewrite the whole file — a full rewrite silently drops untouched top-level fields (`slug`/`created_at`/`version`). Verify a load-bearing field survives after apply (e.g. `jq -e '.slug'`). <!-- (2026-06-12) oh-my-eyes slug lost via hand-applied 0004 -->
- Onboarding (`packages/gui/electron/ipc/onboarding.ts`)
- GUI layout detection / open-refresh (`packages/gui/electron/ipc/project.ts` `detectProductuneLayout`)
- Persona memory bootstrap (`bootstrapPersonaMemory`, init.ts)
- **Data-shape migration → update every GENERATOR, not just existing-data + readers.** A shape change (e.g. po-state `schema_version` 1→2) must enumerate + update ALL producers of new instances — init scaffold (`init-project.mjs`), CLI seed scripts (`scripts/productune` `ensure_state`), and the persona-authoring path (doctrine that drives the write) — else fresh instances are born in the old shape. <!-- (2026-06-16) [T-PATCH-141] -->
