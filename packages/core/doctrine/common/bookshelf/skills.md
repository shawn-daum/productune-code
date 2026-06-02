# Skill layers

Classify each skill at act time using the order below. Apply the first matching rule; stop.

## Classification order (deterministic)

1. **Pinned to any project persona?** → Layer 1 — explicit allowlist.
2. **On the project's skip-list?** → Unused — skip; do not invoke.
3. **Otherwise (installed and available, not pinned, not skipped)?** → Layer 2 — auto-invoke.

## Layer 1 — explicit allowlist

A skill is Layer 1 when it is explicitly assigned to one or more project personas in the project's skill config. Invoke it only for the persona(s) it is assigned to. Do not promote a skill to Layer 1 based on description match alone — a deliberate provisioning act is required.

## Layer 2 — auto-invoke

A skill is Layer 2 when it is installed and available, is NOT pinned to any persona, and is NOT on the project's skip-list. At act time, Claude selects it by matching its description to the current task — no per-persona provisioning is needed. General-purpose vendored skills (e.g. `frontend-design`, `claude-api`, `pdf`, `docx`) are the canonical Layer 2 members.

## Unused / skip

A skill on the project's domain-irrelevant skip-list is not invoked and is skipped at install.

---
(2026-06-02) [T-018]
