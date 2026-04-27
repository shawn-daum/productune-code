# orchestration

A personal dev-workflow setup where **OpenAI Codex CLI** acts as a Product Owner (PO) and delegates work to four specialized **Claude Code sub-agent personas** — **Planner, Designer, Developer, QA** — each with its own 3-tier memory.

```
Codex CLI (PO, orchestrator)
   │
   ├── claude --agent planner    → reads, decomposes, routes
   ├── claude --agent designer   → writes docs/design/*.md
   ├── claude --agent developer  → implements code
   └── claude --agent qa         → verifies build / lint / test / runtime
                                  │
                                  └─ each persona has 3 memory tiers:
                                      1. session  — Claude session (per task)
                                      2. project  — docs/<persona>/*.md in target repo
                                      3. wiki     — Graphiti knowledge graph, persona-global,
                                                    group_id=persona:<name>, backed by FalkorDB + Ollama
```

This repo is the source of truth. It installs symlinks/copies into `~/.claude/agents/` and `~/.codex/` so the personas are available from **any** project directory on your machine.

## Why the 3-tier memory

Inspired by human memory: short-term / middle-term / long-term.

| Tier | Scope | Where it lives | Who writes |
|---|---|---|---|
| **Session** | one task | Claude Code session (keyed by `--session-id`) | Claude auto |
| **Project** | one repo | `docs/<persona>/*.md` inside the *target* project (committed, git-versioned) | Persona, on significant decision |
| **Wiki** | persona-global across projects | Graphiti temporal KG (`group_id=persona:<name>`), stored in local FalkorDB | Persona, on promotion |

The key constraint this solves: **the designer should not instantly recall an old project's color palette in a new project.** Project-tier memory is physically isolated per repo. Only *generalizable* principles (e.g. "prefer pastel for consumer apps") get promoted to the wiki.

Graphiti is **bi-temporal** — every fact has `(valid_from, valid_to)` windows. When you tell a persona "we don't do X anymore", it adds a new fact, and the old one deprecates automatically at retrieval time. Old knowledge isn't deleted, just deprioritized.

## Prerequisites

- **macOS** (Linux should work, paths will need tweaking)
- `claude` — Claude Code CLI, installed and authenticated
- `codex` — OpenAI Codex CLI (`npm i -g @openai/codex`), logged in
- `uv` — Python runner (`brew install uv`)
- `jq` — JSON CLI (`brew install jq`)
- `docker` — Docker Desktop (for FalkorDB container)
- `ollama` — local LLM runtime (`brew install ollama && brew services start ollama`)
- Models pulled in Ollama:
  - `gemma4:26b` — LLM for Graphiti entity/relationship extraction (wiki tier)
  - `qwen3.5:4B` — optional Codex fallback (token-soak / offline)
  - `nomic-embed-text` — embeddings for Graphiti (pull: `ollama pull nomic-embed-text`)

## Install

```sh
# 1. Clone wherever you want
git clone <this-repo> ~/Documents/dev/orchestration
cd ~/Documents/dev/orchestration

# 2. Wire the persona/codex configs into ~/.claude and ~/.codex
bash scripts/install.sh

# 3. Put my-po on your PATH (no sudo needed) — pick ONE:
#    a) PATH export in shell rc (recommended)
echo 'export PATH="$HOME/Documents/dev/orchestration/scripts:$PATH"' >> ~/.zshrc
source ~/.zshrc
#    (~/.bashrc if you're on bash)

#    b) Or symlink into ~/.local/bin (XDG, no sudo)
mkdir -p ~/.local/bin
ln -sf "$PWD/scripts/my-po" ~/.local/bin/my-po
#    (then ensure ~/.local/bin is on PATH — most modern shells already include it)

#    c) Or with sudo into /usr/local/bin (Apple Silicon Macs typically need sudo here)
sudo ln -sf "$PWD/scripts/my-po" /usr/local/bin/my-po

# 4. Set up the wiki tier (FalkorDB container + Graphiti clone). Optional but recommended.
bash scripts/setup-graphiti.sh

# 5. Verify
which my-po          # should print a path
claude agents        # should list planner/designer/developer/qa
```

`install.sh` is idempotent and backs up any existing conflicting files at the target path with a `.bak.<timestamp>` suffix. It does **not** touch your PATH — that step is up to you (step 3 above).

> **Permission denied on /usr/local/bin?** That directory needs sudo on Apple Silicon Macs. Use option (a) or (b) above instead — neither requires elevated privileges.

## Daily use

From **any project directory** you want to work on:

