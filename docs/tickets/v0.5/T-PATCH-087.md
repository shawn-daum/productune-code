---
ticket_id: T-PATCH-087
version: v0.5
slug: chat-abort-and-dismiss-i18n
title: "Chat: abort message i18n + dismissed chip i18n"
type: impl
status: done
phase: 3
assignee: pdt-developer
requires_qa: true
requires_user_gate: false
area_tag: gui-chat-i18n
estimated_complexity: L3
risk_flags: []
created_at: 2026-06-10T00:00:00Z
---

# T-PATCH-087: Chat: abort message i18n + dismissed chip i18n

## Request

Two i18n gaps in the chat UI:

**R1 — Abort path message.** When the user stops a PO turn (stop button → T-PATCH-081 SIGTERM), the child exits with code 143. The `close` handler in `po-runner.ts:449` currently emits a raw English string `"claude exited with code 143"` via `cb.onAnnounce`. This surfaces verbatim in the chat as a trace message. The user should instead see a localized informational message: `"요청에 따라 작업을 중단했습니다."` (ko) / `"Turn aborted per request."` (en). Real non-zero crashes (not user-initiated) must also become localized error messages (with code interpolation) rather than raw English strings.

Main process has no i18n context — the translation must happen in the renderer. The mechanism: emit a structured `kind` field from the main process so the renderer can resolve via `t()`.

**R2 — Dismissed chip label.** `AskUserQuestionCard.tsx:34` hardcodes the Korean string `'보류'` for the resolved-dismissed chip label. All other strings in the app use `t()` with `en.json` / `ko.json` locale files. This must be migrated to `t('chat.askQuestion.dismissed')`.

## Acceptance

### R1 — AnnouncePayload: add `kind` + `code` fields

- AC-1: In `packages/gui/electron/po-runner.ts`, extend the `AnnouncePayload` interface:
  ```ts
  export interface AnnouncePayload {
    level: 'system' | 'tool' | 'error' | 'info'
    text: string
    kind?: 'turn-aborted' | 'exit-error'
    code?: number
  }
  ```
  Add `'info'` to the `level` union (used for the abort case, rendered non-red in trace).

### R1 — `abortActiveTurn`: set `wasAborted` flag

- AC-2: Add a module-level flag in `po-runner.ts`:
  ```ts
  let wasAborted = false
  ```

- AC-3: In `abortActiveTurn()`, set `wasAborted = true` BEFORE sending SIGTERM:
  ```ts
  export function abortActiveTurn(): void {
    if (activeChild && !activeChild.killed) {
      wasAborted = true          // new line
      activeChild.kill('SIGTERM')
    }
    activeChild = null
  }
  ```

### R1 — `close` handler: emit structured kind

- AC-4: In the `child.on('close', ...)` handler (`po-runner.ts` around line 449), replace the raw error emit with:
  ```ts
  if (code !== 0 && code !== null) {
    if (wasAborted) {
      cb.onAnnounce(msgId, { level: 'info', kind: 'turn-aborted', text: '' })
    } else {
      cb.onAnnounce(msgId, { level: 'error', kind: 'exit-error', code: code ?? undefined, text: `claude exited with code ${code}` })
    }
    // health logic unchanged
  }
  ```

- AC-5: Reset `wasAborted = false` at the END of the close handler (after all emits, before `resolve()`):
  ```ts
  wasAborted = false
  ```
  Ensures flag is clean for the next turn.

- AC-6: `text` in the `turn-aborted` payload MAY be empty string — renderer ignores `text` when `kind` is set (AC-9). `text` in `exit-error` kept as English fallback for any codepath that does not check `kind`.

### R1 — Renderer: resolve `kind` via `t()`

- AC-7: In `packages/gui/src/store/poEvents.ts`, the `poOnAnnounce` callback (around line 164) currently uses `payload.text` directly. Add a `kind`-aware resolver before the trace is constructed:
  ```ts
  const resolveText = (payload: { level: string; text: string; kind?: string; code?: number }): string => {
    if (payload.kind === 'turn-aborted') return t('chat.turn.aborted')
    if (payload.kind === 'exit-error')   return t('chat.turn.exitError', { code: payload.code })
    return payload.text
  }
  ```
  Use `resolveText(payload)` for `trace.text` instead of `payload.text`.

- AC-8: `poEvents.ts` must access `t()` outside a React component. Use `i18next.t(...)` via the raw i18next instance. Import pattern:
  ```ts
  import i18next from 'i18next'
  // usage: i18next.t('chat.turn.aborted')
  ```
  If an app-level `i18n` instance is already exported from a setup file (e.g. `src/i18n.ts`), prefer importing that instead.

