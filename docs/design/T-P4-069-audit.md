---
doc: T-P4-069 audit
owner: pdt-designer
status: draft
round: phase4-r4-fix
date: 2026-05-08
ticket: T-P4-069
doctrine_ref: docs/design/design-system.md §1.5 + §7 + §8
scope: packages/gui/src/components/**/*.tsx — landed components only
out_of_scope:
  - 컴포넌트 wrapper 라이브러리화 (R5)
  - PR template 강제 (§1.5 OQ-6)
  - doctrine 변경 (§1.5 그대로)
  - ESLint custom rule (R5)
related_tickets:
  - T-P4-069  # 본 audit
  - T-P4-058  # modal surface
  - T-P4-059  # SessionHealthBanner
  - T-P4-046  # split-pane / Empty pane
---

# T-P4-069 — Design system §1.5 UX principles audit

> 본 audit 은 **read-only doctrine 정합 검토** — 코드 변경 X. critical violation
> 별 fix ticket 후보를 §5 에 enumerate, PO 가 별 ticket 발행.

scope: 시간 budget 안에서 사용자 가시 critical 컴포넌트 우선. 일부 (HomeView /
OnboardingWizard 등) 는 파일 위치 미확인 또는 quick-scan 만 — §3 / §4 표기.

---

## §1 Audit matrix

5 sub-rule (§1.5.1–§1.5.5):
- **2-1** = Few Things Per Page
- **2-2** = 익숙한 경험
- **3-1** = Predictability
- **3-2** = Feedback
- **3-3** = Escape

기호: ✅ pass / ⚠ minor / ❌ violation

| 컴포넌트 | 2-1 Few | 2-2 익숙 | 3-1 Predict | 3-2 Feedback | 3-3 Escape |
|---|---|---|---|---|---|
| ChatPanel | ✅ 5-row 단순 | ✅ IDE chat 패턴 | ⚠ ctxRow `#1f2a3a` token 미정합 | ❌ restart click feedback 0 | ✅ minimize FAB 복원 |
| RestartSessionModal | ⚠ CTA 3 (primary+sec+ghost) — 한 줄 | ✅ 한국어 본문 | ⚠ Cancel 좌측 not 우측 (§8.5 위반) | ⚠ "Restart now" busy 라벨 → spinner 미사용 | ✅ Cancel 명시 |
| SessionHealthBanner | ✅ msg+CTA+dismiss | ✅ 친근 톤 | ✅ banner 패턴 일관 | ✅ slide-in + role=alert | ⚠ dismiss `×` 만 — Esc 미지원 |
| SessionHealthSegment | ✅ inline chip | ✅ status pill 패턴 | ✅ token (`#38BDF8` 등) 정합 | ✅ icon + 색 변화 | n/a (passive seg) |
| PendingPromotionDrain | ⚠ row 3 CTA (Save/Edit/Skip) | ✅ ticket 패턴 | ✅ toast feedback 패턴 일관 | ✅ toast ok/err | ⚠ bulk input Esc 미정의 |
| PhaseStrip | ✅ 1-dot default → hover expand | ✅ progressive disclosure 정합 | ⚠ stage hex `#1f2a3a` (§2 token 외) | ✅ hover 전환 | n/a (passive) |
| PhaseBreadcrumb | ✅ flat | ✅ breadcrumb 익숙 | ✅ stage-prd 색 일관 | n/a (passive) | n/a (passive) |
| PersonaPresenceBar | ✅ 4 persona row | ✅ presence chip 익숙 | ✅ persona-blink 정합 | ✅ working dot blink | ✅ done click 외부 dismiss |
| MainPanel | ✅ pane tree only | ✅ IDE 멀티 pane | ✅ gate sticky | n/a | n/a |
| LeafPane | ⚠ active border `#FF6B2B66` 알파 hardcode | ✅ split-pane 명시 act | ✅ DnD overlay 일관 | ✅ DnD hint 즉시 visual | ✅ tab close X |
| TabBar | ✅ active+close | ✅ tab 익숙 | ✅ tab underline `--accent` 정합 | ✅ TooltipButton hover | ✅ ⌘W close |
| EmptyPane | ✅ kbd 4 hint | ✅ VSCode welcome 익숙 | ❌ §8.9 Empty pane recipe 미정합 — primary CTA 없음 | n/a | ✅ kbd 자체 출구 |
| QuickOpenPalette | ✅ 입력+리스트 | ✅ Cmd+P 익숙 | ✅ token 정합 (footer 주석에서 token 참조) | ✅ Empty state msg | ✅ Esc + overlay click |
| ContextMenu | ✅ 메뉴 단일 | ✅ context menu 익숙 | ⚠ hex hardcode (`#1c1c1c` `#333`) | ✅ hover bg 변화 | ✅ Esc + outside click |
| PoFab | ✅ 단일 button | ✅ FAB 패턴 | ✅ health badge 색 정합 | ✅ pulse/blink/static | ✅ click 으로 ChatPanel 복원 |
| MessageBubble | ✅ row | ✅ chat bubble 익숙 | ✅ persona color 정합 | ✅ streaming cursor blink | n/a (passive) |
| StatusBar | ✅ 2 cluster | ✅ statusbar 익숙 | ⚠ `#5A5A5A` (§2.3 외) | ✅ SessionHealthSegment 위임 | n/a |
| SettingsView | ✅ 2 sub-tab | ✅ settings tab 익숙 | ⚠ `#1E2A3A` 활성 bg (token 외) | ✅ tab active 변화 | n/a (관통 view) |
| WorkflowRulesPanel | ✅ flat field 목록 | ✅ form 익숙 | ⚠ envChip `#1F3A5F` hardcode | ✅ saveSuccess banner + retry | ⚠ Phase 5 lock 라벨 — disabled 만, hint 부재 |
| ExplorerPane | ✅ tree+icon 2 act | ✅ VSCode explorer | ✅ icon stroke 2 정합 | ✅ refresh icon click | n/a |
| TeamPanel | ✅ section 3 fold | ✅ section list | ❌ §7.1 컬러 emoji 사용 (`🧠` `📚` `🗄️` `📌` `⚙️`) | ✅ hover bg | n/a |