```sh
cd ~/path/to/target-project

# Full PO flow (recommended) — auto-creates a git worktree if another my-po
# is already running on the same project root
my-po

# Equivalent direct call (no worktree split, no parallel-safety)
codex --profile po

# Single persona (for debugging / exploration)
claude --agent planner
claude --agent designer
claude --agent developer
claude --agent qa

# Token-soak / offline fallback: swaps Codex to local qwen3.5:4B
codex --profile local
```

### Parallel sessions on the same project

Running `my-po` from a second terminal in a directory where another `my-po` is already alive triggers an automatic split:

```
[my-po] another PO is running on /Users/.../agentcafe (pid 12345)
[my-po] creating worktree at /Users/.../agentcafe-my-po-20260427-153045-67890 on branch my-po/20260427-153045-67890
```

The new shell `cd`s into the worktree before launching codex, so its `.codex/po-state.json`, branch, and persona sessions are all isolated from the original. The two PO instances cannot race on shared state.

Two ways to clean up the auto-created worktrees, pick whichever you remember:

**Option 1 — passive prompt at exit (default).** When `my-po` returns from a normal codex exit in the *main* worktree, it scans for safe-to-remove worktrees and asks once:

```
[my-po] 🧹 2 my-po worktree(s) safe to remove.
[my-po]    (also ambiguous: 0, unsafe: 1 — those are left alone)
[my-po] clean up the safe ones now? [y/N]
```

`y` removes them inline; anything else skips and you can revisit later. No command to remember.

**Option 2 — explicit subcommand.** Audit anytime:

```sh
my-po gc          # dry-run: classify each my-po/* worktree as ✓ / ⚠ / ❌
my-po gc -y       # remove only the ✓ ones (dirty / unmerged-unpushed are never touched)
# verbose aliases below also work:
#   my-po --cleanup
#   my-po --cleanup --auto
```

Decision basis is **git state** — a worktree is `✓ safe` only when its committed history is already in `main`/`master` (or an upstream remote). If you walked away from PO without committing, the worktree stays `❌ unsafe` so nothing is lost. To preserve a worktree as a real feature branch, rename it before cleanup: `git branch -m my-po/<...> feat/proper-name` removes it from the cleanup filter.

The PO profile follows a three-stage loop (see `codex/po-instructions.md` for the full doctrine):

**Stage 1 — Instruction**: paraphrases the ask back if vague, raises risk flags (auth / payments / PII / breaking changes), asks at most 2 clarifying questions, offers A/B alternatives when two paths are defensible.

**Stage 2 — Execution**: delegates to `planner`, then runs the pipeline that planner identifies (not every task uses every persona — a "design system" task may be designer-only). Emits `→` progress markers between persona calls. Applies gates adaptively:
- **Gate 1 (plan approval)**: before design/dev work if ≥4 tasks or touches risk areas
- **Gate 2 (design review)**: after designer, if the artifact is user-facing
- **Gate 3 (design-compliance cross-check)** — *mandatory when designer was involved*: after developer, PO re-invokes `designer` with changed files to check "does this match the design intent?" before handing back to the user
- **QA** runs in parallel with design-compliance or after; dev↔qa loops up to 3×

**Stage 3 — Feedback**: probes if vague, scopes to the owning persona, resumes that persona's session only, chains forward only when invalidated. Learns repeated preferences into `~/.codex/po-memory.md`.

**PRDs are opt-in** — written only when you ask or PO judges scope warrants it (≥5 tasks / multi-day work). Otherwise task list stays in PO's memory and only the final ≤5-bullet summary reaches you.

## Per-project state

When PO runs in a project, it creates `<project>/.codex/po-state.json` to track:
- `persona_sessions`: Claude session UUIDs per persona (isolates sessions per project)
- `recent_turns`: last 10 persona outcomes (PO uses this to flag recurring failures → suggests model/tool upgrades)

Add this to the target project's `.gitignore`:

```
.codex/po-state.json
.codex/po.lock
.codex/logs/
```

