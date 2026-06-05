---
ticket_id: T-PATCH-023
version: v0.5
phase: 3
type: patch
status: done
assignee: pdt-developer
qa: false
slug: doctrine-tree-styling
---

# T-PATCH-023 — Doctrine tier tree styling

## Request

When a persona row is toggled open in TeamPanel, wrap the expanded T0/T1/T2
tier tree in a dark (near-black) inset "drawer" box that visually contains it,
and add a hairline divider between each tier group. Styling only — no behavior
or logic change.

## What changed

`packages/gui/src/components/workspace/TeamPanel.tsx`:

- Wrapped the mounted `PersonaDoctrineTree` in a new `drawerBox` container —
  background `#0D0D0D` (a notch darker than the `#141414` panel bg), `#1E1E1E`
  hairline border, `borderRadius: 6`, inset margin `2px 8px 6px` + vertical
  padding — so the expanded region reads as a contained drawer.
- Added a `tierGroupDivided` style (`borderTop: 1px solid #1E1E1E` + small
  margin/padding) applied to every tier group after the first, separating
  T0 / T1 / T2 with a thin muted rule consistent with the existing `#1E1E1E`
  dividers in the file.

Border tone (`#1E1E1E`) matches the existing `sectionWrap` divider already in
TeamPanel; hover bg (`#1A1A1A`), spacing, and font sizes are unchanged. lucide
icons only.
