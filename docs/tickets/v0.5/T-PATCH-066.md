---
ticket_id: T-PATCH-066
version: v0.5
phase: 3
type: impl
status: done
assignee: pdt-developer
created_at: 2026-06-08T00:00:00Z
estimated_complexity: L5
risk_flags: electron-menu-accelerator, ipc, active-pane-gate, oopif-sandboxed-iframe
slug: html-iframe-cmd-shortcut-menu-accelerator
qa_status: pending
requires_qa: true
area_tag: gui-main-panel
parent_ticket: T-PATCH-063
---

# T-PATCH-066: HTML iframe cmd 단축키 — Electron menu accelerator 라우팅 (R4 최종)

## Context

T-PATCH-063 재시도. `document.addEventListener('blur', ..., true)` 로는 해결 불가.

**근본 원인**: Electron Chromium은 `sandbox=""` iframe을 cross-origin 컨텍스트로 처리. 포커스가 iframe으로 이동하면 Chromium compositor가 키보드 입력을 iframe 레이어로 라우팅함. JavaScript `document.activeElement` 변경으로는 compositor 라우팅을 바꿀 수 없음.

**유일한 renderer-only 해결책**: `allow-scripts` + postMessage bridge.
- iframe 안에 keydown 이벤트 리스너 스크립트를 주입
- meta/ctrl 조합 키 발생 시 `parent.postMessage(...)` 로 부모에 전달
- 부모에서 `window.addEventListener('message', ...)` 로 수신 후 KeyboardEvent 재발송

## Acceptance Criteria

- [ ] AC-1: HTML artifact 뷰어 내부 클릭 후 cmd+T, cmd+W, cmd+F, cmd+1-9 동작
- [ ] AC-2: iframe 내 스크롤, 클릭, 링크 동작 유지
- [ ] AC-3: allow-same-origin 없음 (보안 유지 — 스크립트가 parent window DOM 접근 불가)

## Plan (R4 — recovery re-diagnosis on shawn hands-on evidence; supersedes R3 + Context)

### R4 Root cause — DECISIVE hands-on evidence flips the diagnosis

shawn, hands-on, after clicking INSIDE the HTML artifact iframe:
- cmd+T / cmd+W → do NOTHING.
- cmd+F → WORKS (opens find bar).
- The R3-era main-process `before-input-event` block (now in `main.ts`) did NOT fix cmd+T/W.

**Why cmd+F works and cmd+T/W don't — the real mechanism:**
- cmd+F is wired as an Electron **menu accelerator** — `main.ts buildAppMenu()` Edit submenu: `{ label:'Find', accelerator:'CmdOrCtrl+F', click:()=>sendToFocused('menu:find') }` (~L207-211). Menu accelerators fire **window-wide**, including when keyboard focus is inside the sandboxed **out-of-process iframe (OOPIF)**.
- `before-input-event` does NOT see input routed into the OOPIF sandboxed frame — Chromium delivers those keystrokes to the iframe's own renderer process, bypassing the host frame's `before-input-event`. That is why the R3 main-process attempt failed and why cmd+T/W die.
- Renderer-side `useKeyboardShortcuts` window listener also never sees the keystroke (focus is in the OOPIF) → same dead end.

**Conclusion: the ONLY mechanism proven to reach the focused-iframe case is the menu accelerator.** Register the app shortcuts the SAME way cmd+F is registered. REMOVE the `before-input-event` block — it does not reach the OOPIF and is now dead weight.

### Step 1 — REMOVE the dead before-input-event capture. File: `packages/gui/electron/main.ts`

Delete the R3 `webContents.on('before-input-event', …)` shortcut-forwarding block (and any helper it added). Proven not to reach the OOPIF iframe. Keep nothing from that path.

### Step 2 — register app shortcuts as menu accelerators. File: `packages/gui/electron/main.ts` (`buildAppMenu()`)

Mirror the working cmd+F pattern. Add a **"Tab" (or "Go") submenu** holding one item per shortcut, each with an `accelerator` and a `click:()=>sendToFocused('menu:<action>')`. Items may be `visible:false` if they should not clutter the menu — hidden menu items still fire their accelerator window-wide (same as cmd+F). Exact additions:

