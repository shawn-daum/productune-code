# security_6 — close-gate security checklist (Tier 0)

The 6 security items behind the P3 close-gate `security_6` step (po `lifecycle/p3-build.md`).
This file is the SoT for what "6 security items" enumerates — the close-gate references this list; it is never re-enumerated elsewhere. Base set formalized from T-PATCH-242's provisional six.

Run at the `type:qa` close-gate step. Waivable per the P3 gate, but a waive names which item(s) and why in the gate/summary — never a silent skip. A failing item that is genuinely an env limitation (not a product fail) follows the same env-fail rule as smoke (`surface-config-schema.md`): manual fallback + note, not a product `fail` row.

## The 6 items

1. **secrets** — no credentials, API keys, tokens, or private keys committed to the repo or baked into the build/dist.
   - How: scan tracked files + the build output for key patterns; confirm secrets come from env / OS keychain, not source.
   - Pass: zero hard-coded secrets in source or dist; all sensitive values injected at runtime.

2. **electron-hardening** — Electron windows run with safe defaults (`contextIsolation: true`, `nodeIntegration: false`, `sandbox` on where feasible) and a restrictive CSP.
   - How: inspect `BrowserWindow`/`webPreferences` and the app CSP; confirm no renderer has raw Node access.
   - Pass: every window sets `contextIsolation: true` + `nodeIntegration: false`; a CSP is present and not `unsafe-*`-wide open.

3. **ipc-path** — IPC channels are explicit and validated; no broad/unbounded bridge surface from renderer to main.
   - How: review `ipcMain` handlers + the `contextBridge` preload allowlist; confirm each channel validates its payload and is individually exposed (no `*` / passthrough).
   - Pass: every exposed IPC channel is named, allowlisted, and input-validated; no generic eval/exec bridge.

4. **deps** — dependencies carry no known-exploitable advisories at the gated severity, and the lockfile is intact.
   - How: run the audit tool (`npm audit` / `pnpm audit` equiv) and review high/critical findings against the lockfile.
   - Pass: no unresolved high/critical advisories (or each is triaged + justified in the summary); lockfile committed and consistent.

5. **data-exposure** — user/PII/local data is not over-collected, logged, or transmitted; logs and telemetry carry no sensitive payloads.
   - How: review what is persisted, logged, and sent off-device; confirm sensitive fields are excluded or redacted.
   - Pass: no PII/secret in logs or outbound traffic; stored data scoped to what the feature needs.

6. **dist-integrity** — the distributable is built from the intended source and (where the surface supports it) signed / checksummed so tampering is detectable.
   - How: confirm the dist is produced by the canonical build (`surfaces[X].build`), not a hand-assembled artifact; check signing / checksum where the platform provides it.
   - Pass: dist reproduces from the committed build command; signing/checksum present where the surface supports it, else noted as a known gap.
