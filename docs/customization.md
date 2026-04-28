# Customizing personas

Structurally, everything about a persona is a small edit in `agents/<name>.md`. Because `scripts/install.sh` uses symlinks, saving the file applies immediately to your next `claude --agent <name>` call. You never need to reinstall unless you change `codex/*` files.

This doc is the playbook for the common evolutions PO might suggest, or you might want to try on your own.

## 0. Running multiple PO sessions on the same project

Use `my-po` (the wrapper from `scripts/my-po`) instead of `codex --profile po` directly. When a second `my-po` is launched in a project where another is already running, the wrapper automatically:

1. Detects the live PO via `<root>/.codex/po.lock` (PID + alive check).
2. Creates a `git worktree` at `<parent>/<repo>-my-po-<timestamp>-<pid>` on a new branch `my-po/<timestamp>-<pid>`.
3. `cd`s into the worktree and launches a fresh codex session there.

The two PO instances now have separate `.codex/po-state.json` files, separate persona session UUIDs, and separate branches — they cannot race on shared state.

Worktrees auto-created this way **persist after PO exits** (the wrapper does not delete them — your work could still be sitting there uncommitted). Two ways to clean up:

**Passive (default).** When `my-po` returns from a normal codex exit in the *main* worktree (not inside an auto-spawned `my-po/*` branch), it audits and asks once:

```
[my-po] 🧹 2 my-po worktree(s) safe to remove.
[my-po] clean up the safe ones now? [y/N]
```

**Explicit.** Run anytime:

```sh
my-po gc          # dry-run: classify each my-po/* worktree as ✓ / ⚠ / ❌
my-po gc -y       # remove only the ✓ ones
# (verbose aliases: my-po --cleanup / my-po --cleanup --auto)
```

The cleanup classifier is git-state-only: PO process state (alive, crashed) is irrelevant. A worktree is `✓ safe` exclusively when its content lives elsewhere (merged or pushed). `⚠ ambiguous` and `❌ unsafe` are never auto-removed; you decide manually.

To graduate a worktree's branch into a real feature branch (and exclude it from cleanup): `git branch -m my-po/<...> feat/<name>`. The cleanup filter only matches `my-po/*` so renamed branches stay forever until you handle them yourself.

## 1. Swap a persona's model

Permanent (commits into the repo):

```markdown
# agents/my-qa.md — change this line
-model: haiku
+model: sonnet
```

One-off (no file edit, single call):

```sh
claude --agent my-qa --model sonnet -p "your prompt"
```

CLI `--model` flag wins over frontmatter. Useful for A/B testing before you commit.

Aliases: `sonnet`, `opus`, `haiku`. Or full IDs: `claude-opus-4-7`, `claude-sonnet-4-6`, etc.

## 2. Add an MCP server (RAG, browser, etc.) to ONE persona

Suppose you found a cool RAG MCP (e.g. `awesome-docs-rag`) and want only the my-developer to use it (not my-planner/my-designer/my-qa). Append to `agents/my-developer.md`'s frontmatter:

```yaml
mcpServers:
  - graphiti: ...          # keep existing
  - awesome-rag:
      type: stdio
      command: uvx
      args: ["awesome-docs-rag-mcp"]
      env:
        RAG_API_KEY: "${RAG_API_KEY}"
```

Then also add its tools to `tools:` so they're invokable:

```
tools: Read, Write, Edit, Bash, Glob, Grep,
       mcp__graphiti__add_memory, mcp__graphiti__search_memory_nodes, ...,
       mcp__awesome-rag__search, mcp__awesome-rag__fetch
```

Save. Next `claude --agent my-developer` call spawns the new MCP server alongside graphiti.

**One-off experiment** (no file edit):

```sh
claude --agent my-developer \
  --mcp-config '{"mcpServers":{"awesome-rag":{"type":"stdio","command":"uvx","args":["awesome-docs-rag-mcp"]}}}' \
  --allowedTools "mcp__awesome-rag__search" \
  -p "try the new RAG"
```

Caveat: `--mcp-config` **replaces** the agent's `mcpServers` block for that call rather than merging, so you'd lose Graphiti access for that one call. Use for genuine throwaway tests.

