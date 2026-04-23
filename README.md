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
git clone <this-repo>  ~/Documents/dev/orchestration   # wherever you want
cd ~/Documents/dev/orchestration
bash scripts/install.sh           # links agents → ~/.claude/agents/, copies codex config → ~/.codex/
bash scripts/setup-graphiti.sh    # FalkorDB container + graphiti clone + uv sync
```

`install.sh` is idempotent and backs up any existing conflicting files at the target path with a `.bak.<timestamp>` suffix.

## Daily use

From **any project directory** you want to work on:

```sh
cd ~/path/to/target-project

# Full PO flow (recommended)
codex --profile po

# Single persona (for debugging / exploration)
claude --agent planner
claude --agent designer
claude --agent developer
claude --agent qa

# Token-soak / offline fallback: swaps Codex to local qwen3.5:4B
codex --profile local
```

The PO profile autonomously:
1. delegates `planner` to decompose the request
2. delegates `designer` for any tasks needing design
3. delegates `developer` to implement
4. delegates `qa` to verify
5. loops dev↔qa up to 3× on QA failure
6. summarizes to you in ≤5 bullets per section

## Per-project state

When PO runs in a project, it creates `<project>/.codex/persona-sessions.json` to track which Claude session UUID belongs to each persona *for that project*. This isolates sessions per project — planner in project A has a different accumulated context than planner in project B.

Add this to the target project's `.gitignore`:

```
.codex/persona-sessions.json
.codex/logs/
```

Project-tier memory lives at `<project>/docs/<persona>/*.md` and *should* be committed — it's part of the project's documentation.

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
├── codex/                     # Codex global config — copied to ~/.codex/
│   ├── config.toml            # profiles po + local, model_providers.ollama
│   └── po-instructions.md     # PO doctrine (delegation rules, memory model, output shape)
├── scripts/
│   ├── install.sh             # one-time: symlinks + copies
│   └── setup-graphiti.sh      # one-time: FalkorDB docker + graphiti clone + uv sync
├── docs/                      # the plan/design docs for this orchestration itself
└── README.md                  # this file
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
