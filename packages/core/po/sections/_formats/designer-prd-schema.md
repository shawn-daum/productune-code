# Designer PRD JSON returns + output paths

Loaded on-demand during PRD authoring (clarity loop).

## Return schemas

```json
// needs-info
{ "state": "needs-info", "session_id": "<uuid>",
  "next_question": "<one question>", "missing_slot": "<slot key>",
  "ambiguity_score": <0..1>, "iteration": <int>, "confidence": <0..1> }
```

```json
// ready
{ "state": "ready", "session_id": "<uuid>",
  "prd_path": "docs/prd/<version>.md",
  "user_prd_path": "docs/artifacts/<version>/PRD.md",
  "tickets": ["T-NNN", "..."],
  "ambiguity_score": <0..1>,
  "slot_clarity": { "<slot>": <0..1> },
  "version_outcome": { "north_star": "...", "input_metrics": ["..."],
                       "validation_method": "..." },
  "confidence": <0..1>, "unresolved": ["..."] }
```

## PRD output paths (both Designer-authored)

- `prd_path` = `docs/prd/<version>.md` — canonical English; downstream persona read source.
- `user_prd_path` = `docs/artifacts/<version>/PRD.md` — user-lang view (translate from master if user writes non-English; same content if English).
