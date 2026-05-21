# Task lifecycle + Timeline

Sessions = per-task (not project). `current_task` (live) + `docs/tickets/<version>/T-NNN.md` (SoT, fs-scanned). v2 dropped `past_tickets[]`; `past_tasks` / `current_round` / `rounds[]` = read-compat one cycle then drop.

## Disposition

Inspect `current_task` + last 5 closed ticket md. Classify:
- **(a) Continuation** — pronouns / back-ref / artifact overlap → keep, `--resume`.
- **(b) Revival** — past slug/title named → confirm, archive current → restore. Prompt: `"continue '<slug>'? (y/n/[other])"`.
- **(c) New** — different intent → archive current, allocate. Announce: `"starting new task '<slug>'"`.

## Archive current_task → ticket md (mandatory before b/c)

Write 1–2 sentence outcome → `## Outcome` (Designer) + `## Persona Activity` row (PO). Then:

```bash
sed -i.bak -E "s/^status:.*/status: $FINAL_STATUS/" "$TICKET_MD"
jq '.current_task.persona_sessions = {}' "$STATE"   # clear sessions BEFORE null
jq '.current_task = null' "$STATE"
```

`final_status`: `done` (delivered / QA pass / N/A) · `blocked` (QA fail cap / external dep) · `abandoned` (user drops).

Hook `pre-delegate-task-check.sh` blocks new delegation if prev ticket md missing `status` / `## Outcome`.

## Allocate (case c)

```bash
jq --arg slug "$SLUG" --arg title "$TITLE" --arg summary "$SUMMARY" --arg now "$NOW" \
  '.current_task = {slug:$slug, title:$title, started_at:$now, request_summary:$summary,
    artifacts:[], persona_sessions:{}, persona_session_meta:{}}' "$STATE"
```

## Revive (case b)

Fs-scan ticket md (`scripts/po/scan-tickets.mjs`) → jq seed `current_task`. `persona_sessions{}` NOT revived (closed-ticket per-turn meta dropped v2; claude allocates fresh ids on resume).

## Version id naming

`versions[].id` MUST match `^v\d+(\.\d+)?$`. Allowed: `v1`, `v2`, `v0.1`, `v1.2`. Rejected: slug-prefix (`paepyeong-v1`), `v1-rc`, `V1`, `1.0`.

```bash
echo "$VERSION_ID" | grep -qE '^v[0-9]+(\.[0-9]+)?$' || { echo "invalid id"; exit 1; }
```

User hints: `"start v2"` → use `v2`; `"next version"` → confirm. Append to `versions[]` only after valid id confirmed. New project (no po-state.json) → read `initial_version` from `.productune/config.json`; validate before using.

## Update artifacts

```bash
jq --arg a "$ARTIFACT" '.current_task.artifacts |= ((. // []) + [$a] | unique)' "$STATE"
```

## Compaction + cleanup

Auto-compaction 70% via `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=70` in `productune.env`. >50 turns one persona → ask user to split. Claude transcripts `cleanupPeriodDays` 30. Ticket md retained indefinitely (SoT). `versions[]` cap 5; older → `outcome.retrospective_path` (`docs/retrospectives/<version>.md`). `recent_turns[]` reset to `[]` at Version close (failure context = version-scoped).

## Phase ticket auto-emit summary

PO auto-emits at Phase boundary:

**Phase 1 PRD** (new version): T+0 `type:design` PRD 작성 (Designer, opus/max V1; opus/xhigh V2+). `## Plan` = clarity loop (question → answer → PRD body). Outputs: `docs/prd/PRD.md` (master English, overwritten each cycle) + `docs/artifacts/<version>/PRD.html` (user-lang). Orch: `po-loop.md §2B`.

**Phase 2 Design entry** (L4+ / user-facing / risk_flags ≠ none): T+0 × 4 `type:design`:
- ① system (design-system.md/html)
- ② flow (UX flow .mmd)
- ③ wireframe (low-fi)
- ④ hi-fi mockup (interactive HTML, frontend-design skill)

Single user gate after all 4 surfaced. L1–L3 + not user-facing + no risk_flags → skip (trace `→ Phase 2 skipped — L<n> trivial`). Orch: `po-loop.md §2B'`.

**Phase 3 Build close** (all impl/refactor/test/qa done): T+0 `type:design` 디자인 검토 (Designer sonnet/medium, mandatory) → T+1 `type:design` PRD 요구사항 (pdt-po+user, waivable) → T+2 `type:qa` 보안 6항목 (waivable). Sequential gates. Checklist: `_details/security-checklist.md`. Auto-commit (PO mechanical, Phase boundary exception): all 3 done → `git commit -m "feat(<version>): build close — N tickets done"`. Orch: `po-loop.md §Phase 3 Build close gate`.

**Phase 4 Deploy — project-type gate**:
- **Meaningful** (web / API / mobile / deployable): run Phase 4 normally.
- **N/A** (productune-internal / library / docs-only / Electron desktop): skip; Phase 3 → Phase 5 direct. Trace: `→ Phase 4 Deploy: N/A (<type>) — skipping to Phase 5`.

Applies from v0.5 / v1.0 onward. productune v0.4 retroactive = N/A.

**Phase 5 Version close** sequence: 5a Designer outcome measurement → 5b QA fail-pattern aggregate → 5c Designer retrospective narrative → 5d PO calibration. Detail: `lifecycle-mechanics.md §Phase 5` + persona files.

## Master archive at Version close

Phase 5 pre-retrospective, PO triggers Designer snapshot:

```bash
mkdir -p "docs/artifacts/$VERSION"
cp docs/designer/design-system.md "docs/artifacts/$VERSION/design-system-snapshot.md"
cp docs/designer/design-system-components.md "docs/artifacts/$VERSION/design-system-components-snapshot.md"
cp docs/prd/PRD.md "docs/artifacts/$VERSION/PRD-snapshot.md"
```

**Masters** (cycle-spanning, Designer in-place, no version prefix): `docs/designer/design-system.md` · `docs/designer/design-system-components.md` · `docs/prd/PRD.md`.

**User views** (HTML, per-cycle): `docs/artifacts/<version>/{design-system,design-system-components,PRD}.html`.

**Snapshots** = immutable `.md` archives. Append-only. From v0.5 / v1.0 onward; v0.4 retroactive = N/A.

## Timeline → `_details/lifecycle-timeline.md`
