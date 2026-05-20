# Feature history

Per-Version log of feature decisions / scope choices / deferrals.
Read at Phase 1 PRD authoring; appended by Designer at Phase 5 Version close.

## Schema

- (YYYY-MM-DD) <version> · <area-tag> · <decision-type> · note: <one-line>

decision-type ∈ `shipped | deferred | dropped | scope-change`.
area-tag = `<feature>/<sub-area>` (matches QA convention).

## Entries

### v0.4-meta-dogfood (closed 2026-05-20)

- (2026-04-30) v0.4-meta-dogfood · gui/main-split-pane · shipped · note: VS Code + cmux 패러다임 — 재귀 hbox/vbox 트리 + 10 tab type dispatcher + drag-drop + ⌘\\/⌘W (T-P4-046).
- (2026-05-07) v0.4-meta-dogfood · gui/persona-presence · shipped · note: Right Panel PO Chat 24px presence strip — 4 persona × 3 state (idle/working/done) (T-P4-049).
- (2026-05-07) v0.4-meta-dogfood · gui/i18n · shipped · note: English / 한글 toggle — onboarding Step 0 + Settings Language sub-tab + 9 컴포넌트 i18n + react-i18next (T-P4-056).
- (2026-05-07) v0.4-meta-dogfood · gui/i18n-linter · shipped · note: locale protected-token linter BSD `grep -P` no-op fix (bash + perl PCRE) + 보호어 6 분류 baseline (T-P4-057).
- (2026-05-07) v0.4-meta-dogfood · init/openfolder-hygiene · shipped · note: settings.local.json foreign-user detect + backup + `.gitignore` 자동 + detectProductuneLayout 3-kind + 모달 contrast AAA (T-P4-058).
- (2026-05-07) v0.4-meta-dogfood · gui/po-session-health · shipped · note: PO session health 6-state surface (StatusBar + sticky banner + FAB badge) + Restart/Retry/View log CTA (T-P4-059).
- (2026-05-08) v0.4-meta-dogfood · doctrine/phase-5단-통일 · shipped · note: PRD/Design/Build/Deploy/Close 통일 + StageStrip 5단 + ticket stage→type rename + ChatPanel selector 제거 + po-state past_tickets[] 제거 + ticket md = SoT (T-P4-065).
- (2026-05-08) v0.4-meta-dogfood · doctrine/promotion-lifecycle · shipped · note: pending_promotions[] schema 11 sub-keys + drain Step 1b (Cap 5/turn · 7-day stale-drop) + retrospective archive read source 5종 (T-P4-066).
- (2026-05-08) v0.4-meta-dogfood · gui/ux-feedback · shipped · note: ChatPanel restart visual feedback — §1.5.4 anti-pattern fix (T-P4-067).
- (2026-05-08) v0.4-meta-dogfood · gui/background-task-monitor · shipped · note: PresenceBar count badge + StatusBar BackgroundTaskSegment + StatusBar height 28→36px (동시 sub-agent visibility) (T-P4-068).
- (2026-05-08) v0.4-meta-dogfood · doctrine/po-state-past-tickets · dropped · note: past_tickets[] (cap 50) 통째 제거 — ticket md = SoT + useTicketScan hook GUI 대체 (T-P4-065 sub-area f).
- (2026-05-06) v0.4-meta-dogfood · gui/multi-chatroom · dropped · note: GUI 단일 PO 세션 채택 — multi-chatroom 모델 폐기, T-P4-042 deprecated, T-P4-041 흡수 (CLI/non-GUI multi-session 가능성만 보존).
- (2026-05-12) v0.4-meta-dogfood · doctrine/version-naming · shipped · note: shared validator + Wizard validator + PO doctrine + Ticket lint + Migration script (paepyeong v1 migration applied) (T-P4-095).
- (2026-05-12) v0.4-meta-dogfood · gui/usermode-default · shipped · note: UserMode default null → planner + Settings General i18n parity (settings.tabGeneral + settings.general.userMode.*) (T-P4-096).
- (2026-05-12) v0.4-meta-dogfood · gui/sidebar-versions · shipped · note: Project side panel 2-section split (현재 버전 + 지난 버전), current → ticket-review tab, past → version-history tab, v1 default 시드 (T-P4-097).
- (2026-05-12) v0.4-meta-dogfood · gui/sidebar-team · shipped · note: Team Skills section collapse — 단일 "스킬 매트릭스 →" nav-row + N count badge (T-P4-098).
- (2026-05-12) v0.4-meta-dogfood · gui/sidebar-uniform · shipped · note: VersionRow 2-token + Phase popover 제거 + close badge Phase pill style / TeamPanel Personas inline + Skills/Wiki nav row (team-wiki) / Workflow → main pane (workflow-settings) (T-P4-099).
- (2026-05-12) v0.4-meta-dogfood · gui/resizable-panes · shipped · note: Side section + PO Chat width drag-resize (4px handle) (T-P4-100).
- (2026-05-13) v0.4-meta-dogfood · gui/v1-tab · scope-change · note: v1 tab = TicketDashboardView reuse (T-P4-097 §2(a) revision) — VersionHistoryView isCurrentVersion kanban 분기 제거 (~322 line ↓) (T-P4-102).
- (2026-05-13) v0.4-meta-dogfood · gui/onboarding-cleanup · shipped · note: onboarding:clearLocalStorage IPC + OS-aware path + Persona role label 갱신 (designer "Plan, Design" / QA "Test, Validation") (T-P4-103).
- (2026-05-14) v0.4-meta-dogfood · doctrine/chunking-enforcement · shipped · note: po-instructions Hard rules + pre-chunking-warn.sh PreToolUse hook + delegation cross-ref (ceiling=2) — T-P4-099 3x 위반 cycle 학습 (T-P4-104; T-P4-108 fix-forward).
- (2026-05-14) v0.4-meta-dogfood · gui/workspace-shell-routing · shipped · note: WorkspaceShell mount + tickets icon 둘 다 current_version 라우팅 — fresh project no-op (T-P4-105).
- (2026-05-14) v0.4-meta-dogfood · init/bootstrap-doctrine · shipped · note: productune init 이 user-global doctrine 자동 설치 — po-instructions hash compare + po-memory absolute no-overwrite + sections/ idempotent seed + --skip-doctrine escape (T-P4-106; T-P4-109 fix-forward shell handler).
- (2026-05-14) v0.4-meta-dogfood · doctrine/model-effort-defaults · shipped · note: Persona model/effort defaults + caveman mode 분기 (developer light / planner natural / persona간 caveman lite) + Designer plan §QA scope 의무 + PO reject gate (T-P4-107).
- (2026-05-15) v0.4-meta-dogfood · gui/ipc-subscription-uplift · shipped · note: FreshComposer → PO 응답 race fix — IPC subscription = store/poEvents.ts 모듈 top-level 1회 register (component lifecycle race 영구 차단 anchor) (T-P4-119).
- (2026-05-15) v0.4-meta-dogfood · doctrine/alternative-reporting · shipped · note: N≥2 alternative 보고 mandatory format (Pros + Cons + anchor citation [<axis>] + vague-descriptor blacklist) — UKS grounding 의무화 (T-P4-120).
- (2026-05-18) v0.4-meta-dogfood · doctrine/wiki-write-architecture · scope-change · note: persona MCP graphiti 도구 (write + read 일괄) 제거 + agent frontmatter graphiti 항목 제거. wiki write 유일 경로 = PO `claude --print` (no --agent) subprocess. 4-layer root cause (env / claude mcp add / hyphen / subagent non-inheritance) documented (T-P4-121).
- (2026-05-18) v0.4-meta-dogfood · install/graphiti-provider · shipped · note: ollama 기기 성능 감지 + 모델 추천 + `claude mcp add` 자동화 — T-P4-121 layer 1+2 영구 차단 (T-P4-125).
- (2026-05-19) v0.4-meta-dogfood · doctrine/md-optimization · shipped · note: 13 main file ≤86 non-empty line + 17 sub-file (_formats/ 8 + _details/ 9) + bootstrap-doctrine recursive sweep + Korean→English (verbatim user-phrase 2 line preserved) + token ~30-40% 절감 (T-P4-126; cap residual T-P4-142 후속).
- (2026-05-19) v0.4-meta-dogfood · gui/skill-matrix-dynamic · shipped · note: SKILLS_TOTAL 동적 + SkillMatrix sort + PO modelSummary opus/xhigh 통일 (T-P4-137).
- (2026-05-19) v0.4-meta-dogfood · gui/ticket-status-i18n · shipped · note: workspace.tickets.status.<status> + defaultValue fallback — TicketDashboardView + VersionHistoryView 단일 소스 (T-P4-138).
- (2026-05-19) v0.4-meta-dogfood · gui/phase-gate-ui · dropped · note: PhaseStrip + LeftSidebar PHASE strip 제거 (dogfood "정신없다" feedback) — doctrine 5단 phase 보존, GUI 시각화는 implicit transition + Approve CTA 로 단순화 (T-P4-139).
- (2026-05-19) v0.4-meta-dogfood · gui/team-panel-mcp · shipped · note: TeamPanel MCP nav-row + 3-tier mcp IPC (local / project / productune) + Wiki Memory persona-style row (T-P4-140; D-1 misread → rollback dispatch).
- (2026-05-19) v0.4-meta-dogfood · gui/skill-matrix-header · shipped · note: PERSONA_INITIALS pill 통일 (PO/Des/Dev/QA) + width 40→52 + persona role 한국어 정리 (T-P4-127).
- (2026-05-19) v0.4-meta-dogfood · gui/info-popover · shipped · note: InfoPopover 공통 컴포넌트 shared/ 추출 — SkillMatrix inline 55줄 제거 + 4 field 적용 (T-P4-128).
- (2026-05-20) v0.4-meta-dogfood · doctrine/persona-activity · shipped · note: PA row PO-only enforcement — developer + QA 6 variant prohibition + tickets.md L97 강조 + persona `notes` 필드 변환 패턴 (T-P4-141).
- (2026-05-20) v0.4-meta-dogfood · doctrine/cap-cleanup · shipped · note: 4 over-cap main doctrine ≤100 line cleanup (blank-line 제거 — routing.md; sub-file 추출 — lifecycle/prd-and-output/tickets.md) (T-P4-142).
- (2026-05-20) v0.4-meta-dogfood · skill-matrix/persona-mapping · shipped · note: inferPersonasFromPath `phuryn/pm-* → [po, designer]` blanket → 8 specific group/skill override + blanket fallback (T-P4-143).
- (2026-05-20) v0.4-meta-dogfood · close-prep/misc-bugs · shipped · note: MCP "확인 중" 무기한 badge 제거 + Kanban card 너비 column 초과 fix (T-P4-144).
- (2026-05-20) v0.4-meta-dogfood · close-prep/sidebar-ux · shipped · note: 4-bug 묶음 — 지정없음 hide + 현재 버전 카드 ChevronRight/hover border + Persona row → PersonaDefTab + Wiki sub-row distinct tabs (T-P4-145).
- (2026-05-20) v0.4-meta-dogfood · close-prep/round9-dogfood · deferred · note: T-P4-091/T-P4-092 closing — Round 9 full-cycle 비-개발자 dogfood (13 AC evidence 수집) v0.5 carry.
- (2026-05-20) v0.4-meta-dogfood · round5/design-gate-viewer · deferred · note: T-P4-050~055 (Mermaid + Excalidraw + design system md + hi-fi mockup preview) v0.5 carry — 가설 후보 #2.
- (2026-05-20) v0.4-meta-dogfood · round6/dev-env-automation · deferred · note: T-P4-060~064 (node-pty + shell status + 외부 service setup 가이드 TTL 24h SWR + 오프라인 fallback) v0.5 carry — 가설 후보 #3.
- (2026-05-20) v0.4-meta-dogfood · round7/memory-wiki-editor · deferred · note: T-P4-070~072 (3-tier 메모리 브라우저 + Monaco markdown + 페르소나 즉시 반영) v0.5 carry — 사용자 우선순위 가설 #1.
- (2026-05-20) v0.4-meta-dogfood · round8/deploy-abstraction · deferred · note: T-P4-080~082 (DeployProvider interface + Vercel full impl + 추후 provider 회색) v0.5 carry — T-P4-022 3rd deploy 까지만 land.
- (2026-05-20) v0.4-meta-dogfood · ux-audit/design-system-1.5 · deferred · note: T-P4-069 (§1.5 UX principles audit — 기존 컴포넌트 × 5 sub-rule matrix + critical/minor 분류) v0.5 carry.
- (2026-05-20) v0.4-meta-dogfood · skills/designer-author-skill · deferred · note: T-P4-124 OQ-K G1 candidate (design-system / wireframe / mockup author skill) — mattpocock/design-an-interface drop 후 self-author 별도 ticket v0.5 carry.

