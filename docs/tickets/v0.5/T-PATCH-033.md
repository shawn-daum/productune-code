---
ticket_id: T-PATCH-033
version: v0.5
phase: 3
type: feature
status: done
assignee: pdt-developer
estimated_complexity: M
risk_flags: [data-plumbing-crosslayer, stream-ordering]
qa: true
slug: tool-use-toggle
---

# T-PATCH-033 — Tool-use group + nested per-tool detail toggle

## Request

Today the chat renders every tool use as its own flat gray trace line: `→ tool: Bash`,
`→ tool: Read`, `→ tool: Edit` … one line per tool. For a multi-tool turn this floods
the chat with low-signal noise.

Two changes:

1. **GROUP** — consecutive tool-use trace lines collapse under ONE disclosure toggle.
   Header shows a lucide tool icon + count + chevron, e.g. `[Wrench] 7 tools >`.
   Collapsed by default. Expand reveals the per-tool list.
2. **NESTED** — inside the expanded group, each tool row is itself a disclosure toggle.
   Expanding a row shows that tool's detail: input summary (e.g. Bash command, Read
   file path) and output/result summary.

> Color-emoji note: the user's mock used `🔧`. DS §7.1 forbids color emoji — substitute
> lucide `Wrench` (or `Hammer`) with a color token. No emoji ships.

## Feasibility (investigation result — pin file:line)

**Group (AC1): feasible, renderer-only.** Tool-use lines are emitted as `trace`-kind
messages. Source chain:
- `packages/gui/electron/po-runner.ts:446-447` — on a stream-json `tool_use` part the
  runner emits `cb.onAnnounce(msgId, { level: 'tool', text: '→ tool: ${part.name}' })`.
- `packages/gui/src/store/poEvents.ts:66-76` — `poOnAnnounce` turns that payload into a
  `Message { kind: 'trace', text }` appended to `messages[]`.
- `packages/gui/src/components/workspace/ChatPanel.tsx:244` — `messages.map((m) =>
  <MessageBubble key={m.id} message={m} />)` renders each flat.
- `packages/gui/src/components/workspace/chat/MessageBubble.tsx:49,95-101` — `kind ===
  'trace'` → `<TraceLine>` (gray monospace, one line per message).

Consecutive `level:'tool'` traces can be detected and grouped in the renderer without any
new data. The `level` field is currently dropped at `poEvents.ts:66` (only `text` is
copied onto the `Message`) — group detection therefore needs EITHER a `level`/sub-kind
carried onto `Message`, OR a text-prefix sniff on `→ tool: `. Carrying a structured
sub-kind is preferred (avoids brittle string-sniff).

**Nested per-tool detail (AC2): NOT feasible with current data — needs plumbing.**
- The runner HAS `part.input` in hand at `po-runner.ts:446` (it already reads
  `part.input.subagent_type` at :451) but discards everything except `part.name`.
- Tool **output**: `tool_result` blocks arrive in stream-json `type === 'user'` messages;
  `handleStreamJsonLine` (po-runner.ts:425+) parses `system` / `assistant` / `result`
  only — `type === 'user'` is never handled, so tool output never reaches the renderer.
- `Message` (`packages/gui/src/lib/types.ts:96-108`) carries only `text` — no structured
  per-tool input/output field exists end-to-end.

So nested detail requires a cross-layer data sub-task: po-runner extracts
`{ name, input-summary }` from `tool_use` and `{ result-summary, is_error }` from the
`tool_result` user-message, threads them through `AnnouncePayload`
(`po-runner.ts:45-46`, currently `{ level, text }`) and the `po:onAnnounce` IPC
(`po-runner.ts:828`), and lands them on a typed field of `Message`. See
`open_questions` — this MAY be split into a developer-owned plumbing ticket if scope is
too large for one PR.

## Acceptance

- [AC1] Consecutive tool-use trace messages render as ONE group disclosure, **collapsed
  by default**, header = lucide `Wrench` (`--icon-sm`, stroke `--icon-stroke-soft`,
  `--text-muted`) + `N tools` + lucide `ChevronRight`→`ChevronDown` on expand. A
  non-tool message (text / persona / other trace) breaks the run into a new group.
