# Task lifecycle + Timeline

Sessions scoped per **task** (not project). Same-intent follow-ups stay in `current_task`. State key: `current_task` (live) + ticket md files (`docs/tickets/<version>/T-NNN.md` = SoT for closed tickets, fs-scanned). Legacy `past_tickets[]` removed in v2; `past_tasks`, `current_round` / `rounds[]` legacy keys read-compat one cycle, then drop.

## Disposition (Step 1 step 2)

Inspect `current_task` + recent ticket md (fs scan, last 5 closed). Classify:

- **(a) Continuation** — pronouns / temporal back-reference ("that one", "just now", "continue"), files in `current_task.artifacts`, same scope → keep, `--resume`.
- **(b) Revival** — past slug/title/artifact named or strong overlap → confirm, archive current → restore past as current. Prompt template (in user's lang): `"this looks like follow-up to '<slug>'. continue that task? (y/n/[other slug])"`.
- **(c) New** — different feature/file/intent → archive current → past, allocate. Announce: `"starting new task '<slug>'"` (in user's lang).

## Archive `current_task` → ticket md (mandatory before b/c)

Always write 1–2 sentence outcome before archiving — synthesized verdict (what shipped, open items, status), not persona dump. Outcome lands in ticket md `## Outcome` section (Designer-authored when content needed; PO appends mechanical row to `## Persona Activity` table). State `current_task` cleared.

```bash
NOW=$(date -u +%FT%TZ); FINAL_STATUS="done"   # done | blocked | abandoned
TID=$(jq -r '.current_task.ticket_id' "$STATE")
VER=$(jq -r '.current_task.version // .current_version' "$STATE")
TICKET_MD="docs/tickets/$VER/$TID.md"
sed -i.bak -E "s/^status:.*/status: $FINAL_STATUS/" "$TICKET_MD" && rm -f "${TICKET_MD}.bak"
# T-P4-149: clear sessions BEFORE null-out — next dispatch always fresh
tmp=$(mktemp) && jq '.current_task.persona_sessions = {}' "$STATE" > "$tmp" && mv "$tmp" "$STATE"
tmp=$(mktemp) && jq '.current_task = null' "$STATE" > "$tmp" && mv "$tmp" "$STATE"
```

`final_status`: `done` (delivered/QA pass or N/A) · `blocked` (QA fail loop cap or external dep) · `abandoned` (user explicitly drops — intent: "let's drop this" / "abandon").

Hook `pre-delegate-task-check.sh` blocks new-slug delegation if previous ticket md missing required `status` and `## Outcome`. Skipping not optional.

## Allocate new `current_task` (case c)

```bash
SLUG="<kebab>"; TITLE="<one-line>"; SUMMARY="<paraphrase>"; NOW=$(date -u +%FT%TZ)
tmp=$(mktemp) && jq --arg slug "$SLUG" --arg title "$TITLE" --arg summary "$SUMMARY" --arg now "$NOW" '
  .current_task = {slug:$slug, title:$title, started_at:$now, request_summary:$summary,
    artifacts:[], persona_sessions:{}, persona_session_meta:{}}
' "$STATE" > "$tmp" && mv "$tmp" "$STATE"
```

## Revive past ticket (case b)

```bash
# 1. archive current (with outcome). 2. fs-scan ticket md → seed current_task.
SLUG="login-modal-forgot-pw"
SCAN=$(node scripts/po/scan-tickets.mjs "$PROJECT_DIR")
MATCH=$(echo "$SCAN" | jq -r --arg slug "$SLUG" '[.[] | select(.slug == $slug)] | last')
if [ -n "$MATCH" ] && [ "$MATCH" != "null" ]; then
  tmp=$(mktemp) && jq --argjson f "$MATCH" '
    .current_task = {ticket_id:$f.ticket_id, slug:$f.slug, title:$f.title,
                      type:$f.type, status:$f.status, request_summary:$f.request_summary,
                      artifacts:[], persona_sessions:{}, persona_session_meta:{}}
  ' "$STATE" > "$tmp" && mv "$tmp" "$STATE"
fi
```

`persona_sessions{}` **not** revived — closed-ticket per-turn meta dropped per v2. New session ids allocated by claude on resume.

## Version id naming rule (T-P4-095)

`versions[].id` MUST match `^v\d+(\.\d+)?$`. Allowed: `v1`, `v2`, `v0.1`, `v1.2`. Rejected: `paepyeong-v1` (slug prefix — retroactive: already applied to all versions), `v1-rc`, `V1`, `version-1`, `1.0`.

**version-create validation** — before pushing new entry to `versions[]`:

```bash
VERSION_ID="<proposed>"
if ! echo "$VERSION_ID" | grep -qE '^v[0-9]+(\.[0-9]+)?$'; then
  echo "version id must match v<N> or v<N>.<M> (e.g. v1, v0.1). Please choose valid id."
  exit 1
fi
```

User natural-language hints (`"start v2"` → use `v2`; `"next version"` → confirm `"v2"` before proceeding). PO appends to `versions[]` only after valid id confirmed.

When project new (po-state.json absent), read `initial_version` from `.productune/config.json` as first version id suggestion. Validate before using.

## Update `current_task.artifacts`

```bash
ARTIFACT="docs/artifacts/login-modal.md"
tmp=$(mktemp) && jq --arg a "$ARTIFACT" '.current_task.artifacts |= ((. // []) + [$a] | unique)' "$STATE" > "$tmp" && mv "$tmp" "$STATE"
```

## Compaction + cleanup

Auto-compaction 70% via `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=70` in `productune.env` (sourced by wrapper; direct `claude --agent` doesn't inherit — `export` if needed). >50 turns one persona → ask user to split.

Claude transcripts: `cleanupPeriodDays` (default 30) in `~/.claude/settings.json`. Ticket md files retained indefinitely (= SoT). `versions[]` in po-state capped at 5; older versions reachable via `outcome.retrospective_path` (`docs/retrospectives/<version>.md`).

`recent_turns[]` reset to `[]` at Version close (Phase 5 → next-Version Phase 1): failure context is version-scoped. (H2 trim still runs at every turn-start during the new Version.)

## Phase ticket auto-emit summary (T-P4-159)

Quick reference for which tickets PO auto-emits at each phase boundary:

**Phase 1 — PRD ticket auto-emit** (trigger: new version entry):
- T+0 `type:design` — PRD 작성 (Designer, opus/max; interview + PRD writing in one ticket)
- Ticket `## Plan` = PRD clarity loop: question → user answer → PRD body
- Outputs: `docs/prd/PRD.md` (master, English; no version prefix) + `docs/artifacts/<version>/PRD.html` (user-lang HTML view)
- Full orchestration: `po-loop.md §2B`

**Phase 2 Design entry** (trigger: L4+ / user-facing / risk_flags ≠ none):
- T+0 `type:design` — static artifacts (design-system.html + flow.html + wireframe optional) → Gate A
- T+1 `type:design` — interactive component code (frontend-design skill) → Gate B
- Full orchestration: `po-loop.md §2B'`

**Phase 3 Build close** (trigger: all impl/refactor/test/qa tickets done):
- T+0 `type:design` — 디자인 요소 검토 (Designer, mandatory — sonnet/medium auto-check, full design-system compliance)
- T+1 `type:design` — PRD 최종 요구사항 검토 (pdt-po+user, waivable)
- T+2 `type:qa`     — 보안 체크리스트 6항목 (QA/Developer auto-check; checklist + automation spec: `_details/security-checklist.md`)
- Sequential gates — each must close before next emits.
- **Auto-commit** (PO mechanical — Phase boundary exception to "Never unsolicited commit" rule): after all 3 close tickets reach `done`, PO runs `git commit -m "feat(<version>): build close — N tickets done"`. No user request required.
- Full orchestration: `po-loop.md §Phase 3 Build close gate`

**Phase 4 Deploy — project-type gate**:
- **Meaningful deploy** (web app / API / mobile / deployable service): run Phase 4 normally.
- **N/A** (productune-internal / library / docs-only / Electron desktop): skip Phase 4; Phase 3 → Phase 5 direct. PO emits trace `→ Phase 4 Deploy: N/A (<project type>) — skipping to Phase 5`.

**Applies to all projects from next cycle (v0.5 / v1.0) onward. productune v0.4 retroactive = N/A.**

## design-system + PRD archive at Version close

At Phase 5 Version close (before retrospective), PO triggers Designer to snapshot all cycle-spanning master files into the closing version bucket:

```bash
VERSION=$(jq -r '.current_version' "$STATE")
mkdir -p "docs/artifacts/$VERSION"
# design-system master → version snapshot
cp docs/designer/design-system.md "docs/artifacts/$VERSION/design-system-snapshot.md"
# design-system-components master → version snapshot
cp docs/designer/design-system-components.md "docs/artifacts/$VERSION/design-system-components-snapshot.md"
# PRD master → version snapshot
cp docs/prd/PRD.md "docs/artifacts/$VERSION/PRD-snapshot.md"
```

**Master files** (cycle-spanning, Designer edits in-place — no version prefix):
- `docs/designer/design-system.md` — live design system; single authoritative read source
- `docs/designer/design-system-components.md` — component library spec
- `docs/prd/PRD.md` — canonical PRD; overwritten each cycle

**User views** (HTML, generated by Designer during cycle):
- `docs/artifacts/<version>/design-system.html`
- `docs/artifacts/<version>/design-system-components.html`
- `docs/artifacts/<version>/PRD.html`

**Snapshots at Version close** = immutable `.md` archives of master state at that version close. Snapshots are append-only (never edited after creation).
**Applies from v0.5 / v1.0 onward; productune v0.4 retroactive = N/A.**

## Timeline / project history → `sections/_details/lifecycle-timeline.md`
