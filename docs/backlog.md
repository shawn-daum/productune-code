# Backlog

알고서 미룬 결정 추적 (PRD·티켓 본문은 고치지 않음). 한 줄 = 제목 + 왜 미뤘는지 + 출처.
P3 close gate 첫 단계에서 각 항목을 이번 버전 적용 / 다음 버전 이월로 분류한다.

## near-term

- doctrine-file 저장 "PO 검수" 자동적용(replace-on-approval) — 승인 시 whole-file 교체하는 mechanical-write 모드가 없음(기존 머신은 append-only). 현재는 PO가 pending 보고 수동 반영. (출처: T-PATCH-022 GAP-2, 2026-06-05)
- doctrine enum 불일치 — promotion-process 5th-retro snapshot은 status ∈ {approved, edited, dropped}인데 lifecycle/p5-close.md는 {approved, edited}로 'dropped' 누락. 정합 필요(designer). (출처: doctrine sweep grill, 2026-06-05)
- T-PATCH-031 후속 — persona-spec viewer 높이/스크롤(specViewerWrap 360px) 시각 적합성 눈으로 확인 필요. (출처: T-031 dev note, 2026-06-05)
- git ticket-branch 네이밍 drift — git-workflow는 `v<N>-T-<N>-<slug>`, developer habit §2는 `feat/T-NNN-<slug>`. worktree-per-ticket 의무화로 정합 필요(designer). (출처: git-posture grill, 2026-06-05)

## next-version (v0.x)

## pre-deploy
