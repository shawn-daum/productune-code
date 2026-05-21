# Security Checklist (Phase 3 close — Close Ticket 3)

**Scope**: Universal — all project types. No project-type branching.
**Type**: `type:qa` · assignee: `pdt-qa` or `pdt-developer`.
**Instruction**: Mark each item ✓ done / N/A / ✗ fail. All 6 must resolve (no open ✗) before ticket closes.
**Waiver**: Entire ticket waivable only for `type:docs` or pure-design releases — user must waive inline in ticket `## Outcome`.

---

## Checklist items (6)

1. **OWASP surface scan** — XSS / injection / path traversal entry points identified + mitigated in all user-input surfaces.

2. **Secret exposure** — no hardcoded API keys / tokens / passwords in source; `.env` / `.env.local` in `.gitignore`; CI/CD secrets stored in vault (not commit-level).

3. **Auth & session** — auth flows correct; tokens short-lived; logout clears both client and server state; refresh token rotation in place if applicable.

4. **Input validation** — all user input sanitized + validated server-side (not client-only); file upload types/sizes restricted if applicable.

5. **Authorization (IDOR)** — every resource access endpoint gated to authenticated owner; no horizontal privilege escalation surface; admin routes require explicit role check.

6. **Pre-deploy config** — `NODE_ENV=production`; debug/dev mode OFF; HTTPS enforced; CORS origin explicit + strict; error stack traces hidden in production responses; rate limiting on auth endpoints.

---

## Auto-check specification (grep / static analysis)

QA/Developer agent performs automated grep-level scan and returns structured JSON to PO. PO synthesizes → surfaces to user in plain language.

### Check mapping

| Item | Auto-check method |
|---|---|
| **secret_exposure** | `grep -rn` for patterns: `(api_key\|API_KEY\|secret\|password\|token)\s*=\s*["'][^"']\+["']` in `src/` + config files; confirm `.env*` in `.gitignore` |
| **predeploy_config** | grep `NODE_ENV`, `DEBUG`, `console.error.*stack`, `CORS` config in source + config files |
| **owasp_surface** | grep for `innerHTML`, `dangerouslySetInnerHTML`, `eval(`, `document.write` + SQL string concat patterns |
| **auth_session** | grep for auth middleware presence, token handling, logout handlers |
| **input_validation** | grep for server-side validation libraries (`zod`, `yup`, `express-validator`, `joi`, etc.) vs. client-only form validation |
| **authz_idor** | grep for route-level auth guards, ownership checks on resource endpoints |

### JSON response schema (agent → PO)

```json
{
  "ticket": "T-NNN",
  "security_check": {
    "owasp_surface":    {"status": "pass|fail|na", "note": "<finding or clear>"},
    "secret_exposure":  {"status": "pass|fail|na", "note": "<finding or clear>"},
    "auth_session":     {"status": "pass|fail|na", "note": "<finding or clear>"},
    "input_validation": {"status": "pass|fail|na", "note": "<finding or clear>"},
    "authz_idor":       {"status": "pass|fail|na", "note": "<finding or clear>"},
    "predeploy_config": {"status": "pass|fail|na", "note": "<finding or clear>"}
  },
  "overall": "pass|fail|na",
  "fail_items": ["<item names that failed>"]
}
```

### PO surface rule

- `overall: pass` → PO surfaces summary: "보안 자동 점검 완료 — 6항목 모두 통과". Close ticket.
- `overall: fail` → PO surfaces per-fail item in plain language. User must acknowledge + confirm fix. Ticket stays open until all fail items resolved or user explicitly waives.
- `overall: na` (no code / pure docs) → surface note; user waiver inline in `## Outcome` closes ticket.
