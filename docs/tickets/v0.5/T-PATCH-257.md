---
ticket_id: T-PATCH-257
version: v0.5
slug: tray-idle-brace-invisible-on-dark-menubar
title: 메뉴막대 트레이 idle `{}` 아이콘이 어두운 메뉴막대에서 안 보임 — template로 적응 렌더 + waiting 괄호 흰색화
type: impl
status: done
phase: 4
assignee: pdt-designer
requires_qa: false
requires_user_gate: false
area_tag: tray
estimated_complexity: S
risk_flags: []
qa_status: skipped
qa_loops: 0
completed_at: 2026-06-24
created_at: 2026-06-24T00:00:00Z
---

# T-PATCH-257: tray idle `{}` invisible on dark menu bar

## Request
shawn(2026-06-24): 메뉴막대 `{}` 아이콘 색을 흰색으로 — 다크 메뉴막대에서 안 보인다.

## 진단
트레이 idle 아이콘(`tray-idle-22`)이 브랜드 그라데이션(purple→teal) `{}`라 어두운 macOS 메뉴막대에서
저대비로 안 보임. waiting 아이콘도 동일 그라데이션 `{}` + 빨간 점. 고정 흰색 PNG로 바꾸면 라이트
메뉴막대에선 또 안 보이는 문제 → macOS 표준은 **template image**(전경색 자동 틴트).

## Acceptance
- **AC-1**: idle `{}`가 다크 메뉴막대에서 흰색으로(라이트에선 검정으로) 또렷이 보인다.
- **AC-2**: waiting 상태에서 괄호가 보이고(흰색) 빨간 점(awaiting-input 신호)은 유지된다.
- **AC-3**: persona working 아이콘(po/designer/dev/qa)의 식별 색상 무회귀.

## Plan / Outcome
1. `electron/tray.ts` — idle 아이콘만 `setTemplateImage(true)`(seed + updateTray의 `key==='tray-idle-22'`
   분기). macOS가 메뉴막대 전경색으로 자동 틴트 → 다크=흰색, 라이트=검정. persona/waiting은 컬러 유지.
2. `build/tray/tray-waiting-22{,@2x}.png` — 괄호 픽셀(purple/teal)만 흰색으로 recolor, 빨간 점
   (R>180 & B<120) 보존. waiting은 non-template 유지(빨간 점 색 보존 위해).

note: waiting은 컬러(흰 괄호+빨강)라 라이트 메뉴막대에선 괄호 저대비 가능 — 빨간 점은 항상 보이므로
신호는 유지. 필요 시 후속으로 waiting도 template화 검토(빨강 손실 트레이드오프).

## Out of scope
- persona working 아이콘 색/모양. dock 아이콘.

## Persona Activity
(PO-managed)
