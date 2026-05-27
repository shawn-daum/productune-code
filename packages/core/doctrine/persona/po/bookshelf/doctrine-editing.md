# Doctrine editing — orchestrate a doctrine change

Trigger: any doctrine change (a `type:doctrine` ticket or a doctrine fix) touching habit / bookshelf / agent pointer.

## Authoring rules (apply to every doctrine edit)
- **P0** — runtime doctrine is read BY a persona AT THE MOMENT OF ACTING; write every line as an act-time instruction to that actor. Strip author / maintainer-perspective. Keep these 5 leak categories OUT:
  1. maintenance meta — line caps, "English" / "caveman lite", style / length rules.
  2. structure exposition — "this is Tier 0", "PO not bound by common", layering explanation.
  3. migration / history — "replaces old X", "TBD", "legacy", "previously at …".
  4. design justification — "why we split it this way" rationale prose.
  5. just-in-case — fields / options never used in actual action.
- **caps** — common habit ≤50 · persona habit ≤100 · bookshelf ≤100 · agent pointer ≤30. Over cap → curate down (habit) / graduate or archive (bookshelf).
- **mode** — habit = curated rewrite, no source tag. bookshelf = append + `(YYYY-MM-DD) [T-NNN]` source.
- **structure** — Tier 0 = `packages/core/doctrine/` (SoT) + `~/.productune/doctrine/` (byte-identical mirror, `install.sh` cp) · Tier 1 = `docs/<persona>/{habit,bookshelf}` · Tier 2 = `~/.productune/<persona>/{habit,bookshelf}` · agent pointers = `packages/core/agents/pdt-<role>.md`. Full path table: `../../../common/bookshelf/sot-paths.md`.

## Process
1. **Delegate** (hold no Write/Edit): prose / content → designer · hooks / scripts / init → developer. Inject the rules above (P0 + the target file's cap + mode) into the dispatch task body.
2. **Verify + mirror** on return: cap held · actor-voice (none of the 5 leak categories) · mirror SoT `packages/core/doctrine/` → `~/.productune/doctrine/` byte-identical (or confirm the assignee did).
