---
ticket_id: T-PATCH-245
version: v0.5
slug: global-thin-scrollbar
title: 전역 thin 스크롤바 — 클래스 미적용 컨테이너의 OS 기본 스크롤바 제거
type: impl
status: done
phase: 4
assignee: pdt-developer
requires_qa: false
requires_user_gate: false
area_tag: ui-chrome
estimated_complexity: L1
risk_flags: []
created_at: 2026-06-23T00:00:00Z
---

# T-PATCH-245: 전역 thin 스크롤바

## Request

shawn(2026-06-23, dmg 라이브 화면): 가운데 패널(General settings 등)에 **못생긴 OS 기본
스크롤바**가 남아있음. 다른 패널(PO 채팅 등)처럼 thin 스크롤바로 통일 + "전체 UI 한 번에
반영" 요청.

## 원인

thin 스크롤바가 **클래스 기반**(`.pdt-thin-scroll` T-222, `.tab-strip-scroll` T-056)이라
그 클래스가 안 붙은 스크롤 컨테이너(설정 패널·마크다운 뷰어·모달 등)는 Chromium 기본
스크롤바(두꺼운 회색)로 폴백됨. 전역 디폴트 규칙 부재.

## Acceptance

- **AC-1**: 앱 내 모든 스크롤 컨테이너가 thin 테마 스크롤바(6px, 투명 트랙, `#2A2A2A` thumb,
  hover `#3A3A3A`, radius 3)로 렌더 — 클래스 부착 여부 무관.
- **AC-2**: 기존 클래스 변종(`.tab-strip-scroll` 3px 가로 등)은 specificity로 그대로 override.

## 구현 (done)

`src/styles/index.css`: 전역 디폴트 규칙 추가 —
`*::-webkit-scrollbar{width:6px;height:6px;background:transparent}` + track/thumb/hover/corner +
`*{scrollbar-width:thin;scrollbar-color:#2A2A2A transparent}` (Firefox 표준). 클래스 규칙은
class+pseudo specificity로 상위 → 사이즈 다른 곳은 그대로 유지. thumb hex == DS `--border-strong`.

## Out of scope
- 스크롤바 자동 숨김(overlay fade) 애니메이션.

## Outcome
shipped (다음 dmg 재패키징에 포함). 라이브 눈확인은 재빌드 후.

## Persona Activity
(PO-managed — direct impl by harness per user request)
