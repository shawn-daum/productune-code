---
ticket_id: T-PATCH-119
version: v0.5
round: patch
type: doctrine
status: done
phase: 3
assignee: pdt-designer
model: opus
effort: low
estimated_complexity: L2
qa_status: pass
completed_at: 2026-06-11
qa_loops: 0
slug: p2-scope-by-version-delta
area_tags: [doctrine/designer, doctrine/po]
created_at: 2026-06-11
---

# T-PATCH-119 — P2 디자인 스코프를 버전 델타 기준으로: full chain(DS+hi-fi)은 major 만, minor 는 핵심 2~3화면 목업

## §1. Request

shawn (ad-hoc): "디자인 페이즈 hi-fi mockup 은 첫 버전 말고 이후 버전엔 그냥 2~3개 화면 목업 정도로 충분함. Major version 변화에서만 거의 필요할듯? 디자인 시스템도 그렇고 (1.0 → 2.0 등)."

현행 `phase2-3-ticket-sequence.md` 의 branch 선택(A/B/C)은 "PRD 케이스"(net-new / 기존 DS 위 신기능 / 소규모 UI) 기준만 있고 **버전 델타 기준이 없음** → minor 버전에서도 full chain(S1~S5: DS 제안 3종 + DS 렌더 + 목업 + 플로우 + full hi-fi)을 도는 과잉 발생.

## §2. Acceptance

- BDD-1: Given minor 버전(v1.1, v0.6 등) + 기존 design-system.md 존재 / When PO 가 P2 진입 branch 를 선택 / Then doctrine 이 branch B(핵심 2~3화면 목업, S1/S2 skip)를 기본값으로 지시한다.
- BDD-2: Given major 버전(v1.0→v2.0) 또는 net-new(DS 부재) / When branch 선택 / Then full chain A 허용.
- BDD-3: Given minor 버전인데 PRD 가 brand/DS 개편을 명시 / When branch 선택 / Then 명시적 사용자 confirm 으로만 A 승급 가능 (기본 거부).
- BDD-4: `po/bookshelf/lifecycle/index.md` P2 항목이 동일 기준을 1줄로 반영.

## §3. Out of scope

- S1~S5 스텝 자체의 내용 변경 (T-PATCH-120 의 S1 다양성 규칙과 별개).
- P2 skip 조건(L4+/user-facing/risk_flags) 변경.

## §4. Plan

`designer/bookshelf/phase2-3-ticket-sequence.md` Branch 섹션을 "PRD 케이스 × 버전 델타" 2축 기준으로 재작성 + `po/lifecycle/index.md` P2 1줄 동기화.

## §5. Outcome

(P5 에서 기입)