**합계 (사용자 가시 직접 영향)**:
- ❌ critical violation: **3**
- ⚠ minor: **11**
- ✅ pass: 다수

---

## §2 Critical violation list

사용자 가시 직접 영향. 즉시 fix ticket 후보.

### C-1. ChatPanel restart button — §1.5.4 Feedback ❌

- **위치**: `packages/gui/src/components/workspace/ChatPanel.tsx` `onRestartClick`
  + RestartSessionModal `handleRestartNow`.
- **사유**: 사용자가 "Restart now" 클릭 → `api.poRestartSession` IPC 호출 + modal
  닫힘 + `setClaudeSessionId(null)` + `clearHealth()` 실행. 그러나 ChatPanel 본문
  의 message 영역은 변하지 않고 (history 유지), session id reset 의 trace 메시지
  도, toast 도, banner 도 노출 X. 사용자는 "재시작이 됐는지 안 됐는지" 확인 불가.
- **doctrine ref**: §1.5.4 "모든 사용자 action 은 즉시 visual feedback 받는다" +
  "task 완료 알림" + 위반 사례 1 (recent dogfood 2026-05-07 본 케이스 자체).
- **fix 권장** (단순 → 점진):
  1. RestartSessionModal `handleRestartNow` busy 단계에 inline `Loader2` spinner
     (§9.2 `pdt-spin`). 현재는 라벨만 `t('common.loading')` 으로 변경.
  2. `onClose` 직후 ChatPanel 에 trace 메시지 1 줄 inject —
     `[system] 세션이 재시작됐어요` (kind=`trace`, `--text-muted`). MessageBubble
     의 `TraceLine` 패턴 그대로.
  3. 또는 SessionHealthBanner 의 success variant 1.5s 노출 ("재시작 완료").
- **assignee 권장**: pdt-developer (impl) + pdt-qa (회귀 — restart 후 trace 보임).

### C-2. EmptyPane — §1.5.3 Predictability ❌

