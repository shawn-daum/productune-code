# Surface config — build/smoke commands (`.productune/config.json` → `surfaces`)

QA resolves build & smoke commands from project config — never by guessing from the repo
(legacy fallback only when the block is absent; recommend migration 0004).

## Schema

```json
"surfaces": {
  "<name>": {
    "type": "web | electron | ios | android | node-lib | cli | server",
    "build": "<shell — prod build>",
    "build_dev": "<optional: dev build when it differs>",
    "smoke": "<shell | null — null = not scripted yet>",
    "smoke_driver": "playwright | playwright-electron | maestro | script | manual"
  }
}
```

## Resolution rules (QA)

- Ticket touches surface X → run `surfaces[X].build` (and `build_dev` where applicable),
  then `surfaces[X].smoke`. Exit 0 + clean error log = green.
- `smoke: null` → manual fallback; document in `summary` — never silent-skip.
- Driver map: web → playwright · electron → playwright-electron (scripted
  `_electron.launch`, NOT the browser MCP) · ios / android → maestro.

## maestro wiring (ios / android) — two parts, both required (2026-06-22) [T-PATCH-227]

A mobile smoke runs only when BOTH exist; either missing = effectively `smoke: null`.
1. config command — `surfaces[X].smoke` = the maestro invocation (e.g.
   `maestro test .maestro/`). Authored by PO; committed in `config.json`.
2. flow file — `.maestro/*.yaml` holding the actual test scenario. Committed to
   the repo, NEVER gitignored — so a device clone gets the same smoke. Owner: the
   `type:test` ticket's dev/designer deliverable (PO authors only the config command
   + `.maestro/` path string); location is repo-root `.maestro/`.
A device with command set but no flow file (or flow gitignored) is the cross-device
drift: one machine runs, another falls to null. Treat a missing flow file the same
as a null command — manual fallback + `summary` note, never silent-skip.

## Driver prerequisites (env fail ≠ product fail)

- playwright / playwright-electron / script — repo-local devDependencies:
  install green = env ready; no gate step.
- maestro (ios / android) — OS-level, NOT repo-installable:
  iOS = Xcode + simulator runtime (`xcodebuild -downloadPlatform iOS`) ·
  Android = SDK + AVD. PO verifies at P3 open (po `lifecycle/p3-build.md`).
- A smoke failure from a missing device / driver is an ENV fail, not a product
  fail: QA → manual fallback + `summary` note — never a product `qa_status: fail` row.

## Write rules

- Owner: PO — authors entries at init and whenever a surface or its build changes
  (PO habit write whitelist; diff surfaced to the user).
- Mobile surfaces (ios / android): PO authors BOTH the `smoke` maestro command and
  the `.maestro/` flow path it points at; do not leave `smoke: null` by default. If
  the scenario is genuinely unwritten, name that fact in the close-gate / summary
  (silent null forbidden) — do not let it pass as a quiet skip.
- QA is read-only on this file and on `surfaces`.
