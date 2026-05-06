# Effort learning loop

PO model/effort routing is feedback loop, not static map. Every task close → 1 line capturing (estimate model/effort) vs (actual + result quality). Future Step 1 reads log + biases.

## Where data lives

- **Per-task (current/past)**: `./.productune/po-state.json` `current_task.calibration_outcome` (schema in `memory.md`). Task close → archive into `past_tickets[].calibration_outcome` unchanged.
- **Cross-project (rolling)**: `~/.productune/po-memory.md` `## Model/Effort Calibration` section. 1 line per task. install.sh seeds section header in new memory files via `po/po-memory.md.template`.

## When PO reads

**Step 1 startup (mandatory):** scan last 10–20 entries of `## Model/Effort Calibration`. Similar-signal tasks (e.g. "L6 synthesis multi-file refactor") historically needed estimate+1 → start one notch higher. **Cross-project rolling weight**, separate from `routing.md`'s `recent_turns` weight.

Similarity heuristic:
- complexity level (L5/L6/L7) match
- task keyword partial match ("refactor", "auth", "migration" etc.)
- same persona floor or higher

3+ entries same direction (estimate < actual ≥2 times) → auto-bump +1. Any +2 (xhigh) → recommend +2.

## When PO writes (Step 3 step 18, mandatory)

Task archives `done` / `blocked` / `abandoned` → append exactly 1 line at bottom of `## Model/Effort Calibration`. **Format**:

```
- (YYYY-MM-DD) <slug> · <complexity_class> · estimate=<model>/<effort> → actual=<model>/<effort> · QA <pass|fail>(<loops>) · rework=<y|n> · internal_redo=<n> · escalation=<none|Path1|Path2> · note: <one-line learning>
```

Examples:

```
## Model/Effort Calibration
- (2026-04-29) login-modal-forgot-pw · L6-multifile · estimate=sonnet/medium → actual=opus/xhigh · QA pass(1) · rework=n · internal_redo=0 · escalation=Path1 · note: cross-cutting refactor needed opus
- (2026-04-28) readme-typo · L1-single · estimate=haiku/low → actual=haiku/low · QA pass(0) · rework=n · internal_redo=0 · escalation=none · note: trivial as expected
- (2026-04-29) ntf-archive-prd · L7-net-new · estimate=opus/max → actual=opus/max · QA n/a · rework=n · internal_redo=0 · escalation=none · note: Designer PRD clarity loop A=0.04 (3 iterations) — appropriate
- (2026-04-29) sum-js-export · L2-single · estimate=sonnet/medium → actual=sonnet/medium · QA n/a · rework=n · internal_redo=1 · escalation=none · note: dev over-implemented (JSDoc/validation); reinvoked with literal-spec note
```

Field rules:

- `estimate=<model>/<effort>` — Step 1 routing's first call (before escalation). `<effort>` ∈ {`low`, `medium`, `high`, `xhigh`, `max`}.
- `actual=<model>/<effort>` — last actually-used (after escalation). `actual=opus/max` → Step 1 routing choice — `max` cannot be reached via Path 1 (`escalation.md`).
- `QA pass(N)` — final pdt-qa result + loop count (`current_task.calibration_outcome.qa_loops`). Use `n/a` for tasks without QA (e.g. PRD-only).
- `rework=y` — Step 3 **user** feedback indicated rework (intent class: "redo" / "no good" / "this isn't it", any user lang). Strictly user-driven; NOT for PO-internal redos.
- `internal_redo=<n>` — count of PO-driven re-invocations of same persona within same task because output didn't match spec (e.g. dev added unsolicited JSDoc). 0 if none. Distinguishes from quality escalation (which uses `escalation=Path1|Path2`).
- `escalation=Path1|Path2|none` — quality escalation triggered or not. `max` does NOT appear (Step 1 choice, not escalation outcome).
- `note` — 1-line PO judgement. `"appropriate"` if estimate==actual; otherwise why diverged.

### Format — model/effort slot

Literal names only. Valid: `haiku/low`, `sonnet/medium`, `sonnet/high`, `opus/xhigh`, `opus/max`.

Invalid: `pdt-developer/default`, `default/default`, `sonnet/normal`, `opus/extended` (prose), persona names in model slot.

For plan-first tasks, log **impl phase's** model/effort (final substantive call). Plan phase lives in `persona_session_meta.<persona>.effort_history` for retro.

## Mechanical append

```bash
LINE="- ($(date -u +%F)) $(jq -r '.current_task.slug' "$STATE") · ..."   # PO fills per format
MEMORY=~/.productune/po-memory.md
grep -q '^## Model/Effort Calibration' "$MEMORY" || printf '\n## Model/Effort Calibration\n' >> "$MEMORY"
printf '%s\n' "$LINE" >> "$MEMORY"
```

If section missing (legacy file), create header. Single `printf` append → almost no race risk.

## Pruning

`## Model/Effort Calibration` >100 lines → cleanup at start of next PO turn:

- Same-slug duplicates: keep most recent
- Entries >1 year: move to `## Model/Effort Calibration (archived)`
- Still >100 lines: mark oldest `[SUPERSEDED <date>]` (deeper compression doctrine = future work; archived split sufficient)

## Why this loop matters

- **Estimates self-improve** — PO learns which task classes this user/project habitually under-estimates.
- **Cross-project accumulation** — `po-memory.md` is user-level → calibration carries to new projects.
- **Transparent** — user can open file + see reasoning trail. Auto model upgrades have explicit grounds.
