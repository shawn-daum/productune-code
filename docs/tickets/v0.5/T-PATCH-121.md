---
ticket_id: T-PATCH-121
version: v0.5
round: patch
type: feature
status: done
phase: 3
assignee: pdt-developer
model: opus
effort: medium
estimated_complexity: L3
qa_status: pass
completed_at: 2026-06-11
qa_loops: 0
slug: ticket-artifact-links
area_tags: [gui/ticket-detail, gui/version-history, gui/ipc]
created_at: 2026-06-11
---

# T-PATCH-121 — 티켓 산출물 가시화: 상세 탭 하이퍼링크 + 버전 메인 pane 티켓 카드 배지

## §1. Request

shawn (ad-hoc): "산출물 있는 ticket 의 경우 ticket 에 기록, GUI ticket 상세에서는 하이퍼링크 제공. Project version main pane Ticket 카드에서는 산출물 있음을 표시해줘."

설계 결정: 티켓 md frontmatter 에 산출물을 중복 기록하지 않고 **manifest 단일 SoT** 사용 — `docs/artifacts/<version>/manifest.json` entries 의 `ticket:` 필드가 이미 티켓↔산출물 링크를 보유 (`artifact-manifest-schema.md`), GUI IPC `artifacts:listScoped`/`listTree` 가 `meta.ticket` 을 반환. "ticket 에 기록" 요건은 manifest entry 가 충족 (designer habit §3 이 이미 artifacts write = manifest entry 동시 작성 의무화).

## §2. Acceptance

- BDD-1: Given manifest 에 `ticket: T-NNN` 인 entry 1+ / When 해당 티켓 상세 탭(TicketDetailTab) 열람 / Then "Artifacts" 섹션에 산출물별 하이퍼링크(파일명 + kind + status pill) 표시, 클릭 시 기존 artifact 열람 경로(preview tab / openPath)로 열림.
- BDD-2: Given 동일 조건 / When 버전 히스토리 메인 pane / Then 해당 TicketCard meta 라인에 산출물 개수 배지(📎 n) 표시.
- BDD-3: Given 산출물 없는 티켓 / Then 섹션·배지 미표시 (빈 상태 노이즈 없음).
- BDD-4: archived 산출물은 상세 탭에서 회색/archived 표기, 카드 배지 카운트에서 제외.
- BDD-5: `pnpm -F gui` typecheck/build green.

## §3. Out of scope

- 티켓 md frontmatter `artifacts:[]` 필드 신설 (manifest 단일 SoT 유지).
- 파일명 regex 기반 ticket 추론(useAutoSurfaceArtifacts 방식)의 manifest 기반 전환 — 별도 정리.
- 산출물 미리보기 렌더러 변경.

## §4. Plan

1. `VersionHistoryView.tsx`: `artifacts:listScoped` 1회 로드 → ticket_id→entries 맵 → `TicketCard` prop.
2. `TicketCard.tsx` (views/versionHistory): meta 라인에 📎 배지 (archived 제외 count>0).
3. `TicketDetailTab.tsx`: DispatchProgress 아래 Artifacts 섹션 — `meta.ticket === ticket_id` 필터, ArtifactsPane.handleRowClick 패턴 재사용.

## §5. Outcome

(P5 에서 기입)
