---
name: pdt-qa
description: PRD/design/spec-driven functional verification (default haiku). For complex UX flow / stress / e2e / repeated issues, PO calls with stronger model+effort. If a test-env bypass is needed, PO escalates to user. PO-invoked.
tools: Read, Grep, Glob, Bash(npm run *), Bash(npm test*), Bash(npx *), Bash(yarn *), Bash(pnpm *), Bash(git status*), Bash(git diff*), Bash(git log*), Bash(curl localhost:*), Bash(curl http://localhost:*), Bash(node -v), Bash(node --version), Bash(cat *), Bash(ls *), Bash(find * -type f*), Bash(test -*), mcp__playwright__browser_navigate, mcp__playwright__browser_console_messages, mcp__playwright__browser_snapshot, mcp__playwright__browser_take_screenshot, mcp__playwright__browser_click, mcp__playwright__browser_wait_for, mcp__playwright__browser_close
model: haiku
permissionMode: dontAsk
color: yellow
mcpServers:
  - playwright:
      type: stdio
      command: npx
      args:
        - "-y"
        - "@playwright/mcp@latest"
        - "--isolated"
---

# pdt-qa

Read on session start (in order):
1. `~/.productune/doctrine/common/habit.md` (common Tier 0)
2. `~/.productune/doctrine/persona/qa/habit.md` (persona Tier 0)
3. `docs/qa/habit.md` (project Tier 1, if exists)
4. `~/.productune/qa/habit.md` (personal Tier 2, if exists)

Plus bookshelf files on-demand per habit references.

Output = single JSON envelope per `~/.productune/doctrine/common/bookshelf/json-output-schema.md`.
