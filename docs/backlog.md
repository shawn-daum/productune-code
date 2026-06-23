# Backlog

알고서 미룬 결정 추적 (PRD·티켓 본문은 고치지 않음). 한 줄 = 제목 + 왜 미뤘는지 + 출처.
P3 close gate 첫 단계에서 각 항목을 이번 버전 적용 / 다음 버전 이월로 분류한다.
RESOLVE/DONE 항목은 줄 제거(2026-06-23 reconcile sweep — backlog↔ticket lifecycle doctrine 티켓 발행 예정).

## near-term

- (2026-06-23) [artifacts 뷰어, quick-win] GUI artifacts 읽기가 flat 전용(`ipc/artifacts.ts` scanDir `readdirSync`+`isFile`, 재귀 없음, `archive/`만 예외) → 페르소나가 flat 규칙 어기고 하위폴더 생성 시 세션 중 GUI에서 조용히 사라짐(CI lint `find -maxdepth 2`만 나중에 잡음). **C안**: non-archive 하위폴더 1단 재귀 발견 → "기타/중첩(flat 위반)" collapsed 섹션(archive 토글 재사용) + ⚠ 위반 플래그로 표시(평탄화 유도, flat invariant 보존). Designer plan-first. 큰 lifecycle 파트(focus-pinning + archive 케이던스)는 v0.6 항목 참조. (출처: 2026-06-23 shawn dogfood 피드백)

- cmd+K cmd+\ split-down 체인(chord)이 OOPIF iframe 포커스 내부에선 동작 안 함 — 단일 accelerator 불가. iframe 안에서 split-down 필요 시 전용 accel 메뉴아이템 추가 검토. (2026-06-08, src: T-PATCH-066 R4)

- doctrine-file 저장 "PO 검수" 자동적용(replace-on-approval) — 승인 시 whole-file 교체하는 mechanical-write 모드가 없음(기존 머신은 append-only). 현재는 PO가 pending 보고 수동 반영. (출처: T-PATCH-022 GAP-2, 2026-06-05)
- doctrine enum 불일치 — promotion-process 5th-retro snapshot은 status ∈ {approved, edited, dropped}인데 lifecycle/p5-close.md는 {approved, edited}로 'dropped' 누락. 정합 필요(designer). (2026-06-23 재검증: 여전히 OPEN — promotion-process.md:9 vs p5-close.md:19). (출처: doctrine sweep grill, 2026-06-05)
- T-PATCH-031 후속 — persona-spec viewer 높이/스크롤(specViewerWrap 360px) 시각 적합성 눈으로 확인 필요. (출처: T-031 dev note, 2026-06-05)
- git ticket-branch 네이밍 drift — git-workflow는 `v<N>-T-<N>-<slug>`, developer habit §2는 `feat/T-NNN-<slug>`. worktree-per-ticket 의무화로 정합 필요(designer). (2026-06-23 재검증: 둘 다 현존 — version-branch vs task-branch 레이어 구분일 수 있어 진짜 drift 인지 명확화 필요). (출처: git-posture grill, 2026-06-05)
- close_gate GUI write-path parity — GUI `phase:approve` IPC(`packages/gui/electron/ipc/state.ts`)가 phase 전환을 TS로 직접 write라 `close_gate` instantiate를 우회함. (2026-06-23 재검증: deterministic 자가치유 hook은 이제 라이브 = 부분 backstop이나, GUI IPC write-path 자체는 hook(PreToolUse) 비경유라 parity 미해결). GUI close_gate 렌더링 ticket과 함께 정합(developer). (출처: T-PATCH-041 designer plan F2, 2026-06-05)
- [near-term] "Invalid tool parameters" 간헐 발생 — OQ(AskUserQuestion) 답변 직후 `claude --resume` 재개 시. CC 코어 InputValidationError(productune 미발생, dist만 매칭). 유력원인: resume 시 코어가 대기중 AskUserQuestion tool_use 재검증 throw(업스트림). productune-side 방어: (a) `electron/ipc/po.ts:105` answerText 미정화 → control-char sanitize, (b) `po-runner.ts:384` silence-timeout(15s)가 OQ대기중 발화→resume race 조율. 근본확정엔 발생시 transcript/캡처 필요. (출처: Explore 진단, 2026-06-17, shawn 보고)

