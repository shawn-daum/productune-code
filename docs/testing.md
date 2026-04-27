# Testing the orchestration end-to-end

A progressive 4-phase test plan. Each phase must pass before the next — failures get easier to diagnose if you don't skip.

## Phase 0 — Prerequisites (one-time, ~5 min)

```sh
# 0.1 — Pull the embedding model Graphiti needs
ollama pull nomic-embed-text

# 0.2 — Start Graphiti infra (FalkorDB container + clone graphiti + uv sync)
bash ~/Documents/dev/orchestration/scripts/setup-graphiti.sh
```

**Pass criteria:**
- `docker ps | grep falkordb` shows the container Up
- `ls ~/.graphiti/mcp_server/main.py` exists
- `ollama list | grep nomic-embed-text` shows the model

If this fails, memory-related phases (2–4) won't work. Phase 1 still works without Graphiti — MCP spawn will emit warnings that are safe to ignore.

## Phase 1 — Persona smoke test (~1 min)

Confirms Claude Code sees the personas and they respond with valid JSON.

```sh
# 1.1 — List discovered personas
claude agents
# Expect: 4 user agents — planner / designer / developer / qa

# 1.2 — Ask planner to introspect itself (no Graphiti call; pure introspection)
claude --agent planner -p "Describe your role in one sentence and list the JSON fields you return. Return as JSON." --output-format json | jq '.result' -r
# Expect: a coherent 1-sentence role description + mention of fields like persona, tasks, prd_path, pipeline, risk_flags, open_questions
```

**Pass criteria:** JSON parses, persona self-identifies correctly.

## Phase 2 — Single-persona task on a real project (~3–5 min)

We use a throwaway temp project so we don't pollute anything real.

```sh
# 2.1 — Create a disposable target project with a tiny typo to fix
mkdir -p /tmp/co-test && cd /tmp/co-test
git init -q
cat > README.md <<'EOF'
# Test project
This is a temporery test for the orchestration setup.
EOF
git add . && git commit -q -m "init"
```

Now test personas one at a time:

```sh
# 2.2 — Planner: decompose a request (read-only, expect JSON with tasks array)
claude --agent planner -p "The README has a typo. Find it and describe the fix." --output-format json | jq '.result' -r

# 2.3 — Developer: implement the fix
claude --agent developer -p "Fix the typo in README.md. The misspelling is on line 2." --output-format json | jq '.result' -r
git diff   # confirm the change

# 2.4 — QA: verify
claude --agent qa -p "Verify the README change. Run git status and git diff, confirm exactly one typo was corrected, nothing else." --output-format json | jq '.result' -r
```

**Pass criteria:**
- Planner returns a JSON with `tasks`
- Developer changes one character in README.md (`temperery` → `temporary`) and nothing else
- QA reports pass

## Phase 3 — Full PO orchestration + task lifecycle (~10–15 min)

Tests Codex PO delegating across multiple personas, **plus** the task-scoped session model (current_task / past_tasks / revival / timeline rendering).

> **Pre-flight migration**: if you ran an earlier version of this test suite and have a stale `<project>/.codex/po-state.json` with the legacy flat schema (top-level `persona_sessions`), nuke it first:
>
> ```sh
> rm -f /tmp/co-test/.codex/po-state.json
> ```
>
> PO will recreate it with the current `current_task` / `past_tasks` schema on the next run.

