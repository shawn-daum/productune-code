# Artifacts — placement, format, manifest (`docs/artifacts/<version>/manifest.json`)

Every user-gate deliverable in `docs/artifacts/<version>/` is addressed through the
manifest — the GUI reads the manifest, NOT directory globs or magic filenames. A file
absent from the manifest = misplaced (lint-flagged).

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

- **Authoring persona** (designer): every `docs/artifacts/` file write MUST add/update its
  manifest entry in the same task — `status: "pending"` until the user gate decides.
- **PO** (mechanical whitelist): `status` lifecycle only — `pending → approved` on user
  accept; `→ archived` on reject/supersede (move file to `archive/`, update `path`).
  Never authors other fields.
- **Entry ≠ promotion**: manifest writes are part of the artifact write itself, not the
  promotion gate.
- Lint: `scripts/ci/check-artifact-manifest.sh` — unregistered files + dangling entries fail.
