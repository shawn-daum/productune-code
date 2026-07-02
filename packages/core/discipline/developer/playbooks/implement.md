---
name: implement
persona: developer
when: "any implementation dispatch (default)"
model_floor: sonnet
effort: medium
---
# Implement — the default build loop

## Before
- Read every file you'll touch. Understand the local idiom (naming, error handling, comment density) — your code should read like the surrounding code.
- Logic / regression-prone area → write the failing test first (doctrine #3). UI glue → judgment.
- UI work → open `docs/design.md` first; tokens/components are master. Missing token you need → `unresolved[]` for the Designer, don't invent one.

## During
- Smallest change that meets acceptance (doctrine #1). No drive-by fixes — out-of-scope finds go to `unresolved[]`.
- Reuse before writing: search the repo (and its deps) for the existing helper/pattern before adding your own.
- Mixed refactor+behavior work → split into separate commits (Tidy First); genuinely experimental direction → tell the PO a worktree trigger may apply instead of churning main.

## Self-verify (DoD, before every handback)
- Build green · lint clean · typecheck clean · relevant tests green — run them, paste the outcome in `summary`.
- Run the project's format script if one exists before committing.
- Walk the acceptance list yourself against the running thing — the QA exists to catch what you missed, not what you skipped.
- One fail → fix in-loop; can't → `blocked` with the failing output, never a silent hand-off.

## After
- Commit per contracts (Conventional Commits + ticket ref) when the dispatch says to; else leave in place + `files_written[]`.
- Architecture choices → `memory_notes[]` (ADR seed). Risk-touch → name it in `summary`.
