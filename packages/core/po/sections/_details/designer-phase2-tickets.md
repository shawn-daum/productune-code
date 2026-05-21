# type:design Phase 2 — 4 auto-emit tickets (amended 2026-05-21)

Loaded on-demand at Phase 2 entry. PO emits all 4 tickets upfront; Designer executes each via session resume. Single user gate after all 4 artifacts surfaced.

## T1 — system (Design System)
- Path: `docs/designer/design-system.md` (global single instance — no per-version fork)

## T2 — flow (UX flow Mermaid)
- Path: `docs/artifacts/<version>/<slug>-flow.md`

## T3 — wireframe (low-fi, optional)
- Path: `docs/artifacts/<version>/<ticket-id>-wireframe.excalidraw.json`
- Skippable if hi-fi mockup covers wireframing intent

## T4 — hi-fi mockup (interactive HTML/TSX)
- Path: `docs/artifacts/<version>/<ticket-id>-<slug>.{html,tsx}`
- Skill: `anthropic/frontend-design` (`~/.claude/skills/anthropic/skills/frontend-design/SKILL.md`)
- Stack default: shadcn/ui + react-icons (productune-internal = lucide-react per `feedback_icon_set`)

## Orchestration

Single user gate after all 4 surfaced. Revisions → resume Designer on relevant ticket(s) (`--session` resume). Full PO orchestration: `~/.productune/sections/po-loop.md §2B'`.
