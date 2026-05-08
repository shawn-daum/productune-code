# T-P4-065 sub-f — po-state.json slim down (ticket md = SoT)

**Status**: design / plan only — code changes deferred to next ticket.
**Author**: pdt-designer
**Date**: 2026-05-07
**Round**: v0.4.0 (Phase 4 dogfood)
**Sub-area**: f (po-state ticket-info dedup)

---

## §0 Why this exists

Dogfood (2026-05-08) found `po-state.json` accumulates ticket info that the
ticket markdown file already owns. `past_tickets[]` (cap 50) is the worst
offender — every field there is a copy of the ticket md frontmatter, kept in
sync by mechanical PO writes that can drift, bloat the JSON, and confuse
readers ("which is canonical?"). Three smaller offenders follow the same
shape: `versions[]` outcome (retrospective md is canonical), `phase_history[]`
(retrospective md absorbs on version close), `persona_session_meta{}`
(scoped to current_task only — drop on close).

Fix doctrine: **ticket md (`docs/tickets/<version>/T-NNN.md`) = single source
of truth for ticket-scoped data. po-state.json holds only live state +
references + a small cap of recent versions.** PO / GUI derive ticket lists by
filesystem scan (50 ticket × ~2KB ≈ 100KB read, <100ms — negligible).

User directive: option C — **통째 제거 + fs derived**.

---

## §1 Decision

