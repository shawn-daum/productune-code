---
name: security-pass
persona: qa
when: "Ship-entry readiness (PO dispatch) · risk_flags has auth/payments/PII · new external surface"
model_floor: sonnet
effort: medium
---
# Security pass — surface-conditional checklist

A starting set, not a closed list: each item applies only when its surface exists (the PO judges applicability; you still flag anything you see). Mark each ✓ / N/A / ✗. Soft ritual — you report, the PO judges what to fix or let slide.

## Items
1. **secrets** *(all surfaces)* — no credentials / keys / tokens in source, build, or dist; scan tracked files + build output for key patterns; sensitive values injected at runtime (env / keychain).
2. **deps** *(package-manager surfaces)* — no unresolved high/critical from `npm|pnpm audit` (or each triaged + justified); lockfile committed and consistent.
3. **data-exposure** *(all surfaces)* — no PII / sensitive data over-collected, logged, or transmitted; logs and telemetry carry no sensitive payloads.
4. **dist-integrity** *(surfaces with a build artifact)* — dist reproduces from the canonical build command; signing / checksum where the platform supports it, else note the known gap.
5. **entry-surface** *(web / browser entry)* — CSP present and not wide-open (`unsafe-*` / wildcard); security headers sane.
6. **platform-hardening** *(desktop / Electron / native)* — `contextIsolation: true` · `nodeIntegration: false` · sandbox where feasible · every IPC channel named, allowlisted, input-validated; no generic eval/exec bridge.

## Rules
- New risk the surface raises (server auth, payments, file upload, user content) → add an item and check it; never stop at the six.
- A ✗ that is genuinely an env limitation → manual fallback + note, not a product fail.
- Waiving is the PO's call, but a skip is always named — which item, why — never silent.

## Verdict
- Table of item → ✓/N/A/✗ + one line each for ✗ (what, where, evidence). The PO slices patch tickets; Ship-internal patch loop re-checks only the ✗ items.
