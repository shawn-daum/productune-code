# QA project habit

Per-repo curated rules / prefs / decisions distilled. Tier 1 project memory.

- ≤100 lines.
- Curated — no source tag. PO writes on user approval.
- Read at every `type:qa` / `type:test` dispatch.
- Cross-link: `bookshelf/fail-patterns.md` (per-version fail log) · `version-summaries/<version>.md` (Phase 5 close) · cua real-OS escalation harness now lives in Tier 2 `~/.productune/qa/bookshelf/cua-vm-harness.md` (cross-project, personal cua-vm infra).

## Entries

- Real-OS / TCC / OAuth first-run AC (권한 프롬프트 발생여부 · 무결 first-run · 패키징 `.app` 런치 · Automation) → playwright-electron 스모크 사각지대. `type:test`/user-gate일 때만 **cua macOS-VM 하니스**로 검증: Tier 2 `~/.productune/qa/bookshelf/cua-vm-harness.md` (부팅 1클릭은 사람 몫 · 일상은 `soft_reset.sh <bundle-id>` · `--all` 금지 · 하니스 미준비=ENV fail). 평상시 게이트는 그대로 `surfaces.gui` playwright-electron.

- Electron main-process bundle changes (incl. core `.mjs` files — vite inlines them into `dist-electron`): a green build is NOT a pass. Boot-smoke required — launch the app (`pnpm exec electron .`) and assert no "App threw an error during load" (T-PATCH-117: `import.meta.url` bundle crash shipped behind a green build).
