---
ticket_id: T-PATCH-260
version: v0.6
slug: doctrine-design-s1-s2b
title: doctrine — S1 DS옵션=HTML 3안 발산 + S2b 에셋 PNG우선/영어프롬 (designer)
type: doctrine
status: done
phase: 3
assignee: pdt-designer
requires_qa: true
qa_status: pass
qa_loops: 1
requires_user_gate: false
area_tag: doctrine
estimated_complexity: L3
risk_flags: []
created_at: 2026-06-25T01:55:00Z
---

# T-PATCH-260: design doctrine — S1 + S2b

PRD SoT = docs/prd/PRD.md v0.6 (#1 S1, #2 S2b). 같은 파일(phase2-3-ticket-sequence.md) 두 변경이라 한 티켓으로 직렬화. **QA GRILL 필수**(doctrine edit, 무조건).

## Acceptance
### (S1) DS 옵션 제시 — `designer/bookshelf/phase2-3-ticket-sequence.md` S1
- **AC-S1a**: S1 옵션 제시 = 텍스트 컨셉 대신 **처음부터 렌더된 HTML 시안 3개 up-front** (비개발자 구분-불가 해소). cost-gate 없음(3안 모두 렌더, user 명시 수용).
- **AC-S1b**: A·B안 = 기존 Fit doctrine 유지. **C안 = 매번 디자인 웹서치 기반 완전히 새로운 방향**(Claude 창의성 발산) — 세 안이 시각적으로 명백히 다를 것.
### (S2b) 에셋 생성 — `phase2-3-ticket-sequence.md` S2b + `designer/habit.md` §5
- **AC-S2b1**: **SVG 직생성을 폴백으로 강등** — 생성형 PNG(Codex/핸드오프) 우선. "유저가 PNG 돌려주면 Claude가 SVG로 변환/후처리"하는 루프 명문화.
- **AC-S2b2**: 이미지모델 핸드오프 **프롬프트는 user_lang 무관 무조건 영어**(한글=품질저하) — habit §5 + S2b에 명시.

## Out of scope
- 코드 변경 0 (순수 doctrine). 실제 이미지 생성 자동화 배선.

## Plan
designer author. **cap 주의**: phase2-3-ticket-sequence.md 현재 150/100(backlog cap-breach) → 추가 전 trim 선행 또는 over 승인 flag. ux-principles.md(108/100)도 인접. QA GRILL(loss 없는지·기존 Fit/S2b 메커닉 보존·cross-ref 정합).

## Outcome
done — designer author + QA GRILL(fail→fix→PO-verify pass). 4 AC(S1a/b·S2b1/2) verbatim pass, loss audit clean(Stretch pool→C로 이전, 메커닉 0 손실). 편집: phase2-3-ticket-sequence.md(S1 HTML 3-up-front+C 웹서치 발산 / S2b PNG우선+PNG→SVG 루프) · designer/habit.md §5(영어 프롬프트 SoT)+§4(S1 rendered 바인딩 추가) · po/delegation.md(C web-search provenance 수용, anchor 없어도 bounce 안 함) · style-library/index.md(cross-ref). cap=136/100 잔여(150→136, 메커닉 보존; ≤100 구조분리는 backlog cap-curation 이월, 정직 flag). QA GRILL 2 must-fix(habit §4·delegation.md cross-ref 모순)=fix됨, PO-verify로 close.

## Persona Activity
(PO-managed)
