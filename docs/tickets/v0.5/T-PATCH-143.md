---
ticket_id: T-PATCH-143
version: v0.5
slug: app-set-name-productune
title: app.setName('productune') — 앱 메뉴/About/알림 소스 라벨 "Electron"→"productune"
type: code
status: done
phase: 3
assignee: pdt-developer
requires_qa: true
qa_status: pass
requires_user_gate: false
area_tag: gui-app-name
estimated_complexity: L1
risk_flags: []
created_at: 2026-06-16T00:00:00Z
started_at:
completed_at:
duration_min:
---

# T-PATCH-143: app.setName('productune')

## Request

dev 모드에서 앱 메뉴 / About 패널 / 시스템 알림 소스가 `app.name` 기본값인 "Electron"으로 표시됨 (main.ts:220 `label: app.name`). `app.setName('productune')`를 main 진입 시점(app 준비 전, name 첫 사용 전)에 호출해 브랜드 이름으로 통일한다.

## Scope (patch-lane · single-file)

- `packages/gui/electron/main.ts` 상단(import 직후, app 사용 전 모듈 최상위)에 `app.setName('productune')` 한 줄 추가.
- 다른 변경 금지. 단일 파일.

## Notes / 비-목표

- dev 모드 **dock 툴팁** "Electron"은 실행 바이너리(`Electron.app`)의 Info.plist(CFBundleName)에서 오므로 `app.setName`으로 바뀌지 않음 — 이건 비-목표. 패키징 .app은 electron-builder `productName: productune`가 CFBundleName을 설정하므로 별도 해결됨.
- 하드코딩 문자열 `'productune'`은 electron-builder.yml `productName`과 일치(SoT 동일 값).

## Acceptance

- AC-1: main.ts에 `app.setName('productune')`가 app 첫 사용 이전(모듈 최상위)에 존재.
- AC-2: `pnpm --filter @productune/gui build` (tsc --noEmit + vite build) PASS.
- AC-3: 앱 메뉴 좌상단 라벨(macOS app menu) = "productune" (`app.name` 경유 line 220).
