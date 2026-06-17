---
ticket_id: T-PATCH-180
version: v0.5
slug: prd-markdown-style-doctrine-plus-reflow
title: PRD markdown-style 가독성 규약 신설(A) + productune PRD reflow 적용(B)
type: doctrine
status: done
phase: 3
assignee: pdt-designer
requires_qa: true
qa_status: pass
requires_user_gate: false
area_tag: doctrine-designer-prd
risk_flags: doctrine-change, content-rewrite
estimated_complexity: L2
created_at: 2026-06-17T00:00:00Z
started_at: 2026-06-17T00:00:00Z
completed_at: 2026-06-17T00:00:00Z
duration_min: 12
---

## Problem
PRD 본문 가독성 저하의 근본 원인이 작성 방식. designer PRD doctrine(`prd-clarity-loop.md`)은 섹션 SLOT SET + ambiguity 수렴 루프만 규정하고 **markdown 구조/가독성 규약이 0** → run-on 불릿, 코드펜스 ASCII 다이어그램, 과한 inline-code, H4 chunking 부재가 자연 발생 (스크린샷: paepyeong PRD).

## A — Doctrine 규약 신설
SSoT-first: `prd-clarity-loop.md`는 process(scoring/loop) 전용 — markdown 표현 규약은 별 concern. 신규 bookshelf `packages/core/doctrine/persona/designer/bookshelf/prd-markdown-style.md` 생성 권장 + `prd-clarity-loop.md` 또는 designer `habit.md`에서 1줄 pointer로 연결(read path 보장).

규약 내용(act-time voice, English only, bookshelf ≤100 lines):
- heading 리듬: H2=version/phase, H3=slot 섹션, H4=feature 단위 chunk. 섹션이 dense 불릿로 직행 금지.
- 불릿 규율: 1불릿 = 1주장(single-sentence). 멀티문장 spec → H4 + 짧은 prose.
- inline-code 규율: backtick은 code/식별자(함수·파일·라우트·config키)만. 평문 키워드·강조에 backtick 금지.
- 코드펜스 ASCII 다이어그램 금지 → 표 또는 구조화 리스트(또는 mermaid).
- 비교/대조(phase/tier/pros-cons) → 표.

## B — productune PRD reflow (규약 라이브 검증)
신규 A 규약을 `docs/prd/PRD.md`(productune 자체 PRD, user_lang=ko 유지)에 적용. 우선 대상: dense 섹션(특히 `### 핵심 기능` L91-138 run-on 불릿). 의미 손실 없이 구조만 정리. PRD body는 ko 유지(doctrine만 English).

## AC
- `prd-markdown-style.md` 생성 + read-path pointer 연결 + cap(≤100) 준수 + act-time voice(leak category 0) + English
- SoT `packages/core/doctrine/` → mirror `~/.productune/doctrine/` byte-identical (designer 또는 PO 미러)
- `docs/prd/PRD.md` reflow: run-on 불릿 분해 + inline-code 규율 적용 + dense 섹션 H4 chunk, **의미/내용 변경 0** (구조만)
- reflow된 PRD가 새 규약 self-check 통과 (= B가 A의 테스트)

## Scope guard
A=doctrine(English) / B=PRD body(ko). designer만 author. PO는 mirror byte-identical 검증 + grill(content-rewrite/doctrine = loss-risk → grill 필수). PRD 내용(스코프/숫자/결정) 변경 금지 — 표현·구조만.
