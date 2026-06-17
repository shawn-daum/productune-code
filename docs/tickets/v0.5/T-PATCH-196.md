---
ticket_id: T-PATCH-196
version: v0.5
slug: gui-browser-shortcuts
title: 인앱 브라우저 — 키보드 단축키 4종 (⌘⇧T / ⌘L / ⌘[] / ⌃Tab)
type: feature
status: done
phase: 3
assignee: pdt-developer
requires_qa: true
qa_status: pending
requires_user_gate: false
area_tag: browser-tab
risk_flags: >
  recently-closed 스택은 workspace persist(sessionStorage) 범위를 명확히
  해야 한다 — 앱 종료 후 스택 잔류 여부 결정 필요 (설계 결정 AC-RC-5 참조).
  ⌘[ / ⌘] 는 macOS 시스템이 이미 쓰는 가속기 아님 — 충돌 없음.
  ⌃Tab / ⌃⇧Tab 는 일부 IME가 사용할 수 있음 — isEditable 가드 필수.
estimated_complexity: L3
created_at: 2026-06-17T00:00:00Z
---

## 배경 / 목적

인앱 브라우저 탭을 사용할 때 표준 브라우저에서 제공하는 핵심 키보드 단축키
4종이 없어 손이 트랙패드로 자꾸 이탈한다. 기존 T-PATCH-066(탭 탐색 가속기
IPC 패턴)과 T-PATCH-191(빈 탭 URL 포커스) 인프라를 재사용해 추가한다.

---

## 설계 결정

### RC — Recently-Closed 스택 (⌘⇧T 전용 신규 인프라)

| 항목 | 결정 |
|------|------|
| **스코프** | 전역 단일 스택 (pane 구분 없음). 어느 pane에서 닫혀도 같은 스택에 쌓임. 복원은 **현재 activePaneId** 기준 active pane에 추가. |
| **복원 대상** | `type === 'browser'` 인 탭만. 비브라우저 탭(chat, markdown 등)은 닫힐 때 스택에 push하지 않음. |
| **저장 디스크립터** | `{ type: 'browser', url: string, title: string }` — `tab.props.url` + `tab.title` 스냅샷. |
| **최대 깊이** | 10개. 초과 시 가장 오래된 항목(LIFO 바닥) 탈락. |
| **persist 범위** | sessionStorage에 저장하지 않음 (앱 새로고침/종료 시 소멸). workspace persist 미러에 포함하지 않음. Zustand `set` 으로만 관리. |
| **위치** | `workspace.ts` 스토어: `recentlyClosedBrowserTabs: ClosedTabDescriptor[]` 필드 + `pushClosedTab` / `popClosedTab` 액션. `closeTab` 내 browser 탭 필터링 후 push. |

### UB — ⌘L URL 바 포커스

- 활성 탭이 `browser`가 아닌 경우: no-op (아무 반응 없음).
- 활성 탭이 `browser`인 경우: `BrowserTab` 내 `urlInputRef.current?.select()` 호출 — T-PATCH-191과 동일 패턴.
- IPC 채널: `menu:focus-url`. 렌더러 구독은 `LeafPane` 또는 `BrowserTab` 중 `urlInputRef`에 접근 가능한 쪽에 배치 (설계 주의 참조).

### NAV — ⌘[ / ⌘] 브라우저 히스토리 back/forward

- 활성 탭이 `browser`가 아닌 경우: no-op.
- 활성 탭이 `browser`인 경우: `webviewRef.current?.goBack()` / `goForward()`.
- IPC 채널: `menu:nav-back`, `menu:nav-forward`.
- 기존 before-input-event 포워딩(`BrowserTab.tsx` ~line 175)에 `'['` / `']'` key 추가 — webview에 키보드 포커스가 있을 때도 동작하도록.

### CYC — ⌃Tab / ⌃⇧Tab 탭 사이클

- 스코프: `activePaneId` 기준 현재 pane의 탭 목록.
- 방향: ⌃Tab → 다음 탭(index + 1, 마지막에서 0번으로 wrap), ⌃⇧Tab → 이전 탭(index − 1, 0에서 마지막으로 wrap).
- isEditable 가드 적용 (IME 충돌 방지).
- IPC 채널: `menu:cycle-tab`, payload `{ dir: 1 | -1 }`.

