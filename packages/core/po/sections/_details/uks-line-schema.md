# `## User knowledge state (engineering)` — line schema + update triggers

Lives in `~/.productune/po-memory.md`. Append-only.

```
- (YYYY-MM-DD [baseline|inferred|user-asserted]) <axis>: <level descriptor> — <one-line nuance> [· superseded YYYY-MM-DD]
```

| Field | Meaning |
|:--|:--|
| `YYYY-MM-DD` | append date (UTC) |
| `baseline / inferred / user-asserted` | trust origin. `baseline` = install / first capture. `inferred` = PO inferred from session trace. `user-asserted` = user directly enumerated. |
| `<axis>` | knowledge axis label (e.g. `Electron IPC`, `React lifecycle`, `Zustand store`, `Race conditions / event ordering`, `Architecture trade-offs`, `Unclear / probable gaps`). Extensible — new axis allowed; doctrine taxonomy table no cap. |
| `<level descriptor>` | `fluent` > `solid` > `comfortable` > `concept-level fluent` > `partial` > `gap`/`unclear` |
| `<one-line nuance>` | what is known, what is gap — 1 line |
| `· superseded YYYY-MM-DD` | optional. when superseded by next entry |

## Update triggers (PO writes per `po-loop.md` Step 3 #14c)

- user enumerates own fluency → `user-asserted` line append.
- user pushback + primitive-level demonstration → `inferred` line, level down 1 notch, supersede prior.
- user corrects PO with deeper terminology → `inferred` line, level up 1 notch, supersede prior.

PO never guesses upward without trace evidence; never deletes prior entries; pruning (≥30 entries) = doctrine-future (mark `[ARCHIVED <date>]` only).
