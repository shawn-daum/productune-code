---
ticket_id: T-PATCH-128
version: v0.5
round: patch
slug: ds-rework-reentry-anchor-provenance-s1-fidelity
title: DS 재작업 재진입 룰 + S1 앵커 provenance 공개 + S1 프리뷰 fidelity
type: doctrine
status: done
phase: 3
assignee: pdt-designer
requires_qa: true
requires_user_gate: false
area_tag: doctrine/designer
estimated_complexity: L3
risk_flags: []
created_at: 2026-06-12
started_at: 2026-06-12
completed_at: 2026-06-12
duration_min: 8
---

# T-PATCH-128: DS 재작업 재진입 룰 + S1 앵커 provenance 공개 + S1 프리뷰 fidelity

## Request

oh-my-eyes 프로젝트(2026-06-12), P3 빌드 도중 사용자가 이미 채택된 디자인 시스템("먼하늘")을 거부하고 P2 의 DS 단계부터 다시 하자고 요청. 원인 진단 + PO 검증 + 사용자 승인 완료. 세 가지 실패를 doctrine 으로 봉합한다(룰 자체가 아니라 룰로 가는 경로/공개/렌더 충실도의 공백):

1. **DS 재작업 라우팅 공백** — PO 가 재작업을 ad-hoc 으로 디스패치 → Designer 가 `phase2-3-ticket-sequence.md` 를 읽지 않음 → 앵커 선별 파이프라인 없이 컨셉 3개를 손으로 발명(74개 스타일 라이브러리 무시). 앵커 룰(T-PATCH-122)·미러는 byte-identical 정상 — 실패는 룰로 가는 경로.
2. **앵커 provenance 미공개** — 재실행은 앵커를 썼으나 사용자가 "각각 어떤 파일 참고한거야?" 라고 직접 물어야 했음. doctrine 은 S1 step4 내부 근거 + S2 design-system.md anchor 라인만 의무화 — 게이트에서 사용자-facing 공개 의무 없음.
3. **S1 프리뷰 fidelity 공백** — S1 HTML 프리뷰가 시스템 폰트(-apple-system)만 로드, 텍스트로 명시된 EB Garamond/DM Mono 미렌더 → 제안 3개가 색만 빼고 동일하게 보임 → 게이트 판정 불가. doctrine 은 S1=TEXT 라고만 하고, Designer 가 실제 첨부하는 비주얼 프리뷰의 충실도 룰이 0.

## Acceptance

- BDD-1: Given 사용자가 채택된 DS 를 어느 phase(mid-P3 포함)에서든 거부 / Then `phase2-3-ticket-sequence.md` Branch 가 P2 체인 S1 재진입을 강제하고, 앵커 파이프라인을 mandatory 로 명시하며, 거부된 DS 의 앵커 + 4축 mood 라벨을 이번 버전 S1 ban-list(기존 re-roll ban 확장)에 올린다.
- BDD-2: Given P2/S3+ 디자인 시퀀스를 건드리는 모든 디스패치(mid-build DS redo 포함) / Then PO doctrine(`delegation.md`)이 진입 step 명시 + Designer 에게 `phase2-3-ticket-sequence.md` 실행 지시를 의무화하고 ad-hoc framing 을 금지한다.
- BDD-3: Given S1 게이트 제시 / Then 각 제안마다 `anchor: <slug>.md` · 원본 정체성 1줄 · 이 제품용으로 무엇을 적응/변경했는지가 게이트에 포함된다(사용자가 묻지 않아도 노출).
- BDD-4: Given Designer S1 리턴에 앵커 provenance 누락 / Then PO 가 사용자에게 surface 하기 전 Designer 로 bounce.
- BDD-5: Given S1 텍스트 제안에 비주얼 프리뷰 동반 / Then 명시된 폰트가 실제 로드(webfont/local)되고 제안별 type·component-shape 차이가 시각적으로 렌더되며, 단일 시스템폰트 렌더는 금지, surface 전 render-verify.

## Out of scope

- 앵커 선별 파이프라인 자체(mood brief / Fit2+Stretch1 / 발산 판정)의 룰 변경 — T-PATCH-122 그대로 둔다.
- S1 을 TEXT-우선에서 비주얼-필수로 전환 — 프리뷰는 여전히 선택적(동반 시에만 fidelity 룰 적용).
- S2~S5 단계, 스타일 라이브러리 index 내용, Branch 의 버전-델타/PRD-case 판정 로직.
- GUI/statusline·CI lint 신규.
- routing.md 변경(모델+effort 전용 — dispatch-content 룰의 home 아님; delegation.md 채택).

## Plan

1. `designer/bookshelf/phase2-3-ticket-sequence.md`:
   - Branch 섹션에 DS-rework 재진입 항목 추가(S1 재진입 + 앵커 파이프라인 mandatory + 거부 DS 앵커/라벨 ban-list 확장).
   - S1 섹션에 앵커 provenance 게이트 공개 룰 + 비주얼 프리뷰 fidelity 룰(폰트 실로드·제안별 차이 렌더·render-verify) 2건 추가.
2. `po/bookshelf/delegation.md`: 디자인-시퀀스 디스패치 룰 신설 — 진입 step 명시 + `phase2-3-ticket-sequence.md` 실행 지시 + ad-hoc 금지 + S1 리턴 provenance 누락 시 bounce.
3. SoT(`packages/core/doctrine/`) 편집 후 미러(`~/.productune/doctrine/`) byte-identical cp.

## Outcome

(P5 에서 기입)

## Persona Activity

(PO 관리 — dispatch rows)
