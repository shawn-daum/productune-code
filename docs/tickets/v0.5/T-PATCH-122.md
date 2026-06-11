---
ticket_id: T-PATCH-122
version: v0.5
round: patch
type: doctrine
status: done
phase: 3
assignee: pdt-designer
model: opus
effort: medium
estimated_complexity: L3
qa_status: pass
completed_at: 2026-06-11
qa_loops: 0
slug: s1-anchor-selection-rule
area_tags: [doctrine/designer, core/doctrine-assets, core/ci]
created_at: 2026-06-11
---

# T-PATCH-122 — S1 앵커 선별 룰 정교화: mood brief 파이프라인 + 4축 영어 라벨 발산 판정 + 앵커 이력

## §1. Request

shawn (대화로 합의, 2026-06-11): T-PATCH-120 의 "다른 카테고리 3개" 룰은 카테고리(산업)와 무드가 직교라 같은 무드 3개가 통과 가능. 축별 논의로 확정된 사항:

- **① 선별 파이프라인**: (a) mood brief 는 PRD-only 유도 (형용사 2개 미만일 때만 1문항 질문) · (b) Fit 2 + Stretch 1 고정 배합 (유일 예외: PRD 첨부 브랜드 가이드 존재 시 Fit 3) + 유명 브랜드 캡 (3개 중 최대 1개) + 근거 선작성 후 파일 오픈
- **② 발산 판정 교체**: index 74개 전부에 영어 4축 라벨 (`light|dark · minimal|rich · playful|serious · editorial|chrome`) 태깅, 룰 = "어느 두 앵커를 비교해도 라벨 ≥2개 다름". 카테고리 룰은 soft 강등
- **③ 앵커 이력**: refuse 재진입 시 거절 앵커 ban (인터뷰에서 방향 호평 시 유지 예외) · 채택 앵커를 `design-system.md` 에 `anchor: <slug>.md, <version>` 기록 → 다음 major 때 직전 앵커 회피

## §2. Acceptance

- BDD-1: Given S1 진입 / Then doctrine 이 mood brief → 2-pool 숏리스트(6~9) → Fit2+Stretch1 → 근거 선작성의 순서를 강제한다.
- BDD-2: Given index.md / Then 74개 엔트리 전부가 4축 라벨 보유, 값은 각 축의 enum 만 허용.
- BDD-3: Given 앵커 3개 중 두 개가 라벨 ≥3개 동일 / Then 발산 룰 위반 (재선별).
- BDD-4: Given S1 refuse 재진입 / Then 거절 앵커는 ban (인터뷰 호평 예외), 채택 시 design-system.md 에 anchor 라인 기록.
- BDD-5: `scripts/ci/check-style-library-index.sh` — 라벨 누락/오타·dangling 슬러그·미등재 파일 검출 시 비-zero exit.

## §3. Out of scope

- 무드 축 추가 (era 등 — 4축 고정 결정) · 카테고리 hard 룰 복원 · S2~S5 변경 · 라이브러리 re-vendor 자동화.

## §4. Plan

1. `phase2-3-ticket-sequence.md` S1 diversity 단락 → 선별 파이프라인으로 교체 + 게이트에 re-roll 조항, S2 에 anchor 기록 1줄.
2. index.md 74개 라벨 태깅 (각 파일 description/canvas 실증 기반) + header Usage 갱신.
3. `check-style-library-index.sh` lint 신설.

## §5. Outcome

(P5 에서 기입)
