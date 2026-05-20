# T-P4-150 plan — JSON-only persona output doctrine (token-opt-2)

**ticket**: T-P4-150  
**version**: v0.4-meta-dogfood  
**area**: token-opt / persona-protocol  
**complexity**: L3  
**model/effort**: sonnet / high  
**authored**: 2026-05-20

---

## Goal

Enforce JSON-only stdout from all three persona sub-agents (developer / designer / qa) across
all three backend variants (graphiti / keeper / fs) = **9 variant files**. Eliminate mixed
JSON + prose body output pattern. Add two standardized fields (`summary`, `user_surface`) to
carry human-readable content that PO paraphrases for the user.

**Expected ROI**: ~80% output-token reduction ($0.30 → $0.06 per dispatch).

---

## Constraints

- **Additive only** — no existing JSON field renamed or removed.
- `notes` field (developer + QA) stays as-is (≤80 char for Persona Activity table append).
  `summary` is a new, separate field with different purpose.
- Designer's `summary` existed but was semantically "2–4 sentences" prose — tighten to
  ≤200 char machine-readable. Add `user_surface` as the replacement for prose content.
- PO paraphrase behavior is unchanged — PO already renders in user's language. It will now
  read `user_surface` (or fall back to `summary`) instead of parsing body prose.
- Variants differ only in wiki/memory sections — the output-format change is identical
  across graphiti / keeper / fs per persona.
- Changes must be applied to both **repo source** (`packages/core/po/sections/` +
  `packages/core/agents/variants/`) and **user-global** (`~/.productune/sections/`) for
  immediate effect. Agent variant symlinks update automatically; doctrine sections require
  the direct file edit.

---

## Acceptance

| # | Criterion |
|:--|:--|
| A1 | `packages/core/po/sections/_formats/persona-output-format.md` created with shared JSON-only doctrine + field spec. |
| A2 | `packages/core/po/sections/_formats/po-output-format.md` updated: PO surface rule reads `user_surface` / `summary` from persona JSON. |
| A3 | `packages/core/po/sections/delegation.md` updated: 1-line cross-ref to `persona-output-format.md`. |
| A4 | All 9 variant files: `## Output format` starts with JSON-only enforcement rule paragraph before the JSON fence. |
| A5 | pdt-developer (×3): `summary` + `user_surface` added to JSON schema after `session_id`. |
| A6 | pdt-designer (×3): `summary` semantics updated to ≤200 char; `user_surface` added after `summary`. |
| A7 | pdt-qa (×3): `summary` + `user_surface` added to JSON schema after `session_id`. |
| A8 | User-global mirrors updated for immediate effect (paths in §A6 below). |
| A9 | Build passes: `pnpm -F core build` (no TS errors from core exports if any type added). |

---

## Out of scope

- pdt-po and pdt-wiki-keeper output format (PO is user-facing, not JSON-only; wiki-keeper is
  purely internal sub-agent).
- Changing any other existing JSON field names or semantics beyond designer's `summary` comment.
- Automated test verifying stdout first char = `{` (manual PO verification on next dispatch).
- Updating the current system-prompt Designer instance (this file IS the graphiti designer
  variant — the edit takes effect on the next agent spawn, not mid-session).

---

## Approach

### A1. New shared doctrine file

**Create** `packages/core/po/sections/_formats/persona-output-format.md`:

```markdown
# Persona output format (shared doctrine)

**JSON-only rule (T-P4-150)**: Every persona sub-agent response MUST be a single JSON object.

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
```

### A2. `## Output format` enforcement rule — identical insert for all 9 variant files

**Before** the ` ```json ` fence in every `## Output format` section, insert:

