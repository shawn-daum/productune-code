# JSON output envelope schema

Every persona dispatch returns a single JSON object. ≤100 lines.

## Required fields
| field | type | max | note |
|:--|:--|:--|:--|
| `persona` | string | — | `pdt-designer` / `pdt-developer` / `pdt-qa` / `pdt-po` |
| `task` | string | 80 | short task descriptor |
| `session_id` | string | — | matches `--session-id` (= ticket-id within ticket) |
| `summary` | string | 200 | machine-readable outcome of the turn |
| `confidence` | number | 0..1 | self-assessed |
| `promotion_candidates` | array | — | always present; `[]` when nothing to promote |

## Optional fields
| field | type | when |
|:--|:--|:--|
| `user_surface` | string ≤500 | omit on plan-only / needs-info / blocked / doc-no-functional turns |
| `open_questions` | array<string> | ambiguity needing user input |
| `unresolved` | array<string> | known gaps for follow-up |
| `blocked` | boolean | true → explain in `summary` |
| `refused` | boolean | scope-violation refusal |
| `state` | enum | `ready` \| `needs-info` (PRD clarity loop) |
| `next_question` | string | when `state: needs-info` |
| `files_written` | array<path> | doc-write turns |
| `external_tool_recommendation` | object | designer: out-of-ability tool referral `{tool, why_external, prompt, expected_output_path}` |

## Output rules
- stdout char 0 = `{`
- no markdown prose outside JSON string values
- no markdown tables outside JSON string values
- one object per dispatch (no array, no NDJSON)

## Refusal envelope
```json
{"persona":"<id>","refused":true,"reason":"<why>","suggested_persona":"<id>"}
```

## Plan-mode envelope
`summary` set + `user_surface` omitted + no file writes. PO surfaces plan-only.

## Needs-info envelope (PRD clarity loop)
```json
{"state":"needs-info","next_question":"<one question>","summary":"<paraphrase>","confidence":0.6,"promotion_candidates":[]}
```

## Blocked envelope
```json
{"blocked":true,"reason":"<why>","summary":"<context>","promotion_candidates":[]}
```
