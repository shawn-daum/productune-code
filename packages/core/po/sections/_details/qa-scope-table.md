# §QA scope — mandatory doctrine

Every `plan.md` and every `type:design` ticket body **must** include a `## §QA scope`
section. Insert after `§Out of scope`, before `§Open Questions` (or at end if absent).

## §QA scope (template)

| Field | Value |
|:--|:--|
| **QA invoke** | `auto pdt-qa dispatch` \| `manual smoke only` \| `skip` |
| **test target** | [function / component / e2e flow — or `—` if skip] |
| **사용자 dogfood** | [PO asks user to verify directly. `—` if none] |
| **regression check** | [file path or feature. `—` if none] |

## QA invoke selection guide

| Choice | When |
|:--|:--|
| `auto pdt-qa dispatch` | Multi-step flow ≥3 steps; risk_flags = auth/payments/PII; same area ≥3 cumulative fail-patterns |
| `manual smoke only` | Single component; L1–L3 trivial; no regression surface |
| `skip` | Pure doc update; zero user-facing code change |

**PO reject gate**: §QA scope absent from returned plan → PO resumes Designer:
`"plan missing §QA scope — add it."` Max 1 retry. Not a failed turn.

**Applies to**: every plan.md + every companion ticket.md body.