---

## 수정 파일 목록 (files-to-touch)

| 파일 | 변경 내용 |
|------|-----------|
| `packages/gui/electron/main.ts` | `buildAppMenu()` Edit 섹션에 hidden accelerator 5개 추가 |
| `packages/gui/electron/preload.ts` | `onMenuReopenTab`, `onMenuFocusUrl`, `onMenuNavBack`, `onMenuNavForward`, `onMenuCycleTab` 브리지 추가 |
| `packages/gui/src/store/workspace.ts` | `ClosedTabDescriptor` 타입 + `recentlyClosedBrowserTabs` 필드 + `pushClosedTab`/`popClosedTab` 액션; `closeTab` 내 push 로직; `reopenLastClosedTab` 액션 |
| `packages/gui/src/views/workspace/shell/useKeyboardShortcuts.ts` | `onMenuReopenTab`, `onMenuCycleTab` 구독 추가 |
| `packages/gui/src/components/workspace/main/panes/BrowserTab.tsx` | `onMenuFocusUrl`, `onMenuNavBack`, `onMenuNavForward` 구독 추가; before-input-event 포워딩에 `'['`/`']'` key 추가 |
| `packages/gui/src/components/workspace/main/EmptyPane.tsx` | KbdRow 4개 추가 (⌘⇧T, ⌘L, ⌘[/⌘], ⌃Tab) |
| `packages/gui/src/locales/en.json` | `workspace.kbd.*` 키 추가 |
| `packages/gui/src/locales/ko.json` | `workspace.kbd.*` 키 추가 (en과 동기) |

---

## Acceptance Criteria

### AC-RC: ⌘⇧T — 마지막 닫힌 브라우저 탭 재열기

- **AC-RC-1**: 브라우저 탭을 닫은 직후 ⌘⇧T를 누르면, 닫힌 탭이 현재 active pane의 탭 목록 끝에 추가되고 활성화된다. 복원된 탭의 URL이 닫기 직전 URL과 일치한다.
- **AC-RC-2**: ⌘⇧T를 연속으로 누르면 LIFO 순서로 최대 10개까지 복원된다. 11번째부터는 스택이 비어 있으므로 no-op.
- **AC-RC-3**: 비브라우저 탭(예: markdown, chat)을 닫은 후 ⌘⇧T는 no-op. 스택에 쌓이지 않았으므로 이전 브라우저 탭이 복원된다(스택이 있을 경우) 또는 아무 반응 없음(스택 비어있을 경우).
- **AC-RC-4**: 앱 새로고침(⌘R) 후 스택은 초기화된다(sessionStorage persist 미포함). ⌘⇧T는 no-op.
- **AC-RC-5**: 스택 최대 깊이 10개 초과 시 가장 오래된 항목이 탈락한다(새로 닫힌 탭이 push되면 10개 유지).

### AC-UB: ⌘L — URL 바 포커스

- **AC-UB-1**: 활성 탭이 브라우저 탭일 때 ⌘L을 누르면 URL 입력 필드가 포커스되고 텍스트가 전체 선택(`.select()`)된다.
- **AC-UB-2**: 활성 탭이 비브라우저 탭일 때 ⌘L은 no-op. 포커스 변화 없음.
- **AC-UB-3**: webview가 키보드 포커스를 가지고 있을 때도 ⌘L이 동작한다(Electron 메뉴 accelerator 경로).

### AC-NAV: ⌘[ / ⌘] — 브라우저 히스토리 back/forward

