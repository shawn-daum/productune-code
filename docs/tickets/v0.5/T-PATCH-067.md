---
ticket_id: T-PATCH-067
version: v0.5
phase: 3
type: build
status: done
assignee: pdt-developer
created_at: 2026-06-08T00:00:00Z
estimated_complexity: L5
risk_flags: css-custom-highlight, range-walk, live-search, iframe-internal-find, postmessage-protocol
slug: findbar-live-search-plus-iframe-find
qa_status: pending
requires_qa: true
area_tag: gui-main-panel
parent_ticket: T-PATCH-064
---

# T-PATCH-067: FindBar 라이브 검색 — selection 보존 + useEffect 패턴

## Context

T-PATCH-064 재시도. Enter 없이 바로 검색되어야 하는데 여전히 Enter가 필요해 보임.

**근본 원인**: `runTextFind` 안에서 `requestAnimationFrame(() => findInputRef.current?.focus())` 를 호출하면, Chrome/Electron이 input에 포커스를 이동하면서 document selection(매치 하이라이트)을 지워버림. 사용자 눈에는 highlight가 보이지 않으니 "검색 안 됨"으로 인식. Enter 누르면 `handleNext` → `runTextFind` → 하이라이트 표시 → 다시 사라지지만 그 순간 보임.

**해결책 두 가지**:
1. selection range를 저장하고 focus 후 복원
2. `handleQueryChange`에서 직접 search 호출 대신 `useEffect` 패턴으로 변경 (React state update 완료 후 검색)

두 방법을 조합해서 사용.

## Acceptance Criteria

- [ ] AC-1: 글자 칠 때마다 즉시 매치 하이라이트 표시 (Enter 불필요)
- [ ] AC-2: 하이라이트가 typing 중에도 유지됨 (input focus 후에도)
- [ ] AC-3: Enter → 다음 매치로 이동 (기존 동작 유지)
- [ ] AC-4: HTML artifact(iframe preview)에서 cmd+F → find bar 열림 + iframe 내부 하이라이트 + 실제 match count (R4 추가)

## Plan (R4 — shawn hands-on correction; supersedes R3 + Context)

### R4 Correction — HTML-artifact find MUST WORK (prior "disable preview find" was WRONG)

shawn, hands-on:
- cmd+F in an HTML artifact is CORRECT behavior and must STAY.
- find highlight WORKS in markdown but does NOT work in the HTML artifact.

So the R3 recommendation B(b) — "remove `'preview'` from find-enabled types / disable HTML find" — is **REVERSED**. Restore find on HTML-artifact (preview) tabs AND make it actually highlight.

**Root (unchanged & confirmed):** an HTML artifact renders inside a sandboxed `srcDoc` iframe (`HtmlViewer` / `LocalHtmlViewer`, opaque origin). Parent `window.find` / parent-side CSS Custom Highlight CANNOT reach iframe content. The fix is to run find **INSIDE the iframe** over the existing `allow-scripts` `srcDoc` injection (the same injected bridge already used for iframe-focus in T-066) and report results back to the parent via postMessage.

### A. DOM text tabs (`markdown`, `artifact-md`, `code-view`, `doctrine-file`) — KEEP parent-side highlight. File: `LeafPane.tsx`

The CSS Custom Highlight implementation just landed and WORKS for these tabs. Keep it as-is:
- Walk the rendered content container's text nodes; build a `Range` per case-insensitive match of `findQuery`.
- Paint via `CSS.highlights.set(name, new Highlight(...ranges))` + `::highlight(name)` styles (distinct active-match style).
- Driven from `findQuery` (live), does not touch `window.getSelection()` → input keeps focus, highlight never blanks. `total = ranges.length`; `current` advances on Enter/Shift+Enter; `scrollIntoView` active range.
- No changes needed here beyond confirming it stays for these 4 tab types.

### B. HTML artifact `'preview'` (iframe) tabs — find INSIDE the iframe (NOW IN SCOPE)

Re-add `'preview'` to the find-enabled tab types, BUT route preview find to the iframe bridge — NOT to `window.find` / parent CSS Highlight.

