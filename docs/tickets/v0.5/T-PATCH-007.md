---
ticket_id: T-PATCH-007
version: v0.5
phase: 3
type: patch
status: done
assignee: pdt-developer
created_at: 2026-06-02T13:45:00Z
completed_at: 2026-06-02T13:45:00Z
duration_min: 0
estimated_complexity: L3
risk_flags:
  - palette-coherence (T-PATCH-006 의 brand swap 이후 잔여 주황 계열 + 페르소나/상태 토큰까지 보라 기반 팔레트로 정합화 — 코드 로직 변경 없음, 색 토큰 only)
---

# T-PATCH-007: v0.5 P3-A 팔레트 정리 마무리

## Request

### KR

T-PATCH-006(#1 brand color swap) 이후 작업 트리에 남아 있던 색상 정리 변경을 한 커밋으로 묶어 마감한다.
T-PATCH-006 은 `#FF6B2B → #8B5CF6` 1:1 교체만 다뤘으나, 본 패치는 GUI 전반의 색 토큰을 보라 기반 팔레트로 정합화한 잔여분이다. **코드 로직 변경 0, 색 토큰만 교체.**

---

## 변경 명세 (전부 색 토큰 교체, 33개 파일)

1. **잔여 brand 주황 → 보라** — T-PATCH-006 에서 누락된 `#FF6B2B`(및 알파 변형 `#FF6B2B22/30/33/50/55/66`) → `#8B5CF6`(`#8B5CF622/30/33/50/55/66`).
2. **페르소나 색 토큰** — `#9B7FD4`(흐린 보라) → `#FB923C`(주황 계열)로 이동. accent 가 보라가 되면서 페르소나 활동 표시는 대비 위해 주황으로 분리.
3. **상태 배지 톤 정리** — done `#60B860 → #34D399`, error `#E04040 → #EF4444`, info blue `#60A5FA/#38BDF8` 계열 정돈, 배경 tint(`#0A2A0A → #0A2A1A` 등) 동반 조정.
4. **accent 보조 음영** — `#A78BFA` 등 보라 계열 보조색 + 배경 tint(`#1A1208 → #1A1030` 류) 일괄 정합.

영향 파일: `packages/gui/src/` 하위 컴포넌트/뷰/스토어 33개 (components, views, lib/phase-mapping, store/personaPresence).

---

## Acceptance Criteria

1. 앱 전반에서 주황(`#FF6B2B`) 계열 brand 색이 완전히 사라지고 보라(`#8B5CF6`) 기반으로 표시됨.
2. 페르소나 활동 표시 색이 accent(보라)와 구분되는 주황(`#FB923C`)으로 렌더됨.
3. 상태 배지(done/error/info)가 정돈된 톤으로 표시되고 배경 tint 대비가 유지됨.
4. GUI 빌드(tsc) 통과 — 색 토큰 교체 외 로직 변경 없음.
