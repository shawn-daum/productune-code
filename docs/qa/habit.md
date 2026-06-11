# QA project habit

Per-repo curated rules / prefs / decisions distilled. Tier 1 project memory.

- ≤100 lines.
- Curated — no source tag. PO writes on user approval.
- Read at every `type:qa` / `type:test` dispatch.
- Cross-link: `bookshelf/fail-patterns.md` (per-version fail log) · `version-summaries/<version>.md` (Phase 5 close).

## Entries

- Electron main-process bundle changes (incl. core `.mjs` files — vite inlines them into `dist-electron`): a green build is NOT a pass. Boot-smoke required — launch the app (`pnpm exec electron .`) and assert no "App threw an error during load" (T-PATCH-117: `import.meta.url` bundle crash shipped behind a green build).
