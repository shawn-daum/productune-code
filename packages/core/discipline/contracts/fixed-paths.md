---
name: fixed-paths
section: Fixed paths
when: "authoring or updating a `docs/features/<feature>.md` spec file · closing a PRD `## v<N>.<m>` version section, a `## Phase N` section, or a round that wrote no section · retiring a standing PRD section that is not a version section · writing, comparing or sorting a version id · landing a user-review artifact (the root manifest) · setting or reading a register value · deciding whether a design/token file is meta or code"
---
# Contracts §Fixed paths — annex

Continues `contracts.md` §Fixed paths; binds every persona the same way, loaded on demand at the moment `when` names.

## Version id — what `v<N>.<m>` names
- A version id carries one, two or three numeric components: `v1` · `v1.1` · `v1.1.0` are each legal, the third component being a patch round. `v<N>.<m>` written in a rule or a path template names the id itself, never a required component count.
- Fill the missing components with zero to compare, sort, or test two ids for naming the same round (`v1` ≡ `v1.0` ≡ `v1.0.0`). Read a name on disk exactly as written — a round's directory and file names are never rewritten to a longer form to satisfy a comparison; a tool that rejects the shorter form, or cannot find the file it names, is the defect.

## PRD — closing a `## v<N>.<m>` version section
- `docs/prd/PRD.md` holds the standing head + the ONE open version section; `docs/prd/versions/` holds the closed ones, one file per round, named for that round's version id plus `.md` (`v1.md` · `v1.1.md` · `v1.1.0.md`, the third component being a patch round) — `ls` is the index: no index file, no shared history file. A round recorded under a regime that predates sections (a whole-document snapshot) stays the file that regime left, named from the standing head, never rewritten into a section file.
- Closing = cut the whole `## v<N>.<m>` block (heading through the line before the next `## `, or EOF) out of `PRD.md`, write it verbatim as the ENTIRE body of `docs/prd/versions/v<N>.<m>.md` — that block and nothing else: no frontmatter, no head, nothing above the heading — open the next version section in `PRD.md`, and prove the move with a byte compare of the block (`shasum` before/after, each side rstripped: the blank line that separates two sections belongs to the FILE, not to the block, so a raw compare fails on a separator the move never touched) — a rewrite during the move breaks the immutable-record rule. The only later write is a supersede note appended at the end of the file.
- A round that wrote no PRD section (tickets-only, by decision) still gets its file: `docs/prd/versions/v<N>.<m>.md` whose whole body is ONE line — `no PRD section — <the decision page or user line that made it tickets-only>` — never a `## ` heading, so a check tells a stub from a section by the heading alone. That stub is the ONE home for a registered absence; the standing head never lists absent rounds. A ticket dir `docs/tickets/v<N>.<m>/` with no `docs/prd/versions/v<N>.<m>.md` is the gap `prdt doctor` reports; a closed `## v<N>.<m>` section anywhere but its own file is a failure it reports.
- No file under `docs/prd/versions/` is named `PRD.md` — a resolver takes the FIRST match over `docs/prd/PRD.md` · `docs/PRD.md` · `PRD.md`, and a file on any of them is served as the current PRD with nothing raising an error. Citation of a closed section: `docs/prd/versions/v<N>.<m>.md` (a `#<heading>` anchor for a subsection); a dispatch `prd_path` always names the open section in `PRD.md`.
- Retiring a standing section that is NOT a version section (an inherited reference list, an open-questions list, an activity log the rounds outgrew): record the retirement in the standing head of `docs/prd/PRD.md` — what the section held, where its last state survives (a file that still carries the same content, or the commit that holds it), and what decided it — and then delete the section. It never becomes a file under `docs/prd/versions/`: that store holds rounds, and a check reads a file there as one. The two cases are opposites and never borrow each other's home — an absent round takes the stub above and no head line, a retired standing section takes the head line and no file.

## PRD — closing a `## Phase N` section
- Closing one rewrites that heading away into a `완료된 라운드` snapshot pointer — same precedent as Phase 1~3 — never left in place with an appended note.

## `docs/features/<feature>.md` — what a spec file holds
- Holds the CURRENT contract only — every fact carries `(vX~)` or `(vX~vY, replaced-by …)`, and an invalidated fact is annotated, never deleted; history · lessons · provenance stay in `docs/wiki/`.

## `docs/features/<feature>.md` — spec-file frontmatter, wikilinks, the doctor seam
- Frontmatter edges are a closed vocabulary, forward direction only (the reverse is a grep): `depends-on: []` · `parent:`. Never `[[…]]` here — `prdt wiki lint` covers `docs/wiki/` alone, so a wikilink out of that store is an unchecked dead link. `prdt doctor` watches the seam: orphan spec files · promotion candidates (done tickets in ≥2 version dirs, unjudged) · stale `features.non_features` entries (`.prdt/config.json`).

## User-review artifacts — the root manifest
- `docs/artifacts/manifest.json`, one file for every bucket: each entry carries `bucket` (its version dir) beside `path · ticket · kind · status · lang · added_at`. `prdt artifacts sync` derives it from disk and later runs preserve the values a person filled — never hand-write it. `prdt doctor` and `prdt artifacts check` report any file the bucket rule cannot place, any file the manifest has not registered, and any `manifest.json` inside a bucket.

## Register — file syntax, resolver, bodies
- One `key=value` per line, line-leading `#` comments (a trailing `#` after a value is not a comment — it becomes part of the value), unknown keys ignored. The resolver (`prdt-audience-inject.sh`; `prdt register --list` prints the domain) is the sole authority on legal values — an out-of-domain value resolves to the default and reaches no reader. Bodies `discipline/register/<key>-<value>.md` name the surfaces they shape in `governs:`.

## Meta/code split — the cases
- A design/token contract or build pipeline the code imports or builds from (e.g. `tokens.json` → a token build script) is code no matter the subject matter — fix only the design doc's location, and treat any code-side design implementation, tokens or otherwise, as agnostic: standing up a pipeline moves its output to code. A file serving both roles (human spec + build contract) splits into a doc (meta) + generated/config artifact (code); when it can't split, the whole file lives in code — this fallback never reaches `docs/design.md` itself, which the Fixed paths table already fixes as meta.
