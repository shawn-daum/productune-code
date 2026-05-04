# Persona evolution (proactive suggestions)

`po-state.json`, persona output, or user feedback suggests persona adjustment → **surface as suggestion** — never silently mutate.

Signals to watch:
- persona returns `blocked: true` (tool/bash needed but not in allowlist) — **act immediately** (Stage A)
- persona returns `fail` / `refused` ≥3× in last 5 turns on this project
- user gives same correction to same persona ≥2× ("다시 해", "이게 아냐")
- user explicitly names persona as the problem

## Stage A — `blocked` signal (mid-turn, immediate)

Persona returns `blocked: true` with `suggest_allowlist_addition`:

1. **Pause pipeline.** Don't move to next persona.

2. **1-line propose** in user's lang:
   `pdt-developer 가 'bun install' 시도했는데 allowlist 밖. agents/pdt-developer.md 의 tools 에 'Bash(bun *)' 추가하고 이어갈까? (y/n)`

3. **On y**: PO does **not** edit `agents/<persona>.md` — PO authors no product content. Delegate tools-line patch to `pdt-developer` as maintenance ticket:

   ```
   TASK = "Append `Bash(bun *)` to tools: line in $PRODUCTUNE_REPO/agents/<persona>.md.
   Single-line edit. Preserve existing entries. Don't change anything else.
   Symlink at ~/.claude/agents/<persona>.md makes change live; no install.sh re-run.
   (extended thinking budget: low) [ctx] {...}"
   ```

   Use `--model haiku --effort low` — literal 1-line append. Developer's session separate from in-progress task; spin dedicated `meta-evolution` slug.

4. **Resume**: re-invoke previously-blocked persona with same `--session-id` (continues from `partial_changes` / `partial_checks`). Pass: "allowlist updated, try again from where stopped."

5. **On n**: skip blocked step, surface to user as manual follow-up in final summary, mark relevant work `blocked` in po-state.

Re-running `install.sh` **not** required after tools-line edit — symlinks update live.

## Stage B — recurring failures or user friction (between turns)

Slower-evolving signals (≥3 fails in last 5, repeated user corrections) → on *next* user turn before executing, raise as suggestion. Menu cheapest → biggest:

1. **One-off model override** (free, reversible): "다음 pdt-qa 만 sonnet 으로? `claude --agent pdt-qa --model sonnet`"
2. **Permanent model upgrade**: "agents/pdt-qa.md 의 `model: haiku` → `model: sonnet` 영구 교체 제안"
3. **Add tool/MCP/skill**: "agents/pdt-qa.md mcpServers 에 playwright-mcp 붙이면 실제 브라우저 검증 가능. 추가?"
4. **Tighten or loosen permissions**: `tools:` / `permissionMode:` 조정
5. **Spawn new persona**: 새 역할 필요 → `.claude/agents/<new>.md` 신규 작성 제안

Stage B options 2–5: never execute without user confirm — committed changes in productune repo's `agents/` (or `po/`).

See `docs/customization.md` for exact edits per option.
