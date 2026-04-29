# Persona evolution (proactive suggestions)

When `po-state.json`, persona output, or user feedback suggests a persona needs adjustment, **surface it as a suggestion** — never silently mutate the persona.

Signals to watch:
- persona returns `blocked: true` (a tool/bash pattern needed but not in their allowlist) — **act on this immediately** (Stage A below)
- persona returns `fail` / `refused` ≥3× in last 5 turns on this project
- user gives the same correction to the same persona ≥2× ("다시 해", "이게 아냐")
- user explicitly names a persona as the problem

## Stage A — `blocked` signal (mid-turn, immediate)

When a persona returns `blocked: true` with `suggest_allowlist_addition`:

1. **Pause the pipeline.** Don't move to the next persona.

2. **One-line propose** to user, in their language:
   `pdt-developer 가 'bun install' 시도했는데 allowlist 밖. agents/pdt-developer.md 의 tools 에 'Bash(bun *)' 추가하고 이어갈까? (y/n)`

3. **On y**: mechanical edit `$PRODUCTUNE_REPO/agents/<persona>.md` — append the suggested pattern to the `tools:` line. Source `~/.productune/productune.env` first to populate `$PRODUCTUNE_REPO`. Small, reviewable edit; do it directly with `sed`/`python` (no Claude call). The symlink at `~/.claude/agents/<persona>.md` makes the change live for the next call.

4. **Resume**: re-invoke the same persona with the same `--session-id` (it continues from `partial_changes` / `partial_checks`). Pass: "allowlist updated, try again from where you stopped."

5. **On n**: skip the blocked step, surface to user as a manual follow-up in your final summary, mark relevant work `blocked` in po-state.

Implementation hint for step 3 (mechanical tools-line edit, no Claude call):

```bash
. ~/.productune/productune.env    # populates $PRODUCTUNE_REPO
PERSONA_FILE="$PRODUCTUNE_REPO/agents/<persona>.md"
NEW_PATTERN='Bash(bun *)'
# Insert before the closing `, mcp__graphiti` segment (or just before end of tools line)
python3 - "$PERSONA_FILE" "$NEW_PATTERN" <<'PY'
import re, sys, pathlib
p, pat = sys.argv[1], sys.argv[2]
text = pathlib.Path(p).read_text()
text = re.sub(r'^(tools: .*?)(, mcp__graphiti)', rf'\1, {pat}\2', text, count=1, flags=re.M)
pathlib.Path(p).write_text(text)
PY
```

Re-running `install.sh` is **not** required after a tools-line edit — symlinks update live.

## Stage B — recurring failures or user friction (between turns)

For slower-evolving signals (≥3 fails in last 5, repeated user corrections), on the *next* user turn before executing, raise it as a suggestion. Menu of changes from cheapest to biggest:

1. **One-off model override** (free, reversible): "다음 pdt-qa 만 sonnet 으로 돌려볼까요? `claude --agent pdt-qa --model sonnet`"
2. **Permanent model upgrade**: "agents/pdt-qa.md 의 `model: haiku` → `model: sonnet` 로 영구 교체 제안"
3. **Add a tool/MCP/skill**: "agents/pdt-qa.md 의 mcpServers 에 playwright-mcp 를 붙이면 실제 브라우저 검증 가능. 추가할까요?"
4. **Tighten or loosen permissions**: `tools:` / `permissionMode:` 조정
5. **Spawn a new persona**: 완전히 새로운 역할이 필요하면 `.claude/agents/<new>.md` 신규 작성 제안

For Stage B options 2–5: never execute without user confirmation — these are committed changes in the productune repo's `agents/` (or `po/`) directory.

See `docs/customization.md` for exact edits per option.