- AC-9: `trace.traceLevel` continues to use `payload.level` as-is. `'info'` level must render without error color in `TraceLine`. If `TraceLine` only handles `'error' | 'tool' | 'system'`, add `'info'` as a neutral (non-red, non-bold) case — same visual as `'system'`.

### R1 — Locale keys

- AC-10: Add to `packages/gui/src/locales/en.json` under `workspace.chat` (alongside existing chat keys):
  ```json
  "turn": {
    "aborted": "Turn aborted per request.",
    "exitError": "claude exited with an error (code {{code}})."
  }
  ```

- AC-11: Add to `packages/gui/src/locales/ko.json` under the matching path:
  ```json
  "turn": {
    "aborted": "요청에 따라 작업을 중단했습니다.",
    "exitError": "claude가 오류로 종료되었습니다 (코드 {{code}})."
  }
  ```

### R2 — Dismissed chip label

- AC-12: In `packages/gui/src/components/workspace/chat/AskUserQuestionCard.tsx`, add import:
  ```ts
  import { useTranslation } from 'react-i18next'
  ```

- AC-13: Inside the component function body (before the early-return), add:
  ```ts
  const { t } = useTranslation()
  ```

- AC-14: Replace the hardcoded string at line 34:
  ```ts
  // Before
  ? '보류'
  // After
  ? t('chat.askQuestion.dismissed')
  ```

- AC-15: Add to `packages/gui/src/locales/en.json` under `workspace.chat`:
  ```json
  "askQuestion": {
    "dismissed": "Deferred"
  }
  ```

- AC-16: Add to `packages/gui/src/locales/ko.json` under the matching path:
  ```json
  "askQuestion": {
    "dismissed": "보류"
  }
  ```

## Out of scope

- Localizing other hardcoded strings in `AskUserQuestionCard.tsx` beyond the dismissed chip (R2 scope only).
- Changing visual style of trace messages beyond adding `'info'` level neutral case.
- SIGKILL escalation or abort timeout behavior (covered by T-PATCH-081).
- Translating mid-turn stderr stream lines (existing error-level traces for non-exit events).
- Translating the `"spawn failed: ..."` error at po-runner.ts:431.

## Plan

| # | File | Change |
|---|---|---|
| 1 | `electron/po-runner.ts` | Extend `AnnouncePayload`: add `'info'` to `level`, add `kind?` + `code?`. Add `wasAborted` module flag. Set flag in `abortActiveTurn()`. Restructure `close` handler to emit structured kind. Reset `wasAborted = false` after emits. |
| 2 | `src/store/poEvents.ts` | Add `resolveText()` resolver using `i18next.t`. Replace `payload.text` → `resolveText(payload)` for `trace.text`. Import `i18next` (or app i18n instance). |
| 3 | `src/components/workspace/chat/AskUserQuestionCard.tsx` | Add `useTranslation` import + `const { t }`. Replace `'보류'` → `t('chat.askQuestion.dismissed')`. |
| 4 | `src/locales/en.json` | Add `chat.turn.aborted`, `chat.turn.exitError`, `chat.askQuestion.dismissed`. |
| 5 | `src/locales/ko.json` | Add matching keys in Korean. |
| 6 | `src/components/workspace/chat/TraceLine.tsx` (conditional) | Add `'info'` level neutral visual treatment if not already covered. |

### Risk notes

- `wasAborted` flag is process-local and safe: `runPoTurn` is a single serialized Promise — no concurrent turns. No concurrency risk.
- `i18next.t` outside React component: common pattern in store files. Verify existing usage with `grep -rn "import i18next\|i18next.t" src/store/` before introducing; reuse existing import pattern.
- Locale key nesting: `workspace.chat.turn.*` and `workspace.chat.askQuestion.*` — confirm exact nesting path matches `en.json` root (line 282 shows `chat` under `workspace`). Adjust depth if root differs.

### QA scope

| Area | Check |
|---|---|
| Stop button → abort trace | Press stop during active turn → chat trace shows `"요청에 따라 작업을 중단했습니다."` (ko) / `"Turn aborted per request."` (en) — NOT raw `"claude exited with code 143"` |
| Abort trace level | Abort trace renders without error color (neutral / non-red) |
| Real crash (simulate) | Kill claude process with non-SIGTERM signal (or stub exiting code 1) → trace shows localized error with code interpolation |
| New turn after abort | Start a new turn after abort → runs normally; no `wasAborted` flag bleed |
| Dismissed chip — ko locale | In Korean locale, dismiss an AskUserQuestion → chip shows `보류` |
| Dismissed chip — en locale | In English locale, dismiss → chip shows `Deferred` |
| No regression — tool traces | Tool traces (`level: 'tool'`) render unchanged |
| No regression — system traces | System traces (`level: 'system'`) render unchanged |

## Outcome

_To be filled at Phase 5._

## Persona Activity

_PO-managed._
