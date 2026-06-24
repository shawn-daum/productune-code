# Feature history

Per-Version log of feature decisions / scope choices / deferrals.
Read at Phase 1 PRD authoring; appended by Designer at Phase 5 Version close.

## Schema

- (YYYY-MM-DD) <version> · <area-tag> · <decision-type> · note: <one-line>

decision-type ∈ `shipped | deferred | dropped | scope-change`.
area-tag = `<feature>/<sub-area>` (matches QA convention).

## Entries

### v0.4 (closed 2026-05-21)

- (2026-04-30) v0.4 · gui/main-split-pane · shipped · note: VS Code + cmux 패러다임 — 재귀 hbox/vbox 트리 + 10 tab type dispatcher + drag-drop + ⌘\\/⌘W (T-P4-046).
- (2026-05-07) v0.4 · gui/persona-presence · shipped · note: Right Panel PO Chat 24px presence strip — 4 persona × 3 state (idle/working/done) (T-P4-049).
- (2026-05-07) v0.4 · gui/i18n · shipped · note: English / 한글 toggle — onboarding Step 0 + Settings Language sub-tab + 9 컴포넌트 i18n + react-i18next (T-P4-056).
- (2026-05-07) v0.4 · gui/i18n-linter · shipped · note: locale protected-token linter BSD `grep -P` no-op fix (bash + perl PCRE) + 보호어 6 분류 baseline (T-P4-057).
- (2026-05-07) v0.4 · init/openfolder-hygiene · shipped · note: settings.local.json foreign-user detect + backup + `.gitignore` 자동 + detectProductuneLayout 3-kind + 모달 contrast AAA (T-P4-058).
- (2026-05-07) v0.4 · gui/po-session-health · shipped · note: PO session health 6-state surface (StatusBar + sticky banner + FAB badge) + Restart/Retry/View log CTA (T-P4-059).
- (2026-05-08) v0.4 · doctrine/phase-5단-통일 · shipped · note: PRD/Design/Build/Deploy/Close 통일 + StageStrip 5단 + ticket stage→type rename + ChatPanel selector 제거 + po-state past_tickets[] 제거 + ticket md = SoT (T-P4-065).
- (2026-05-08) v0.4 · doctrine/promotion-lifecycle · shipped · note: pending_promotions[] schema 11 sub-keys + drain Step 1b (Cap 5/turn · 7-day stale-drop) + retrospective archive read source 5종 (T-P4-066).
- (2026-05-08) v0.4 · gui/ux-feedback · shipped · note: ChatPanel restart visual feedback — §1.5.4 anti-pattern fix (T-P4-067).
- (2026-05-08) v0.4 · gui/background-task-monitor · shipped · note: PresenceBar count badge + StatusBar BackgroundTaskSegment + StatusBar height 28→36px (동시 sub-agent visibility) (T-P4-068).
- (2026-05-08) v0.4 · doctrine/po-state-past-tickets · dropped · note: past_tickets[] (cap 50) 통째 제거 — ticket md = SoT + useTicketScan hook GUI 대체 (T-P4-065 sub-area f).
- (2026-05-06) v0.4 · gui/multi-chatroom · dropped · note: GUI 단일 PO 세션 채택 — multi-chatroom 모델 폐기, T-P4-042 deprecated, T-P4-041 흡수 (CLI/non-GUI multi-session 가능성만 보존).
- (2026-05-12) v0.4 · doctrine/version-naming · shipped · note: shared validator + Wizard validator + PO doctrine + Ticket lint + Migration script (paepyeong v1 migration applied) (T-P4-095).
- (2026-05-12) v0.4 · gui/usermode-default · shipped · note: UserMode default null → planner + Settings General i18n parity (settings.tabGeneral + settings.general.userMode.*) (T-P4-096).
- (2026-05-12) v0.4 · gui/sidebar-versions · shipped · note: Project side panel 2-section split (현재 버전 + 지난 버전), current → ticket-review tab, past → version-history tab, v1 default 시드 (T-P4-097).
- (2026-05-12) v0.4 · gui/sidebar-team · shipped · note: Team Skills section collapse — 단일 "스킬 매트릭스 →" nav-row + N count badge (T-P4-098).
- (2026-05-12) v0.4 · gui/sidebar-uniform · shipped · note: VersionRow 2-token + Phase popover 제거 + close badge Phase pill style / TeamPanel Personas inline + Skills/Wiki nav row (team-wiki) / Workflow → main pane (workflow-settings) (T-P4-099).
- (2026-05-12) v0.4 · gui/resizable-panes · shipped · note: Side section + PO Chat width drag-resize (4px handle) (T-P4-100).
- (2026-05-13) v0.4 · gui/v1-tab · scope-change · note: v1 tab = TicketDashboardView reuse (T-P4-097 §2(a) revision) — VersionHistoryView isCurrentVersion kanban 분기 제거 (~322 line ↓) (T-P4-102).
- (2026-05-13) v0.4 · gui/onboarding-cleanup · shipped · note: onboarding:clearLocalStorage IPC + OS-aware path + Persona role label 갱신 (designer "Plan, Design" / QA "Test, Validation") (T-P4-103).
- (2026-05-14) v0.4 · doctrine/chunking-enforcement · shipped · note: po-instructions Hard rules + pre-chunking-warn.sh PreToolUse hook + delegation cross-ref (ceiling=2) — T-P4-099 3x 위반 cycle 학습 (T-P4-104; T-P4-108 fix-forward).
- (2026-05-14) v0.4 · gui/workspace-shell-routing · shipped · note: WorkspaceShell mount + tickets icon 둘 다 current_version 라우팅 — fresh project no-op (T-P4-105).
- (2026-05-14) v0.4 · init/bootstrap-doctrine · shipped · note: productune init 이 user-global doctrine 자동 설치 — po-instructions hash compare + po-memory absolute no-overwrite + sections/ idempotent seed + --skip-doctrine escape (T-P4-106; T-P4-109 fix-forward shell handler).
- (2026-05-14) v0.4 · doctrine/model-effort-defaults · shipped · note: Persona model/effort defaults + caveman mode 분기 (developer light / planner natural / persona간 caveman lite) + Designer plan §QA scope 의무 + PO reject gate (T-P4-107).
- (2026-05-15) v0.4 · gui/ipc-subscription-uplift · shipped · note: FreshComposer → PO 응답 race fix — IPC subscription = store/poEvents.ts 모듈 top-level 1회 register (component lifecycle race 영구 차단 anchor) (T-P4-119).
- (2026-05-15) v0.4 · doctrine/alternative-reporting · shipped · note: N≥2 alternative 보고 mandatory format (Pros + Cons + anchor citation [<axis>] + vague-descriptor blacklist) — UKS grounding 의무화 (T-P4-120).
- (2026-05-18) v0.4 · doctrine/wiki-write-architecture · scope-change · note: persona MCP graphiti 도구 (write + read 일괄) 제거 + agent frontmatter graphiti 항목 제거. wiki write 유일 경로 = PO `claude --print` (no --agent) subprocess. 4-layer root cause (env / claude mcp add / hyphen / subagent non-inheritance) documented (T-P4-121).
- (2026-05-18) v0.4 · install/graphiti-provider · shipped · note: ollama 기기 성능 감지 + 모델 추천 + `claude mcp add` 자동화 — T-P4-121 layer 1+2 영구 차단 (T-P4-125).
- (2026-05-19) v0.4 · doctrine/md-optimization · shipped · note: 13 main file ≤86 non-empty line + 17 sub-file (_formats/ 8 + _details/ 9) + bootstrap-doctrine recursive sweep + Korean→English (verbatim user-phrase 2 line preserved) + token ~30-40% 절감 (T-P4-126; cap residual T-P4-142 후속).
- (2026-05-19) v0.4 · gui/skill-matrix-dynamic · shipped · note: SKILLS_TOTAL 동적 + SkillMatrix sort + PO modelSummary opus/xhigh 통일 (T-P4-137).
- (2026-05-19) v0.4 · gui/ticket-status-i18n · shipped · note: workspace.tickets.status.<status> + defaultValue fallback — TicketDashboardView + VersionHistoryView 단일 소스 (T-P4-138).
- (2026-05-19) v0.4 · gui/phase-gate-ui · dropped · note: PhaseStrip + LeftSidebar PHASE strip 제거 (dogfood "정신없다" feedback) — doctrine 5단 phase 보존, GUI 시각화는 implicit transition + Approve CTA 로 단순화 (T-P4-139).
- (2026-05-19) v0.4 · gui/team-panel-mcp · shipped · note: TeamPanel MCP nav-row + 3-tier mcp IPC (local / project / productune) + Wiki Memory persona-style row (T-P4-140; D-1 misread → rollback dispatch).
- (2026-05-19) v0.4 · gui/skill-matrix-header · shipped · note: PERSONA_INITIALS pill 통일 (PO/Des/Dev/QA) + width 40→52 + persona role 한국어 정리 (T-P4-127).
- (2026-05-19) v0.4 · gui/info-popover · shipped · note: InfoPopover 공통 컴포넌트 shared/ 추출 — SkillMatrix inline 55줄 제거 + 4 field 적용 (T-P4-128).
- (2026-05-20) v0.4 · doctrine/persona-activity · shipped · note: PA row PO-only enforcement — developer + QA 6 variant prohibition + tickets.md L97 강조 + persona `notes` 필드 변환 패턴 (T-P4-141).
- (2026-05-20) v0.4 · doctrine/cap-cleanup · shipped · note: 4 over-cap main doctrine ≤100 line cleanup (blank-line 제거 — routing.md; sub-file 추출 — lifecycle/prd-and-output/tickets.md) (T-P4-142).
- (2026-05-20) v0.4 · skill-matrix/persona-mapping · shipped · note: inferPersonasFromPath `phuryn/pm-* → [po, designer]` blanket → 8 specific group/skill override + blanket fallback (T-P4-143).
- (2026-05-20) v0.4 · close-prep/misc-bugs · shipped · note: MCP "확인 중" 무기한 badge 제거 + Kanban card 너비 column 초과 fix (T-P4-144).
- (2026-05-20) v0.4 · close-prep/sidebar-ux · shipped · note: 4-bug 묶음 — 지정없음 hide + 현재 버전 카드 ChevronRight/hover border + Persona row → PersonaDefTab + Wiki sub-row distinct tabs (T-P4-145).
- (2026-05-20) v0.4 · close-prep/round9-dogfood · deferred · note: T-P4-091/T-P4-092 closing — Round 9 full-cycle 비-개발자 dogfood (13 AC evidence 수집) v0.5 carry.
- (2026-05-20) v0.4 · round5/design-gate-viewer · deferred · note: T-P4-050~055 (Mermaid + Excalidraw + design system md + hi-fi mockup preview) v0.5 carry — 가설 후보 #2.
- (2026-05-20) v0.4 · round6/dev-env-automation · deferred · note: T-P4-060~064 (node-pty + shell status + 외부 service setup 가이드 TTL 24h SWR + 오프라인 fallback) v0.5 carry — 가설 후보 #3.
- (2026-05-20) v0.4 · round7/memory-wiki-editor · deferred · note: T-P4-070~072 (3-tier 메모리 브라우저 + Monaco markdown + 페르소나 즉시 반영) v0.5 carry — 사용자 우선순위 가설 #1.
- (2026-05-20) v0.4 · round8/deploy-abstraction · deferred · note: T-P4-080~082 (DeployProvider interface + Vercel full impl + 추후 provider 회색) v0.5 carry — T-P4-022 3rd deploy 까지만 land.
- (2026-05-20) v0.4 · ux-audit/design-system-1.5 · deferred · note: T-P4-069 (§1.5 UX principles audit — 기존 컴포넌트 × 5 sub-rule matrix + critical/minor 분류) v0.5 carry.
- (2026-05-20) v0.4 · skills/designer-author-skill · deferred · note: T-P4-124 OQ-K G1 candidate (design-system / wireframe / mockup author skill) — mattpocock/design-an-interface drop 후 self-author 별도 ticket v0.5 carry.
- (2026-05-21) v0.4 · project-structure/artifacts-version-grouping · scope-change · note: T-P4-153 amend — docs/artifacts/<version>/<ticket>/ 구조 확정 (flat → version-bucket); Phase B multi-step git mv; Phase C 2-pass sed; Phase F designer path rule doctrine 신설.
- (2026-05-21) v0.4 · doctrine/session-lifecycle · shipped · note: Per-ticket fresh / per-turn resume — ticket close 시 session drop, 다음 dispatch always fresh, 동일 ticket 내 multi-turn 만 resume. 5-ticket batch $8.6→$2.5 (~70%) 절감 목표 (T-P4-149).
- (2026-05-21) v0.4 · doctrine/persona-output-json-only · shipped · note: 9 persona variant + 3 doctrine + 3 mirror — JSON-only stdout (first char `{`), summary ≤200 + user_surface ≤500 신설. ~80% output-token 절감 (T-P4-150).
- (2026-05-21) v0.4 · doctrine/po-state-hygiene · shipped · note: H1 past_tickets prune + H2 recent_turns cap=5 + H3 pending_gate staleness — turn-start enforcement. productune po-state 9.4KB→5.6KB 1회 청소 (T-P4-151; T-P4-157 후속 generalization).
- (2026-05-21) v0.4 · doctrine/agent-compress · shipped · note: 9 persona variant ≤100줄 + `_details/` sub-file 2개 추출 — cache_creation 30-40% 절감 ($0.375→$0.25). output 32K cap 위반 2회 후 1-file 단위 chunk 패턴 확립 (T-P4-152).
- (2026-05-21) v0.4 · gui/main-ts-split · shipped · note: main.ts 2009→197 줄 + 13 electron/ipc/* module 추출 — 1 dispatch 일발 통과. maintainability stretch A1 (T-P4-154).
- (2026-05-21) v0.4 · gui/onboarding-split · shipped · note: OnboardingWizard 1099→422 줄 + 12 file (step/helper) — maintainability stretch A2 (T-P4-155).
- (2026-05-21) v0.4 · gui/view-subcomponent-split · shipped · note: VersionHistoryView 932→50 + WorkspaceShell 865→192 + 15 file — maintainability stretch A3 (T-P4-156).
- (2026-05-21) v0.4 · doctrine/artifact-flat-naming · scope-change · note: T-P4-153 amend — sub-folder → 3-category flat-naming (ticket / version-loose / global). po-state hygiene H1/H2/H3 → 단일 staleness sweep (5 field) generalization (T-P4-157).
- (2026-05-21) v0.4 · gui/pending-gate-chip · shipped · note: PendingGateChip option a 구현 — Phase gate 후속 UX (T-P4-139 implicit transition 보완) (T-P4-158).
- (2026-05-21) v0.4 · doctrine/phase-2-3-flow · shipped · note: Phase 2 = 2-step (static artifacts → Gate A → interactive code via `anthropic/frontend-design` skill → Gate B) + Phase 3 Build close 3-item gate (디자인 요소 / 보안 6-prompt / PRD AC) + designer agent skill equip (graphiti/keeper/fs 3 variant 동기화) (T-P4-159).
- (2026-05-21) v0.4 · phase5-unlock/mcp-add · deferred · note: T-P4-146 — MCP 서버 추가 + name rename 활성화 (Phase 5 deferral unlock 1/3). v1.0 carry — `mcp:save` IPC L2.
- (2026-05-21) v0.4 · phase5-unlock/autosave-triggers · deferred · note: T-P4-147 — autosaveTriggers UI 활성화 (Phase 5 deferral unlock 2/3). v1.0 carry — WorkflowRulesPanel phase5Lock 해제 + IPC + i18n.
- (2026-05-21) v0.4 · phase5-unlock/persona-def-edit · deferred · note: T-P4-148 — PersonaDefTab persona spec 편집 활성화 (Phase 5 deferral unlock 3/3). v1.0 carry — frontmatter edit + skills assignment + i18n.
- (2026-05-21) v0.4 · outcome/north-star · shipped · note: 4 sidebar tab schema-driven 달성 (Project/Team/Workflow/Versions all real po-state). Phase gate banner metric은 T-P4-139 scope-change (implicit transition + PendingGateChip 으로 대체). 부수 산출물 8 doctrine landing (meta-dogfooding 성공).

### v0.5 (closed 2026-06-25)

- (2026-05-26) v0.5 · doctrine/4-tier-redesign · shipped · note: doctrine 구조 재설계 — Tier0 `packages/core/doctrine/` · Tier1 `docs/<persona>/` · Tier2 `~/.productune/<persona>/` 4-tier 신축, wiki(graphiti) 폐기, 첫 8h unattended dispatch 사례.
- (2026-06-01) v0.5 · gui/pds-see-layer · shipped · note: PDS See layer — A2 artifacts viewer / A6 QuickOpenPalette(6 카테고리 fixed section order) / A7 ticket-detail single `ticket-open{id}` intent + DispatchProgress read-only. md render = named recipe set(`md-*`) v0.4 토큰 재사용 (T-002~006/009).
- (2026-06-01) v0.5 · brand/persona-hue-separation · shipped · note: GUI brand orange `#FF6B2B` → CLI purple `#8B5CF6`; PO=violet 독점, 4 persona hue-separated(violet/orange/sky/emerald), designer=`#FB923C`(Orange 400) net-new hue 0. WCAG AAA. OQ-3 RESOLVED (T-006).
- (2026-06-02) v0.5 · gui/ipc-security · shipped · note: artifacts:readFile / tickets:read path-traversal 가드 누락 fix — extension whitelist만으론 부족, `startsWith(root)` 추가. B1 GUI↔doctrine write-path 1:1 sync + B2 skill 2-layer (T-014/016/017/018).
- (2026-06-08) v0.5 · gui/iframe-keyboard-routing · scope-change · note: Electron OOPIF sandboxed-iframe는 menu accelerator만 도달(before-input-event·renderer window-keydown 둘 다 miss) — app shortcut 전부 menu accelerator로 라우팅. webview find는 main-process `webContents.findInPage`로 구동(DOM find API 이 빌드서 unreliable) (T-PATCH-066/067).
- (2026-06-09) v0.5 · gui/dogfood-patch-batch · shipped · note: dogfood 피드백 다수 라운드 patch(076~133 등) — artifact auto-surface gating, AskUserQuestion bottom-sheet, browser shortcuts 4종, CLI 산출물 경로-reveal, board QA컬럼 병합 등. headless Electron QA 불가 → dev self-verify+build+shawn hands-on 패턴 확립.
- (2026-06-10) v0.5 · gui/notifications-tray · shipped · note: B3 OS notification(dispatch-done/escalation/phase-gate) + close-to-tray(mac-only first cut). launch warm-up notification 불가(Electron `.show()` always surfaces) → 명시적 Test 버튼으로 대체. macOS 알림 권한은 stock Electron서 read 불가(native addon deferred) (T-PATCH-089/090).
- (2026-06-12) v0.5 · doctrine/data-display-3layer · shipped · note: status enum mismatch 진단 교훈 — 데이터-표시 버그는 read(파서/synonym)·write(가드 채널)·doctrine(쓰기규칙) 3층 분리 추적, prose 수정만으로 "고쳤다" 단정 금지. ux-principles §13 Pretendard UI-text rule 신설 (T-PATCH-128/129/137/138).
- (2026-06-17) v0.5 · doctrine/cli-path-reveal · shipped · note: "자동 폴더 열기" ad-hoc 동작 첫 정착(훅·doctrine·persona 전부 음성이던 것) — Tier0 common doctrine. GUI 감지는 `[ -t 1 ]`(TTY) 금지(에이전트 Bash stdout=하네스 파이프=NOT-TTY), `launchctl managername == Aqua` 게이트 (T-PATCH-195).
- (2026-06-18) v0.5 · doctrine/anti-default-design-discipline · shipped · note: 밤티 design discipline — Tier0 designer+qa habit + bookshelf×2 + P3 close-gate에 aesthetic 축 신설. close-gate no-waiver 기준 변경 = loss-risk → grill 필수 (T-PATCH-211/212).
- (2026-06-18) v0.5 · doctrine/discretionary-gate-removal · shipped · note: 메타 교훈 무조건부化 — 194("additive≠safe")→211/212→215 3연속 grill-skip 재발. **doctrine 편집(Tier0/Tier1) default=grill, "순수 add" self-verify 숏컷 전폐.** 반복 실패 행동은 재량 게이트를 unconditional로 (T-PATCH-215).
- (2026-06-22) v0.5 · doctrine/ui-driven-state-strict · shipped · note: UI-구동 state strict — version-open jq 신설, load-bearing 게이트 훅(pre-frontmatter-lint 등)은 dev self-test green이어도 독립 qa GRILL 필수(false-block+false-negative 양방향). legacy type enum 196파일 9-canon 마이그(UTF-8-safe Python; BSD awk 한글 multibyte 손상) (T-PATCH-224/233/237).
- (2026-06-23) v0.5 · doctrine/cua-verify-tier2 · scope-change · note: cua 검증 doctrine Tier1→Tier2 FULL-REMOVE — meta-repo Tier1은 productune 자기작업 시만 읽힘(타프로젝트는 자기 docs/), cua=개인 인프라라 Tier0 누수 금지. Tier 분류 논거 "committed=공유"는 *누가 실제로 그 Tier를 읽나* 먼저 확인 (T-PATCH-232).
- (2026-06-23) v0.5 · deploy/dmg-team-deploy · shipped · note: unsigned arm64 .dmg 팀 배포 + cua-VM clean-install 검증 + post-deploy app-smoke 7/7 PASS(온보딩·엔진 라운드트립). GUI 온보딩 claude hooks/statusLine 미설치 갭 fix(dmg 사용자 enforcement 훅 보장, north-star 터미널-0 정합) (T-PATCH-246).
- (2026-06-24) v0.5 · gui/quitguard-toast-app-level · shipped · note: Cmd+Q quit-guard 안내 토스트를 App.tsx 최상위 단일 마운트(HomeView·온보딩·워크스페이스 전 화면 노출, 이중 마운트 금지). 5차 dmg 라이브 발견 → 6차 dmg 필요 (T-PATCH-254).
- (2026-06-24) v0.5 · gui/first-turn-reply-race · shipped · note: 첫 턴 PO 응답 유실 race fix — mount 시 chat.json 디스크 리로드가 스트리밍 placeholder 덮어쓰기. 4곳 가드(FreshComposer 시딩·setProject else 보존·ChatPanel+LeftSidebar in-flight). tray `{}` invisible fix. playwright-electron 클린빌드 재현 (T-PATCH-256/257).
- (2026-06-25) v0.5 · close/silent-tool-failure-carry · deferred · note: T-PATCH-255 — PO 턴 tool 실패(macOS TCC Downloads/Desktop/Documents 거부)가 무응답·무안내 silent 종료. 5차 dmg cua 재현 확정(Allow→정상, 거부→응답텍스트 없이 즉시종료). v0.5 미착수 → v0.6 carry, backlog `## next-version` [v0.6] 등재.
- (2026-06-25) v0.5 · outcome/north-star · deferred · note: north-star = **observed 비-개발자 full-cycle(PRD→Close) GUI-only dogfood** + 14-AC 체크. v0.5는 cycle을 *가능케 하는* 인프라(4-region shell·PDS See layer·14-item scope·dmg 배포·cua clean-install)를 shipped했으나 cycle 완주 관찰 자체는 미실시(빌드 막 배포, 6차 dmg pending). **LAZY: observed_result=null** — v0.6 P1이 carried Round9 dogfood로 chase.
