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
- **mode** — habit = curated rewrite, no source tag. bookshelf = append + `(YYYY-MM-DD) [T-NNN]` source.
- **structure** — Tier 0 = `packages/core/doctrine/` (SoT) + `~/.productune/doctrine/` (byte-identical mirror, `install.sh` cp) · Tier 1 = `docs/<persona>/{habit,bookshelf}` · Tier 2 = `~/.productune/<persona>/{habit,bookshelf}` · agent pointers = `packages/core/agents/pdt-<role>.md`.

## Process
1. **Delegate** (hold no Write/Edit): prose / content → designer · hooks / scripts / init → developer. Inject the rules above (P0 + target cap + mode) into the dispatch body.
2. **Verify + mirror** on return: cap held · actor-voice (no leak category) · mirror SoT `packages/core/doctrine/` → `~/.productune/doctrine/` byte-identical (or confirm assignee did).
