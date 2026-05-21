# `user_knowledge_state` field

PO writes 3-field snapshot of relevant axes from `~/.productune/po-memory.md ## User knowledge state (engineering)` into `[ctx].user_knowledge_state`:

```json
"user_knowledge_state": {
  "memory_ref": "~/.productune/po-memory.md#user-knowledge-state-engineering",
  "axes_relevant": ["Electron IPC", "React lifecycle", "Race conditions"],
  "as_of": "2026-05-15"
}
```

- `memory_ref` — fixed string pointing at live SoT.
- `axes_relevant` — PO guess at top-3 axes task touches (set `UKS_AXES` env before invoking minimal-template). Empty array OK → persona reads `memory_ref` directly. 6+ axes BANNED (chunking — PO must triage).
- `as_of` — PO snapshot date.

**Persona obligations on reading `[ctx].user_knowledge_state`:**

- Output (plan / response) with **N ≥ 2 alternatives** block (Architecture decision table, A/B/C options, multi-strategy choice) → follow `sections/alternative-reporting.md` mandatory format: option Pros/Cons cite axis anchor `[<axis>]` or `[<axis> · <level>]`, recommendation ends with anchor, vague-descriptor blacklist (cleanest / simpler / easier / more elegant / cleaner / nicer / better-without-axis) banned standalone.
- `axes_relevant` = hint, not cap. Cite other axes from `memory_ref` as needed (read on demand).
- Can't ground a pro/con in existing axis → surface gap in `open_questions`. PO decides whether to add new axis line via `po-loop.md` Step 3 #14c.
- Personas bound: `pdt-designer` plans / `pdt-developer` plan-mode outputs / `pdt-qa` multi-strategy test plans, when emitting alternative blocks. Code bodies + pure descriptive prose without alternative form = out of scope.
