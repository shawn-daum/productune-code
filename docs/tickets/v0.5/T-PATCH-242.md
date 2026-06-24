---
ticket_id: T-PATCH-242
version: v0.5
slug: p3-close-security-6
title: P3 close gate — 6 security items (v0.5, pre-dmg-distribution)
type: qa
status: done
phase: 3
assignee: pdt-qa
requires_qa: false
requires_user_gate: false
area_tag: security
estimated_complexity: L2
risk_flags: [close-gate, webview, unsigned-dist]
created_at: 2026-06-23T00:00:00Z
---

# P3 close gate — 6 security items (v0.5)

close_gate step `security_6` (T+2, waivable). NOTE: doctrine references "6 security items" but does not enumerate them (gap → doctrine ticket). 6 items below tailored to productune = local Electron GUI + CLI doctrine tool, about to ship an **unsigned `.dmg`** to teammates. BASIC mode (not pen-test).

## 6 items (verify each → ok | na | fail + evidence)
1. **Secrets** — no hardcoded API keys / tokens / credentials in `packages/**/src`, committed config, or `electron-builder.yml`. Anthropic key / OAuth handled via keychain/env, not source.
2. **Electron renderer hardening** — `contextIsolation: true`, `nodeIntegration: false`, `sandbox` posture on the main BrowserWindow; and the **A2 `<webview>`** that renders HTML artifacts (`TabContent.tsx` browser tab) — nodeIntegration off, no arbitrary remote navigation, local-file scope only.
3. **IPC / path traversal** — file IPC handlers (artifacts read `ipc/artifacts.ts`, `project:create`/`delete`, recents) validate/normalize paths; no traversal outside the intended project/docs roots; no shell-injection via project paths.
4. **Dependency vulns** — `pnpm audit` (or equiv) high/critical count; note any in the dmg-shipped runtime deps (electron, electron-builder are dev; runtime deps in asar matter).
5. **Sensitive data exposure** — logs / `turns.jsonl` / dispatch-cost capture / statusline don't persist secrets or tokens; no token echoed to disk.
6. **Distribution integrity** — unsigned `.dmg` is a documented accepted risk (README Gatekeeper bypass). Confirm no WORSE posture: no auto-update fetching unsigned remote code (electron-updater confirmed deferred/absent), no insecure `extraResources` leaking secrets, asar bundles only intended `packages/core` (no `.env`, no node_modules secrets).

## Outcome

1. **Secrets** ✓ — `grep -rE "(sk-|Bearer .{20,}|ANTHROPIC_API_KEY\s*=\s*['\"][^$])"` across `packages/**/src` + `packages/**/electron` → 0 matches. `electron-builder.yml` contains no credentials. GitHub OAuth token saved to `~/.productune/credentials.json` (mode 0o600) via `packages/core/src/github.ts:70` — keychain equivalent (file-permissions-gated, not source). Anthropic auth flows through Claude Code CLI environment, not app source. Evidence: `NO_SECRETS_FOUND` grep result.

2. **Electron renderer hardening** ✓ — `main.ts:185` BrowserWindow: `contextIsolation: true`, `nodeIntegration: false`, preload set. `webviewTag: true` required for in-app browser. `<webview>` (`BrowserTab.tsx`) uses `partition="persist:browser-tab"` (isolated session), no `nodeintegration` attribute (Electron default = off), no `disablewebsecurity`. `setWindowOpenHandler` on all webview web-contents (main.ts:90–95) returns `{ action: 'deny' }` for non-https and routes https popups as IPC → no unrestricted popup spawning. Local HTML artifacts (`HtmlViewer.tsx:533`) rendered in `<iframe sandbox="allow-scripts">` — no `allow-same-origin`, scripts cannot escape. sandbox posture is sound across both rendering paths.

3. **IPC / path traversal** ✓ — `artifacts:readFile` (ipc/artifacts.ts:265): `path.resolve(absPath)` + `startsWith(projectDir + path.sep)` guard + ALLOWED_EXTS whitelist. `html:readFile/writeFile` (ipc/html.ts:36–38): `path.resolve` + `startsWith(root + path.sep)` guard + `.html/.htm` extension whitelist. `project:delete` (ipc/project.ts:89–120): `classifyDeleteTarget` requires absolute path + `.productune/` marker + blocks home/root/projectsBase. `recents:list` reads fixed path `~/.productune/recents.json`. `github:setupRemote` uses `execFileAsync('git', [...], { cwd: projectDir })` — array args, no shell string, no injection vector. No shell injection paths found.

4. **Dependency vulns** ✓ (accepted-risk) — `pnpm audit --prod`: 12 vulnerabilities, **0 high, 0 critical**. 9 moderate + 3 low. All in: `mermaid` (4× moderate: classDef/Gantt sanitization) and `dompurify` (5× moderate + 3× low: IN_PLACE bypass variants). Both are renderer-only diagram/sanitization libs; the app does not use DOMPurify in IN_PLACE mode and mermaid diagrams are doctrine-source-controlled. No high/critical in electron or any IPC-path runtime dep. electron-builder itself is dev-only (not asar-shipped). Accepted: no high/critical; mermaid/dompurify moderate is known, low-impact for internal distribution.

5. **Sensitive data exposure** ✓ — `turns.jsonl` writer (`subagent-cost.ts:209–224`): persists `{ts, scope, persona, task_slug, ticket_id, version, model, usage:{token_counts}, cost_usd, cost_basis, session_id}` — no API keys, no raw message content (`output_full: null`). `credentials.json` written with `mode: 0o600` (github.ts:70). No `console.log` calls found referencing token/secret/credential strings in electron process. `mechanical-write.ts` appends doctrine deltas only. GitHub token passed as Bearer in runtime fetch only; not written to disk beyond credentials file. No token echo to any log or JSONL found.

6. **Distribution integrity** ✓ — `electron-builder.yml`: `identity: null` (unsigned, documented). No `electron-updater` dependency or `autoUpdater` import anywhere in `packages/gui` (grep: empty). `files` section bundles only `dist-electron/`, `dist/` (renderer build), and `package.json` — no `.env` files present in repo to bundle. `extraResources`: `build/tray` (PNG icons only) + `packages/core` with explicit `!node_modules/**`, `!.turbo/**`, `!dist/**`, `!src/**`, `!test/**` excludes. No `.env` files exist in repo root or packages. README.md:198–200 documents Gatekeeper right-click bypass for teammates. Posture: unsigned is the only deviation from ideal; no auto-update, no secret leakage in asar.

**Summary: 6/6 ✓** — no failures. Accepted-risk note: deps audit 9 moderate / 3 low (all mermaid + dompurify; 0 high/critical). Unsigned .dmg is documented accepted risk. Gate: **PASS**.