| Shortcut | Menu item label | accelerator | IPC channel (sendToFocused) |
|---|---|---|---|
| new tab | New Tab | `CmdOrCtrl+T` | `menu:new-tab` |
| close tab/pane | Close Tab | `CmdOrCtrl+W` | `menu:close-tab` |
| split right | Split Right | `CmdOrCtrl+\\` | `menu:split-right` |
| quick open | Quick Open | `CmdOrCtrl+P` | `menu:quick-open` |
| jump to tab 1..9 | Go to Tab 1 … Go to Tab 9 | `CmdOrCtrl+1` … `CmdOrCtrl+9` | `menu:goto-tab` (payload `{index:1..9}`) |

- cmd+1..9 = 9 menu items. Use a SINGLE channel `menu:goto-tab` carrying the index in the payload (cleaner than 9 channels); each item's `click` sends `{index:n}`.
- Keep the existing `menu:find` item unchanged (it is the reference impl and the reason cmd+F lands correctly).

### Step 3 — preload bridge. File: `packages/gui/electron/preload.ts` (wherever `onMenuFind` lives)

Expose one renderer callback per new channel, matching the `onMenuFind` pattern already present:
- `onMenuNewTab(cb)`, `onMenuCloseTab(cb)`, `onMenuSplitRight(cb)`, `onMenuQuickOpen(cb)`, `onMenuGotoTab(cb)` — the last passes the `index` payload through to `cb(index)`.
- (If the preload already uses a generic `onMenu(channel, cb)` shape, add the new channel names to its allow-list instead of bespoke fns — match whatever shape `menu:find` uses.)

### Step 4 — renderer handlers reuse the SAME actions as useKeyboardShortcuts. Files: `useKeyboardShortcuts.ts` + the component that already subscribes to `onMenuFind`

The menu IPC must trigger the IDENTICAL action the keyboard path triggers. Prefer **calling the handlers directly** over re-dispatching a synthetic `KeyboardEvent`:
- Refactor `useKeyboardShortcuts.ts` to expose its action map (e.g. `{ newTab, closeTab, splitRight, quickOpen, gotoTab(index) }`); the existing window-keydown listener calls into this map, and the menu IPC subscriptions call the SAME map. Single source of truth for behavior.
- The R3 `onShortcutForward` re-dispatch path may be reused, but its **source must move** from `before-input-event` (deleted in Step 1) to the menu-click IPC subscriptions. Direct-call is preferred; re-dispatch is acceptable only if it reuses the exact editable-focus guard.
- **Reuse the editable-focus guard.** Even though menu accelerators fire window-wide, do NOT fire new-tab / close-tab / goto-tab while the user is typing in the chat composer or the find input. Apply the same `targetIsEditable()` / active-input check the keyboard path uses, keyed off `document.activeElement`. (cmd+F's own handler already respects this for the find input.)

### Step 5 — KEEP D1 (iframe-focus → setActivePane). File: `HtmlViewer.tsx`

Retain the iframe-focus bridge from R3: on first `mousedown`/`focus` inside the frame, `parent.postMessage({type:"iframe-focus"})` → parent calls `setActivePane(<this pane>)`. This is WHY cmd+F now lands on the clicked pane, and the menu-accelerator actions (close-tab, split, goto) must likewise target the pane the user clicked. Do not regress this.

### Step 6 — cmd+K then cmd+\\ split-down CHORD — out of accelerator scope

A two-key chord cannot be a single Electron accelerator. Options:
- (a) keep the chord entirely in the renderer keydown path (current behavior) — works only when focus is in the app chrome, NOT inside the OOPIF iframe; or
- (b) give split-down a dedicated single accelerator menu item.

**Decision:** keep the chord in the renderer keydown path for now (a). Chord-from-inside-iframe is **acceptable to defer** — flag as a follow-up (see open_questions). Not load-bearing for this ticket's AC.

### Acceptance — after clicking INSIDE the HTML artifact iframe

- cmd+T → new tab on the clicked pane.
- cmd+W → closes the clicked tab/pane.
- cmd+\\ → splits the clicked pane right.
- cmd+P → quick open.
- cmd+1..9 → jumps to that tab.
- cmd+F → still works (unchanged).
- None fire while typing in chat composer / find input (editable-focus guard).

### Verifiability

- **Render/static-verifiable (code review):** menu template additions, IPC channel wiring, preload bridge, renderer action-map reuse + editable guard. Mechanism is PROVEN — cmd+F already demonstrates menu accelerators reach the focused OOPIF.
- **shawn hands-on (decisive):** actual cmd+T/W/\\/1-9 firing after clicking inside the iframe in the running Electron app. High confidence given cmd+F parity, but confirm.
- Chord-from-inside-iframe (Step 6) left for follow-up.