- [AC2] Single tool use (N=1) still renders within the group component (header `1 tool`)
  — no special flat-line path, for predictability (§1.5.3).
- [AC3] Expanding the group reveals the per-tool list; **each tool row is its own
  disclosure** that expands to show that tool's input summary + output/result summary.
  If per-tool input/output is not yet plumbed (see open_questions), the inner toggle
  shows tool name only with a muted "detail unavailable" line — the OUTER group + inner
  toggle structure must still ship and not regress.
- [AC4] No color emoji anywhere (DS §7.1); icons = lucide only.
- [AC5] Disclosure state is local UI state (collapse/expand), not persisted to chat.json;
  re-render / scroll does not lose or force state. Streaming traces append into the
  current open group correctly (a still-streaming turn keeps grouping new tool lines).
- [AC6] `tsc --noEmit` (or project typecheck) passes; lint passes (no new warnings).
- [AC7] DS §1.5.6 self-check run in PR body (2-1 Few Things, 2-2 익숙한 경험,
  3-1 Predictability, 3-2 Feedback, 3-3 Escape). Disclosure = familiar IDE pattern;
  chevron rotate = immediate feedback; collapsed-by-default = progressive disclosure.

## Out of scope

- Re-styling non-tool trace lines (announce `level:'system'`/`'error'`).
- Tool output streaming / live-tail of a running tool.
- Persisting expand state across sessions.
- Rich rendering of tool output (diffs, syntax) beyond a text summary.

## Plan (file:line)

1. **Group detection + UI (renderer, required for AC1-AC5).**
   - `ChatPanel.tsx:244` — before mapping, fold `messages[]` into render groups: a run
     of adjacent tool traces → one `ToolGroup` node; everything else → passthrough.
     Keep keys stable (first message id) so React reconciliation is clean during stream.
   - New component `packages/gui/src/components/workspace/chat/ToolUseGroup.tsx` —
     outer disclosure (collapsed default) + inner per-tool disclosure rows. lucide
     `Wrench` / `ChevronRight` / `ChevronDown`. Bind DS §1.5 (disclosure = Tier0
     progressive disclosure, §1.5.2 IDE-familiar) + §7 (lucide, stroke/size tokens, no
     color emoji). Run DS §1.5.6 self-check before surfacing.
   - Carry tool-ness onto `Message`: add an optional sub-kind/flag at
     `types.ts:96-108` and set it at `poEvents.ts:66-76` from `payload.level === 'tool'`
     (preferred over text-prefix sniff of `→ tool: `).

2. **Per-tool input/output plumbing (required for AC3 full; may be a sub-ticket).**
   - `po-runner.ts:446` — extract a short input summary from `part.input` per tool
     (Bash→`command`, Read/Edit/Write→`file_path`, Task→`subagent_type`, fallback→keys).
   - `po-runner.ts:425+ handleStreamJsonLine` — add a `type === 'user'` branch to read
     `tool_result` content blocks → result summary + `is_error`, keyed by
     `tool_use_id`.
   - `AnnouncePayload` (`po-runner.ts:45-46`) + `po:onAnnounce` IPC (`po-runner.ts:828`,
     preload bridge) — add optional `tool?: { id, name, inputSummary, resultSummary?,
     isError? }`.
   - `poEvents.ts:66` — land `tool` onto the `Message` typed field. Renderer reads it in
     the inner disclosure. If this step is descoped, AC3 fallback ("detail unavailable")
     applies and the structure still ships.

## Open questions

1. **Per-tool input/output is NOT currently plumbed to the renderer** (po-runner emits
   name only; tool_result `type:'user'` stream lines are unparsed; `Message` has no
   structured tool field). Should the nested-detail data plumbing (Plan step 2) be a
   separate developer-owned ticket, or land in this one PR? Recommendation: one ticket if
   the input/output summary stays a short string; split if output parsing
   (`tool_use_id` correlation across stream messages) proves large.
2. **Summary length / truncation** — how long a Bash command / Read path / result before
   truncating in the inner detail? Propose single-line, mono, `…`-truncate at ~120 chars
   with full text in `title`.
