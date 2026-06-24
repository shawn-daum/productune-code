---
ticket_id: T-PATCH-251
version: v0.5
slug: brand-polish-icon-rename-tray
title: 브랜드 폴리시 2 — 앱 아이콘 full-bleed + "Productune" 대문자 워드마크 + 트레이 waiting 브랜드마크
type: impl
status: done
phase: 4
assignee: pdt-developer
requires_qa: true
qa_status: pass
qa_loops: 1
requires_user_gate: false
area_tag: brand-chrome
estimated_complexity: L2
risk_flags: []
created_at: 2026-06-24T00:00:00Z
---

# T-PATCH-251: 브랜드 폴리시 2

## Request

shawn(2026-06-24, 라이브 dmg dogfood): ① 앱 아이콘이 bubble(macOS Tahoe가 full-bleed 아닌
아이콘을 밝은 컨테이너로 감쌈) ② 브랜드명을 "Productune" 첫글자 대문자로 ③ 메뉴바 트레이가
대기중일 때 옛 보라+빨간점. 미리보기 user 승인 완료.

## 완료분 (PO 직접 — 에셋, mechanical)
- ✅ **아이콘 full-bleed**: `build/icon.png` + `build/icon.icns` 재생성(네온 `{ }` 아트 96% fill → Tahoe 컨테이너 미적용). user 미리보기 승인.
- ✅ **트레이 waiting**: `build/tray/tray-waiting-22.png` + `@2x` = 브랜드 `{ }`(보라`{`+청록`}`) + 빨간 대기점(옛 보라점 교체). idle은 T-243에서 이미 브랜드마크.

## Acceptance (dev — rename만)
- **AC-1 ("Productune" 대문자 — display 워드마크만)**: 사용자-노출 브랜드명을 `productune` → `Productune`:
  - `electron-builder.yml` `productName: productune` → `Productune` (앱명·dmg 타이틀·CFBundleName).
  - `src/App.tsx` Titlebar `title="productune"` + fallback `'productune'` → `Productune`.
  - HomeView 워드마크(로고 옆 "productune"), `FreshComposer.tsx` `alt`.
  - locale `en.json`/`ko.json` display prose의 앱명 `productune` → `Productune` (title·onboardingTitle·notifications desc/macosHint·closeToTray/launchAtLogin desc·deleteProject body·entryGate 류·schemaMismatch "productune doctrine"). **en/ko 양쪽 일관**.
- **AC-2 (식별자/경로 절대 보존)**: 다음은 **변경 금지** — `appId com.productune.gui` · npm `@productune/gui` · 파일경로 `~/.productune/`·`productune.env`·`~/.productune/<persona>/` · localStorage 키(`productune.lastProject`·`productune.runHintSeen`) · IPC 채널(`productune:open-settings`·`productune:cost-update`·`productune:usage-update`·`productune:quickopen:recent`) · DRAG_MIME(`application/x-productune-tab`) · MCP source enum `'productune'` · 코드 주석. (바꾸면 설치/기능 깨짐.)
- **AC-3**: `pnpm run build`(tsc + locale parity 901키) green. grep로 식별자/경로 productune 보존 확인.

## Out of scope
- persona-work 트레이 아이콘(po-22 등, 페르소나색 — 별도). PO sprite 버그(T-PATCH-252).

## Plan
dev: rename AC-1대로(display만), AC-2 식별자 보존, build green + grep 검증. QA grill(특히 식별자/경로 미변경 + en/ko parity + build).

## Outcome
shipped — 아이콘 full-bleed(PO 에셋) + 트레이 idle/waiting 브랜드 `{ }`(굵게, PO 에셋, user "{}진하게" 반영) + "Productune" display rename(dev). QA pass: display 워드마크만 대문자(productName·Titlebar·HomeView·FreshComposer·locale prose en/ko 901parity), **식별자/경로 전부 lowercase 보존**(appId·@productune·`app.setName('productune')`·~/.productune 경로·localStorage·IPC채널·DRAG_MIME·MCP enum) — install/IPC 무사. build green. 5차 dmg에 번들.

## Persona Activity
| persona | role | model | result |
|---|---|---|---|
| (PO) | 에셋: icon.icns full-bleed · tray idle/waiting brand `{ }` bold | — | done (user 미리보기 승인) |
| pdt-developer | rename impl | sonnet | done |
| pdt-qa | grill | sonnet | qa_status: pass (식별자 보존 검증, 0 must-fix) |
