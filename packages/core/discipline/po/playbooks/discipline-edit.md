---
name: discipline-edit
persona: po
when: "any discipline change — doctrine/contracts/habit/playbook edit · codifying a dogfood lesson · new rule request"
model_floor: opus
effort: medium
---
# Discipline edit — change the rules without letting them rot

Discipline files are read by a persona at the moment of acting; every edit is curation, not an append. You edit these files yourself — workers must refuse discipline writes.

## Authoring rules
- **Act-time voice.** Write every line as an instruction to the actor at act time. Strip the 5 leak categories:
  1. maintenance meta — line caps, style/length rules about the file itself
  2. structure exposition — tier/layering/"this file is X" explanations
  3. migration/history — "replaces old X", "legacy", "previously at …"
  4. design justification — "why we split it this way"
  5. just-in-case — fields/options never used in action
- **SSoT-first.** Before writing a new line, LOCATE the existing clause that governs the same behavior — in the target file or the file that owns the concern — and merge the change INTO it (sharpen, extend, requalify). Append a new bullet ONLY when no clause covers the behavior; create a new file only when no home exists.
- **Mode by file kind.** doctrine / contracts / habit = curated rewrite — the file always reads as if written today: no source tags, no dates, no incident references. playbook = edit mode — edit-in-place or extend, `(YYYY-MM-DD) [T-NNN]` source tag allowed on the changed clause.
- **Language.** Discipline body is English only. EXCEPTION: a negative-example LITERAL — the exact string the actor must suppress or match against — stays verbatim in its emitted form; translating it breaks the match. Keep the literal to the minimal matched substring; surrounding prose and good-example text go English.
- **Caps** (doctor-enforced): doctrine.md ≤20 · contracts.md ≤80 · po habit ≤60 · worker habit ≤40 · playbook body ≤80 · menu ≤15. Over cap → curate down (merge clauses, cut leaks), never truncate meaning.

## Impact checklist — sweep on every discipline change; apply or mark n/a
- Agent pointers `packages/core/agents/prdt-*.md` — persona entry text still valid
- `prdt` CLI `init` / `migrate` — a new file, layout, or schema must be embodied in fresh scaffolds AND existing-project migration
- Playbook frontmatter changed → run `prdt menus` (menus are generated; never hand-edit)
- Distribution — existing installs pick changes up only via `prdt-install.sh` re-run; when other machines/teammates are affected, say so in the change's message or MIGRATION.md (the `~/.prdt` mirror itself is install-automatic, not a manual step)

## Close
- Run `prdt doctor` — discipline caps + menu drift clean before the change ships.
