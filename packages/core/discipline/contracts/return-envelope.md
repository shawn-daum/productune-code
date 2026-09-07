---
name: return-envelope
section: Return envelope
when: "QA returns a live or smoke verification · the PO reads such a return"
---
# Contracts §Return envelope — annex

Continues `contracts.md` §Return envelope; binds every persona the same way, loaded on demand at the moment `when` names.

## QA live/smoke extras
- QA live/smoke extras (conditional): `browser_url` · `verify_url` · `verify_description` · `auth_required{service,instruction,type}` · `variant_matrix[]{variant,verdict}` — the last returned whenever the verified change renders conditional variants
