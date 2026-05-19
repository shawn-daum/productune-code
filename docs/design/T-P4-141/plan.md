---
ticket: T-P4-141
title: "Doctrine: Persona Activity row — PO-only enforcement"
version: v0.4-meta-dogfood
round: phase4-r4
plan_version: v1
created_at: 2026-05-20
---

## §Context

**Incident (T-P4-129/T-P4-130 batch close):** `pdt-developer` subagent appended `## Persona Activity`
rows to ticket `.md` files on its own. PO then also appended rows per its mechanical duty → duplicates.
PO deduped post-hoc.

### Audit results (2026-05-20)

| File | Persona Activity mention | Verdict |
|:--|:--|:--|
| `~/.productune/sections/tickets.md` L97 | "PO direct (mechanical): … `## Persona Activity` 1-row append" | PO ownership stated |
| `packages/core/agents/pdt-po.md` L24, L31 | Reaffirms PO mechanical ownership; refusal template mentions it | Correct |
| `variants/{graphiti,fs,keeper}/pdt-developer.md` | **None** — no instruction, no prohibition | Gap |
| `variants/{graphiti,fs,keeper}/pdt-qa.md` | **None** — no instruction, no prohibition | Gap |
| `variants/{graphiti,fs,keeper}/pdt-designer.md` | None — designer legitimately authors initial rows at ticket creation | No change needed |

**Root cause:** No persona variant file explicitly prohibits writing `## Persona Activity`. When
`pdt-developer` reads a ticket (which contains the table), an LLM agent infers self-update is
expected — especially after completing work. The prohibition is absent, not contradicted.

**Key distinction:**
- **Ticket creation** (designer authoring a new `T-NNN.md`): initial `## Persona Activity` rows are
  part of the document being `Write`-created → legitimate, no change needed.
- **Post-dispatch edits** (developer/QA editing an existing ticket): NEVER their job → PO does this
  mechanically after reading the persona's JSON output.

### Decision: PO 단독

Developer and QA personas return their turn summary in the `notes` JSON output field.
PO reads the response and appends 1 row mechanically. Zero duplication risk.
Designer: no change (creates initial rows as ticket author).

---

## §Goals

- Prevent duplicate `## Persona Activity` rows in all future ticket closes.
- Zero user-facing code change — doctrine text only (`.md` edits).
- All 3 persona families covered across all 3 wiki-backend variants (6 files + 1 doctrine file).

## §Non-goals

- Migrating existing tickets with duplicate rows (T-P4-129/T-P4-130 already cleaned by PO).
- Changing the `## Persona Activity` table schema.
- Changing the PO mechanical write process.
- Updating `~/.claude/agents/` installed copies (separate install step, out of scope).

---

## §Changes

### D-1. `~/.productune/sections/tickets.md` — strengthen L97

Locate the `### PO mechanical-write whitelist` section. In the `## Persona Activity` entry, append
the enforcement clause **inline** (same paragraph, no new lines):

**Before (L97 excerpt):**
```
… `## Persona Activity` 1-row append (≤80-char Result) …
```

**After:**
```
… `## Persona Activity` 1-row append (≤80-char Result) — **PO 단독**; `pdt-developer` and `pdt-qa`
MUST NOT self-append to this table; they return their turn summary in the JSON `notes` field for PO
to transform. …
```

Read the full line first (it's dense); use a targeted `sed` or Edit to avoid truncation.

---

### D-2. `packages/core/agents/variants/{graphiti,fs,keeper}/pdt-developer.md` — 3 files

Insert the following new `##` section **immediately after the closing ` ``` ` of `## Output format`**
(i.e. right after the JSON block ends, before any subsequent `##` heading or EOF).

**Text to insert (identical in all 3 files):**

```markdown

## Persona Activity — DO NOT write
Never use `Edit` or `Write` to append rows to `## Persona Activity` in any ticket `.md` file.
That table is **PO-mechanical-only** — PO reads your JSON response and appends the row itself.

Include a brief turn-result summary (≤80 chars) in the `notes` field of your JSON output.
PO extracts it to construct: `| <ts> | pdt-developer | <model/effort> | <turn> | <result> |`
```

---

### D-3. `packages/core/agents/variants/{graphiti,fs,keeper}/pdt-qa.md` — 3 files

Same insertion point: **immediately after the closing ` ``` ` of `## Output format`**.

**Text to insert (identical in all 3 files):**

```markdown

## Persona Activity — DO NOT write
Never use `Edit` or `Write` to append rows to `## Persona Activity` in any ticket `.md` file.
That table is **PO-mechanical-only** — PO reads your JSON response and appends the row itself.

Include a brief turn-result summary (≤80 chars) in the `notes` field of your JSON output.
PO extracts it to construct: `| <ts> | pdt-qa | <model/effort> | <turn> | <result> |`
```

Note: `pdt-qa` output format has no top-level `notes` key today. Add `"notes": "..."` as the last
field before `promotion_candidates` in the JSON block comment. (Single-line mechanical change.)

---

### D-4. Insertion anchor — how to find the right line

In each variant file, the Output format section ends with a line containing only ` ``` ` after the
closing `}` of the JSON example. Insert the new `##` block on the line **immediately following**
that closing ` ``` `. Do not insert inside the JSON block.

Pattern to locate:
```
  "promotion_candidates":[...] }
```
→ ` ``` `   ← insert after this line

---

## §Migration

None. T-P4-129/T-P4-130 duplicates already cleaned by PO. Future ticket closes follow the new
prohibition. No grep-and-fix of historical tickets required.

---

## §Out of scope

- `packages/core/agents/pdt-po.md` — no change needed; already correct.
- Designer variant files — no change; designer legitimately authors initial table at ticket creation.
- `~/.claude/agents/` installed copies — updated by separate install script (out of scope here).

---

## §QA scope

| Field | Value |
|:--|:--|
| **QA invoke** | `skip` |
| **test target** | — |
| **사용자 dogfood** | — |
| **regression check** | — |

QA skip: pure doctrine doc edit, zero user-facing code change.
