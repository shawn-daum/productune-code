---
ticket_id: T-PATCH-034
version: v0.5
phase: 3
type: patch
status: done
assignee: pdt-developer
qa: false
slug: chat-footer-polish
---

# T-PATCH-034 — Chat footer polish (send shortcut glyph + usage bar)

## Request

Two chat-footer polishes:

1. **PO send button** — replace the bare arrow (`ArrowUp` / "전송") with a ⌘+Enter
   shortcut representation that signals the submit binding. Prefer lucide
   `Command` + `CornerDownLeft` icons (on-brand, no color emoji).

2. **Usage line** (the `{X}% resets in {time}` 5h + 7d rows under the chat input):
   - (a) `%` showed float artifacts like `55.00000000000001%` → display as an
     integer. Use `Math.round` (not `ceil`) so a remaining-% never rounds up
     past the actual value.
   - (b) the two bars (5h / 7d) had different track lengths → make both bars
     the same track width/scale so they are visually comparable.

## Changes

- `packages/gui/src/components/workspace/ChatPanel.tsx`
  - Swapped `ArrowUp` import for lucide `Command` + `CornerDownLeft`.
  - Send button now renders the "Send" label + a persistent `⌘ ↵` glyph pair
    (lucide icons, §7.2 stroke-bold at ≤12px), replacing the prior hover-only
    `⌘↵` text. Added `title` / `aria-label` from the new `sendShortcut` string.
  - `kbdHint` style reworked to an inline-flex icon row.
- `packages/gui/src/components/workspace/chat/UsageBar.tsx`
  - `pct` now `Math.round(clamp(...))` — kills float noise, no round-up past actual.
  - `track` changed from `flex: 1` to a fixed `width: 120` (`flexShrink: 0`) so
    both rows share an identical track scale; `resetStyle` takes the remaining
    flex space (`flex: 1`, `minWidth: 0`) instead of a fixed `maxWidth`.
- `packages/gui/src/locales/{en,ko}.json`
  - New `workspace.chat.sendShortcut` (en: "Send with ⌘+Enter", ko: "⌘+Enter 로 전송").

## Design

- lucide-react only; ⌘ / ↵ rendered as lucide glyphs, no color emoji (§7.1).
- §7.2 stroke-bold (2.5) at the ≤12px send-button glyph size.
- §1.5.6 self-check: 3-2 Feedback (shortcut affordance is always visible),
  3-1 Predictability (token-consistent), 2-2 vocabulary (`⌘`/`Enter` preserved).
- ko/en parity for the one new i18n key.

## Acceptance

- Send button shows a ⌘+Enter representation via lucide `Command` + `CornerDownLeft`.
- Usage % renders as an integer (no float artifacts), never rounded up past actual.
- 5h and 7d usage bars render at the same track width/scale.
- tsc `--noEmit` green; `pnpm --filter @productune/gui lint` green.
