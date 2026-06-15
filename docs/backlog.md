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

## next-version (v0.x) — codex 폐기
- Codex 엔진 폐기 — claude code only 결정(2026-06-09, shawn). MY_PO_ENGINE codex/both 옵션 + 온보딩 엔진선택(Step1_Engine/Step2_EngineConnect/types.ts) + checkCodex/codexLogin IPC(preload/onboarding) + i18n codex 키 전부 제거 대상. T-PATCH-077 Claude Code 연결상태가 단일 엔진 전제로 자리잡음 → 미러 불필요. (cleanup 티켓 별도 발행 필요)
- [near-term] ipc/po.ts activePoChild (T-P4-059) never assigned -> po:restartSession kill path always null-skips; dead code or latent bug. Found during T-PATCH-081. (2026-06-10)
- [near-term] settings round-trip regression test (load -> mutate one field -> save -> reload -> all fields intact) — T-PATCH-083 중 loadSettings() integrations silent-wipe 버그 발견+수정됨; 재발 방지 테스트 없음. (2026-06-10)
- [v0.6] non-mac tray icon (Tray instance, icon asset, context menu) — deferred from T-PATCH-090 close-to-tray mac-only first cut. (2026-06-10)
- [v0.6+] GUI 자동 업데이트 (electron-updater) — 서명·배포 인프라 필요해서 미룸. 당장은 수동 dmg + 버전 불일치 배너로 감. 외부 배포 시점에 재검토. (2026-06-10, src: harness 구조 피드백 결정 보드 #3-GUI)
- [v0.6] launch-at-login openAsHidden (login 시 창 pre-hidden 시작) — T-PATCH-090 first cut 에서 deferred. (2026-06-10)
- (2026-06-12) [T-PATCH-128 follow-up] `persona/designer/bookshelf/phase2-3-ticket-sequence.md` cap breach 118>100 — curation/restructure to reclaim cap = loss-risk op, needs dedicated doctrine ticket + QA grill (was already 104 pre-128).
- (2026-06-12) [T-PATCH-129 follow-up] `ux-principles.md` 104>100 cap — phase2-3-ticket-sequence.md(118) breach와 묶어 doctrine cap-curation 티켓 1건으로 triage (loss-risk, QA grill).
- (2026-06-12) [GUI gap, dogfood] 프로젝트 삭제 + recents 제거 affordance 부재 — 현재 recents IPC는 list/add만; 프로젝트를 지우거나 최근목록에서 빼려면 수동(rm -rf project dir + recents.json 편집)이어야 함. recents:remove IPC + 우클릭/⋯ 메뉴(목록 제거 / 디렉터리 삭제 옵션) 검토. (2026-06-15: v0.5 P3 in-scope 전환 — Designer plan-first 발행됨)
- (2026-06-15) [brand process, 결정고정] DS 확정 후 로고·에셋 생성 워크플로 = **핸드오프-먼저 + MCP-후속**. ① 근시일: Designer가 영문 로고/에셋 프롬프트 + 스타일 디렉션 brief를 산출물로 author → 션님이 외부 이미지모델(ChatGPT/Gemini/MJ)에 투입(infra 0, 사람 큐레이션 유지). ② v0.6+ 후속: Figma MCP create-design / Vercel AI Gateway 이미지생성 연동으로 반자동화 검토. 실행은 design-system 확정 게이트 이후. codex/CLI 위임안은 폐기(이미지 생성 불가). (출처: 2026-06-15 dogfood 피드백 #4, shawn 결정)
- (2026-06-15) [T-027 follow-up] `turns.jsonl` append-only 무한증가 — rotation/size-cap/prune 정책 없음(현재 gitignore로 커밋만 차단). 장기 dogfood 시 파일 비대 → rotation 티켓 별도. (출처: T-027 dev/QA residual risk)
- (2026-06-15) [T-027 follow-up] GUI CostArchivePanel row-level 검증 미수행 — CLI read-path가 AC-6 authoritative surface로 PASS, 패널 mount+empty-state는 smoke 통과했으나 populated turns.jsonl 대상 group-by 행 출력은 GUI에서 클릭-검증 안 됨. 실사용 turns.jsonl 쌓인 뒤 눈 확인 권장. (출처: T-027 QA residual)