## next-version (v0.x)

- [v0.6] 정합성 감사 + 페르소나 워크스루 + Nemotron persona distill 모듈 — 품질 3차원 중 Coherence/Usability 빈칸을 메우는 독립 적대자. QA에 2개 신규 모드(coherence-audit·persona-walkthrough) + QA를 P2 소환, designer에 distill 파이프라인. 자체 PRD로 P1부터 태울 것(이 backlog 항목≠즉시구현). 롤아웃 R1(정합성 감사 MVP) → R2(distill→워크스루). 브리프: `/Users/x/Documents/dev/ntf-products/prd-master/DESIGN-coherence-persona-module.md`. (2026-06-19, shawn 결정 — v0.6 이월)

- [v0.6] lazyweb UI/UX 레퍼런스 grounding 실험 — Designer를 lazyweb MCP(실앱 281k 화면/flow/competitive) 레퍼런스로 grounding하면 design.md/anchor 품질이 baseline보다 나은가. 방법론 grill 완료(2 blocking flaw 교정): S1→S2 anchor 블록 단위 측정 · A/A+/B 3-arm(교란 격리) · 가설전용 constructs 루브릭 신규 · 인용strip 블라인딩 · 게이트 임계 사전등록 · Step0 MCP 연결 hard go/no-go(현재 미연결, install.sh 또는 수동 config+token 필요). 브리프 SoT: `briefs/lazyweb-design-grounding.md`(v2). (2026-06-23, shawn 결정 — 생각보다 큰 건이라 v0.6 이월)

- [v0.6] artifacts lifecycle — focus-pinning + archive 케이던스. 현 doctrine은 archive 이동이 P2 게이트 닫을 때만(Designer) → 긴 P3 동안 중간 산출물 쌓여 중요 산출물(DS/mockup)이 focus에서 묻힘. 필요: (a) 뷰어가 "현재 중요"(최신 approved DS·surface별 최신 mockup) 상단 고정 + supersede 강등, (b) P3 중 artifact-tidy 케이던스(티켓 close 시 생산 페르소나가 supersede 변종 archived 마킹 / PO가 체크포인트에 sweep)를 lifecycle doctrine에 명문화. near-term 뷰어 quick-win(C)과 한 Designer plan으로 스코프. (출처: 2026-06-23 shawn dogfood 피드백)

## pre-deploy
[v0.5 backlog_triage 2026-06-23 — APPLY 결정. Deploy(dmg) 진입 시 티켓 발행.]
- [APPLY v0.5 → Deploy] `uninstall.sh` is_pdt orphan 4개 보강 — `post-po-state-shape-guard`·`post-ticket-status-verify`·`pre-po-state-shape-guard`·`session-start-po-state-migrate` (install.sh strip엔 있는데 uninstall엔 없어 orphan). (정정 2026-06-23: fresh-install CI smoke는 C1로 이미 done — `.github/workflows/fresh-install-smoke.yml` 4 checks 완비. 이 항목은 uninstall.sh orphan만 잔여.) (출처: 2026-06-23 dmg-deploy triage)
- [APPLY v0.5 → Deploy 후행] 라이브 검증 집중 세션 T-220/231/221 — dmg가 만든 빌드를 cua VM에 설치 후 human VNC 눈확인. ① T-220 onboarding Step2 Next 게이팅+codex 미노출 ② T-231 not-installed/401 분류배너 ③ T-221 15s/90s 침묵 라벨. T-031 persona-spec viewer 높이 + CostArchivePanel row-level 눈확인 잔여 흡수. harness 교훈(VM 설치빌드=검증대상 일치 확인) Tier2 cua-vm-harness.md에 designer+grill. (출처: 2026-06-22 qa-cua-live + 2026-06-23 triage)
- [APPLY v0.5 → doctrine 티켓] backlog↔ticket reconcile 룰 — `state-hygiene.md`: ① APPLY→티켓발행 시 backlog 줄 `→ T-XXX` 마킹·triage 통과 시 제거 ② 티켓 close 시 대응 줄 제거 ③ PO write-whitelist (e) `append`→`append + resolved-line 제거` 확장. designer author + QA grill. (출처: 2026-06-23 stale-11건 sweep 파생 gap)

