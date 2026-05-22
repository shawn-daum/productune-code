# Memory

Two facets: (1) **promotion gate** — persona suggestions → persisted memory; (2) **storage** — PO memory + per-project state.

## Promotion gate

Personas don't auto-write. They return `promotion_candidates`. PO surfaces; on user approval writes. Project + wiki tier both need approval.

Surface prompt format + user response handling (y/n/edit/skip) → **`sections/_formats/promotion-surface-prompt.md`**.

### Mechanical writes

`tier:"project"` — append 1 line to file in project repo (shows in `git status`):
```bash
TARGET=$(jq -r '.target' <<<"$CANDIDATE"); DELTA=$(jq -r '.delta' <<<"$CANDIDATE")
mkdir -p "$(dirname "$TARGET")"; printf '%s\n' "$DELTA" >> "$TARGET"
```

`tier:"work-note"` — `printf` full markdown body to `docs/<persona>/R<n>-<slug>.md`.

`tier:"wiki"` — backend-aware (`WIKI_BACKEND` from `productune.env`). 2 branches (keeper / fs) + pre-persona wiki search → **`sections/_details/wiki-backend-branches.md`**.

### Persistence (deferred surface)

Candidate can't be surfaced inline (background sub-agent result received mid-turn, persona turn closed without immediate user prompt window, etc.) → enqueue into `pending_promotions[]` (schema in `_formats/po-state-schema.md`) with `status:"pending"`. Next PO turn-start surfaces queued entries before new work (Step 1b).

### Why gated

Earlier doctrine auto-promoted on heuristic; memory grew invisibly. Rule: **never persist without user approval**. Repeated dismissals → append to `po-memory.md` Workflow preferences; future turns lower the surface threshold.

## PO memory: `~/.productune/po-memory.md`

Cross-session notepad about **collaborator**, not project facts.

```markdown
# PO memory for <user>
## Communication preferences
## Product taste
## Workflow preferences
## Recent corrections / to-avoid
- (YYYY-MM-DD) user asked me not to X because Y
```

Read at session start. Append (don't rewrite) on: ≥2 pushbacks, intent class "always / never / what I dislike" (any user lang), multi-turn pattern. Mark contradictions `[SUPERSEDED YYYY-MM-DD]`. Never delete — receipts not summary.

### `## Product taste` — positive-feedback log

Schema: `- (YYYY-MM-DD) <area-tag>: <what worked> · "<user phrase verbatim, kept in original lang>"`.

- **Write trigger**: Step 3 #14b (positive intent — `po-loop.md`). 1 line per turn-close satisfaction signal.
- **Read trigger**: Step 1 disposition. PO scans recent N entries cross-project to bias routing toward validated patterns (similar area-tag → reuse approach that landed last time).
- area-tag follows `<feature>/<sub-area>` — shared with `fail-patterns.md` and `feature-history.md`.
- User phrase verbatim in any language. Literal quote, not doctrine prose.

Example entries (mixed-lang user phrases preserved):
```
- (2026-05-13) auth/login-modal: forgot-pw retry flow finally smooth · "오 이제 잘 되네"
- (2026-05-20) onboarding/welcome: 3-step minimum without skip · "exactly what I wanted"
```

## Per-project state: `./.productune/po-state.json`

Repo-local JSON. Sessions scoped per **task**. Schema v2 — full canonical schema (key paths + `pending_promotions[]` lifecycle + legacy keys + access patterns) → **`sections/_formats/po-state-schema.md`**.

## Persona product-memory (structured operational logs)

Append-only Version-tagged logs. Two layers separate from narrative `decisions.md` / `project-notes.md` (which go through promotion gate):

| File | Owner of write | Read by | Purpose |
|---|---|---|---|
| `docs/qa/fail-patterns.md` | PO mechanical (from QA's `fail_event` output) | Designer at Phase 1 | Test ticket trigger #3 — same area-tag ≥3 cumulative fail → emit `type:test`. |
| `docs/designer/feature-history.md` | Designer Write at Phase 5 Version close | Designer at Phase 1 (next Version) | Recall prior Version decisions / surface deferred items. |

Both share schema: `- (YYYY-MM-DD) <version> · <area-tag> · ... · note: <one-line>`. PO writes for fail-patterns = mechanical (no semantic interpretation) — `printf '%s\n' "$LINE" >> "$TARGET"`. Designer writes for feature-history happen inside Designer's session at Phase 5.

Distinct from promotion-gated memory (`decisions.md`, `project-notes.md`, work-notes, wiki). Operational ground truth — like `~/.productune/po-memory.md` calibration log — append-only, no opinion.
