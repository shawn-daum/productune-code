# @productune/core

CLI core for productune — agent thin-pointers, doctrine SoT, hooks, and orchestration scripts.

## Layout

```
packages/core/
├── agents/                 # ≤30-line thin pointers (symlinked to ~/.claude/agents/)
│   ├── pdt-po.md
│   ├── pdt-designer.md
│   ├── pdt-developer.md
│   └── pdt-qa.md
├── doctrine/               # Tier 0 SoT (install.sh mirrors to ~/.productune/doctrine/)
│   ├── common/             # shared across designer/developer/qa
│   │   ├── habit.md        # ≤50 lines — JSON-only · promotion · SoT · role boundary
│   │   └── bookshelf/      # json-output-schema, promotion-candidate-schema, ticket-schema, phase-definitions
│   └── persona/<role>/     # role-specific base habit + bookshelf
│       ├── habit.md
│       └── bookshelf/      # e.g. designer/prd-clarity-loop, designer/phase3-close-gate, po/routing …
├── po/                     # legacy PO doctrine sections (migrating into doctrine/persona/po/)
├── config/
│   └── model-catalog.json  # tier-recommended model map
├── scripts/
│   ├── install.sh          # symlink agents + mirror doctrine + scaffold Tier 2 + merge hooks + install skills + PATH
│   ├── uninstall.sh
│   ├── productune          # daily entrypoint
│   ├── setup-skills.sh
│   └── hooks/              # PreToolUse / PostToolUse / PostCompact / Stop / Pre-Chunking
└── skills/                 # vendored OSS skills (mattpocock, phuryn, anthropic/frontend-design)
```

## Doctrine flow

Agents read 4 tiers on session entry:

1. **Tier 0 common** — `~/.productune/doctrine/common/habit.md` (mirrored from this repo).
2. **Tier 0 persona** — `~/.productune/doctrine/persona/<role>/habit.md`.
3. **Tier 1 project** — `<repo>/docs/<persona>/habit.md` (if present).
4. **Tier 2 personal** — `~/.productune/<persona>/habit.md` (if present).

Bookshelf files load on-demand per habit references. Output = single JSON envelope.

## Install

From the repo root:

```sh
packages/core/scripts/install.sh
```

This script is idempotent — re-run after pulling to refresh agent symlinks, doctrine mirror, and hooks (`productune update` does pull + re-run in one command). Doctrine edits go in `packages/core/doctrine/` (SoT); never edit `~/.productune/doctrine/` directly (it gets overwritten on `onboard`).

## Build (TypeScript bits)

```sh
pnpm --filter @productune/core build
```

Currently a stub (no runtime TS yet). Hooks and scripts are plain bash.
