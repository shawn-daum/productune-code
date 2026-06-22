---
ticket_id: T-PATCH-185
version: v0.5
slug: md-light-link-and-codestring-contrast
title: 라이트 모드 링크 색 + 코드 string 대비 AA화 (T-183 후속)
type: impl
status: done
phase: 3
assignee: pdt-developer
requires_qa: true
qa_status: pass
requires_user_gate: false
area_tag: md-viewer
risk_flags: shared-primitive
estimated_complexity: L2
created_at: 2026-06-17T00:00:00Z
started_at: 2026-06-17T00:00:00Z
completed_at: 2026-06-17T00:00:00Z
duration_min: 8
---

## Problem
T-183 라이트 토글에서 본문 하이퍼링크가 `MdRenderer.getLinkColor()`의 하드코딩 inline hex(cyan #38BDF8 2.05:1 / amber #F59E0B 2.06:1 / violet #A78BFA 2.61:1 / #8B5CF6 4.05:1)라 라이트 배경(#FAFAF9)에서 AA(4.5) 미달 — 흰 배경 가독성 저하. 코드 green `sx-string`(#0E8F63)도 라이트 코드 배경에서 3.60:1로 소폭 미달.

## 가드 해제 (PO 승인)
`MdRenderer`는 chat 공유 frozen primitive지만, **본 티켓에 한해 링크 색 처리 변경을 승인**. 단 조건: chat + 다크 문서의 링크 색은 **현재와 byte-identical** 유지(회귀 0). 라이트 문서에서만 색 분기.

## Fix
1. `MdRenderer` 링크 렌더를 inline hex 대신 **링크 타입별 className**(예 `md-link-internal`/`md-link-persona`/`md-link-external`/`md-link-https`)으로 전환. CSS에서:
   - base `.md-link-* { color: <현재 hex 그대로> }` — chat/다크 문서 동일(회귀 0).
   - `.md-doc.md-light .md-link-* { color: <라이트 AA 색> }` — 라이트에서만 분기.
   - getLinkColor의 타입 구분 로직은 className 매핑으로 보존(색 결정 의미 동일).
2. 라이트 링크 색: `#FAFAF9` 위 **≥4.5:1** 충족하는 값으로 dev 선정(예 internal/accent ~#6D28D9, external ~#0B66C2, amber ~#9A6700 등 — 타입별 톤 유지하되 어둡게). QA가 대비 재측정.
3. `sx-string` 라이트 값을 ≥4.5:1로 상향(코드 배경 위). `.md-doc.md-light` 스코프.
4. 선정한 라이트 링크 팔레트 + sx-string 라이트 값을 `docs/designer/design-system.md` §2.10에 기록.

## AC
- 라이트 문서 모든 링크 타입 ≥4.5:1 (QA 대비 측정 통과)
- chat + 다크 문서 링크 색 **변화 0** (base class = 기존 hex)
- sx-string 라이트 ≥4.5:1
- 라이트 누락(dark island) 0 — 링크까지 플립
- chat 누락 0 (base는 다크, .md-doc.md-light만 분기 — chat 매칭 불가)
- GUI tsc 통과, 신규 토큰명 없이 §2.10 기록

## Scope guard
`MdRenderer.tsx`(링크 className 전환만, 다른 로직 X) + `md-recipes.css`(링크/​string light 규칙) + `design-system.md` §2.10. 다크 색 절대 변경 금지.