- **위치**: `packages/gui/src/components/workspace/main/EmptyPane.tsx`.
- **사유**: §8.9 Empty pane recipe 는 "icon + headline + 1-line description +
  **primary CTA**" 의무. 현 구현은 P logo (opacity 0.25) + title + 4 kbd hint
  만. **primary CTA button 없음**. §1.5.3 위반 사례 2 ("Empty pane 에 placeholder
  만 있고 CTA 없음 → 사용자가 막힘") 그대로.
- **doctrine ref**: §1.5.3 + §8.9.
- **fix 권장**:
  1. kbd hint 아래 `secondary` button 1 개 — `Open file` 또는 `Quick Open
     (⌘P)` 트리거. 클릭 시 QuickOpenPalette open 이벤트 dispatch.
  2. 또는 `New tab (⌘T)` 직접 액션.
  3. logo 는 그대로 유지 (decorative). title 은 `--text-secondary` 로 한 단 올리기
     권장 (§8.9 recipe 정합).
- **assignee 권장**: pdt-developer (single component, L0).

### C-3. TeamPanel — §7.1 컬러 emoji 금지 ❌

- **위치**: `packages/gui/src/components/workspace/TeamPanel.tsx` `WikiRow` 호출
  부 (lines 292–322).
- **사유**: §7.1 "컬러 emoji 금지 — accessibility / 폰트 일관성. 이모지가 필요한
  자리는 lucide 아이콘 + 색 token 으로 대체". 현재 `🧠` `📚` `🗄️` `📌` `⚙️`
  unicode escape (`\u{1F9E0}` 등) 직접 렌더 — OS 폰트별 색/크기/앤티앨리어싱 다름,
  스크린리더 발음 불안정.
- **doctrine ref**: §7.1.
- **fix 권장**: lucide 아이콘 매핑.
  - 🧠 user-memory → `Brain` (lucide)
  - ⚙️ project-state → `Cog`
  - 📌 promotion-candidates → `Pin`
  - 🗄️ wiki:fs → `Archive` 또는 `FolderOpen`
  - 📚 wiki:keeper → `Library` 또는 `BookOpen`
  - 🧠 wiki:graphiti → `Network`
  
  size `--icon-md` (16) / stroke 2 / color `--text-secondary` 또는 의미별 token.
- **assignee 권장**: pdt-developer (단순 import + 교체, L0). pdt-qa light
  (스크린샷 회귀).

---

## §3 Minor list

보강 가치 — Phase 5 또는 별 R4 patch 통합 ticket 후보.

| # | 컴포넌트 | sub-rule | 사유 (1줄) |
|---|---|---|---|
| M-1 | ChatPanel | 3-1 | `ctxRow` `#101010` / `#1f2a3a` 등 token 외 hex — §2 마이그레이션 ticket 통합 |
| M-2 | RestartSessionModal | 3-1 | footer 버튼 순서 [Restart] [Settings] [Cancel] — §8.5 [Cancel] 좌측 권장 위반 |
| M-3 | RestartSessionModal | 3-2 | busy 시 `t('common.loading')` 텍스트만 — `Loader2` spinner inline 권장 (C-1 과 묶음 OK) |
| M-4 | RestartSessionModal | 1.5.5 destructive | destructive (session 재시작 = 잠재 데이터 손실 X 지만 ctx 손실) — Esc 무효 정책 미적용. 본 modal 에 적용할지 PO 결정 (§1.5.5 destructive confirm 정책) |
| M-5 | SessionHealthBanner | 3-3 | dismiss `×` 만 노출 — Esc 키 binding 없음. PoFab badge 가 복원 경로라 OK 지만, focus 이동 후 키보드 사용자 dismiss 어려움 |
| M-6 | PendingPromotionDrain | 2-1 | row 당 [Save] [Edit] [Skip] 3 CTA — §1.5.1 "≤ 2 CTA" 위반 가능. Edit 을 menu/kebab 으로 강등하거나 hover-only 노출 권장 |
| M-7 | PendingPromotionDrain | 3-3 | bulk input Enter 만 — Esc 미정의 (현재는 input 자체 keyDown 처리 안 함). Esc → bulkInput clear 권장 |
| M-8 | LeafPane | 3-1 | active pane border `#FF6B2B66` (40% alpha) hardcode — `--accent` + `color-mix` 권장 |
| M-9 | StatusBar | 3-1 | `projectName` color `#5A5A5A` — `--text-faint` (`#707070`) 또는 `--text-muted` (`#A0A0A0`) 사용. metadata 라 `--text-muted` 권장 |
| M-10 | SettingsView | 3-1 | active tab bg `#1E2A3A` — `--accent` 12% alpha pill recipe (§8.2) 정합 권장 |
| M-11 | WorkflowRulesPanel | 1.5.5 | "Phase 5 lock" 라벨 — disabled visual 만. tooltip / hint ("Phase 5 에서 활성화" 같은) 부재. 사용자 "왜 잠겼지" 모호 |

---

## §4 OK list (정합 — 변경 X)

§1.5 5 sub-rule 정합 또는 본 round scope 외.

| 컴포넌트 | 정합 사유 (1줄) |
|---|---|
| SessionHealthSegment | StatusBar inline chip. dot+icon+label+CTA — §8.2 pill recipe 정합 |
| PhaseBreadcrumb | flat breadcrumb. active stage `--stage-prd` 색 정합 |
| PersonaPresenceBar | working dot `persona-blink` (§9.2 정합), done 외부 click dismiss (§1.5.5) |
| MainPanel | pane tree + sticky gate — §1.5.1 단일 콘텐츠 타입 정합 |
| TabBar | active underline 2px `--accent`, ⌘W close, hover tooltip — §8.3 + §1.5.5 |
| QuickOpenPalette | Cmd+P 익숙, 모든 출구 (Esc + overlay click + Enter pick), token 주석 정합 (§1.5.5 + §8.5) |
| ContextMenu | Esc + 외부 click — §1.5.5 정합 |
| PoFab | health badge 색 token 정합, ChatPanel 복원 경로 — §1.5.5 정합 |
| MessageBubble | persona color 정합, streaming `▋` cursor blink — §1.5.4 정합 |
| ExplorerPane | refresh + show-hidden 2 action만 — §1.5.1 정합 |

---

## §5 Fix ticket trigger (PO 가 발행)

본 audit 이 enumerate 만 — actual ticket 은 PO 가 발행. 권장 ticket 3 개:

### Ticket 후보 #1 — T-P4-070 (제안)

- **제목**: "ChatPanel restart visual feedback — §1.5.4 위반 fix"
- **spec 1줄**: RestartSessionModal busy 시 `Loader2` spinner + 완료 시 ChatPanel
  trace 메시지 1 줄 (`[system] 세션이 재시작됐어요`) inject. assignee=
  pdt-developer.
- **estimated_complexity**: L1 (단일 컴포넌트, 2-3 줄 변경 + i18n key 1)
- **risk**: low
- **assignee**: pdt-developer + pdt-qa (light)
- **참조**: 본 audit §2.C-1 + design-system §1.5.4 + §9.2 + §8.5 정합.

### Ticket 후보 #2 — T-P4-071 (제안)

- **제목**: "EmptyPane primary CTA 추가 — §1.5.3 / §8.9 정합"
- **spec 1줄**: kbd hint 아래 `secondary` button 1 개 (Open file 또는 ⌘P 트리거)
  + title 색 `--text-secondary` 정렬. assignee=pdt-developer.
- **estimated_complexity**: L0 (single component)
- **risk**: low
- **assignee**: pdt-developer
- **참조**: 본 audit §2.C-2 + design-system §1.5.3 + §8.9.

### Ticket 후보 #3 — T-P4-072 (제안)

- **제목**: "TeamPanel 컬러 emoji → lucide 교체 — §7.1 정합"
- **spec 1줄**: WikiRow 의 emoji 5 개 (🧠 ⚙️ 📌 🗄️ 📚) 를 lucide
  (`Brain`/`Cog`/`Pin`/`Archive`/`Library`/`Network`) 로 교체, size 16, stroke 2,
  color `--text-secondary`. assignee=pdt-developer.
- **estimated_complexity**: L0 (import + JSX 교체)
- **risk**: low (visual regression — 스크린샷 회귀 light QA)
- **assignee**: pdt-developer + pdt-qa (light)
- **참조**: 본 audit §2.C-3 + design-system §7.1.

### Minor 통합 ticket 후보 #4 — Phase 5 또는 R4 patch

- **제목**: "§1.5 minor violation 통합 patch — token + 미세 fix"
- **spec 1줄**: §3 minor 11 entry 통합 fix (M-1 ~ M-11) — Phase 5 token
  마이그레이션과 묶거나 R4 patch 1 회 처리. assignee=pdt-developer + pdt-designer
  (token 결정).
- **estimated_complexity**: L2 (cross-component, 11 spot)
- **risk**: medium (visual regression)
- **권장 시기**: 본 audit critical 3 개 fix 후 따로 큐잉. 각 minor 의 PO 결정 (특히
  M-4 destructive Esc 정책 / M-6 Edit kebab 강등) 필요.

---

## §6 Out of scope

- 컴포넌트 wrapper 라이브러리화 (R5 candidate, design-system §11.6)
- PR template self-check 강제 (§1.5 OQ-6, 사용자 결정)
- ESLint custom rule (R5)
- doctrine 변경 (§1.5 그대로 유지)
- 한국어 어휘 i18n linter (T-P4-057 별 ticket)
- HomeView / OnboardingWizard quick-scan 미수행 (파일 위치 미확인 — 본 round
  budget 안 critical 우선). PO 가 발견 시 별 audit ticket 발행 가능.

---

## §7 Verification

본 audit 의 limitations:
- **컴포넌트 ~21개 scan** — 본 ticket 의 권장 list (~25개) 중 OnboardingWizard /
  HomeView 등 실제 path 미확인. 위치 확인 후 follow-up audit 가능.
- **token 마이그레이션 minor (M-1, M-8, M-9, M-10) 는 §11 마이그레이션 ticket 과
  중복** — 별도 ticket 으로 묶어 처리 권장 (본 §5 ticket 후보 #4).
- **destructive 정책 (M-4) 은 PO 결정 필요** — RestartSessionModal 이 destructive
  여부 기준 (ctx 손실 정도). 본 audit 은 sub-rule 정합 enumerate 만.

본 doctrine 정합 audit 은 round 1 회 수행. critical 3 개 fix 완료 후 `qa_status:
pass` 마킹 가능 (본 ticket QA 는 fix ticket 별 회귀로 위임).

---

## §8 PO decisions (2026-05-08)

PO mechanical decision log — designer audit 완료 후 사용자 결정 반영.

- **C-1 ChatPanel restart visual feedback** → fix ticket **T-P4-067** landed.
  RestartSessionModal busy 시 lucide `Loader2` spinner inline + 성공 시 ChatPanel
  trace 메시지 (`[system] 세션이 재시작됐어요` / en `[system] Session restarted`)
  inject. i18n key `workspace.chat.restartTrace`.
- **C-2 EmptyPane primary CTA** → **rejected**. 사용자 판단: EmptyPane 안 4
  keyboard shortcut hints (`⌘P` / `⌘T` / `⌘\` / `⌘W`) + tab close 버튼이 이미
  사용자 다음 행동 path 명확. literal button 추가 불필요. design-system §8.9
  recipe 의 "primary CTA" 정의 확장 — kbd hint + close path equivalent
  (design-system.md §8.9 Note 2026-05-08 land).
- **C-3 TeamPanel emoji** → fix ticket **T-P4-073** landed. lucide 매핑 (`Brain`
  / `Cog` / `Pin` / `Archive` / `Library` / `Network`).
- **M-2 footer 순서 + M-4 Esc 정책** → fix ticket **T-P4-074** landed. session
  재시작 = non-destructive 분류 (Esc 닫힘, busy 중 Esc 무시). footer
  `[Cancel] [Open Settings] [Restart now]` §8.5 정합.
- **M-1 / M-5 / M-6 / M-7 / M-8 / M-9 / M-10 / M-11** → fix ticket **T-P4-075**
  landed. 8 spot 통합 patch — token 4 (ChatPanel `--surface-body` / LeafPane
  `color-mix accent 40%` / StatusBar `--text-muted` / SettingsView `--accent`
  12% pill) + Esc binding 2 (SessionHealthBanner / PendingPromotionDrain bulk
  input) + Edit hover-only 강등 (PendingPromotionDrain) + Phase 5 lock hint
  (WorkflowRulesPanel, i18n `workspace.workflowRules.phase5LockHint`).
- **M-3 busy spinner** — T-P4-067 안에 묶음 처리 (RestartSessionModal Loader2).

audit close: 모든 critical (C-1 ✓, C-2 사용자 결정 reject, C-3 ✓) + minor 11/11
처리 완료. qa_status `pending` → 후속 fix ticket 별 light QA 회귀 후 `pass`.