**B1. Injected iframe handler — extend the existing T-066 `srcDoc` injection. File: `HtmlViewer.tsx` (injection string)**
Add a find/highlight handler that runs the SAME CSS Custom Highlight logic but INSIDE the iframe document:
- Listen for `message` events; on `{type:'find-query', q}`: walk the iframe document's text nodes, build a `Range` per case-insensitive match of `q`, `CSS.highlights.set('find', new Highlight(...))` inside the iframe doc, set current=1 (0 if none), `scrollIntoView` the active range, then `parent.postMessage({type:'find-result', total, current}, '*')`. Empty `q` → clear the highlight + post `{total:0,current:0}`.
- On `{type:'find-nav', forward}`: advance the current index (wrap-around), repaint the active-match highlight, `scrollIntoView`, post updated `find-result`.
- Add the `::highlight(find)` / active styles inside the injected `<style>` so they apply within the iframe doc.
- Keep `sandbox="allow-scripts"`, NO `allow-same-origin` (postMessage is cross-origin-safe from the opaque-origin frame).

**B2. Parent side — own the iframe ref inside `HtmlViewer`, surface results to FindBar. Files: `HtmlViewer.tsx` + `LeafPane.tsx`**
- For a preview tab, pass `findQuery` (+ a nav signal) down to `HtmlViewer`, and an `onFindResult({total,current})` callback up. HtmlViewer encapsulates the iframe `contentWindow`:
  - on `findQuery` change (live, per keystroke): `iframe.contentWindow.postMessage({type:'find-query', q}, '*')`.
  - on Enter / Shift+Enter: `postMessage({type:'find-nav', forward})`.
  - window `message` listener: on `{type:'find-result'}` from this iframe → `onFindResult({total,current})` → FindBar renders the count.
- FindBar (`LeafPane`) for a preview tab: drive the SAME FindBar UI; query goes out via the callback chain above instead of `runTextFind`; `{total,current}` comes back via `onFindResult`. The find `<input>` lives in the parent — typing into it does NOT blank the iframe highlight (highlight is Custom-Highlight inside the iframe, not a Selection), so AC-1/AC-2 hold for preview too.

**B3. postMessage protocol (concrete — wire both ends to these exact shapes):**
- Parent → iframe: `{ type:'find-query', q:string }` — live on each keystroke; empty `q` clears.
- Parent → iframe: `{ type:'find-nav', forward:boolean }` — Enter ⇒ `forward:true`, Shift+Enter ⇒ `false`.
- iframe → parent: `{ type:'find-result', total:number, current:number }` — posted after every query or nav.
- All use `targetOrigin:'*'` (opaque origin). Discriminate by `type`; coexists with the existing `{type:'iframe-focus'}` bridge message.

### C. http `BrowserTab` preview — likely already covered, leave unchanged

For an http (live web) preview rendered by Electron `BrowserTab`/`<webview>`, Electron `webContents.findInPage` likely already handles find natively. Check; if covered, leave unchanged (do NOT route it through the srcDoc bridge — that bridge is for `srcDoc` artifacts only). Flag if not covered.

### Backlog update

The previously-deferred "iframe-internal find" item is **NOW IN SCOPE** in this ticket (section B). Update the backlog accordingly — it is no longer a follow-up.

### Acceptance (revised)

- AC-1: live highlight on type (no Enter) — holds for DOM tabs (A) AND HTML-artifact preview (B).
- AC-2: highlight persists while typing / after input focus — both paths.
- AC-3: Enter / Shift+Enter navigates matches — both paths.
- AC-4 (new): cmd+F in an HTML artifact opens the find bar AND highlights inside the iframe with a real match count.

### Verifiability

- **Render/static-verifiable:** range-build + match-count + postMessage protocol wiring (both ends) reviewable; DOM-tab path (A) headless-checkable in a DOM env.
- **shawn hands-on (decisive):** actual highlight paint + scroll INSIDE the Electron sandboxed `srcDoc` iframe, and the live query/result round-trip in the running app. cmd+F already reaches the focused iframe (per T-066 R4), so the channel is proven; confirm the highlight renders.
