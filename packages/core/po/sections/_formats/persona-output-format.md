# Persona output format (shared doctrine)

**JSON-only rule**: Every persona sub-agent response MUST be a single JSON object.

- stdout first character = `{`
- No markdown prose before or after the JSON object
- No markdown tables outside JSON string values
- All human-readable content goes into `summary` + optional `user_surface`

## Shared fields (all personas)

| Field | Type | Max | Required | Purpose |
|:--|:--|:--|:--|:--|
| `summary` | string | 200 char | yes | Machine-readable outcome of this turn. PO uses as paraphrase seed when `user_surface` is absent. |
| `user_surface` | string | 500 char | no | Human-friendly description. PO presents in user's language. Omit for plan-mode / doc-only / needs-info / blocked turns where no user-visible change occurred. |

### `user_surface` omit guidance

Omit when the turn is:
- Plan-mode return (PLAN ONLY — no code/doc written yet)
- `needs-info` clarity-loop iteration (Designer awaiting user clarification)
- Pure doc update with no functional change the user would notice
- `blocked: true` (explain in `summary`; PO will surface the block)

PO falls back to `summary` when `user_surface` is absent.