```
**JSON-only output rule (T-P4-150)**: Response MUST be a single JSON object. stdout first char = `{`. No body prose before or after. No markdown tables outside JSON values. Human content → `summary` (≤200 char, required) + `user_surface` (≤500 char, optional). Doctrine: `~/.productune/sections/_formats/persona-output-format.md`.
```

### A3. JSON schema changes per persona

#### pdt-developer — graphiti + keeper + fs

Current graphiti variant (abridged):
```json
{ "persona":"pdt-developer", "session_id":"<uuid>",
  "ticket_id": "T-P4-NNN",
  "changed_files":[...],
  ...
  "notes":"...",
```

After — insert after `"session_id"` line:
```json
  "summary": "<≤200 char — what was implemented/changed this turn>",
  "user_surface": "<≤500 char — optional; omit for plan-mode turns>",
```

> `notes` (≤80 char for Persona Activity table) is unchanged.
> keeper/fs variants differ only in `promotion_candidates` wiki tier — schema insert is
> identical for all three.

#### pdt-designer — graphiti + keeper + fs

Current (all three):
```json
{ "persona":"pdt-designer", "session_id":"<uuid>",
  "design_doc_path":"docs/design/<feature>.md", "summary":"2–4 sentences",
```

After — update `summary` semantic + add `user_surface` on next line:
```json
{ "persona":"pdt-designer", "session_id":"<uuid>",
  "design_doc_path":"docs/design/<feature>.md",
  "summary": "<≤200 char — outcome of this turn, machine-readable>",
  "user_surface": "<≤500 char — optional; human-friendly for PO paraphrase>",
```

#### pdt-qa — graphiti + keeper + fs

Current (all three):
```json
{ "persona":"pdt-qa", "session_id":"<uuid>",
  "ticket_id": "T-P4-NNN",
  "overall":"pass|fail",
```

After — insert after `"session_id"` line:
```json
  "summary": "<≤200 char — QA outcome: checks run, pass/fail, key finding>",
  "user_surface": "<≤500 char — optional; what user should verify or what failed>",
```

> `notes` (≤80 char for Persona Activity table) is unchanged.

### A4. `po-output-format.md` update

**File**: `packages/core/po/sections/_formats/po-output-format.md`

Insert after `# Output shape to user` (line 1), before the first blank line:

```markdown
## Persona JSON surface rule (T-P4-150)

Persona sub-agents return JSON only (no body prose). PO surface flow:
1. Read `user_surface` from persona JSON if present (≤500 char, human-friendly).
2. If `user_surface` absent, derive from `summary` (≤200 char, machine-readable).
3. Render in user's working language (caveman lite). Never expose raw persona JSON to user.
4. Map into the Normal turn / Clarity-loop / Feedback template below.
```

### A5. `delegation.md` cross-reference

**File**: `packages/core/po/sections/delegation.md`

Append after the `## Minimal template` section (after the `$TASK` line and before the next `##` heading), add:

```markdown
**Persona output**: JSON-only per T-P4-150. `summary` (≤200 char) + optional `user_surface` (≤500 char) carry human content — PO paraphrases for user. Shared doctrine: `sections/_formats/persona-output-format.md`.
```

### A6. User-global mirrors (immediate effect)

After applying all repo edits, **also apply the same changes** to:

| User-global path | Change |
|:--|:--|
| `~/.productune/sections/_formats/persona-output-format.md` | Create (same content as A1) |
| `~/.productune/sections/_formats/po-output-format.md` | Apply A4 edit |
| `~/.productune/sections/delegation.md` | Apply A5 edit |

These files are bootstrapped from the repo by `bootstrap_user_global_doctrine` (T-P4-106)
but only updated when `productune init` or `install.sh` runs with hash-detect. Direct edit
ensures the currently-running PO session uses the new doctrine immediately.

---

## Files changed

| File | Type | Change |
|:--|:--|:--|
| `packages/core/po/sections/_formats/persona-output-format.md` | **NEW** | Shared JSON-only doctrine + field spec |
| `packages/core/po/sections/_formats/po-output-format.md` | edit | Add persona JSON surface rule (§A4) |
| `packages/core/po/sections/delegation.md` | edit | Cross-ref to persona-output-format.md (§A5) |
| `packages/core/agents/variants/graphiti/pdt-developer.md` | edit | Rule + fields (§A2 + §A3) |
| `packages/core/agents/variants/keeper/pdt-developer.md` | edit | Rule + fields (§A2 + §A3) |
| `packages/core/agents/variants/fs/pdt-developer.md` | edit | Rule + fields (§A2 + §A3) |
| `packages/core/agents/variants/graphiti/pdt-designer.md` | edit | Rule + summary update + user_surface (§A2 + §A3) |
| `packages/core/agents/variants/keeper/pdt-designer.md` | edit | Rule + summary update + user_surface (§A2 + §A3) |
| `packages/core/agents/variants/fs/pdt-designer.md` | edit | Rule + summary update + user_surface (§A2 + §A3) |
| `packages/core/agents/variants/graphiti/pdt-qa.md` | edit | Rule + fields (§A2 + §A3) |
| `packages/core/agents/variants/keeper/pdt-qa.md` | edit | Rule + fields (§A2 + §A3) |
| `packages/core/agents/variants/fs/pdt-qa.md` | edit | Rule + fields (§A2 + §A3) |
| `~/.productune/sections/_formats/persona-output-format.md` | **NEW (mirror)** | Immediate effect |
| `~/.productune/sections/_formats/po-output-format.md` | edit (mirror) | Immediate effect |
| `~/.productune/sections/delegation.md` | edit (mirror) | Immediate effect |

**Total**: 3 repo doctrine files (1 new, 2 edit) + 9 agent variant files (edit) + 3 user-global mirrors = 15 file ops.

---

## §QA scope

| Field | Value |
|:--|:--|
| **QA invoke** | `skip` |
| **test target** | — |
| **사용자 dogfood** | — |
| **regression check** | — |

Pure doctrine / agent-spec doc update — zero user-facing code change. Behavioral verification
(stdout first char = `{` on next persona dispatch) is manual PO observation, not automatable
by pdt-qa.

---

## §Open Questions

None — scope fully specified.