- **AC-NAV-1**: 활성 탭이 브라우저 탭이고 뒤로 갈 수 있을 때, ⌘[을 누르면 webview가 한 페이지 뒤로 이동한다.
- **AC-NAV-2**: 활성 탭이 브라우저 탭이고 앞으로 갈 수 있을 때, ⌘]를 누르면 webview가 한 페이지 앞으로 이동한다.
- **AC-NAV-3**: 히스토리가 없어 goBack/goForward가 불가능한 경우 — webview 자체가 no-op으로 처리 (별도 가드 불필요).
- **AC-NAV-4**: 활성 탭이 비브라우저 탭일 때 ⌘[ / ⌘]는 no-op.
- **AC-NAV-5**: webview가 키보드 포커스를 가지고 있을 때도 ⌘[ / ⌘]가 동작한다 (before-input-event 포워딩 + 메뉴 accelerator 이중 경로).

### AC-CYC: ⌃Tab / ⌃⇧Tab — 탭 사이클

- **AC-CYC-1**: ⌃Tab을 누르면 현재 active pane에서 다음 탭(index + 1)이 활성화된다. 마지막 탭에서 누르면 첫 번째 탭으로 wrap.
- **AC-CYC-2**: ⌃⇧Tab을 누르면 이전 탭(index − 1)이 활성화된다. 첫 번째 탭에서 누르면 마지막 탭으로 wrap.
- **AC-CYC-3**: 탭이 1개뿐인 pane에서는 사이클이 no-op (현재 탭 유지).
- **AC-CYC-4**: 텍스트 입력 필드(INPUT / TEXTAREA / contenteditable)에 포커스가 있을 때 isEditable 가드가 적용되어 사이클이 발동하지 않는다.

### AC-LEGEND: EmptyPane KbdRow 범례

- **AC-LEGEND-1**: EmptyPane의 단축키 범례에 ⌘⇧T(탭 복원), ⌘L(URL 포커스), ⌘[/⌘](back/forward), ⌃Tab(탭 사이클) 항목이 표시된다.
- **AC-LEGEND-2**: en.json / ko.json 키가 동기화되어 있고, 한국어 UI에서 한국어 레이블이 출력된다.

---

## 구현 주의 사항

**`onMenuFocusUrl` 구독 위치**: `urlInputRef`는 `BrowserTab` 컴포넌트 내부에 있다. 구독을 `BrowserTab` 내에 배치하면 활성 탭이 마운트된 경우에만 핸들러가 등록된다. 비브라우저 탭 활성 시에는 BrowserTab 자체가 마운트되지 않으므로 자연스럽게 no-op이 된다 — 추가 타입 가드 불필요. `onMenuNavBack` / `onMenuNavForward` 도 동일 패턴.

**before-input-event 포워딩 확장**: `BrowserTab.tsx` ~line 175–177의 `isAppShortcut` 조건에 `key === '['` / `key === ']'` 추가 필요. 단, 메뉴 accelerator 경로가 이미 있으므로 이는 webview 포커스 시의 보조 경로다.

**`reopenLastClosedTab` 액션**: `popClosedTab`으로 디스크립터를 꺼낸 뒤, `openBrowserTab(activePaneId, url, title)` 패턴으로 탭을 복원. 기존 `openBrowserTab` 액션을 재사용하거나, 직접 탭 객체를 구성해 `replaceLeaf`로 추가.

**스택 persist 제외**: `persist` 미들웨어의 `partialize` 옵션으로 `recentlyClosedBrowserTabs` 를 명시적으로 제외해야 sessionStorage에 저장되지 않는다.

---

## QA 노트

Electron 헤드리스 환경에서는 메뉴 accelerator IPC 경로 및 webview goBack/goForward 호출을 자동 검증할 수 없다. **QA는 shawn 직접 hands-on(로컬 빌드 실행) 으로 진행.** 체크포인트:

1. 브라우저 탭 2개 이상 열고 ⌃Tab / ⌃⇧Tab으로 사이클 확인.
2. 브라우저 탭에서 여러 페이지 이동 후 ⌘[ / ⌘] 동작 확인.
3. ⌘L — URL 바 포커스 + 전체 선택 확인 (webview 포커스 상태 포함).
4. 브라우저 탭 3개 닫은 뒤 ⌘⇧T 3회 연속 → 역순 복원 확인.
5. 비브라우저 탭 활성 시 ⌘L / ⌘[ / ⌘] no-op 확인.
6. EmptyPane 열고 범례 4개 항목 노출 확인.
