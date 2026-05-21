# turn activity log

Per-task JSONL files (`<task-slug>.jsonl`). One line per persona invocation:
`{ ts, persona, task_slug, ticket_id, version, turn_index, input_meta, wiki_consult, output_full, promotion_outcome }`.
Written by PO. Raw truth; `.productune/po-state.json` is the summary.
