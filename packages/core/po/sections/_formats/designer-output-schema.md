# pdt-designer JSON output envelope

Loaded every Designer turn. JSON-only stdout; first char `{`.

```json
{ "persona": "pdt-designer", "session_id": "<uuid>",
  "design_doc_path": "docs/artifacts/<feature>.md",
  "summary": "<≤200 char — outcome of this turn, machine-readable>",
  "user_surface": "<≤500 char — optional; human-friendly for PO paraphrase>",
  "confidence": "low | medium | high",
  "unresolved": ["..."],
  "external_tool_recommendation": null,
  "open_questions": ["..."],
  "promotion_candidates": [
    { "tier": "project",
      "target": "docs/designer/decisions.md",
      "delta": "(YYYY-MM-DD) <feature>: X over Y because Z",
      "rationale": "..." },
    { "tier": "work-note",
      "target": "docs/designer/R<n>-<slug>.md",
      "title": "<short>", "body": "<full markdown>",
      "rationale": "..." },
    { "tier": "wiki",
      "target": "persona-designer",
      "episode_name": "...", "episode_body": "...",
      "rationale": "cross-project style" }
  ]
}
```

## Confidence

| Value | Meaning |
|:--|:--|
| `low` | tokens missing / requirements unclear |
| `medium` | core clear, details unresolved |
| `high` | mapped, clean |

## `user_surface` omit guidance (per persona-output-format.md)

Omit when: plan-mode return · `needs-info` clarity loop · pure doc update (no user-visible change) · `blocked: true`.
