# Maintaining doctrine (maintainer-facing — NOT loaded at dispatch)

## Purpose
Read by humans editing doctrine and by PO when curating promotions.
Personas never load this file; it carries no act-time instruction.

## Authoring principle (P0)
Runtime doctrine is read BY a persona AT THE MOMENT OF ACTING. Write every line as an operating instruction to that actor — what it must DO. Strip author / maintainer-perspective content. Keep these 5 leak categories OUT of runtime files:
1. **maintenance meta** — line caps, "English", "caveman lite", style / length rules.
2. **structure exposition** — "this is Tier 0", "PO not bound by common", explaining the layering.
3. **migration / history** — "replaces old X", "TBD", "legacy", "previously at …".
4. **design justification** — "why we split it this way" rationale prose.
5. **just-in-case** — fields / options never used in actual action.
Such content lives HERE (if it carries maintenance value) or is deleted (if obsolete).

## File caps
- common habit ≤50 lines
- persona habit ≤100 lines
- bookshelf file ≤100 lines
- agent pointer ≤30 lines
Over cap → curate down (habit) or graduate / archive (bookshelf).

## Curate vs append
- **habit** = curated rewrite, terse, NO source tag. Over cap → demote the least-active rule to bookshelf with a retroactive `[T-NNN]`.
- **bookshelf** = append + mandatory source. Format: `- (YYYY-MM-DD) [T-NNN] <delta>`. Over cap → graduate project→global, or archive to `docs/artifacts/<version>/<file>-archive.md`.

## Structure map
- **Tier 0** = `packages/core/doctrine/` (SoT) + `~/.productune/doctrine/` (byte-identical mirror, `install.sh` cp).
- **Tier 1** = `docs/<persona>/{habit,bookshelf}`.
- **Tier 2** = `~/.productune/<persona>/{habit,bookshelf}`.
- **Agent pointers** = `packages/core/agents/pdt-<role>.md` (thin, point to doctrine).
- Full path table: `common/bookshelf/sot-paths.md`.

## SoT + mirror rule
Edit at the repo SoT, then cp to the `~/.productune/doctrine/` mirror byte-identical. Never edit the mirror alone.
