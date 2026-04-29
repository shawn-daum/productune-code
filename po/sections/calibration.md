# Effort learning loop

PO's model/effort routing is not a static map — it's a feedback loop. On every task close, append one line capturing (estimate model/effort) vs (actual model/effort + result quality). Future Stage 1 routing reads this log and biases accordingly.

## Where the data lives

- **Per-task (current/past)**: `./.productune/po-state.json` `current_task.calibration_outcome` (schema in `memory.md` and `tickets.md`). On task close, archive into `past_tasks[].calibration_outcome` unchanged.
- **Cross-project (rolling)**: `~/.productune/po-memory.md` `## Model/Effort Calibration` section. One line per task. install.sh seeds the section header in new memory files via `po/po-memory.md.template`.

## When PO reads it

**Stage 1 startup (mandatory):** scan the last 10–20 entries of `## Model/Effort Calibration`. If similar-signal tasks (e.g. "L6 synthesis multi-file refactor") historically needed estimate+1, start this turn one notch higher. This is a **cross-project rolling weight**, separate from `routing.md`'s `recent_turns` weight.

Similarity heuristic:
- complexity level (L5/L6/L7) match
- task keyword partial match ("refactor", "auth", "migration" etc.)
- same persona floor or higher

If 3+ calibration entries point the same direction (estimate < actual ≥2 times), auto-bump +1. If any one was +2 (xhigh), recommend auto +2.

## When PO writes it (Stage 3 step 18, mandatory)

Task archives to `done` / `blocked` / `abandoned` → append exactly one line at the bottom of `## Model/Effort Calibration`. **Format**:

```
- (YYYY-MM-DD) <slug> · <complexity_class> · estimate=<model>/<effort> → actual=<model>/<effort> · QA <pass|fail>(<loops>) · rework=<y|n> · escalation=<none|Path1|Path2|xhigh> · note: <one-line learning>
```

Examples:

```
## Model/Effort Calibration
- (2026-04-29) login-modal-forgot-pw · L6-multifile · estimate=sonnet/medium → actual=opus/high · QA pass(1) · rework=n · escalation=Path1 · note: cross-cutting refactor needed opus
- (2026-04-28) readme-typo · L1-single · estimate=haiku/low → actual=haiku/low · QA pass(0) · rework=n · escalation=none · note: trivial as expected
```

Field rules:

- `estimate=<model>/<effort>` — Stage 1 routing's first call (before any escalation).
- `actual=<model>/<effort>` — last actually-used model/effort (after any escalation).
- `QA pass(N)` — final pdt-qa result + loop count (`current_task.calibration_outcome.qa_loops`).
- `rework=y` — Stage 3 user feedback indicated rework ("다시", "별론데", "이거 아니야").
- `escalation=Path1|Path2|xhigh|none` — whether quality escalation triggered.
- `note` — one-line PO judgement. "정상" if estimate==actual; otherwise why they diverged.

## Mechanical append

```bash
LINE="- ($(date -u +%F)) $(jq -r '.current_task.slug' "$STATE") · ..."   # PO fills per format
MEMORY=~/.productune/po-memory.md
if ! grep -q '^## Model/Effort Calibration' "$MEMORY"; then
  printf '\n## Model/Effort Calibration\n' >> "$MEMORY"
fi
printf '%s\n' "$LINE" >> "$MEMORY"
```

If section doesn't exist (legacy memory file), create the header. Single `printf` append → almost no race risk.

## Pruning

`## Model/Effort Calibration` exceeding **100 lines** triggers cleanup at the start of the next PO turn:

- Same-slug duplicates: keep only the most recent
- Entries older than 1 year: move to `## Model/Effort Calibration (archived)`
- Still >100 lines after that: mark oldest with `[SUPERSEDED <date>]` (deeper compression doctrine is future work; archived split is sufficient for now)

## Why this loop matters

- **Estimates self-improve** — PO learns which task classes this user/project habitually under-estimates.
- **Cross-project accumulation** — `po-memory.md` is user-level, so calibration carries to new projects.
- **Transparent to the user** — they can open the file and see the reasoning trail. Auto model upgrades have explicit grounds.