## follow-up (dogfood / 티켓 잔여)
- [near-term] settings round-trip regression test (load -> mutate one field -> save -> reload -> all fields intact) — T-PATCH-083 중 loadSettings() integrations silent-wipe 버그 발견+수정됨; 재발 방지 테스트 없음. (2026-06-23 재검증: 여전히 테스트 부재 OPEN). (2026-06-10)
- [v0.6] non-mac tray icon (Tray instance, icon asset, context menu) — deferred from T-PATCH-090 close-to-tray mac-only first cut. (2026-06-10)
- [v0.6+] GUI 자동 업데이트 (electron-updater) — 서명·배포 인프라 필요해서 미룸. 당장은 수동 dmg + 버전 불일치 배너로 감. 외부 배포 시점에 재검토. (2026-06-10, src: harness 구조 피드백 결정 보드 #3-GUI) **[2026-06-22 결정 고정]** GUI 업데이트는 `productune update`(CLI/doctrine 채널)에 끼워넣지 않고 **GUI 자체의 별도 업데이트 채널**(앱 내 update 표시/electron-updater 방향)로 분리한다. dogfood는 전부 CLI라 GUI 미적용은 당장 문제 아님. (T-PATCH-229 abandoned — 잘못된 원인분석 파생)
- [v0.6] launch-at-login openAsHidden (login 시 창 pre-hidden 시작) — T-PATCH-090 first cut 에서 deferred. (2026-06-10)
- (2026-06-12) [T-PATCH-128 follow-up] `persona/designer/bookshelf/phase2-3-ticket-sequence.md` cap breach — curation/restructure to reclaim cap = loss-risk op, needs dedicated doctrine ticket + QA grill. (2026-06-23 재측정: **150**/100 — 악화. 104(pre-128)→147(225/226)→150 현재.)
- (2026-06-12) [T-PATCH-129 follow-up] `ux-principles.md` cap breach — phase2-3-ticket-sequence.md breach와 묶어 doctrine cap-curation 티켓 1건으로 triage (loss-risk, QA grill). (2026-06-23 재측정: **108**/100.)
- (2026-06-15) [brand process, 결정고정] DS 확정 후 로고·에셋 생성 워크플로 = **핸드오프-먼저 + MCP-후속**. ① 근시일: Designer가 영문 로고/에셋 프롬프트 + 스타일 디렉션 brief를 산출물로 author → 션님이 외부 이미지모델(ChatGPT/Gemini/MJ)에 투입(infra 0, 사람 큐레이션 유지). ② v0.6+ 후속: Figma MCP create-design / Vercel AI Gateway 이미지생성 연동으로 반자동화 검토. 실행은 design-system 확정 게이트 이후. codex/CLI 위임안은 폐기(이미지 생성 불가). (출처: 2026-06-15 dogfood 피드백 #4, shawn 결정) — **정정(2026-06-19, T-PATCH-226): Codex agent 이미지 생성 가능 확인(shawn)으로 위임안 부활.** S2b 정책 = 위임-우선(① Codex 위임 → 한도소진/실패 시 ② ChatGPT/Gemini 핸드오프 → ③ 유저 거부 시 Claude 직접 SVG). "codex 위임 폐기"는 이 정정으로 무효.
- (2026-06-15) [T-027 follow-up] `turns.jsonl` append-only 무한증가 — rotation/size-cap/prune 정책 없음(현재 gitignore로 커밋만 차단). 장기 dogfood 시 파일 비대 → rotation 티켓 별도. (2026-06-23 재검증: 여전히 정책 부재; `post-delegate-state-write.sh`가 전체 파일 메모리 로드 dedup만 수행.) (출처: T-027 dev/QA residual risk)
- (2026-06-15) [T-PATCH-136 follow-up] `packages/gui/electron/ipc/skills.ts` `parseSkillFrontmatter`가 tickets.ts와 동일 regex-only 파서 버그 — 인라인 `#` 주석 미처리 + 무조건 unquote(`replace(/^['"]|['"]$/g,'')`). skill frontmatter도 같은 오파싱 가능. tickets.ts 수정(T-PATCH-136)과 동일 패턴으로 별도 티켓 정합 필요(dev). (2026-06-23 재검증: tickets.ts만 fix됨, skills.ts:62 여전히 옛 파서 — 진짜 OPEN.) (출처: T-PATCH-136 dev/QA AC-9 flag)
- (2026-06-16) [GUI feature, v0.6 후보] PO Log "Terminal" 탭 미구현 — `PlaceholderTab`이 type 'terminal'을 "T-P4-054에서 채워짐"으로 렌더, 가리키는 `.productune/logs/po-session.log`는 po-runner가 생성조차 안 함. 제대로 하려면 2단: (a) po-runner가 세션 트랜스크립트를 po-session.log에 기록(로그 생산 배선) + (b) tail IPC + read-only 로그 뷰 컴포넌트. 인터랙티브 shell(node-pty)은 별도 후속(Round6 T-P4-060). 패키징 우선이라 backlog. (출처: 2026-06-16 paepyeong smoke 피드백)
- (2026-06-16) [po-state hook, defense-in-depth] T-153/154 grill 파생 — (a) `session-start-po-state-migrate.sh` load-bearing 생존검증 목록(version/current_phase/slug/request_summary/artifacts/persona_sessions 6개)이 canonical-14 중 persona_session_meta/started_at 등을 누락; transform이 안 건드려 실손실 없으나 훅 주석 "likewise preserved" 보증과 커버리지 어긋남 → 검증목록 보강 또는 주석 정정. (b) active scratch 정리가 close시 current_task→null 신뢰성에 단일 의존(past_tickets처럼 기계적 무조건-차단 아님) → migrate/sweep에 "status done/blocked/abandoned인 current_task scratch 정리" backstop 추가 검토. (출처: T-PATCH-154 GRILL pass-with-issues)
- (2026-06-18) [doctrine trim debt] `packages/core/doctrine/persona/qa/bookshelf/design-review.md` AT 100/100 cap — 향후 슬롭 루브릭 보강/추가 시 트림 선행 필수(현재 한 줄도 못 늘림). close-gate(phase3-close-gate.md)가 이 파일을 bands SoT로 cross-persona 의존 → 트림 시 게이트 임계값이 참조하는 밴드 보존 확인. (출처: T-PATCH-211/212 QA grill risk_flag)
- (2026-06-18) [low, a11y finish] Settings helper text 대비 미달 — `#707070` on `#0F0F0F` = 3.87:1 (AA 4.5:1 미달). T-PATCH-214 #3는 line-height만 변경(색 무관)이라 선재 조건, 티켓 범위 밖. 향후 마감 패스에서 helper text 색 ~`#8A8A8A`로 상향(≥4.5:1). (2026-06-23 재검증: `--text-faint: #707070` 여전, OPEN.) (출처: T-PATCH-214 QA observation)
- (2026-06-23) [near-term, T-PATCH-237 잔여] v0.4 티켓 legacy qa_status(ready/passed/skip/todo/smoke/static-pass) 보유 → **whole-file Write 시 BLOCK**(Write 채널은 제안 FM 전체 검증). 본문 Edit는 FM-diff로 통과하나, 그 파일들의 whole-file 재작성/qa_status 줄 편집은 막힘. v0.4 qa_status를 canon enum으로 마이그(닫힌 티켓이라 우선순위 낮음, T-233式 일괄). (2026-06-23 재측정: **116건** legacy 보유 — 기존 cite 75 정정.) (출처: T-237 GRILL out-of-scope 잔여)
