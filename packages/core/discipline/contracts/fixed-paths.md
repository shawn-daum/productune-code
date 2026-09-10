---
name: fixed-paths
section: Fixed paths
when: "authoring or updating a `docs/features/<feature>.md` spec file · closing a PRD `## v<N>.<m>` version section or a `## Phase N` section · landing a user-review artifact (the bucket manifest) · setting or reading a register value · deciding whether a design/token file is meta or code"
---
# Contracts §Fixed paths — annex

Continues `contracts.md` §Fixed paths; binds every persona the same way, loaded on demand at the moment `when` names.

## PRD — closing a `## v<N>.<m>` version section (T-602)
- `docs/prd/PRD.md` holds the standing head + the ONE open version section; `docs/prd/history.md` holds every closed one, v0.5 onward, in close order (v0.1~v0.4 stay in `docs/prd/versions/v0.4.md` — the retired snapshot regime's sole record, a whole-document snapshot that is never spliced into the `## v` run). Closing = cut the whole `## v<N>.<m>` block (heading through the line before the next `## `, or EOF) out of `PRD.md`, append it verbatim to the end of `history.md`, open the next version section in `PRD.md`, and prove the move with a byte compare of the block (`shasum` before/after) — a rewrite during the move breaks the immutable-record rule.
- History stays ONE lump: nothing machine-reads a closed section (ntf-pm's portfolio pipe reads only the open section, first match of `docs/prd/PRD.md` · `docs/PRD.md` · `PRD.md`, verified 2026-09-10) — so the history file is never named `PRD.md` and never sits at one of those three paths, or first-match would serve history as the current PRD without an error. Citation form for a closed section: `docs/prd/history.md#v<N>.<m>`; a dispatch `prd_path` always names the open section in `PRD.md`.

## PRD — closing a `## Phase N` section
- Closing one rewrites that heading away into a `완료된 라운드` snapshot pointer — same precedent as Phase 1~3 — never left in place with an appended note.

## `docs/features/<feature>.md` — what a spec file holds
- Holds the CURRENT contract only — every fact carries `(vX~)` or `(vX~vY, replaced-by …)`, and an invalidated fact is annotated, never deleted; history · lessons · provenance stay in `docs/wiki/`.

## `docs/features/<feature>.md` — spec-file frontmatter, wikilinks, the doctor seam
- Frontmatter edges are a closed vocabulary, forward direction only (the reverse is a grep): `depends-on: []` · `parent:`. Never `[[…]]` here — `prdt wiki lint` covers `docs/wiki/` alone, so a wikilink out of that store is an unchecked dead link. `prdt doctor` watches the seam: orphan spec files · promotion candidates (done tickets in ≥2 version dirs, unjudged) · stale `features.non_features` entries (`.prdt/config.json`).

## User-review artifacts — the bucket manifest
- `manifest.json` fields: `path · ticket · kind · status · lang · added_at`. `prdt artifacts sync` derives it from disk and later runs preserve it — never hand-write it. `prdt doctor` reports any file the bucket rule cannot place or the manifest has not registered.

## Register — file syntax, resolver, bodies
- One `key=value` per line, line-leading `#` comments (a trailing `#` after a value is not a comment — it becomes part of the value), unknown keys ignored. The resolver (`prdt-audience-inject.sh`; `prdt register --list` prints the domain) is the sole authority on legal values — an out-of-domain value resolves to the default and reaches no reader. Bodies `discipline/register/<key>-<value>.md` name the surfaces they shape in `governs:`.

## Meta/code split — the cases
- A design/token contract or build pipeline the code imports or builds from (e.g. `tokens.json` → a token build script) is code no matter the subject matter — fix only the design doc's location, and treat any code-side design implementation, tokens or otherwise, as agnostic: standing up a pipeline moves its output to code. A file serving both roles (human spec + build contract) splits into a doc (meta) + generated/config artifact (code); when it can't split, the whole file lives in code — this fallback never reaches `docs/design.md` itself, which the Fixed paths table already fixes as meta.
