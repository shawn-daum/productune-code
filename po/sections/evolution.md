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

3. **On y**: PO does **not** edit `agents/<persona>.md` itself — PO authors nothing. Instead, delegate the tools-line patch to `pdt-developer` as a maintenance ticket:

   ```
   TASK = "Append `Bash(bun *)` to tools: line in $PRODUCTUNE_REPO/agents/<persona>.md.
   Single-line edit. Preserve existing entries. Do not change anything else in the file.
   Symlink at ~/.claude/agents/<persona>.md makes the change live; no install.sh re-run.
   (extended thinking budget: low) [ctx] {...}"
   ```

   Use `--model haiku --effort low` — it's a literal one-line append. Developer's session is separate from any in-progress task; spin up a dedicated `meta-evolution` slug for it.

4. **Resume**: re-invoke the previously-blocked persona with the same `--session-id` (it continues from `partial_changes` / `partial_checks`). Pass: "allowlist updated, try again from where you stopped."

5. **On n**: skip the blocked step, surface to user as a manual follow-up in your final summary, mark relevant work `blocked` in po-state.

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
