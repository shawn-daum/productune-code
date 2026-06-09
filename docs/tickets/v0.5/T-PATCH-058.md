---
ticket_id: T-PATCH-058
version: v0.5
phase: 3
type: build
status: open
assignee: pdt-developer
created_at: 2026-06-08T00:00:00Z
estimated_complexity: L4
risk_flags: findbar, window-find, webview-dom-ready, overlay-position
slug: findbar-focus-domready-position-fix
qa_status: pending
requires_qa: true
area_tag: gui-main-panel
parent_ticket: T-PATCH-046
---

# T-PATCH-058: FindBar 3-fix (한글자 버그 + WebView dom-ready + vscode 위치)

## Context

T-PATCH-046 후속 QA. 세 가지 문제:

1. **한글자 버그**: 검색 입력 시 첫 글자 이후로 입력이 안 됨. 원인: `window.find()` 호출 후 DOM 포커스가 매치된 요소로 이동하여 FindBar input의 focus가 빠져나감.

2. **WebView dom-ready 에러**: 다른 탭으로 이동 후 검색 시 에러:
   ```
   Error: The WebView must be attached to the DOM and the dom-ready event emitted before this method can be called.
   ```
   원인: 탭 전환 시 closeFind()에서 browserFindRef.current.stopFindInPage() 호출하거나, 새 webview가 dom-ready 전에 findInPage() 호출됨.

3. **위치**: 현재 전체 너비(full-width)로 상단에 표시됨. vscode 스타일: 오른쪽 상단 고정 오버레이, 너비 ~320px.

## Acceptance Criteria

- [ ] AC-1: 두 번째 글자부터도 FindBar input에 입력 가능 (focus 유지)
- [ ] AC-2: 다른 탭으로 이동 후 검색 시 dom-ready 에러 없음
- [ ] AC-3: FindBar가 탭 콘텐츠 우상단에 고정 오버레이로 표시됨 (vscode 스타일, 너비 약 320px)
- [ ] AC-4: FindBar 위치에서 탭 콘텐츠가 가려지지 않도록 오버레이 처리

## Plan

### Fix 1: window.find() 후 focus 복원

`packages/gui/src/components/workspace/main/LeafPane.tsx`:

`findInputRef`를 추가하고 `runTextFind` 후 focus 복원:
```tsx
const findInputRef = useRef<HTMLInputElement | null>(null)
```

`runTextFind` 실행 후:
```tsx
// restore focus to FindBar input after window.find() moves it
requestAnimationFrame(() => { findInputRef.current?.focus() })
```

`FindBar` 컴포넌트에 `inputRef` forwardRef 또는 prop 추가:
```tsx
// FindBar에 inputRef?: RefObject<HTMLInputElement> prop 추가
// 내부 inputRef를 prop으로 받아 사용
```

`packages/gui/src/components/workspace/main/FindBar.tsx`:
- `inputRef?: React.RefObject<HTMLInputElement>` prop 추가
- 내부 `useRef`를 prop으로 받은 ref와 병합하거나, prop을 우선 사용

### Fix 2: dom-ready 체크

`packages/gui/src/components/workspace/main/panes/BrowserTab.tsx`:
- `domReady` state 추가: `const [domReady, setDomReady] = useState(false)`
- webview `dom-ready` 이벤트에서 `setDomReady(true)` 호출
- `useImperativeHandle` → `findInPage`에서 `domReady` 가드:
  ```tsx
  findInPage: (text, opts) => {
    if (!domReady) return  // guard: webview not ready
    webviewRef.current?.findInPage(text, opts)
  },
  stopFindInPage: () => {
    if (!domReady) return  // guard
    webviewRef.current?.stopFindInPage('clearSelection')
  },
  ```
- `domReady`를 useImperativeHandle deps에 포함

### Fix 3: vscode 스타일 위치

`packages/gui/src/components/workspace/main/FindBar.tsx`:
```tsx
const barStyle: React.CSSProperties = {
  position: 'absolute',
  top: 8,           // 탭 콘텐츠 상단에서 8px 내려옴
  right: 12,        // 우측 고정
  left: 'auto',     // full-width 해제
  width: 320,       // vscode 스타일 고정 너비
  height: 'auto',   // auto height (입력 필드 기준)
  zIndex: 20,
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  padding: '4px 6px',
  background: '#252526',
  border: '1px solid #454545',
  borderRadius: 4,
  boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
  flexShrink: 0,
}
```
- `borderBottom` → `border`로 변경, `borderRadius` 추가
- `top: 0` → `top: 8` (약간 아래)
