# T-P4-151 — po-state.json Hygiene Doctrine · Plan

**Created**: 2026-05-20  
**Ticket**: T-P4-151  
**Designer session**: fresh

---

## § Context

`po-state.json` has three recurring bloat patterns observed in productune (9.4 KB) and paepyeong (4.6 KB):

| Field | Problem | Root cause |
|:--|:--|:--|
| `past_tickets[]` | 8 entries present (2318 chars) | Removal decided in T-P4-065 / v2 schema, but no enforcement mechanism was ever added. Doctrine says "removed" but PO still writes it in some code paths and no turn-start purge runs. |
| `recent_turns[]` | 9 entries (1526 chars) with no cap enforcement | Schema says "rolling 10" but no trim runs. Purpose is last-5 failure detection — 10 is over-specified. |
| `pending_gate` | 13 days stale (emitted 2026-05-07) | No stale policy. Phase hasn't advanced, so gate sits forever. |

The problem is **not one-time cleanup** — it's missing management rules that prevent future accumulation.

---

## § Problem (precise)

1. **past_tickets[]** — v2 doctrine (T-P4-065) abolished this field in favor of ticket-md-as-SoT. The schema doc notes it, but there is no turn-start purge rule. PO sometimes populates it anyway. Field survives indefinitely.
2. **recent_turns[]** — schema cap is "rolling 10" but no trim runs at turn-start or ticket close. The field grows unbounded. The actual usage window (pre-delegate risk check) only needs last 5 entries.
3. **pending_gate** — has no staleness policy. If a user defers a phase gate (doesn't respond to the prompt for >7 days) the entry persists indefinitely, even after phase has progressed.
4. **No turn-start hygiene step** — `po-loop.md` Step 1 loads po-state.json but has no corresponding "clean before use" step.
5. **No size guidance** — `po-state-schema.md` has no per-field size budget table. Docs don't communicate expected steady-state.

---

## § Approach

Three hygiene rules (**H1 / H2 / H3**) defined as mandatory turn-start steps:

- **H1** — purge `past_tickets` unconditionally. Idempotent (`[] → []`). < 1 ms.
- **H2** — trim `recent_turns` to last 5. Idempotent if already ≤ 5. < 1 ms.
- **H3** — stale `pending_gate` check (LLM-driven date math):
  - If `current_phase > from_phase` → auto-clear (gate was skipped; phase moved on)
  - If age ≥ 7 days AND `current_phase == from_phase` → surface inline once: `"pending_gate is {N}d old (Phase {from}→{to}): still relevant? keep / clear?"` → await user reply before disposition

Mechanic: PO runs H1+H2 as silent jq writes every turn-start. H3 runs only when `pending_gate != null`.

One-time backfill for productune (and any project): the hygiene rules auto-apply on next turn-start. No separate migration script needed.

---

## § Acceptance

### A1 — `po-state-schema.md` updated (local mirror + global mirror)

File pair:
- `packages/core/po/sections/_formats/po-state-schema.md`
- `~/.productune/sections/_formats/po-state-schema.md`

#### A1-a — `past_tickets[]` bullet

Replace:
```
- ~~`past_tickets[]`~~ — **removed in v2** (ticket md = single source of truth). PO + GUI derive ticket lists by fs scan of `docs/tickets/**/*.md`. Revival match: `node scripts/po/scan-tickets.mjs <projectDir>` then jq filter on `slug` similarity.
```

With:
```
- ~~`past_tickets[]`~~ — **removed in v2** (ticket md = SoT; T-P4-065). PO + GUI derive ticket lists by fs scan of `docs/tickets/**/*.md`. Revival: `node scripts/po/scan-tickets.mjs <projectDir>` + jq slug filter. **H1 hygiene (turn-start)**: `jq '.past_tickets = []'` runs every turn — purges any residual stale data. Field MUST NOT be written in v2.
```

#### A1-b — `recent_turns[]` bullet

Replace:
```
- `recent_turns[]` (rolling 10, project-wide, task-independent — failure-pattern detection)
```

With:
```
- `recent_turns[]` (**rolling 5**, project-wide, task-independent — failure-pattern detection. **H2 hygiene (turn-start)**: `jq '.recent_turns |= .[-5:]'`. Pre-delegate: persona ≥ 3 fails / last 5 → risk-flag. Reset to `[]` at Version close — failure context is version-scoped.)
```

#### A1-c — `pending_gate?` bullet

Append to end of existing bullet (after `emitted_at}`):
```
 **H3 hygiene (turn-start, only when field present)**: compute age from `emitted_at`. If `current_phase > from_phase` → auto-clear (`jq '.pending_gate = null'`). If age ≥ 7 days AND `current_phase == from_phase` → surface once inline: `"pending_gate is {N}d old (Phase {from}→{to}): still relevant? keep / clear?"` — await user reply.
```

#### A1-d — `## Legacy + access patterns` — remove compat language for past_tickets

Replace in that section:
```
`past_tickets` no longer written in v2; reads ignore.
```

With:
```
`past_tickets` removed in v2 — H1 hygiene purges at every turn-start (compat period ended; field silently ignored by v2 PO).
```

#### A1-e — Add `## Size budget` section (append at end of file)

```markdown
## Size budget

Per-field target after turn-start hygiene. Not hard-enforced in code — PO mechanical compliance.

| Field | Cap | Hygiene rule | Notes |
|:--|:--|:--|:--|
| `past_tickets[]` | `[]` (always empty) | H1 — purge every turn-start | v2 SoT = ticket md; MUST NOT be written |
| `recent_turns[]` | ≤ 5 entries | H2 — `[-5:]` every turn-start | Reset `[]` at Version close |
| `pending_gate` | null or age < 7 d | H3 — auto-clear / surface at turn-start | See H3 rule on `pending_gate` bullet |
| `persona_sessions{}` | live-only | Drop on ticket close (existing rule) | Per-ticket audit → ticket md `## Persona Activity` |
| `versions[]` | ≤ 5 entries | Existing cap | Older versions → `outcome.retrospective_path` |
| **Total target** | **~4–5 KB** | steady-state after H1/H2/H3 | productune was 9.4 KB before hygiene |
```

---

### A2 — `po-loop.md` updated (local mirror + global mirror)

File pair:
- `packages/core/po/sections/po-loop.md`
- `~/.productune/sections/po-loop.md`

Insert the following block **between** Step 1 (Memory) and Step 1b (Drain pending_promotions) — i.e., after the line ending `+ './.productune/po-state.json'.` and before the line starting `1b.`:

```markdown
1.1. **Turn-start hygiene (H1 / H2 / H3)** — mechanical, every turn, ≈ 3 jq ops. Skip only if po-state.json absent (new project). Full budget table → `sections/_formats/po-state-schema.md §Size budget`.

```bash
STATE=".productune/po-state.json"
# H1 — purge past_tickets (v2: ticket md = SoT; compat period ended)
jq '.past_tickets = []' "$STATE" > /tmp/ps.tmp && mv /tmp/ps.tmp "$STATE"
# H2 — trim recent_turns to last 5
jq '.recent_turns |= .[-5:]' "$STATE" > /tmp/ps.tmp && mv /tmp/ps.tmp "$STATE"
```

**H3 (LLM-driven, only when `pending_gate != null`)** — compute age from `emitted_at`:
- `current_phase > from_phase` → auto-clear: `jq '.pending_gate = null' "$STATE" > /tmp/ps.tmp && mv /tmp/ps.tmp "$STATE"`
- age ≥ 7 days AND `current_phase == from_phase` → surface inline: `"pending_gate is {N}d old (Phase {from}→{to}): still relevant? keep / clear?"` Await reply, then clear or keep. Does **not** block disposition — show before paraphrase step.
```

---

### A3 — `lifecycle.md` updated (local mirror + global mirror)

File pair:
- `packages/core/po/sections/lifecycle.md`
- `~/.productune/sections/lifecycle.md`

In `## Compaction + cleanup` section, after the `versions[]` cap sentence, append:

```
`recent_turns[]` reset to `[]` at Version close (Phase 5 → next-Version Phase 1): failure context is version-scoped. (H2 trim still runs at every turn-start during the new Version.)
```

---

### A4 — One-time backfill: productune po-state.json

Run the H1 + H2 commands once against `.productune/po-state.json` in the productune repo:

```bash
STATE=".productune/po-state.json"
jq '.past_tickets = []' "$STATE" > /tmp/ps.tmp && mv /tmp/ps.tmp "$STATE"
jq '.recent_turns |= .[-5:]' "$STATE" > /tmp/ps.tmp && mv /tmp/ps.tmp "$STATE"
```

Expected result:
- `past_tickets` → `[]` (was 8 entries, 2318 chars)
- `recent_turns` → last 5 entries (was 9 entries)
- File size: from ~9.4 KB to ~5–6 KB (pending_gate and current_task remain; handled separately)

`pending_gate` (13 days stale, `from_phase: 3 == current_phase: 3`): **not** auto-cleared — surface to user per H3 rule on the first PO turn after this ticket ships. Developer does NOT clear it; PO does on turn-start with user confirmation.

---

### A5 — paepyeong and other projects

No manual action needed. H1/H2/H3 rules auto-apply when `po-loop.md` is updated in both mirror locations. Global `~/.productune/sections/po-loop.md` is picked up by any project on next turn-start.

---

### A6 — Build sanity

`pnpm -F core build` exits 0. These are `.md` file edits only; no TypeScript compilation is affected. Include as sanity gate to catch any inadvertent file path errors.

---

## § Files changed

| # | File | Change |
|:--|:--|:--|
| 1 | `packages/core/po/sections/_formats/po-state-schema.md` | A1-a through A1-e |
| 2 | `~/.productune/sections/_formats/po-state-schema.md` | Mirror of #1 |
| 3 | `packages/core/po/sections/po-loop.md` | A2 (Step 1.1 insert) |
| 4 | `~/.productune/sections/po-loop.md` | Mirror of #3 |
| 5 | `packages/core/po/sections/lifecycle.md` | A3 (recent_turns Version close note) |
| 6 | `~/.productune/sections/lifecycle.md` | Mirror of #5 |
| 7 | `.productune/po-state.json` (productune repo) | A4 (one-time H1/H2 backfill) |

---

## § Out of scope

- Automated hook (PreToolUse / shell wrapper) to enforce hygiene — PO mechanical compliance is sufficient; hook adds fragile infra overhead
- Hard size limit enforcement in code (`src/`)
- paepyeong po-state.json manual cleanup — H1/H2 self-apply on next turn-start
- `pending_gate` clear for productune — PO surfaces to user on next turn-start per H3; developer does not touch it
- GUI surface changes (pending_gate was already deprecated in T-P4-139)
- `current_task.persona_sessions{}` lifecycle — already documented as "drop on ticket close" in v2 schema; no change needed

---

## § QA scope

| Field | Value |
|:--|:--|
| **QA invoke** | `skip` |
| **test target** | — |
| **사용자 dogfood** | — |
| **regression check** | — |

Pure doctrine doc update + mechanical jq backfill. Zero user-facing code change. Verification: first PO turn after ship confirms H1/H2 run silently, H3 surfaces the 13-day stale `pending_gate`.

---

## § Open questions

None. Scope is fully specified.