```sh
cd /tmp/co-test

# 3.1 — Reset so we have something to fix again
git reset --hard HEAD~0 >/dev/null 2>&1 || true
cat > README.md <<'EOF'
# Test project
This is a temperery test for the orchestration setup.

## Features
- adds 2 numbers
EOF
git add . && git commit -q -m "reset" 2>/dev/null || true

# Clear any legacy po-state from prior test cycles (safe — sessions just restart fresh)
rm -f .codex/po-state.json

# 3.2 — Start PO — pick one of three methods

# Method A (recommended for testing): interactive TUI
codex --profile po
# → opens Codex TUI. Type the prompt below inside the TUI, press Enter to submit.
# Multi-line: Shift+Enter for newline, Enter to submit. Pasting works fine.

# Method B: kickstart the TUI with an initial prompt as CLI argument
# Use SINGLE quotes when the prompt contains backticks, otherwise zsh executes them:
codex --profile po 'README 의 오타 하나 찾아서 고치고, 그 다음 `sum.js` 라는 파일 만들어서 `function sum(a,b) { return a+b; }` 를 export 해줘. 테스트는 안 돌려도 되고.'

# Or with heredoc when the prompt is multi-line:
codex --profile po "$(cat <<'EOF'
README 의 오타 하나 찾아서 고치고, 그 다음 `sum.js` 라는 파일 만들어서
`function sum(a,b) { return a+b; }` 를 export 해줘. 테스트는 안 돌려도 되고.
EOF
)"

# Method C: completely non-interactive (scripting / CI-style)
codex exec --profile po --output-last-message /tmp/po-out.txt \
  'README 의 오타 하나 찾아서 고치고, `sum.js` 에 `function sum(a,b) { return a+b; }` 를 export 해줘.'
```

Whichever method you pick, the initial task to give PO is:

> README 의 오타 하나 찾아서 고치고, 그 다음 `sum.js` 라는 파일 만들어서 `function sum(a,b) { return a+b; }` 를 export 해줘. 테스트는 안 돌려도 되고.

**Observe:**
1. PO paraphrases back or proceeds (obvious enough to skip Stage 1 questions)
2. `→ delegating to planner...` progress marker appears
3. Planner returns task list (likely 2 tasks: typo fix + sum.js creation, both `developer` persona, `qa` skipped since "테스트 안 돌려도")
4. Since ≤3 tasks and no risk flags, no Gate 1 pause — PO proceeds directly to developer
5. `→ delegating to developer...`, `✓ developer complete`
6. PO ends with the ≤5-bullet summary

**Pass criteria:**
- `git diff` shows the typo fix + new `sum.js` with the expected content
- PO emitted progress markers between persona calls
- Final summary is PO's own synthesized words, not raw JSON
- PO announced `새 task '<slug>' 시작합니다.` at the start of the run
- After the run, `cat .codex/po-state.json | jq '.current_task'` shows a populated `current_task` with `slug`, `started_at`, `request_summary`, `persona_sessions.developer` (a real UUID), `persona_session_meta.developer.turns ≥ 1`
- `recent_turns` has at least one entry with `task_slug` matching `current_task.slug`

### 3.3 — Continuation (same task, follow-up turn)

If you used **Method A or B**, you're still inside the Codex TUI after the first task completes — just type the follow-up as a new turn. If you used **Method C** (`codex exec`), start a resumed session with `codex resume --last` instead.

Follow-up prompt:

> 어 그리고 `sum.js` 에 음수 들어가면 에러 던지게 수정해줘.

**Observe:**
- PO does **not** announce a new task. It detects continuation signals ("그", "그리고", reference to `sum.js` already in `current_task.artifacts`) and proceeds silently.
- PO should NOT re-run planner.
- `→ delegating to developer...` (only), resumed session.
- `✓ developer complete` with the update to sum.js.

**Pass criteria:**
- Only developer is invoked; session is resumed (not a fresh one)
- `jq '.current_task.slug' .codex/po-state.json` returns the **same slug** as before (no archive, no new task)
- `jq '.current_task.persona_session_meta.developer.turns' .codex/po-state.json` incremented by 1

### 3.4 — New task (different intent → archive + new current_task)

In the same Codex TUI, ask something genuinely unrelated:

> 이제 README 에 "## License" 섹션 추가해서 MIT 라고 적어줘.

**Observe:**
- PO announces: `새 task 'add-license-section' (or similar) 시작합니다.` (or proposes a slug — exact wording flexible)
- The previous task is archived: `jq '.past_tasks[-1]' .codex/po-state.json` should show the prior `current_task` content with `ended_at`, `final_status`, `outcome_summary` populated
- New `current_task` allocated with empty `persona_sessions` (developer gets a fresh session id, not the prior one)

