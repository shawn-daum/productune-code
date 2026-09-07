---
name: fixed-paths
section: Fixed paths
when: "authoring a `docs/features/<feature>.md` spec file · deciding whether a design/token file is meta or code"
---
# Contracts §Fixed paths — annex

Continues `contracts.md` §Fixed paths; binds every persona the same way, loaded on demand at the moment `when` names.

## `docs/features/<feature>.md` — spec-file frontmatter, wikilinks, the doctor seam
- Frontmatter edges are a closed vocabulary, forward direction only (the reverse is a grep): `depends-on: []` · `parent:`. Never `[[…]]` here — `prdt wiki lint` covers `docs/wiki/` alone, so a wikilink out of that store is an unchecked dead link. `prdt doctor` watches the seam: orphan spec files · promotion candidates (done tickets in ≥2 version dirs, unjudged) · stale `features.non_features` entries (`.prdt/config.json`).

## Meta/code split — the cases
- A design/token contract or build pipeline the code imports or builds from (e.g. `tokens.json` → a token build script) is code no matter the subject matter — fix only the design doc's location, and treat any code-side design implementation, tokens or otherwise, as agnostic: standing up a pipeline moves its output to code. A file serving both roles (human spec + build contract) splits into a doc (meta) + generated/config artifact (code); when it can't split, the whole file lives in code — this fallback never reaches `docs/design.md` itself, which the Fixed paths table already fixes as meta.
