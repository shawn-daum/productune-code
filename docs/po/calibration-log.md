# PO bookshelf — Model/Effort calibration log (Tier 1, per-project)

<!-- Append-only. ROUTING-BIAS ONLY — 1 line each (교훈/essay는 project-notes로).
     Schema: - YYYY-MM-DD · <slug> · L# · <persona> · <model>/<effort> · qa:<state> · <wall> · <note ≤12w>
     Read last ~8 entries at turn-open to bias routing. Cap ≤100 lines (per-project).
     Migrated 2026-06-16 from global ~/.productune/po/bookshelf/calibration-log.md [T-PATCH-156]. -->

- ARCHIVE (2026-04-30 → 05-13, 13 entries) — early monorepo+worktree sweep · sonnet/medium · worktree sweet spot L2 5~15min.
- 2026-05-18 · wiki-promo-knowledge · L2 · designer→direct-claude · sonnet/medium · qa:skip · ~30min · 6 dispatch(1fail+5retry).
- 2026-05-19 · T-P4-125 graphiti-provider · L3 · dev sonnet/high · ~25min · clean.
- 2026-05-19 · T-P4-126 doctrine-100line-cap · L4 · designer opus/high · 210min · 13main+17sub.
- 2026-05-19 · T-P4-127 skillmatrix-i18n · L1 · dev sonnet/low · ~8min.
- 2026-05-19 · T-P4-128 tickets-tab i18n popover · L2 · dev sonnet/medium · ~15min.
- 2026-05-19 · T-P4-129 chevron+emoji→lucide · L1 · sonnet/medium · 119s.
- 2026-05-19 · T-P4-130 TeamPanel MCP · L2 · sonnet/medium · 183s.
- 2026-05-19 · T-P4-136 frontmatter lint hook · L2 · sonnet/medium · qa:5/5 dry-run · PO jq merge.
- 2026-05-20 · T-P4-137 SkillMatrix sort · L1 · sonnet/medium · 119s.
- 2026-05-20 · T-P4-138 kanban grid · L2 · sonnet/medium · ~250s.
- 2026-05-20 · T-P4-139 phase-gate UI 제거 · L2 · sonnet/medium · ~110s.
- 2026-05-20 · T-P4-140 MCP 3-tier IPC · L3 · sonnet/medium · ~700s · D-1 미스리드 rollback.
- 2026-05-20 · T-P4-141 6 agent variant · L2 · designer sonnet/medium · ~360s.
- 2026-05-20 · T-P4-142 doctrine ≤100 · L2 · designer sonnet/medium · ~480s.
- 2026-05-20 · T-P4-143 inferPersonas override · L2 · sonnet/medium · ~165s.
- 2026-05-20 · T-P4-144 MCP badge 제거 · L1 · sonnet/medium · ~90s.
- 2026-05-20 · T-P4-145 6 close-prep bug · L2 · sonnet/medium · ~410s.
- 2026-05-21 · T-P4-149 session lifecycle doctrine · L1 · designer sonnet/medium · ~3min.
- 2026-05-21 · T-P4-150 JSON-only doctrine · L3 · designer sonnet/medium · ~6min.
- 2026-05-21 · T-P4-151 po-state hygiene · L2 · designer sonnet/medium · 9.4KB→5.6KB.
- 2026-05-21 · T-P4-152 페르소나 다이어트 · L4 · designer sonnet/medium · 32K cap 2회→1file 재분할.
- 2026-05-21 · T-P4-153 산출물 폴더 재구조 · L5 · dev sonnet/medium.
- 2026-05-21 · T-P4-154 main.ts 2009→197 · L3 · sonnet/medium · 1 dispatch.
- 2026-05-21 · T-P4-155 OnboardingWizard 1099→422 · L2 · sonnet/medium · 429 retry.
- 2026-05-21 · T-P4-156 VersionHistory+WorkspaceShell split · L2 · sonnet/medium · 429 retry.
- 2026-05-21 · T-P4-158 PendingGateChip · L2 · sonnet/medium.
- 2026-05-21 · T-P4-159 Phase 2/3 룰+frontend-design skill · L4 · designer sonnet/medium · 2 amend.
- 2026-05-21 · v0.4 Phase 5 close · 109 ticket/~27일 · doctrine landing 10 · carry-forward v1.0 T-P4-146/147/148.
- 2026-05-21 · v0.4-post-close-doctrine-batch · L4 · designer opus/xhigh+sonnet/medium · qa:smoke 3/3 · ~80min · 7 chunks.
- 2026-05-26 · doctrine-redesign-v0.5 · L7 · designer+dev · sonnet→opus/xhigh · qa:ready · ~135min · 9 dispatch, 4-tier 신축, wiki 폐기, unattended 8h 첫사례. (→project-notes §6)
- 2026-06-02 · productune/T-PATCH-008 git-branch-namespace · L2 · designer sonnet/medium · ~1min · small doctrine-fix baseline.
- 2026-06-02 · T-017-R2+T-018-AC1 doctrine status-enum+skills.md · L3 · designer sonnet/medium · ~1min.
- 2026-06-02 · productune/T-017 B1 GUI↔doctrine sync · L5+1 · dev opus/high · qa:fix1→pass(2loop) · ~40min · write-path 1:1. (→§5)
- 2026-06-02 · productune/T-018 B2 skill 2-layer · L4 · dev sonnet/medium · qa:2loop · ~40min · 계산가능 경계. (→§5)
- 2026-06-04 · productune/Phase3-B-bug-batch (7 ticket) · L4~L6 · designer opus/high+dev+qa · all pass · migration-debt. (→§5)
- 2026-06-04 · productune/Phase3-B-build-queue (5 ticket) · L3~L6 · dev opus/high+sonnet+qa · all pass · 자율빌드.
- 2026-06-05 · productune/gui-batch-A T-PATCH-049/055/044/054/050 · L1~L3 · dev sonnet/medium · qa:skip · ~12min · 5 commit clean.
- 2026-06-05 · productune/gui-batch-B T-PATCH-045/047/051/052/053 · L2~L3 · dev sonnet/medium · qa:skip · ~10min · 5 commit clean.
- 2026-06-05 · productune/gui-batch-C T-PATCH-048/046 · L3~L4 · dev sonnet/medium · qa:skip · ~15min · 2 commit clean.
- 2026-06-09 · productune/gui-patch-refix-r3 (T-PATCH-066~075) · L2~L6 · designer opus + dev sonnet/opus (~14 dispatch) · qa: shawn hands-on (Electron headless 불가) · 2 commit(gui+doctrine) 미push · Electron <webview> file:// findInPage 死(event無·supersede無)→sandboxed-iframe 재라우팅; doctrine promotion Tier0 버그 fix. ★blind-iterate 교훈. (→PO project-notes)
- 2026-06-09 · productune/v0.5-patch 076~079 +fixes · L2~L5 · designer opus(plan×2)→dev sonnet/high(×6 dispatch) · Electron headless QA 불가→dev self-verify+shawn hands-on · 076 2회 재구성(inline→.env*→사이드=파일명/메인페인=에디터), 078 2회(slicer prefix-fix→VersionDetailView 통합·별도탭 폐기) · blind-iterate, hands-on 전 commit 보류.
- 2026-06-09 · productune/doctrine artifact-placement-rule clarify · L3 · designer opus/high→PO mirror byte-identical+self-verify · loss-risk(User-review→User-gate 리네임) blast-radius grep=0 검증→grill 생략(clarify 비례). Tier0 common+designer habit.
- 2026-06-10 v05-patch-gui-feedback-7: designer sonnet D1/D2/D4 + opus D3 clean; dev sonnet 6 tickets — 1 QA fail (T-085, spec ambiguity AC-3 + overflowX w/o min-width; root cause designer spec, not model) -> strike1 fix pass. Explore agent pre-brief had 2 wrong facts (.dev keys, isDev modal branches) — designer caught; lesson: Explore negative claims (X does not exist) need grep verify before briefing.
- 2026-06-10 v05-patch-followup-batch2: clean run — designer sonnet x2 + opus x1, dev sonnet x4, QA haiku x4, 0 fails. No routing deviation.
- 2026-06-12 · productune/gui-feedback-5 (T-PATCH-125/126/127) · L1~L2 · dev sonnet/medium · QA Electron headless 불가→self-verify+shawn hands-on · 126 strike1: whitespace-only span이 inline-flex 컨테이너에서 width0 collapse→flex `gap`으로 교체(blind-iterate, flex 공백은 gap). 125 root: oh-my-eyes config top-level slug 누락=File>Open이 detect.config.slug(undefined) 그대로 반환(recents만 basename fallback)→IPC 반환 config에도 fallback. slug-loss 원인=migration 0004(PO 지시 프롬프트)가 config 통째 재작성하며 init의 slug 떨굼→0004 인라인 하드닝(jq merge)+Tier1 doctrine-editing migrations 줄에 일반규칙. config 복구는 init 필드순 백필. Tier0 안 넣음(매세션 비용 회피, on-demand 자리로).
- 2026-06-12 · productune/T-PATCH-128 doctrine×3 (DS-rework S1 reentry + anchor provenance disclosure + S1 preview fidelity) · L3 · designer opus×2 · attempt1 TOTAL DRIFT — unrequested ONBOARDING.md, 0 deliverables (discarded, rm) → retry w/ leading SOLE-TASK guard = clean · additive-only restructured:false → grill skip(clarify-비례), PO mirror byte-identical verify · placement deviation accepted (PO rules→delegation.md not routing.md, dispatch-composition 영역 적중). lesson: subagent 탈선 시 fresh re-dispatch는 금지목록+SOLE TASK를 프롬프트 선두에. (→§4)
- 2026-06-12 · productune/T-PATCH-129 Inter→Pretendard UI-text rule (ux-principles §13 신설) · L3 · designer opus + sonnet(junk-strip) · clean · PO verify 중 발견: ux-principles.md 말미 tool-call XML 누출(</content></invoke>, 파일 생성 커밋부터 상존) → sonnet 디스패치 제거. lesson: doctrine diff 검증 시 trailing context까지 읽기 — 파일 말미 leak은 diff context로만 드러남. (→§4)
- 2026-06-12 · productune/T-PATCH-130 board QA컬럼→진행중 병합 · L2 · dev sonnet/low · patch-lane(Designer 생략) · build PASS, Electron headless QA 불가→self-verify+shawn hands-on · STATUS_ORDER 에서 review 빼되 KNOWN_STATUS_SET 엔 유지(아니면 unknown 오집계)+DISPLAY_BUCKET remap, types.Status 7-status 불변(표시버킷만 병합) · dev 수반 grid track repeat(7)→length 자동수정(빈 track 방지, in-scope).
- 2026-06-12 · productune/v05-gui-dogfood-feedback-8 (T-PATCH-131/132/133) · L2~L5 · dev sonnet patch×2(131/132) + designer sonnet plan-emit(133) → dev opus plan-first → sonnet impl · Electron headless QA 불가→dev self-verify+빌드+PO diff 정독, shawn hands-on, 커밋 후 재테스트 · 3건 main 그룹커밋(관례). KEY: ① "권한 규칙으로 세션이 멈췄어요"는 UI 버그 아니라 po-runner 30s tool-use timeout 휴리스틱 오탐 — Write/Edit/Bash 후 타이머가 AskUserQuestion/tool_result에서 안 꺼져 OQ 대기 중 발화. UX "깨짐" 신고가 백엔드 health-event 오탐일 수 있음 → 렌더 버그 단정 전 health source 추적. ② T-PATCH-133 A안 hook추출, FreshComposer fire-and-forget은 poSendMessage await 불가→cleanupAttachments 경합→disk cleanup 생략+L1 purge 위임(티켓 BDD-3 cleanup 절 의도적 deviation). ③ post-delegate hook SID 미기록 지속→plan세션 resume 대신 plan을 impl 디스패치 첫 줄로(plan-mode impl step 정상). ④ GUI 프로젝트 삭제/recents 제거 affordance 부재 발견(backlog 후보).
- 2026-06-15 · productune/v0.5 dogfood-paepyeong (T-PATCH-137 read + T-PATCH-138 write-guard) · L1/L2 · 137 dev sonnet patch-lane→qa basic pass · 138 designer sonnet plan-first→dev sonnet/high impl→qa opus GRILL(fail→fix→pass) · 둘 다 done, 미커밋(commit-on-request). KEY: ① ★진단 교훈: "status enum mismatch" 신고 — 22808c1 "prose hygiene"가 doctrine **dogfood 티켓 예시**(docs/tickets/v0.5/T-001·099)만 고쳤지 (a)board read-side synonym map (b)write-guard 어느 쪽도 안 건드림=불완전 fix. paepyeong 신규 `in_progress`(오늘) 진짜 원인은 **기존 PreToolUse 훅(pre-frontmatter-lint.sh)의 matcher가 Write|Edit뿐** → PO가 Bash(sed/heredoc)로 status 쓰면 훅 미발화. `qa`는 ticket TYPE을 status 슬롯에 오배치(canonical=review). 교훈: 데이터-표시 버그는 read(파서/synonym)·write(가드 채널)·doctrine(쓰기규칙) 3층 분리해 추적, prose 수정만으로 "고쳤다" 단정 금지. ② subagent 빈응답 재발 1건(dev가 release-notes 요약 echo, 0 tool-use)→fresh 재디스패치 clean. ③ ★GRILL이 진짜 cardinal-sin over-block 잡음(F1): 인라인#strip이 unquoted만 처리→`status: "review" # x`(쿼티드+주석 합집합) false-BLOCK. load-bearing 게이트 훅은 self-test 신뢰말고 GRILL 적대 엣지(엣지의 합집합) 필수. ④ deploy 노트: 훅 수정은 install 재실행 후 활성(미배포 시 paepyeong 무효).
- 2026-06-15 T-PATCH-139 (doctrine+hook+migration, opus→sonnet, L4): brief 스코프 과대추정 — Designer plan이 (a) planning 누수는 doctrine SoT 아닌 docs/testing.md only (b) enum single-source 이미 존재로 축소. current_task field-set 13→14(started_at 누락) developer risk_note로 catch→converge. QA fail은 배포(activation)뿐 로직 7/7 pass. 교훈: data-migration은 생성주체(lifecycle-owned po-state=doctrine-authored)도 갱신 — data+reader만 고치면 fresh init이 옛 shape 재생산.
- 2026-06-16 T-PATCH-140/141 (hook scoping + init po-state generator, opus plan→sonnet impl, L2/L3): plan-grill이 생성원 0누락 확정했으나 Designer가 내 audit이 놓친 6번째 파일(bash productune ensure_state — v1+past_tickets 하드코딩 seed, init 前 실행)을 발견 → v1 shape의 실제 생성원이었음. recent_turns "canonical 제거" plan rationale를 grill이 factual 오류로 refute(유효 v2 필드, post-delegate가 write) → seed-omit로 정정. impl 9/9 + 독립 grill 8+14 all pass. 교훈: scaffold 감사 시 bash CLI wrapper(.mjs 아닌)도 생성원 후보로 포함.
- 2026-06-16 T-PATCH-142 (Tier0 promotion-schema 7→10, opus, L3, additive): designer가 schema.md mirror는 했으나 consumer promotion-process.md의 ~/.productune mirror는 누락 → SoT만 10, mirror 7 drift. PO mirror-verify(grep residual)가 잡아 cp로 수정. 교훈: doctrine-editing impact sweep에서 *변경된 모든 파일*의 mirror를 개별 확인 — assignee self-check "mirror_byte_identical:true"는 한 파일만 본 것일 수 있음.
