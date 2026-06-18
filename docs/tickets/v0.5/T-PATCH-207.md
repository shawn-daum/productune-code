---
ticket_id: T-PATCH-207
version: v0.5
slug: html-artifact-render-on-open-cli
title: HTML 아티팩트 — CLI(터미널) 전달 시 코드뷰 말고 렌더로 열리게 (path-reveal .html 특수처리)
type: feature
status: user-verify
phase: 3
assignee: pdt-developer
requires_qa: true
qa_status: pending
requires_user_gate: true
area_tag: artifact-reveal
risk_flags: >
  자동 브라우저 open은 침습적일 수 있음(헤드리스/CI/매 아티팩트마다 브라우저
  뜸 방지 필요). cmux 등 터미널 뷰어의 cmd+클릭 라우팅은 productune이 제어 못함
  — file:// URL을 cmux가 브라우저로 보내는지/자체 뷰어로 보내는지 미검증. open
  -R(Finder)와 open(브라우저 렌더)은 다른 동작. Aqua 게이트가 cmux 세션을 어떻게
  판정하는지 확인 필요(현재 비-Aqua면 reveal 자체가 스킵됨).
estimated_complexity: L2
created_at: 2026-06-18T00:00:00Z
---

## 배경 / 목적 (dogfood 관찰)

CLI(Claude Code in cmux)에서 작업 중 `docs/artifacts/<ver>/userflow.html` 같은
HTML 아티팩트를 결과물로 받으면, 출력된 절대경로를 cmd+클릭해 확인한다. 그런데
**cmux 기본 파일 뷰어가 렌더된 HTML이 아니라 코드(소스)를 띄운다** → 비개발
기획자가 결과물을 확인 못 함.

### 판정 (2026-06-18) — 이건 cmux 뷰어, productune 게 아님
- productune **GUI는 HTML 아티팩트를 iframe으로 정상 렌더**한다:
  `ArtifactsPane.tsx:447`(`.html` 분기), `TabContent.tsx:40`(preview HTML
  iframe), `SidePanelArtifacts.tsx:31`. → GUI에서 보면 렌더됨.
- 스크린샷은 GUI가 아니라 **CLI→cmd+클릭→cmux 파일 뷰어(코드뷰)**. 상단 path바
  + globe/split 아이콘은 cmux chrome.
- 즉 cmux 자체 동작은 productune이 직접 못 고침. productune-side 레버는
  **artifact path-reveal**(`common/habit.md`).

### 현재 path-reveal 한계 (`packages/core/doctrine/common/habit.md:16`)
- `.html` 특수처리 없음 — 모든 아티팩트 동일하게 (a) 절대경로 print + (b) Aqua
  GUI 세션에서만 `open -R`(Finder 폴더 reveal).
- cmux 세션은 비-Aqua로 판정될 가능성 높음 → reveal 스킵, **path만 출력** →
  cmd+클릭 → cmux 코드뷰.

## 설계 결정 (후보 — 게이트에서 택1/조합)

| 옵션 | 동작 | 트레이드오프 |
|------|------|------------|
| **A. file:// URL 병기** | `.html` 아티팩트는 절대경로와 함께 `file://<abs>` 도 출력 → cmd+클릭 시 OS가 브라우저(렌더)로 라우팅 기대 | 비침습적. 단 cmux가 file://을 브라우저로 보내는지 미검증(자체 뷰어로 열 수도) |
| **B. open <abs> (브라우저 렌더)** | `.html`은 `open -R`(Finder) 대신/추가로 `open <abs>`(기본 브라우저=렌더) | 확실히 렌더됨. 단 매 HTML마다 브라우저가 떠서 침습적; 헤드리스/CI/non-Aqua 가드 필요 |
| **C. 안내문** | "터미널 코드뷰 대신 브라우저/`open`으로 보세요" 1줄 가이드 | 가장 약함 |
| **D. GUI 유도** | productune GUI 아티팩트 탭에서 렌더 확인하라고 안내 | GUI 안 쓰는 CLI 유저엔 무의미 |

권장 시작점: **A(file:// 병기)** 를 먼저 시도(비침습) → cmux가 file://을 브라우저로
안 보내면 **B**(`.html`만, Aqua/`open` 가드 하에 브라우저 open)로. 헤드리스/CI는
무조건 path만(자동 open 금지).

## 수정 파일 목록 (files-to-touch)

| 파일 | 변경 |
|------|------|
| `packages/core/doctrine/common/habit.md` (+ `~/.productune` 미러) | path-reveal 규칙에 `.html`/`.htm` 특수처리 추가(택한 옵션). doctrine 편집은 designer 경유. |
| (B 택 시) reveal 가드 | `.html`일 때 `open <abs>` 분기 + 헤드리스/CI 가드 명시 |

## Acceptance Criteria

- **AC-1**: HTML 아티팩트 전달 시 CLI 유저가 **렌더된 HTML**에 도달할 경로가 생긴다(file:// 병기 또는 브라우저 open).
- **AC-2**: 비-HTML 아티팩트 동작은 불변(기존 path print + Aqua Finder reveal).
- **AC-3**: 헤드리스 / CI / non-Aqua-without-open 에선 자동 브라우저 open이 발생하지 않는다(침습 방지). path print는 항상 유지.
- **AC-4**: (판정 기록) productune GUI는 이미 HTML을 iframe 렌더하므로 GUI 경로는 변경 없음 — 본 티켓은 CLI/터미널 흐름 한정.

## 비고

- 진짜 코드뷰→렌더 전환은 cmux 측 동작이라 productune이 직접 못 고침. 본 티켓은
  productune이 할 수 있는 "렌더로 도달하는 경로 제공"에 한정.
- cmux의 file:// 라우팅 동작은 hands-on(cmux 환경) 확인 필요 — cua 하니스 대상 후보.
- QA: shawn hands-on (cmux에서 .html 아티팩트 cmd+클릭 / file:// 클릭 / open 동작 확인).

## 구현 (2026-06-18) — 옵션 A 채택

`common/habit.md` path-reveal 규칙(a)에 `.html`/`.htm` 절 추가(repo SoT + `~/.productune`
미러 둘 다): 절대경로 print 직후 `file://<abs-path>` 줄도 출력(rendered view 표기).
바 경로 = 터미널 파일뷰어(raw 소스), `file://` = 기본 브라우저(렌더). 비침습 — 기존
path print/Finder reveal 동작 불변. **cmux의 file:// 라우팅(브라우저 vs 자체뷰어)은
미검증 → user-verify(cmux hands-on / cua). 안 먹으면 옵션 B(.html은 open 으로 브라우저
렌더)로 후속.** GUI 경로(iframe 렌더)는 무관.
