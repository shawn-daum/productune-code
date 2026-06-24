---
ticket_id: T-PATCH-243
version: v0.5
slug: brand-chrome-tray-titlebar-revisit
title: 브랜드 크롬 재고 — 메뉴바 트레이 아이콘(보라 점→로고) + 타이틀바 BrandMark 투톤(보라/청록)
type: design
status: done
phase: 4
assignee: pdt-designer
requires_qa: false
requires_user_gate: true
area_tag: brand-chrome
estimated_complexity: L2
risk_flags: []
created_at: 2026-06-23T00:00:00Z
---

# T-PATCH-243: 브랜드 크롬 재고 (트레이 아이콘 + 타이틀바 BrandMark)

## Request

shawn(2026-06-23, dmg Deploy 라이브 검증 중 VNC 눈확인): "우리 메뉴막대에 기본 로고가
없구나(보라색 동그라미임) + 우리 앱 상단바에 원래 왼쪽 보라 오른쪽 청록 이렇게 했었는데
그거 없어졌나..?" → 일단 티켓등록 요청.

**중요 — 둘 다 버그/회귀가 아니라 의도된 결정임** (PO 조사로 확정). 이 티켓은 "수정"이
아니라 그 두 결정을 **재고(revisit)** 하는 design 티켓이다. 디자이너는 결정 맥락을 깔고
사용자 게이트로 방향을 받은 뒤 진행할 것.

### 결정 맥락 (회귀 아님 — 의도)

1. **타이틀바 BrandMark `}` 청록 → 보라 통일**: `BrandMark.tsx`가 원래 여는 `{`=보라
   `#8B5CF6`, 닫는 `}`=mint/청록 `#2DD4BF` 투톤이었음. **T-PATCH-241**(build-close
   `7dd99c4`)에서 의도적으로 양 brace를 `#8B5CF6`로 통일. 사유: mint `#2DD4BF`가 DS
   미정의 off-palette → design_review `design_system_consistency` / `color_palette` ✗
   항목, **T-006(brand = CLI purple)** 따라 제거, "mint를 DS 토큰으로 승격하지 않음"
   결정. (Titlebar.tsx `accent` 상수 #8B5CF6는 현재 orphan/미사용.)

2. **메뉴바 트레이 = 보라 동그라미**: `tray-idle-22.png`(167B, 22×22 단색 점)는
   **T-PATCH-177**의 의도된 "brand-neutral idle 아이콘". persona 작업 중일 때만
   persona 아이콘(po/dev/designer/qa-22), 대기 중엔 waiting(브랜드+red dot), idle엔
   중립 점. 즉 메뉴바에 브랜드 `{ }` 로고를 두지 않은 게 설계.

## 재고 포인트 (디자이너 → 사용자 게이트)

- **(A) 타이틀바 BrandMark**: 투톤(보라 `{` + 청록 `}`) 복원할지, 보라 통일 유지할지.
  복원 시 청록을 **DS 토큰으로 정식 승격**해야 함(T-006/§11 DS 일관성 — 임의 inline
  hex 재도입 금지). orphan `accent` 상수도 정리/배선.
- **(B) 메뉴바 트레이 idle 아이콘**: 중립 점 대신 **브랜드 로고 마크**(`{ }` 또는
  logo.png 파생 모노 글리프)로 교체할지. macOS 메뉴바 제약(22pt, 가독성, 다크/라이트
  메뉴바 양립 — template vs color) 고려. 교체 시 idle/waiting/persona 상태 위계가
  여전히 구분되는지 확인.

## Acceptance

- **AC-1**: 디자이너가 (A)(B) 각각에 대해 결정 맥락(T-006/T-241/T-177) + 옵션(복원 vs
  유지) + DS 토큰 영향을 정리해 사용자 게이트로 제시한다.
- **AC-2**: 사용자 승인 방향대로 반영하되 — 청록/신규 색 도입 시 **DS 토큰으로 정의**
  (inline off-palette hex 재도입 금지), 트레이 교체 시 idle/waiting/working 상태 구분
  유지.
- **AC-3**: 변경 시 dmg 재빌드 후 라이브(VM/VNC)에서 메뉴바 아이콘 + 타이틀바 시각 확인.

## Out of scope

- 그 외 off-spec hex 일괄 마이그(DS §11 마이그레이션 = 별도 티켓).
- 작업 중 persona 트레이 아이콘 셋(po/dev/designer/qa-22)의 디자인 — 이번은 idle만.

## Plan

(디자이너 작성 — 위 재고 포인트 기반. fix-now(v0.5 build 재오픈) vs v0.6 이월은 PO/사용자
우선순위 결정. build-close 이후 발견이라 deploy-blocker 아님 = 기본은 v0.6 후보로 보되
사용자가 dmg 배포 전 반영 원하면 v0.5 build 재오픈.)

## Update (2026-06-23) — 항목 (A) 결정 + 구현 완료

shawn user-gate 결정(2026-06-23, dmg 화면 보고 즉시): **투톤 복원** — close-brace 청록은 빼면
안 되는 브랜드 요소. T-241 의 "off-palette 제거"는 오판으로 확정(BrandMark 최초 생성 주석
"violet open-brace + mint close-brace" = 의도된 2색).

- ✅ `BrandMark.tsx`: 닫는 `}` → `#2DD4BF`(mint) 복원, 여는 `{` = `#8B5CF6` 유지. 주석 정정.
- ✅ `design-system.md §2.4`: `--brand-mint #2DD4BF` 토큰 신규 등록 + RESTORED 노트 →
  mint 가 on-palette 가 되어 design_review color_palette ✗ 재발 방지(AC-2 충족).
- ✅ **항목 (B) 트레이 아이콘**(2026-06-23 user 지시 "123 진행"): `build/tray/tray-idle-22.png`
  + `@2x` 를 **브랜드 `{ }` 마크**(보라 `{` `#8B5CF6` + 청록 `}` `#2DD4BF`, 투명배경, PIL 생성
  master 다운스케일)로 교체. 기존 보라-점은 `_old-dot-backup/` 보관. iconKeyFor idle=tray-idle-22
  경로 그대로. 22px 가독 확인. (working/waiting persona 아이콘은 범위 밖 — idle만.)
- ⏳ **잔여**: **dmg 재빌드** — 소스/에셋만 수정됨, v0.5 build closed 상태라 배포하려면
  `dist:mac` 재실행(arm64). 다른 수정과 배치 재빌드(user 결정 2026-06-23).

## Outcome
shipped — (A) BrandMark `}` 청록 `#2DD4BF` 복원 + `--brand-mint` DS토큰 등록, (B) 트레이 idle = 브랜드 `{ }` 마크. user 결정(2026-06-23 "투톤 복원" + "123 진행"). 3차 dmg 반영 + cua-VM 라이브검증 PASS(타이틀바 청록·트레이 아이콘·wizard 대형 BrandMark 청록 눈확인). user 직접 이미지로도 청록 확인.

## Persona Activity
(PO-managed)