## 3. Preload a skill into a persona

Skills are reusable prompt-bundles Claude Code loads into an agent's context. Put a skill at `~/.claude/skills/<name>/SKILL.md` (user-scope) or `.claude/skills/<name>/SKILL.md` (project-scope).

Reference it in a persona:

```yaml
skills:
  - design-system-reviewer
  - a11y-checker
```

The *full content* of each skill is injected into the persona's system prompt at start — not just "available to invoke". Plan accordingly if skills are large.

## 4. Narrow or widen a persona's tool access

```yaml
# Allowlist approach — persona can only use these
tools: Read, Grep, Glob

# Or denylist approach — inherits everything except these
disallowedTools: Write, Edit
```

If both are present, `disallowedTools` is applied first, then `tools` filters the remainder.

## 5. Change permission mode

```yaml
permissionMode: plan           # read-only, proposes before executing
              | acceptEdits    # auto-accepts file edits in cwd
              | dontAsk        # auto-denies unless in allowlist
              | bypassPermissions   # skip all prompts (DANGEROUS)
              | default        # normal prompts
              | auto           # Claude's classifier decides
```

## 6. Spin up a whole new persona

```sh
# 1. Create the file
cat > "$REPO/agents/security-reviewer.md" <<'EOF'    # $REPO = wherever you cloned coolchestration
---
name: security-reviewer
description: Audits code changes for common security issues (injection, auth, secrets, PII). Read-only.
tools: Read, Glob, Grep
model: sonnet
permissionMode: plan
memory: user
color: red
---

# Security Reviewer

When invoked, audit the listed changed files for:
- injection (SQL, shell, template)
- missing auth checks on mutations
- hard-coded secrets / tokens
- PII handling violations
...
EOF

# 2. Sync to ~/.claude/agents/
bash "$REPO/scripts/install.sh"   # $REPO = your coolchestration clone dir

# 3. Verify
claude agents | grep security-reviewer

# 4. Tell PO about it (add a one-liner to po-instructions.md under "Personas you delegate to")
```

For one-off ad-hoc personas without committing:

```sh
claude --agents '{"security-reviewer":{"description":"...", "prompt":"You are ...", "tools":["Read","Grep","Glob"], "model":"sonnet"}}' \
  --agent security-reviewer \
  -p "audit the last commit"
```

## 7. Attach a new MCP server globally (to all personas)

If the MCP should be available to every persona, don't inline it in each frontmatter. Instead add to `~/.claude/mcp.json` (or per-repo `.mcp.json`):

```json
{
  "mcpServers": {
    "awesome-rag": {
      "type": "stdio",
      "command": "uvx",
      "args": ["awesome-docs-rag-mcp"]
    }
  }
}
```

And add the tool name to each persona's `tools:` where you want it exposed (Claude Code gates MCP tool access per-persona via `tools:`).

## 8. Experimenting before committing

Rule of thumb:
- **Model swap** — try with `--model` first, commit if it helps.
- **New MCP** — try with `--mcp-config` once (accepting loss of other MCPs for that call). If good, add permanently to the persona frontmatter.
- **New persona** — use `--agents '{...}'` inline. If it keeps coming up, create the file.
- **Permission or tool changes** — no good one-off override; edit the file, test, revert if worse.

Keep this in mind during PO suggestions: PO should always propose the **cheapest reversible change first** before suggesting committed file edits.

## 9. What to tell PO about changes you make

If you edit `agents/*.md`, PO will pick up the change on its next invocation (symlinks). You don't need to notify it.

If you add a **new** persona, update `codex/po-instructions.md`'s "Personas you delegate to" table so PO knows it can delegate there. Then re-run `install.sh` to copy the updated `po-instructions.md` to `~/.codex/`.

If you change PO's doctrine itself (e.g. new gate rule, new evolution trigger), same — edit + `install.sh`.

## 10. Debugging what a persona "sees"

```sh
# List discovered personas
claude agents

# Dry-run — ask the persona to describe its own context
claude --agent my-qa -p "List your memory tiers, your tools, your MCP servers, and any skills loaded. Return as JSON." --output-format json
```

The agent's own output is the most reliable test of whether your frontmatter is being parsed correctly.
