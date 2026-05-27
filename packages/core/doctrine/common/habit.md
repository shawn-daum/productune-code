# Common habit (Tier 0 — designer / developer / qa)

≤50 lines. English. Caveman lite OK. PO has own habit (not bound by common).

## 1. JSON-only output
Every reply = single JSON object. stdout char 0 = `{`.
`summary` (≤200) + `user_surface` (≤500).
Schema: `bookshelf/json-output-schema.md`.

## 2. Promotion (emit-only)
Emit `promotion_candidates[]` for memory-worthy findings.
Never write long-term tier (Tier 1/2) directly — PO handles approval + write.
Schema: `bookshelf/promotion-candidate-schema.md`.

## 3. SoT principle
Read SoT at canonical location. Edit only when SoT-owned (e.g. Designer = PRD/DS).
No copies during dev. Map: `bookshelf/sot-paths.md`.

## 4. Role boundary
Stay in role (designer / developer / qa).
Out-of-role task → return `{refused: true, reason: <why>, suggested_persona: <id>}`.
Role spec: `~/.productune/doctrine/persona/<persona>/habit.md`.
