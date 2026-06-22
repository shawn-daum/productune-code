---
ticket_id: T-PATCH-155
version: v0.5
slug: abandoned-excluded-from-progress
title: 진행률 모수에서 abandoned 제외 (statusline + SidePanel) — 13/14→13/13
type: impl
status: done
phase: 3
assignee: pdt-developer
requires_qa: true
qa_status:
requires_user_gate: false
area_tag: progress-count
risk_flags: []
estimated_complexity: L1
created_at: 2026-06-16T00:00:00Z
started_at:
completed_at:
duration_min:
---

# T-PATCH-155: abandoned 모수 제외

`abandoned` 티켓이 진행률 분모(total)에 잡혀 `13/14`로 표시됨(oh-my-eyes v0.1 P3). abandoned는 종료-아카이브라 모수에서 빼서 `13/13`이 나오게. (`blocked`는 유지 — 진행중 작업.)

기준 = `phase-mapping.ts:138`이 이미 하는 방식(`if (status === 'abandoned') continue` → done·total 둘 다 미산입). 동일 규칙을 누락된 2곳에 적용.

## 변경

1. **`packages/core/scripts/statusline-productune.sh`** (python 카운트 블록, `total+=1` 부근):
   - status가 `abandoned`면 `total`/`done` 둘 다 미산입(`continue`). 현재는 `total+=1` 후 done만 분기 → abandoned가 total 부풀림.

2. **`packages/gui/src/components/workspace/SidePanelCurrentVersion.tsx`** (~66-68):
   - `totalCount = versionTickets.length` → `versionTickets.filter(tk => tk.status !== 'abandoned').length`. `doneCount`는 동일(done만). (abandoned는 done도 total도 아님.)

3. `phase-mapping.ts`(PhaseBreadcrumb) = 이미 올바름, 변경 없음.

## Acceptance
- AC-1: statusline — phase에 abandoned 1건 있으면 그게 total에서 빠짐(13/14 케이스 → 13/13). `done`/`blocked`/`todo` 등 다른 status 카운트 불변.
- AC-2: SidePanel totalCount가 abandoned 제외, doneCount 불변.
- AC-3: `bash -n` (statusline) PASS + `pnpm --filter @productune/gui build` PASS.
- AC-4: 스코프 외 변경 없음(phase-mapping 불변).