**Pass criteria:**
- `jq '.past_tasks | length' .codex/po-state.json` is ≥1
- `jq '.past_tasks[-1].final_status' .codex/po-state.json` is one of `done` / `blocked` / `abandoned`
- `jq '.past_tasks[-1].outcome_summary' .codex/po-state.json` is a 1-2 sentence string (not null, not raw JSON)
- `current_task.slug` differs from the archived entry's slug

### 3.5 — Timeline rendering (no persona invocations)

In the same TUI:

> 지금까지 한 작업 타임라인 정리해줘.

**Observe:**
- PO does **not** print `→ delegating to ...` for any persona. The whole answer is rendered from `po-state.json` alone.
- Output groups entries chronologically with `slug`, `started_at — ended_at`, `final_status`, `outcome_summary`, `artifacts`.
- Includes the in-progress `current_task` with status `in-progress`.

**Pass criteria:** zero `→ delegating` lines in this turn; visible chronological list with at least 2 entries (one `past_tasks[]` + current).

### 3.6 — Past task revival

In the same TUI:

> 어제 만든 sum.js 좀 다시 손대자. 함수 위에 JSDoc 주석 달아줘.

**Observe:**
- PO scans `past_tasks` for matches against "sum.js" in `artifacts` or the slug.
- PO proposes (one line): `이건 'add-sum-helper' 후속처럼 보여요. 그 task 이어서 갈까요? (y/n)`. Reply `y`.
- After confirmation: PO archives the (just-created) `add-license-section` task and restores the `add-sum-helper` past entry as `current_task` — including its prior `persona_sessions.developer` session id.
- The next persona call resumes that *original* developer session (not a fresh one), so the dev "remembers" the sum.js context.

**Pass criteria:**
- After revival, `jq '.current_task.slug' .codex/po-state.json` matches the revived slug
- The revived task's `developer` session id matches what was previously archived (verify against the prior `past_tasks` snapshot if you saved one)
- The license-section task is now in `past_tasks`

## Phase 4 — Memory tiers (requires Phase 0)

### 4.1 — Project tier

Check that personas write to `docs/<persona>/` when they learn something:

```sh
cd /tmp/co-test
ls docs/ 2>/dev/null
# Personas may have auto-created docs/developer/project-notes.md or similar from Phase 3 runs
find docs/ -type f 2>/dev/null
```

**Pass criteria:** at least one persona has populated a docs/ file during the previous runs (not guaranteed — it depends on whether they encountered something worth promoting; this is more of an observation than a hard check).

### 4.2 — Wiki tier (Graphiti)

> Note: earlier doctrine versions used `group_id="persona:<name>"` (with a colon), which Graphiti's API rejected as invalid. Current doctrine uses `persona-<name>` (with a dash). If the second query below comes back with a "Graphiti validation error — colon in group_id" message, that means Claude Code is still loading a cached/older agent definition — re-run `bash scripts/install.sh` and start a fresh session.

Teach the designer persona a principle, then query it. Note: **each `claude --agent` call creates a fresh session** unless you `--resume`, so Graphiti is the only thing carrying knowledge across these two invocations.

```sh
cd /tmp/co-test
claude --agent designer -p "From now on, save this principle to your wiki: 'For consumer-facing apps, prefer pastel color palettes over monotone.'" --output-format json | jq '.result' -r
# Expect: designer calls mcp__graphiti__add_memory with group_id=persona-designer

# Verify it's retrievable in a fresh session:
claude --agent designer -p "Search your wiki for color palette preferences. What do you know?" --output-format json | jq '.result' -r
# Expect: designer references the fact just saved
```

**Pass criteria:** second call retrieves the principle even though it's a different Claude session (because Graphiti persists across sessions for the same group_id).

### 4.3 — Bi-temporal contradiction

```sh
claude --agent designer -p "Update your wiki: actually, I've changed my mind — for consumer apps I now prefer high-contrast monotone palettes, not pastel." --output-format json | jq '.result' -r

# Query again:
claude --agent designer -p "What do I prefer for consumer app color palettes? Check your wiki." --output-format json | jq '.result' -r
# Expect: the new (monotone) answer; old (pastel) may be mentioned as deprecated/invalidated
```

**Pass criteria:** latest answer reflects the new fact. Graphiti's temporal handling should naturally deprioritize the old one.