Project-tier memory lives at `<project>/docs/<persona>/*.md` and *should* be committed — it's part of the project's documentation. PRDs (when opt-in'd) live at `<project>/docs/prd/*.md` and also committed.

## PO's own memory

PO remembers **how you work with it** (not project facts) at `~/.codex/po-memory.md`. Accumulates your communication preferences, product taste, workflow preferences, and pushback history. PO reads it at session start and appends at notable moments. Seeded by `install.sh` as an empty template; edit freely or let PO grow it.

## Model choices

| Role | Model | Rationale |
|---|---|---|
| **PO default** | Codex hosted (OpenAI) | Robust multi-step routing, structured output |
| **PO fallback** | Ollama `qwen3.5:4B` | Fast, cheap, offline; only for simple routing |
| **Personas** | Claude (hosted) per frontmatter | `planner`/`designer`=sonnet, `developer`=opus, `qa`=haiku |
| **Graphiti LLM** | Ollama `gemma4:26b` | Entity/relationship extraction needs quality structured output; 26B is the sweet spot vs 4B. Called infrequently (only on `add_memory`), so slowness is fine. |
| **Graphiti embed** | Ollama `nomic-embed-text` | Small, fast, purpose-built for embeddings |

All persona LLM calls stay on Anthropic hosted Claude. Only the *memory backend* goes local via Ollama — your project content does not leave your machine for wiki storage.

## Files

```
orchestration/
├── agents/                    # persona sub-agent definitions — symlinked to ~/.claude/agents/
│   ├── planner.md
│   ├── designer.md
│   ├── developer.md
│   └── qa.md
├── codex/                          # Codex global config — copied to ~/.codex/
│   ├── config.toml                 # profiles po + local
│   ├── po-instructions.md          # PO doctrine (3 stages, gates, evolution triggers)
│   └── po-memory.md.template       # seed for ~/.codex/po-memory.md (PO's cross-session memory of user)
├── scripts/
│   ├── install.sh                  # one-time: symlinks + copies + seeds PO memory + chmod
│   ├── my-po                       # daily entrypoint: lock + auto-worktree + codex
│   └── setup-graphiti.sh           # one-time: FalkorDB docker + graphiti clone + uv sync
├── docs/
│   ├── overview.md                 # high-level system explanation
│   ├── customization.md            # how to swap model / add MCP / add skill / new persona
│   └── plan.md                     # design journey (historical)
└── README.md                       # this file
```

## Memory promotion (how knowledge climbs the tiers)

Each persona has explicit rules in its `.md` frontmatter body:

1. **Session → Project**: during a task, when a decision/constraint/non-obvious project fact is established, the persona appends a dated line to `docs/<persona>/project-notes.md` (or `decisions.md` for designer). Committed with the feature.
2. **Project → Wiki**: only when a pattern repeats across ≥2 projects *or* the user explicitly says "always do this", the persona calls `mcp__graphiti__add_memory` with `group_id="persona:<name>"`. Project-specific facts stay in project tier and **do not** get promoted.
3. **Wiki contradictions**: when a new fact contradicts an old one, the persona just adds the new fact. Graphiti's bi-temporal model invalidates the old one automatically.

## Troubleshooting

- **"claude doesn't list my personas"** → run `bash scripts/install.sh` (re-symlinks). Confirm `ls -la ~/.claude/agents/` shows symlinks pointing into this repo.
- **"graphiti MCP fails to start"** → check `docker ps` (falkordb container up), `curl http://localhost:11434/api/tags` (ollama), and `ls ~/.graphiti/mcp_server/main.py` (clone succeeded).
- **"entity extraction quality is bad"** → gemma4:26b depending on your tag may not match. Try `ollama pull gemma2:27b` or `ollama pull qwen2.5:32b` and update `MODEL_NAME` in each `agents/*.md`.
- **"embedding errors"** → ensure `ollama pull nomic-embed-text` ran successfully. Verify via `ollama list`.
- **"PO loses session continuity"** → check `<target-project>/.codex/persona-sessions.json` — if malformed, reset with `echo '{}' > <project>/.codex/persona-sessions.json`.

## Updating personas

Because `install.sh` uses symlinks, editing `agents/planner.md` here immediately applies to your next `claude --agent planner` run. No re-install needed.

For Codex config (`codex/config.toml`, `codex/po-instructions.md`): these are *copied*, not symlinked (Codex doesn't follow symlinks well for config paths). To update, edit the file here and re-run `install.sh`.

## Non-goals / future work

- **Not committed upstream to Graphiti**: we use a simple stdio spawn of the official graphiti MCP. If you want HTTP/SSE for multi-client sharing, edit the mcpServers `--transport` value.
- **No auto-commit** — PO always returns to you for the commit decision.
- **Not a team setup** — this is a personal config. For team sharing, the personas would live in a shared plugin rather than `~/.claude/agents/`.
- **No replacement of Basic Memory / Mem0** — evaluated, ruled out for this setup (see `docs/` for the reasoning).

## Uninstall

```sh
# Remove symlinks
rm -rf ~/.claude/agents/{planner,designer,developer,qa}.md

# Remove Codex config (or restore the .bak.* files install.sh created)
rm ~/.codex/config.toml ~/.codex/po-instructions.md

# Remove Graphiti infra
docker rm -f falkordb
docker volume rm falkordb-data
rm -rf ~/.graphiti
```
