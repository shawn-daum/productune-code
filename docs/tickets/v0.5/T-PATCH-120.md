---
ticket_id: T-PATCH-120
version: v0.5
round: patch
type: impl
status: done
phase: 3
assignee: pdt-designer
model: opus
effort: medium
estimated_complexity: L3
qa_status: pass
completed_at: 2026-06-11
qa_loops: 0
slug: s1-style-library-diversity
area_tags: [doctrine/designer, core/doctrine-assets]
created_at: 2026-06-11
---

# T-PATCH-120 — S1 디자인시스템 시안 다양성: awesome-design-md 스타일 라이브러리 벤더링 + divergent 앵커 규칙

## §1. Request

shawn (ad-hoc): "디자인 첫 시안(디자인시스템) 뽑을 때 뭔가 느낌이 다 비슷한 버전을 뽑아오던데… 좀 더 서비스 느낌을 다양하게 주고 싶어. https://github.com/VoltAgent/awesome-design-md 레포 긁어오면 어때?"

조사: MIT 라이선스, 74개 브랜드 DESIGN.md (Claude/Linear/Stripe/Nike/Ferrari/Dell-1996 등, 10개 카테고리). 각 파일은 Google Stitch 스펙 — 분위기 prose + 컬러/타이포 토큰 + 컴포넌트 스타일 + 가드레일. 사용자 선택: **74개 전부 벤더링**.

## §2. Acceptance

- BDD-1: Given designer bookshelf / Then `style-library/` 에 74개 스타일 md + `index.md`(카테고리·브랜드·one-line vibe 카탈로그) + LICENSE/attribution 존재.
- BDD-2: Given S1 실행 / When 3개 제안 생성 / Then 서로 다른 카테고리에서 뽑은 **divergent 스타일 앵커 3개**(index 에서 선택, 해당 파일만 read)를 각 제안에 1:1 명시 — 전부 비슷한 무드 금지.
- BDD-3: 앵커는 모사가 아니라 번안 — 토큰/무드를 제품 맥락에 맞게 변형하라는 지시 포함 (브랜드 클로닝 가드레일).
- BDD-4: install.sh 수정 없이 기존 doctrine `cp -r` 미러로 `~/.productune/doctrine/` 에 자동 포함.
- BDD-5: index.md 는 경량(컨텍스트 보호) — designer 는 index 만 읽고 선택한 앵커 파일만 연다.

## §3. Out of scope

- 라이브러리 자동 업데이트 파이프라인 (수동 re-vendor 로 충분).
- preview.html 동봉 (md 만 — 2.2MB 한정).
- S2~S5 변경.

## §4. Plan

1. `/tmp` clone → `packages/core/doctrine/persona/designer/bookshelf/style-library/<slug>.md` 74개 + `LICENSE` 복사.
2. README 카테고리 + 각 파일 description 으로 `style-library/index.md` 생성 (스크립트 1회성).
3. `phase2-3-ticket-sequence.md` S1 에 divergent 앵커 규칙 추가.

## §5. Outcome

(P5 에서 기입)
