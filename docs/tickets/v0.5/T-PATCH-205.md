---
ticket_id: T-PATCH-205
version: v0.5
slug: pane-error-isolation
title: Pane 단위 ErrorBoundary 격리 + 탭 복구 fallback (+ 챗 드래프트 persist)
type: bugfix
status: user-verify
phase: 3
assignee: pdt-developer
requires_qa: true
qa_status: pending
requires_user_gate: false
area_tag: workspace-shell
risk_flags: >
  현재 ErrorBoundary 는 main.tsx 루트(<App/>)에만 있어, 탭 한 개의 render throw 가
  앱 전체를 에러화면으로 교체한다. pane 단위 격리 시 바운더리를 tab.id 로 key 해
  "수정된 탭 재마운트/재시도"가 깨끗이 되게 해야 함(리셋 경로 필요). ErrorBoundary
  는 render-phase throw 만 잡는다 — webview(browser 탭) async/네이티브 에러,
  이벤트 핸들러 throw 는 못 잡음(범위 명시). 챗 드래프트 persist 는 sessionStorage
  partialize — 민감정보(미전송 입력) 디스크 잔류 범위 확인.
estimated_complexity: L3
created_at: 2026-06-17T00:00:00Z
---

## 배경 / 목적

ErrorBoundary 는 존재하지만 **루트(`main.tsx:59-61`, `<App/>` 래핑)에만** 있다.
개별 pane/tab 은 감싸지지 않는다(`components/workspace/main/` grep 0건). 재사용
가능한 `components/ErrorBoundary.tsx`(fallback prop 지원)는 MermaidBlock /
DesignStageView 에서만 쓰인다.

결과: **탭 하나가 render throw 하면 루트까지 버블되어 워크스페이스 전체가 에러
화면으로 교체된다.** 잘못된 artifact-json, 예상 밖 shape 의 ticket-detail, 이상한
doctrine 파일 하나 → 앱 전체 다운. 루트 fallback 엔 복구 버튼도 없어 재실행이 답.
비개발 기획자에겐 "그 파일 열었더니 앱이 통째로 깨졌다" — 빈 pane 보다 나쁜 경험.

덤: 챗 드래프트(`poChat.ts inputDraft`)는 persist 미들웨어가 없어 ⌘R/종료/크래시 시
미전송 입력이 소실된다.

목표: **탭 단위 에러 격리** — 한 탭이 터져도 나머지 워크스페이스는 살아있고, 그
탭만 복구(닫기/재마운트)할 수 있게. 챗 드래프트 소실도 같이 막는다.

---

## 설계 결정

| 항목 | 결정 |
|------|------|
| **격리 단위** | 각 LeafPane 의 `TabContent` 렌더를 재사용 `ErrorBoundary` 로 래핑. `key={tab.id}` 로 탭별 독립 + 수정 후 재마운트. |
| **fallback UI** | 해당 탭 자리에만 표시: 에러 요약 + 액션 **"이 탭 닫기"** / **"새로고침(재마운트)"**. 나머지 pane·챗·strip 은 정상. |
| **리셋 경로** | "새로고침" → 바운더리 error state 리셋(remount key 증가 또는 reset 메서드)로 같은 탭 재시도. |
| **범위 명시** | render-phase throw 만 격리됨. webview(browser) async/네이티브, 이벤트 핸들러 throw 는 미포함 — fallback 문구/주석에 명시. 루트 바운더리는 최후 안전망으로 유지. |
| **챗 드래프트 persist** | `poChat` 의 `inputDraft` 를 sessionStorage persist(partialize)에 포함 → ⌘R/재시작 후에도 미전송 입력 유지. 전송 시 클리어 동작 불변. |

---

## 수정 파일 목록 (files-to-touch)

| 파일 | 변경 |
|------|------|
| `packages/gui/src/components/workspace/main/LeafPane.tsx` (또는 `TabContent` 호출부) | TabContent 를 `ErrorBoundary` 로 래핑(`key={tab.id}` + fallback). |
| `packages/gui/src/components/ErrorBoundary.tsx` | 필요 시 reset/remount API + 탭용 기본 fallback 추가(현재 fallback prop 존재). |
| `packages/gui/src/store/poChat.ts` | `inputDraft` persist(partialize) 추가. |
| `packages/gui/src/locales/en.json` / `ko.json` | fallback 문구("이 탭에 문제가 생겼어요" / 닫기 / 새로고침) 키(동기). |

---

## Acceptance Criteria

- **AC-1**: 한 탭의 컴포넌트가 render-phase throw 를 일으켜도, 그 탭 자리에만 fallback 이 뜨고 다른 pane·챗·phase strip 은 정상 동작한다(앱 전체 다운 없음).
- **AC-2**: fallback 의 "이 탭 닫기" 는 해당 탭만 닫고, "새로고침" 은 같은 탭을 재마운트해 정상 콘텐츠로 복구한다(원인이 일시적이면).
- **AC-3**: 서로 다른 두 탭 중 하나가 터져도 나머지 탭은 영향 없다(`key={tab.id}` 격리).
- **AC-4**: 루트 ErrorBoundary 는 최후 안전망으로 유지된다(pane 격리를 통과한 throw 대비).
- **AC-5**: 챗 입력 중 ⌘R/재시작 후에도 미전송 드래프트가 유지되고, 메시지 전송 시 정상 클리어된다.
- **AC-6**: fallback/주석에 "webview·async·핸들러 throw 는 비격리" 범위가 명시된다(오해 방지).

---

## 구현 주의 사항

1. **remount key** — 단순 fallback 만으로는 재시도가 안 됨. "새로고침"이 동작하려면 바운더리 error state 를 리셋하고 자식 key 를 증가시켜 재마운트해야 함.
2. **browser 탭** — webview 는 별도 프로세스라 render throw 가 아닌 경로로 깨진다. 본 격리는 browser 탭 자체 크래시를 못 막음 — 기존 BrowserTab 실패 오버레이가 그 역할(중복 아님).
3. **draft persist 민감도** — 미전송 입력이 sessionStorage 에 남는다. 세션 종료 시 정리되는 sessionStorage 특성상 디스크 영구 잔류는 아니나, 범위 확인.

## QA 노트

shawn hands-on + 가능 시 단위테스트. 의도적으로 throw 하는 더미 탭으로: 단일 탭
fallback 격리, "닫기"/"새로고침" 동작, 인접 탭 무영향, 루트 안전망 잔존 확인.
챗 드래프트는 입력 후 ⌘R → 유지, 전송 → 클리어 확인.