| What | Before | After |
|---|---|---|
| `past_tickets[]` | cap 50 inline copies of ticket md | **removed entirely**. Derived: `glob docs/tickets/**/*.md` + frontmatter parse. |
| `versions[]` | unbounded inline outcome | last 5 inline (recent-window). Older versions: `outcome.retrospective_path` reference only; full content lives in `docs/retrospectives/<version>.md`. |
| `phase_history[]` | unbounded across versions | **current version only**. On version close: PO appends summary to `docs/retrospectives/<current_version>.md` + clears the array. |
| `persona_session_meta{}` | persisted under `current_task` (turns / model_history / effort_history / complexity_level / confidence_history / ambiguity_score_history) | scope unchanged — already lives under `current_task`. On ticket close: **drop entirely** (do not migrate to `past_tickets` since that's gone). Calibration outcome already merged into `~/.productune/po-memory.md` `## Workflow preferences` log via existing promotion gate; per-turn meta has no consumer beyond live routing. |
| `recent_turns[]` | rolling 10 | **unchanged** (small, project-wide signal for fail-pattern detection). |
| `current_task` | active ticket frontmatter mirror | **unchanged** — this *is* the live cache. Cleared on close (ticket md becomes SoT for that ticket's history). |

Rationale: every removed structure has either (a) a markdown file already
acting as canonical (ticket md, retrospective md), or (b) no read consumer
beyond the live routing window. Keeping copies in JSON costs sync correctness
+ readability with zero benefit.

---

## §2 ticket md = SoT — schema sufficiency check

Current frontmatter (per `~/.productune/sections/tickets.md`):

```yaml
ticket_id, round, stage, status, assignee, created_at, started_at,
completed_at, duration_min, estimated_complexity, risk_flags, branch,
worktree_path
```

Comparing against what `past_tickets[]` retained for revival match:
`slug`, `title`, `request_summary`, `artifacts`, `persona_sessions`.

**Gap analysis**:

| past_tickets field | In ticket md? | Action |
|---|---|---|
| `ticket_id` | ✅ frontmatter | — |
| `slug` | ❌ frontmatter | **Add to frontmatter**. Trivial — already in `request_summary` lookup. |
| `title` | ✅ H1 (`# T-042: <title>`) | parse from H1 — no frontmatter dup needed. |
| `request_summary` | ✅ `## Request` body paragraph | parse first paragraph of `## Request`. |
| `artifacts` | ⚠ partial — ticket md `## Inputs` lists deps + design doc; output artifacts are scattered | **Add `## Outcome` section schema** (already designer-owned per doctrine, but make presence mandatory on close): bullet list of changed files / docs created. Designer fills on round-close call. |
| `persona_sessions` | ❌ | **Out of scope for SoT**. Live session ids only matter while ticket is active (resume continuity). Once closed, no consumer cares which uuid handled which turn. Drop. If future audit need surfaces, add to `## Persona Activity` table (already exists, append-only). |
| `qa_status`, `qa_loops` | ❌ frontmatter | **Add to frontmatter** (currently lives only in `current_task`). |

**Decided frontmatter additions** (sub-f scope):
```yaml
slug: <kebab>            # NEW
qa_status: pending|pass|fail  # NEW
qa_loops: <int>          # NEW
```

`title`, `request_summary`, `outcome` stay in markdown body — they're
prose, not metadata. Parsers extract on demand.

**Why no `T-NNN.history.md` separate file**: extra file per ticket doubles
fs entries, splits SoT, and the data we need (outcome bullets, persona
activity) fits naturally inside the existing ticket md. Single file per
ticket = simpler invariant.

---

## §3 Derived view — fs scan implementation

### Scan strategy

PO + GUI both need "list all tickets" or "find ticket by slug". Implementation:

```ts
// packages/gui/src/lib/ticketScan.ts (new)
import fs from 'node:fs/promises'
import path from 'node:path'
import matter from 'gray-matter'   // already a tauri-side dep candidate; if not, fallback to manual yaml-front parse

export interface ScannedTicket extends Ticket {
  path: string         // docs/tickets/v1.0-MVP/T-042.md
  title: string        // parsed from H1
  request_summary: string  // first paragraph of ## Request
}

export async function scanTickets(projectDir: string): Promise<ScannedTicket[]> {
  const root = path.join(projectDir, 'docs', 'tickets')
  // glob */**.md, parse frontmatter, parse H1, parse ## Request first paragraph
  // sort by created_at desc
}
```

PO side (bash) — `jq` is insufficient; needs a small node script
`scripts/po/scan-tickets.mjs` (or python equivalent already existing in
repo if present). Output JSON to stdout, PO consumes via `$(...)`.

### Caching

In-memory only. No on-disk cache. Reads:
- GUI: cache in React state per `projectDir`. Invalidate on:
  - tauri fs-watcher event under `docs/tickets/**`
  - explicit user action (refresh button — exists)
  - ticket close hook (PO writes ticket md, GUI re-fetches)
- PO bash: re-scan every call. 100ms is below human-perceptible latency for
  routing decisions; complexity of cache invalidation (file mtime tracking,
  staleness windows) outweighs savings. **No cache for PO scope.**

Cost validation:
- 50 tickets × 2KB = 100KB read · 50 frontmatter parses
- Local SSD: ~5ms read + ~30ms parse (Node.js gray-matter benchmark) = **35ms**
- Even at 200 tickets (4× safety margin): ~140ms — still fine for a panel
  that loads on demand, not per keystroke.

### Revival match

Currently: PO greps `past_tickets[].slug` for similar tokens to suggest
"T-031 was similar — reopen?". Replacement:

```bash
# in PO routing logic
SCAN_OUT=$(node scripts/po/scan-tickets.mjs "$PROJECT_DIR")
SIMILAR=$(echo "$SCAN_OUT" | jq -r --arg q "$QUERY_SLUG" '
  .[] | select(.status == "done") |
  select(.slug | ascii_downcase | contains($q | ascii_downcase)) |
  "\(.ticket_id) \(.title)"' | head -3)
```

Behaviour-equivalent. Slightly slower than in-memory `past_tickets[]` lookup,
but routing is once-per-task, not per-turn.

---

## §4 Migration

### What we're removing — data loss audit

For each `past_tickets[]` entry currently in po-state, verify same data exists
in `docs/tickets/<round>/<ticket_id>.md`:

- `ticket_id` — frontmatter: ✅
- `slug` — **MISSING** in current frontmatter. Migration step 1 must
  back-fill.
- `title` — H1: ✅
- `request_summary` — `## Request` body: ✅ (or empty if ticket was created
  without one — then derive from title)
- `artifacts` — `## Outcome` body (designer-fill required for closed
  tickets that don't have it)
- `persona_sessions` — **dropped intentionally** (no consumer post-close)
- `status / stage / started_at / completed_at / duration_min` — frontmatter: ✅

**Pre-flight script** (`scripts/po/audit-past-tickets.mjs`):
```js
// for each past_tickets[i]:
//   open docs/tickets/<round>/<ticket_id>.md
//   check frontmatter for slug, qa_status, qa_loops
//   check H1 matches title
//   check ## Request exists
//   report MISSING fields per ticket
// exit non-zero if any ticket would lose data
```

Run once before migration. Report drives back-fill.

### Back-fill

For each ticket md flagged MISSING:
1. **Add `slug:` frontmatter** — copy from `past_tickets[].slug`.
2. **Add `qa_status: pending` (or last-known) + `qa_loops: 0`** — copy from
   `past_tickets[].qa_status`/`qa_loops` if present; else default.
3. **If `## Request` missing**: emit a designer ticket (1-line) to back-fill
   from `request_summary`. Don't auto-write — maintains "PO never authors
   content" rule. Acceptable to have a few stub `## Request: <derived from
   title>` if the project is small and audit shows trivial cases; surface
   to user.

### po-state.json transform — idempotent

```bash
jq '
  del(.past_tickets) |
  del(.current_task.persona_sessions) |
  del(.current_task.persona_session_meta) |
  .versions = (.versions // [] | sort_by(.started_at) | .[-5:]) |
  .phase_history = (
    if .current_version != null then
      (.phase_history // [] | map(select(.version == .current_version or .version == null)))
    else [] end
  ) |
  .schema_version = 2
' "$STATE" > "$STATE.tmp" && mv "$STATE.tmp" "$STATE"
```

(Note: `phase_history[]` entries don't currently carry a `version` field —
because they're implicitly current-version. Migration assumes the entire
existing array is for `current_version` and keeps it. Going forward, on
version close, PO clears the array. No `version` field needed.)

### Schema version

Sub-area a (parallel ticket — not yet defined here, referenced in §7) is the
canonical introducer of `schema_version`. **Use `schema_version: 2`** for
post-sub-f shape. If sub-a lands first with `schema_version: 1`, sub-f bumps
to `2`. If sub-f lands first, it introduces `schema_version: 2` directly
(since sub-f is the larger structural change). Coordination: sub-f assumes
`schema_version: 2`; sub-a will land with whichever value matches sequence at
land time. PO migration is by structure-presence (`if .past_tickets exists →
migrate`), so version number is informational.

---

## §5 GUI impact

### `packages/gui/src/lib/types.ts`

- `Ticket` — already matches ticket-md frontmatter shape (good — sub-d
  rename to `type` is parallel, doesn't affect sub-f).
- `PoState` — **remove `past_tickets?: Ticket[]`** field. Replace consumers
  with `useTicketScan(projectDir)` hook.
- `CurrentTask` — **remove `persona_session_meta` reference** if any (none
  in current types — already absent from the interface).

### `packages/gui/src/components/views/VersionDetailView.tsx`

Currently reads `poState.past_tickets.filter(t => t.version === selectedVersion)`.
Replace:

```ts
const { tickets, loading } = useTicketScan(projectDir)
const versionTickets = useMemo(
  () => tickets.filter(t => t.version === selectedVersion),
  [tickets, selectedVersion],
)
```

### `packages/gui/src/components/views/TicketDashboardView.tsx`

Same swap. Loading-state UX: skeleton rows for ~50ms typical scan.

### `packages/gui/src/components/views/VersionsPanel.tsx`

`versions[]` read unchanged — but display logic clarifies "showing last 5;
older versions: see `docs/retrospectives/<version>.md`". Add a footer link
when `versions.length === 5` (cap reached).

### New hook: `packages/gui/src/lib/useTicketScan.ts`

```ts
export function useTicketScan(projectDir: string): {
  tickets: ScannedTicket[]
  loading: boolean
  refresh: () => void
} {
  // tauri invoke('scan_tickets', { projectDir })
  // fs-watch docs/tickets/** for invalidation
}
```

Tauri rust side: `scan_tickets` command — read dir, parse frontmatter +
H1 + first paragraph of `## Request`. Or do it node-side via existing
`spawn` infra; pick whichever has lower latency in benchmarks. Default
suggestion: rust side using `serde_yaml` + simple H1 regex — sub-millisecond
per ticket, no node spawn cost.

---

## §6 Migration sequence

1. **Doctrine update** — `packages/core/po/sections/tickets.md` frontmatter
   schema add `slug`, `qa_status`, `qa_loops`. `packages/core/po/sections/memory.md`
   §"po-state schema" remove `past_tickets[]` + `persona_session_meta`
   description; document `versions[]` cap 5; document `phase_history[]`
   current-version-only semantics.
2. **Audit script** — `scripts/po/audit-past-tickets.mjs` — run on every
   project repo with non-empty `past_tickets[]`; report gaps.
3. **Back-fill ticket md** — for each gap: add missing frontmatter (`slug`,
   `qa_status`, `qa_loops`); for missing `## Request` body, surface to user
   (don't auto-write).
4. **po-state migration** — `scripts/po/migrate-state-v2.sh` running the §4
   `jq` transform; idempotent (re-runs on already-migrated state are no-op
   since `del(.past_tickets)` on absent key is fine).
5. **GUI rewrite** — types, hook, view consumers (parallel to migration —
   GUI must be deployed *before* po-state migration runs in production
   projects, or `past_tickets` reads return `undefined` and crash).
   Compatibility window: GUI reads `past_tickets ?? scannedTickets` for one
   release, then drops the fallback.
6. **Verification** — fixture project `ntf-games`: run audit + migration;
   diff GUI screen state pre/post should be visually identical.

Coordinate with sub-area a / b / c / d / e: sub-d (ticket `stage`→`type`
rename) is the only one touching ticket md frontmatter — sequence sub-d
*before* sub-f if both are open, so frontmatter shape stabilizes once.

---

## §7 Out of scope (explicit)

- **sub-area b** — StageStrip 5-stage UI redesign.
- **sub-area c** — ChatPanel persona selector removal.
- **sub-area d** — ticket `stage` → `type` rename. Parallel axis; sequence
  before sub-f if open.
- **sub-area e** — PRD / service-flow doctrine corrections.
- **Code fixes themselves** — this doc is plan only. Implementation =
  developer ticket(s) emitted next.
- **`recent_turns[]` schema changes** — keeping cap-10 untouched.
- **Promotion gate / `pending_promotions[]` lifecycle** — separate concern,
  not ticket-info dedup.
- **`po-memory.md` calibration log** — already separate file, untouched.

---

## §8 Open questions

1. **`versions[]` cap = 5 — is 5 right?** Dogfood-tunable. 5 covers
   "current + last 4 closed" which matches typical project review window.
   If teams routinely reference 10+ versions back: bump to 10. Likely
   irrelevant since `docs/retrospectives/<version>.md` is one-click away.
   **Default 5; revisit after 1 month dogfood.**
2. **`persona_session_meta` traceability loss** — once a ticket closes and
   the meta drops, we can no longer answer "which model handled T-042's
   final designer turn?". The `## Persona Activity` table in ticket md
   already has Model/Effort + Result columns — it's a sufficient
   audit log. Decision: rely on Persona Activity table; drop session_meta.
   If audit need surfaces post-launch, add a `model` + `effort` column to
   Persona Activity (currently has `Model/Effort` combined).
3. **`outcome` in ticket md vs retrospective md duplication** — when a
   ticket lands in a closed version, its outcome bullets effectively appear
   twice: once in `## Outcome` of T-NNN.md, once aggregated in
   `docs/retrospectives/<version>.md`. **This is fine** — retrospective
   is a *summary* (one paragraph per ticket, plus version-level themes),
   not a copy. Designer authors retrospective at version close referencing
   ticket md's `## Outcome` as input.
4. **Audit script back-fill UX** — if 30 tickets are missing `## Request`,
   surfacing each to user is noisy. Alternative: emit *one* designer
   ticket "Back-fill `## Request` for T-NNN, T-NNN, T-NNN..." with the
   list as input. Designer batches in one round. Decided default: batch
   designer ticket if >5 gaps; surface inline if ≤5.
5. **fs-watch overhead** — tauri fs-watcher under `docs/tickets/**` — does
   this trigger on every PO mechanical frontmatter sed (status / lifecycle
   updates many times per ticket)? If yes: GUI re-scans frequently. Mitigation:
   debounce 500ms in `useTicketScan`. Fine for human-scale interaction.

---

## §9 Acceptance (for the implementation ticket — not this design)

- [ ] po-state.json post-migration has no `past_tickets` key, no
  `persona_session_meta` under `current_task`, `versions[]` length ≤ 5,
  `phase_history[]` only contains current-version entries.
- [ ] Audit script run on `ntf-games` fixture: zero data loss reported, or
  report enumerates exact ticket IDs needing back-fill.
- [ ] GUI VersionDetailView + TicketDashboardView render identical ticket
  lists pre/post migration on `ntf-games`.
- [ ] Ticket md frontmatter schema includes `slug`, `qa_status`, `qa_loops`
  on all newly-emitted tickets.
- [ ] Doctrine files (`packages/core/po/sections/tickets.md`,
  `packages/core/po/sections/memory.md`) updated to match.
- [ ] PO bash routing — revival match works against fs-scan output, not
  `past_tickets[]`.

---

## §10 Implementation notes (developer reference)

- Tauri rust `scan_tickets` command — prefer `serde_yaml` + small regex over
  shelling to a node script (cold-start cost dominates).
- `gray-matter` is already a node ecosystem standard; if rust path is
  rejected, node script is fine.
- fs-watch debounce: 500ms.
- Migration script idempotency tested by running twice — second run = no-op.
- Schema bump documented in `CHANGELOG.md` if repo maintains one.
