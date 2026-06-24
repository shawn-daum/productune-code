# Artifacts — placement, format, manifest (`docs/artifacts/<version>/manifest.json`)

Every user-gate deliverable in `docs/artifacts/<version>/` is addressed through the
manifest — the GUI reads the manifest, NOT directory globs or magic filenames. A file
absent from the manifest = misplaced (lint-flagged).

## Candidate vs adopted (lifecycle)  (2026-06-24) [T-PATCH-248]

A rendered artifact has two lifecycle states; the layout itself encodes them — `archive/` =
candidate, flat = adopted. Only the **adopted** one is SoT. (Distinct from the *promotion*
candidate/adopt of `common/bookshelf/promotion-candidate-schema.md` — that governs doctrine; this
governs `docs/artifacts/`.)

- **candidate** — an option produced while exploring (the options a step surfaces at its gate: S2
  system showcases, S3 mockup options, S5 hi-fi takes) **and** any version a later one supersedes.
  **Local-forced**: a candidate-of-record is a real git-tracked file in
  `docs/artifacts/<version>/archive/`. A claude-code native artifact (hosted preview) is allowed
  only as throwaway visual scratch for a gate — never the candidate of record. **Non-SoT,
  manifest-unregistered, excluded** from the GUI "currently important" pins.
- **adopted** — the one chosen at the gate (one per surface). **SoT**: promoted to the flat
  `docs/artifacts/<version>/` location + a manifest entry (`kind`/`source`/`source_hash`, schema
  below). The flat dir holds adopted+registered files only — exactly what the build and the user
  gate read from.

## Adopt = deterministic promote (owner: designer; PO on status)  (2026-06-24) [T-PATCH-248]

Adoption is an **explicit persona write**, never an inference that "claude will have left it in the
repo." On a gate accept, the adopting persona MUST, in the same task:

1. **Promote the chosen file** `archive/<name>` → flat `docs/artifacts/<version>/<ticket-id>-<slug>.<ext>`.
   If the option only existed as a claude-hosted preview, **pull its content into the repo as a real
   file** first — do not link a hosted URL as the SoT.
2. **Write/update its manifest entry** (`status: "pending"`, per Write rules below) — same task, same
   write, never deferred.

The non-chosen options stay in `archive/` — no keep-vs-discard call (dead ones are reclaimed by the
archive-tidy cadence, not at adopt time). Relying on claude's native artifact persistence for SoT is
the failure this rule closes: a hosted preview can satisfy a gate yet leave the repo with no
committed file + no manifest row.

> Enforcement is **persona discipline** here, not a coded gate. A close-gate / hook check that an
> adopted artifact exists on disk + in the manifest is a separate impl decision (T-PATCH-249); this
> file states only the rule personas follow. Candidates carry no such obligation.

## Placement & format (owner: designer)

- **Criterion = user-gate, NOT file extension**: anything needing user review / confirmation
  (design artifacts / specs / mockups, PRD gate view, user-shared retrospective) lives here;
  internal files the PO self-verifies (working flows, build plans, DS snapshots, notes) never
  do — route them to their SoT home (`docs/designer/…`, `docs/retrospectives/…`, etc).
- **Language**: author in `[ctx].user_lang` (default `en`).
- **Format follows the deliverable's nature**: rendered spec / mockup / PRD-view = HTML;
  an inherently-textual deliverable (terms, policy) MAY be md.
- Flat layout — no sub-folders except `archive/`; grouping lives in the filename
  (`<ticket-id>-<slug>.<ext>`).

## Schema (schema_v 1)

```json
{
  "schema_v": 1,
  "version": "v0.5",
  "entries": [
    {
      "path": "T-004-a9-mockup.html",      // relative to the version dir; archive/<name> for archived
      "ticket": "T-004",                    // source ticket id, null if none
      "kind": "mockup",                     // prd-view | mockup | wireframe | design-system | asset | spec | doc
      "status": "pending",                  // pending | approved | archived
      "lang": "ko",                         // BCP-47 — user-gate deliverables are user_lang
      "source": "docs/prd/PRD.md",          // optional: SoT this file was rendered from
      "source_hash": "sha256:…",            // optional: source content hash at render time (stale detection)
      "added_at": "2026-06-10T00:00:00Z"
    }
  ]
}
```

## Write rules

- **Authoring persona** (designer): every **adopted** (flat) `docs/artifacts/<version>/` file write
  MUST add/update its manifest entry in the same task — `status: "pending"` until the user gate
  decides. Candidates in `archive/` are exempt — not registered (see Candidate vs adopted above).
- **PO** (mechanical whitelist): `status` lifecycle only — `pending → approved` on user
  accept; `→ archived` on reject/supersede (move file to `archive/`, update `path`).
  Never authors other fields.
- **Entry ≠ promotion**: manifest writes are part of the artifact write itself, not the
  promotion gate.
- Lint: `scripts/ci/check-artifact-manifest.sh` — unregistered files + dangling entries fail.
  Scope is the flat version dir only; `archive/` (candidates + superseded) is exempt. Because flat
  holds adopted+registered files only, the lint passes naturally — the only needed skip is
  `archive/`. (That script change is impl, T-PATCH-249.)