### 4.4 — Persona isolation

Confirm developer doesn't see designer's palette knowledge (different group_id):

```sh
claude --agent developer -p "Search your wiki for color palette preferences. What do you know?" --output-format json | jq '.result' -r
# Expect: nothing relevant (developer's group is persona-developer, not -designer)
```

**Pass criteria:** developer returns empty or "no relevant facts".

## Phase 5 — Persona evolution (manual, ~2 min)

Simulate QA failures to trigger PO's evolution suggestion:

```sh
cd /tmp/co-test
# Manually inject 3 fake QA failures into the project's po-state
mkdir -p .codex
cat > .codex/po-state.json <<'EOF'
{
  "persona_sessions": {},
  "recent_turns": [
    {"ts": "2026-04-23T10:00:00Z", "persona": "qa", "task": "verify build", "result": "fail"},
    {"ts": "2026-04-23T11:00:00Z", "persona": "qa", "task": "verify lint", "result": "fail"},
    {"ts": "2026-04-23T12:00:00Z", "persona": "qa", "task": "verify tests", "result": "fail"},
    {"ts": "2026-04-23T13:00:00Z", "persona": "qa", "task": "verify build", "result": "pass"},
    {"ts": "2026-04-23T14:00:00Z", "persona": "qa", "task": "verify build", "result": "fail"}
  ]
}
EOF
```

Now start PO and give it any small task (kickstart with a CLI argument so the TUI opens with the prompt already submitted):

```sh
codex --profile po 'README.md 에 한 줄 더 추가해줘.'
```

(Equivalent: run `codex --profile po` alone and type the prompt in the TUI.)

**Observe:** Before executing, PO should mention something like: "qa 가 최근 이 프로젝트에서 4/5 실패. sonnet 으로 올려볼까요? (one-off: `--model sonnet`, 영구: agents/qa.md 수정)".

**Pass criteria:** PO proactively surfaces the pattern and suggests evolution, without auto-mutating the persona file.

## Troubleshooting

**"MCP server 'graphiti' failed to start"** — Phase 0 not complete. Run `setup-graphiti.sh`. For phases that don't need the wiki tier, the warning is safe to ignore.

**"codex --profile po fails to parse config"** — rare but if Ollama's `responses` API isn't ready, profile `local` may error. Doesn't affect `po`. Workaround: `codex --oss --local-provider ollama -m qwen3.5:4B` instead of `--profile local`.

**"persona doesn't respect gate"** — PO reads `po-instructions.md` at startup. If you edited it mid-session, restart Codex.

**"--session-id can only be used with --continue or --resume if --fork-session is also specified"** — you (or PO) tried `claude --session-id <uuid>` to *create* a new session with that id. That's not supported — Claude Code only allows `--session-id` inside fork-session flows. Correct pattern: omit `--session-id` on the first call (Claude assigns one, returned in response JSON's `.session_id`), and use `--resume <id>` on subsequent calls. Don't combine `--resume` with `--session-id`. The PO doctrine in `~/.codex/po-instructions.md` already implements this — if you hit the error from PO, run `bash scripts/install.sh` to redeploy the latest doctrine.

**Legacy `po-state.json` schema (flat `persona_sessions`)** — if you set up before the task-lifecycle change, your `<project>/.codex/po-state.json` may have:

```json
{ "persona_sessions": {"planner": "uuid", ...}, "recent_turns": [...] }
```

The new doctrine reads under `current_task.persona_sessions`, not the top level. The simplest migration is to clear it and let PO recreate on next run:

```sh
rm /path/to/project/.codex/po-state.json
```

Persona-tier knowledge (project markdown + Graphiti wiki + MEMORY.md) is unaffected — only the in-flight session ids are reset, which means the next persona call starts fresh sessions. That's usually fine since the task you were on is most likely complete by the time you upgrade.

**"claude --agent exits with missing `uuidgen`"** — macOS always has it; on Linux use `python3 -c 'import uuid; print(uuid.uuid4())'` instead in the PO delegation template.

**General**: `claude --debug --agent <name> -p "..."` shows MCP connection attempts and tool discovery.
