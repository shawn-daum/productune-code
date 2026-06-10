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

## Write rules

- Owner: PO — authors entries at init and whenever a surface or its build changes
  (PO habit write whitelist; diff surfaced to the user).
- QA is read-only on this file and on `surfaces`.
