---
ticket_id: T-PATCH-206
version: v0.5
slug: design-phase-brand-assets-producer
title: doctrine — 디자인 페이즈 로고/에셋 생산 단계(S2b) 신설 (게이트-생산자 불일치 해소)
type: docs
status: done
phase: 3
assignee: pdt-po
requires_qa: false
qa_status: na
requires_user_gate: false
area_tag: doctrine-designer
estimated_complexity: L2
created_at: 2026-06-17T00:00:00Z
---

## 배경 / 목적

dogfood 결과: 디자인 페이즈가 로고·에셋(파비콘/og·아이콘)을 실제로 안 다룸.
점검해보니 **게이트-생산자 불일치**:
- P3 close-gate(`phase3-close-gate.md` L15-19)는 Logo/Favicon/og:image/app-icon "존재
  여부"를 **검사**함.
- 그런데 P2 디자인 시퀀스(S1~S5) 어디에도 이들을 **생산하는 단계가 없음**.
- artifact manifest `kind` enum에도 asset 종류 자체가 부재.

→ 게이트가 "로고 있냐"고 묻는데 만들 책임자가 없어 조용히 통과/누락됨.

## 설계 결정 (생산 step 추가)

**S2b — brand assets** 신설. S2(DS 확정) 직후, **Branch A 전용**(net-new/DS overhaul).
확정된 팔레트·타입에서 파생:
- Logo(SVG, dual-theme시 light/dark) · favicon(`favicon.svg`+`.ico`) · og:image(소셜 카드).
  출력 `docs/artifacts/<version>/`, manifest `kind: "asset"`. P3 build가 `public/`에 배치.
- brand-guide 입력(S1 Fit-3 예외) 있으면 로고 **재사용**, 재작도 금지.
- 역량 초과(raster 고해상도/3D/사진/복합 일러스트) → `external_tool_recommendation`(habit §5)
  emit, 해당 close-gate 항목은 에셋 도착까지 `blocked`.
- Gate: 사용자 에셋 세트 승인. Branch B/C는 스킵(이미 존재; 로고 변경은 major-version → A).

close-gate에 생산자 cross-ref 추가 → 누락 시 "S2b 스킵/외부도구 미충족"으로 surface.

## 수정 파일 목록

| 파일 | 변경 |
|------|------|
| `…/designer/bookshelf/phase2-3-ticket-sequence.md` | S2b 단계 신설 + Branch A 티켓표 `T1 (S1–S2b)` |
| `…/designer/bookshelf/phase3-close-gate.md` | Logo/Favicon/og 항목 생산자(S2b) cross-ref 노트 |
| `…/designer/bookshelf/artifact-manifest-schema.md` | `kind` enum 에 `asset` 추가 |

## Acceptance Criteria

- **AC-1**: P2 시퀀스에 로고/파비콘/og를 생산하는 단계(S2b)가 명시됨 (Branch A 전용).
- **AC-2**: 생산물이 확정 DS에서 파생되고, 역량 초과 시 external_tool_recommendation로 위임됨이 명시.
- **AC-3**: P3 close-gate의 Logo/Favicon/og 항목이 S2b를 생산자로 cross-ref → 더 이상 고아 체크 아님.
- **AC-4**: manifest `kind` 에 `asset` 종류 존재.

## 비고

doctrine-only, QA 불필요. dogfood 관찰이 트리거. SoT = Tier 0 designer bookshelf.
