# Backlog

알고서 미룬 결정 추적 (PRD·티켓 본문은 고치지 않음). 한 줄 = 제목 + 왜 미뤘는지 + 출처.
P3 close gate 첫 단계에서 각 항목을 이번 버전 적용 / 다음 버전 이월로 분류한다.

## near-term

- cmd+K cmd+\ split-down 체인(chord)이 OOPIF iframe 포커스 내부에선 동작 안 함 — 단일 accelerator 불가. iframe 안에서 split-down 필요 시 전용 accel 메뉴아이템 추가 검토. (2026-06-08, src: T-PATCH-066 R4)

- prefers-reduced-motion 미지원 (T-068 question sheet slide-up) — 애니메이션이 inline style 이라 @media reduced-motion CSS 셀렉터가 noop. className 기반 또는 matchMedia JS 게이팅으로 수정 필요(a11y, dev). dead 셀렉터(.question-sheet-slide)도 정리. (2026-06-08, src: T-PATCH-068)

- doctrine-file 저장 "PO 검수" 자동적용(replace-on-approval) — 승인 시 whole-file 교체하는 mechanical-write 모드가 없음(기존 머신은 append-only). 현재는 PO가 pending 보고 수동 반영. (출처: T-PATCH-022 GAP-2, 2026-06-05)
- doctrine enum 불일치 — promotion-process 5th-retro snapshot은 status ∈ {approved, edited, dropped}인데 lifecycle/p5-close.md는 {approved, edited}로 'dropped' 누락. 정합 필요(designer). (출처: doctrine sweep grill, 2026-06-05)
- T-PATCH-031 후속 — persona-spec viewer 높이/스크롤(specViewerWrap 360px) 시각 적합성 눈으로 확인 필요. (출처: T-031 dev note, 2026-06-05)
- git ticket-branch 네이밍 drift — git-workflow는 `v<N>-T-<N>-<slug>`, developer habit §2는 `feat/T-NNN-<slug>`. worktree-per-ticket 의무화로 정합 필요(designer). (출처: git-posture grill, 2026-06-05)
- close_gate turn-open hard-inject hook — phase/gate 의도 질문 + 해당 phase 일 때 po-state `close_gate` 슬라이스를 PO 컨텍스트에 강제 주입(prose discipline 우회, 유일한 진짜 enforcement). T-PATCH-041 gate-as-state 의 hook 후속(developer). (출처: gate-as-state QA grill item3, 2026-06-05)
- uninstall.sh is_pdt 누락 — `pre-delegate-ctx-lang.sh` + `pre-git-posture.sh`가 install.sh strip 목록엔 있는데 uninstall.sh `is_pdt`엔 없음 → uninstall 시 orphan. (출처: T-PATCH-043 QA grill note, 2026-06-05, predates ticket)
- close_gate GUI write-path parity — GUI `phase:approve` IPC(`packages/gui/electron/ipc/state.ts`)가 phase 전환을 TS로 직접 write라 `close_gate` instantiate를 우회함. 현재는 T-PATCH-041 AC5 lazy-instantiate-on-read가 backstop. GUI close_gate 렌더링 ticket과 함께 정합(developer). (출처: T-PATCH-041 designer plan F2, 2026-06-05)
- close_gate deterministic 자가치유 (cross-machine) — turn-open sweep jq가 `current_phase` enumerable gate(P3) && `close_gate` 부재 시 **결정적으로** 배열 write (transition write와 단일 `--argjson` 리터럴 공유 → drift 없음). 기존 mid-P3 po-state가 이 기기/타 기기 모두 doctrine pull 직후 매 turn-open 자가치유 — LLM recall/GUI hook 불요. AC5 prose-lazy(negative-control PARTIAL)보다 strictly 강함. T-PATCH-041 followup, hook보다 우선(designer, doctrine-only). (출처: T-PATCH-041 QA sign-off crux, 2026-06-05)

## next-version (v0.x)

## pre-deploy
