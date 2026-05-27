# JSON output envelope schema

Optional fields + situational envelopes. Core required-field format: see common/habit rule 1.

## Optional fields
| field | type | when |
|:--|:--|:--|
| `open_questions` | array<string> | ambiguity needing user input |
| `unresolved` | array<string> | known gaps for follow-up |
| `blocked` | boolean | true → explain in `summary` |
| `refused` | boolean | scope-violation refusal |
| `state` | enum | `ready` \| `needs-info` (PRD clarity loop) |
| `next_question` | string | when `state: needs-info` |
| `files_written` | array<path> | doc-write turns |
| `external_tool_recommendation` | object | designer: out-of-ability tool referral `{tool, why_external, prompt, expected_output_path}` |

## Refusal envelope
```json
{"persona":"<id>","refused":true,"reason":"<why>","suggested_persona":"<id>"}
```

## Plan-mode envelope
`summary` set + no file writes. PO surfaces plan-only.

## Needs-info envelope (PRD clarity loop)
```json
{"state":"needs-info","next_question":"<one question>","summary":"<paraphrase>","confidence":0.6,"promotion_candidates":[]}
```

## Blocked envelope
```json
{"blocked":true,"reason":"<why>","summary":"<context>","promotion_candidates":[]}
```
