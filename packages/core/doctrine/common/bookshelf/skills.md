# Skill layers

Classify each skill at act time. First matching rule wins; stop.

1. **Pinned to any project persona** (project skill config) → **Layer 1** allowlist. Invoke only for its assigned persona(s). Pin = deliberate provisioning act; never promote on description match alone.
2. **On project skip-list** (domain-irrelevant — not invoked, skipped at install) → **Unused**. Skip; skip at install too.
3. **Else** (installed and available, not pinned, not skipped) → **Layer 2** auto-invoke. Select by matching description to current task; no per-persona provisioning. Canonical: `frontend-design`, `claude-api`, `pdf`, `docx`.

---
(2026-06-02) [T-018]
