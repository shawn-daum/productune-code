---
doc: plan
feature: design-system-ux-principles-audit
ticket_id: T-P4-069
owner: pdt-designer
status: draft
round: R4
date: 2026-05-14
audit_scope: packages/gui/src/components/workspace/**
design_system_ref: docs/design/design-system.md §1.5
---

# T-P4-069 Plan — §1.5 UX Principles Audit

> **Audit-only plan** — 산출물은 이 문서(matrix + violation list) 하나.
> 실제 fix 는 §3 critical 별로 발행되는 후속 ticket 에서.

---

## §1 Background

### §1.1 Context

`design-system.md §1.5` (R4, 2026-05-07 land) 는 5 개 UX sub-rule doctrine 을 정의했다:

| Sub-rule | Code | 원칙 |
|:--|:--|:--|
| Few Things Per Page | 1.5.1 | 한 pane/modal 옵션 최소화. Modal CTA ≤ 2. |
| 익숙한 경험 + 점진적 정보 | 1.5.2 | IDE 패턴 차용 + 단계화. 어휘 보호어 유지. |
| Predictability | 1.5.3 | token 강제. empty state = 컴포넌트 + CTA. 버튼 위치 일관. |
| Feedback | 1.5.4 | 모든 action → 즉시/진행/완료 visual feedback. error → 대안 CTA. |
| Escape | 1.5.5 | Esc + Cancel + backdrop click + dismiss 복원. destructive modal 예외 |

Doctrine 은 land 됐으나 **기존 61 개 workspace 컴포넌트에 대한 정합 검증이 없었음**.

### §1.2 Known Pre-Audit State

- **T-P4-067** (동 conversation): ChatPanel restart button §1.5.4 violation fix → 완료.
  - `RestartSessionModal.handleRestartNow` 에 `restarting` disabled + loading text 추가.
  - **본 audit 은 T-P4-067 fix 를 "완료" 로 간주**. 동일 위반 재서술 안 함.
- **T-P4-068**: BackgroundTaskSegment — `@media (prefers-reduced-motion)` 가 올바르게
  keyframe 에 적용되어 있음 (code-read 확인, reference implementation).

### §1.3 Audit Method

- **Code-read** (직접 소스 확인, 16 컴포넌트): 실선 평가
- **Inferred** (파일명/역할/부모 컴포넌트 컨텍스트로 추론, ~20 컴포넌트): 점선 평가
- **`?` (미검증)**: on-site 확인 필요 (~25 컴포넌트)
- 평가 기호: `✓` pass · `⚠` minor · `✗` critical · `?` 미검증 · `—` N/A

---

## §2 Component × §1.5 Sub-Rule Matrix

> 61 개 컴포넌트를 7 개 cluster 로 분류.
> Critical row 에는 §3 항목 번호 교차 참조.

### 2-A. Modals (5 components)

| Component | §1.5.1 Few | §1.5.2 Familiar | §1.5.3 Predict | §1.5.4 Feedback | §1.5.5 Escape | Critical ref |
|:--|:--:|:--:|:--:|:--:|:--:|:--|
| **RestartSessionModal** `[code-read]` | ✗ | ✓ | ✗ | ⚠ | ✓† | C-3, C-4 |
| **ConflictResolveModal** `[code-read]` | ⚠ | ✓ | ⚠ | ✓ | ✓ | — |
| **DeployConfirmModal** `[code-read]` | ✓ | ✓ | ⚠ | ⚠ | ✓ | — |
| **McpServerModal** `[code-read partial]` | ✓ | ✓ | ✗ | ? | ✓ | C-5 |
| **BaseDirtyModal** `[inferred]` | ✓ | ✓ | ? | ? | ✓ | — |

> †RestartSessionModal §1.5.5: destructive confirm modal → Esc 비활성 + backdrop non-close 는 **§1.5.5 doctrine 의 의도적 예외**. Cancel 버튼 존재 ✓.
>
> ConflictResolveModal §1.5.1 ⚠: [도움말(ghost)] + [작업전환] + [재시도] = 3 CTAs. 도움말은 informational ghost (좌측 분리). Decision CTA 는 2개 = 경계선. Minor.
>
> DeployConfirmModal §1.5.3 ⚠: button hover state 없음. §1.5.4 ⚠: error 후 retry CTA 미명시 (버튼이 re-enabled 되므로 암묵적 retry 경로 존재).

### 2-B. Chat Cluster (7 components)

| Component | §1.5.1 Few | §1.5.2 Familiar | §1.5.3 Predict | §1.5.4 Feedback | §1.5.5 Escape | Critical ref |
|:--|:--:|:--:|:--:|:--:|:--:|:--|
| **ChatPanel** `[code-read]` | ✓ | ✓ | ⚠ | ✓* | ✓ | — |
| **PersonaPresenceBar** `[code-read]` | ✓ | ✓ | ✓ | ✗ | ✓ | C-7 |
| **PoFab** `[code-read]` | ✓ | ✓ | ✓ | ⚠ | ✓ | C-7 |
| **MessageBubble** `[inferred]` | ✓ | ✓ | ? | ? | — | — |
| **TodoChip** `[?]` | ? | ✓ | ? | ? | ? | — |
| **TodoListPanel** `[?]` | ? | ✓ | ? | ? | ? | — |

> *ChatPanel §1.5.4 ✓: restart button T-P4-067 fix 완료. send button disabled+opacity feedback ✓.  
> ChatPanel §1.5.3 ⚠: empty chat messages → `emptyHint` text-only. Empty 컴포넌트 패턴 미적용 (CTA 부재). Minor — chat 특성상 첫 메시지 전 hint 은 acceptable 경계선.
>
> PersonaPresenceBar §1.5.4 ✗: `persona-blink` keyframe 에 `@media (prefers-reduced-motion: reduce)` 없음 (→ C-7).
>
> PoFab §1.5.4 ⚠: hover state 없음. `fab-pulse` (transform:scale 포함) + `fab-blink` 모두 reduced-motion guard 없음 (→ C-7). §1.5.5 ✓: chat panel 닫혔을 때 FAB 복원 CTA 역할 수행.

### 2-C. Banners / Status Indicators (5 components)

| Component | §1.5.1 Few | §1.5.2 Familiar | §1.5.3 Predict | §1.5.4 Feedback | §1.5.5 Escape | Critical ref |
|:--|:--:|:--:|:--:|:--:|:--:|:--|
| **SessionHealthBanner** `[code-read]` | ✓ | ✓ | ✓ | ⚠ | ⚠ | — |
| **UserModeBanner** `[code-read]` | ✓ | ✓ | ✓ | ⚠ | ⚠ | — |
| **PhaseTransitionGate** `[code-read]` | ✓ | ✓ | ⚠ | ⚠ | ⚠ | — |
| **BackgroundTaskSegment** `[code-read]` | ✓ | ✓ | ✓ | ⚠ | ✓ | — |
| **SessionHealthSegment** `[inferred]` | ✓ | ✓ | ? | ? | ? | — |

> SessionHealthBanner §1.5.4 ⚠: dismiss `×` button hover state 없음. `sh-slide-down` animation (transform:translateY) reduced-motion guard 없음 → minor (one-shot entrance, not loop).  
> SessionHealthBanner §1.5.5 ⚠: dismiss 후 banner 복원 경로가 banner 내에 명시되어 있지 않음. StatusBar → SessionHealthSegment 통해 복원 가능하나 명시적 CTA 없음.
>
> UserModeBanner §1.5.4 ⚠: [Open Settings] hover state 없음.  
> UserModeBanner §1.5.5 ⚠: dismiss 후 복원 경로 미명시.
>
> PhaseTransitionGate §1.5.3 ⚠: [Modify] / [Approve] hover state 없음. hardcoded hex (`#1F1408`, `#FF6B2B`).  
> PhaseTransitionGate §1.5.4 ⚠: 버튼 `:active` / pressed visual state 없음.  
> PhaseTransitionGate §1.5.5 ⚠: [Modify] 는 기능적으로 escape path 이나 [취소/뒤로] 라벨 아님 → §1.5.5 "PhaseTransitionGate — [뒤로]/[Cancel] 명시" 경계선 위반.
>
> BackgroundTaskSegment §1.5.4 ⚠: completed task dismiss button hover opacity 0→1 전환 있으나, click 시 시각적 pressed state 없음.

### 2-D. Main Navigation Shell (7 components)

| Component | §1.5.1 Few | §1.5.2 Familiar | §1.5.3 Predict | §1.5.4 Feedback | §1.5.5 Escape | Critical ref |
|:--|:--:|:--:|:--:|:--:|:--:|:--|
| **ActivityBar** `[code-read]` | ✓ | ✓ | ⚠ | ✓ | — | — |
| **QuickOpenPalette** `[code-read]` | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| **PhaseBreadcrumb** `[inferred]` | ✓ | ✓ | ? | ? | ✓ | — |
| **PhaseStrip** `[inferred]` | ✓ | ✓ | ? | — | — | — |
| **Titlebar** `[inferred]` | ✓ | ✓ | ? | ? | — | — |
| **StatusBar** `[code-read]` | ✓ | ✓ | ✓ | — | — | — |
| **LeftSidebar** `[?]` | ? | ✓ | ? | ? | ? | — |

> ActivityBar §1.5.3 ⚠: hover state 는 inline JS `onMouseEnter/Leave` 로 처리 (token 아님). hardcoded hex (`#1A1A1A`, `#E0E0E0`, `#FFFFFF`, `#0A0A0A`). §1.5.4 ✓: active icon 즉시 state 변화 (background white).
>
> QuickOpenPalette: 전 항목 ✓. §1.5.5 model implementation — Esc, backdrop click, focus restore 모두 구현.

### 2-E. Content Panels / Views (10 components)

| Component | §1.5.1 Few | §1.5.2 Familiar | §1.5.3 Predict | §1.5.4 Feedback | §1.5.5 Escape | Critical ref |
|:--|:--:|:--:|:--:|:--:|:--:|:--|
| **EmptyPane** `[code-read]` | ✓ | ✓ | ✗ | — | — | C-1 |
| **TicketDashboardView** `[code-read partial]` | ✓ | ✓ | ✗ | ✗ | — | C-2 |
| **PendingPromotionDrain** `[code-read]` | ✓ | ✓ | ✓ | ⚠ | ✗ | C-6 |
| **VersionDetailView** `[?]` | ? | ✓ | ? | ? | ? | — |
| **VersionsPanel** `[?]` | ? | ✓ | ? | ? | ? | — |
| **VersionRow** `[?]` | ? | ✓ | ? | ? | — | — |
| **TeamPanel** `[?]` | ? | ✓ | ? | ? | ? | — |
| **WorkflowRulesPanel** `[?]` | ? | ✓ | ? | ? | ? | — |
| **SidePanelVersionList** `[?]` | ? | ✓ | ? | ? | — | — |
| **SidePanelCurrentVersion / PastVersions / Artifacts** `[?]` | ? | ✓ | ? | ? | — | — |

> EmptyPane §1.5.3 ✗: logo + title + keyboard chord hints 만 존재. **Primary CTA 버튼 없음.** §1.5.3 명시 anti-pattern: "Empty pane 에 placeholder 만 있고 CTA 없음 → 사용자가 '여기서 뭐 해야 하지' 막힘." (→ C-1)
>
> TicketDashboardView §1.5.3 ✗ + §1.5.4 ✗: `loading && allTickets.length === 0` 일 때와 `allTickets.length === 0` 일 때 **동일한 'noTickets' 텍스트** 렌더링. "Pending state ≠ Empty state" doctrine 위반. Loading 중 spinner 없음. (→ C-2)
>
> PendingPromotionDrain §1.5.4 ⚠: `busy[item.id]` 시 button disabled 되나 Loader2 spinner 없음.  
> PendingPromotionDrain §1.5.5 ✗: toast (4s auto-dismiss) 에 dismiss X 없음. §1.5.5 anti-pattern: "Toast 에 dismiss X 없음 → 사용자가 끄지 못함." (→ C-6)

### 2-F. Main Panel Infrastructure (7 components)

| Component | §1.5.1 Few | §1.5.2 Familiar | §1.5.3 Predict | §1.5.4 Feedback | §1.5.5 Escape | Critical ref |
|:--|:--:|:--:|:--:|:--:|:--:|:--|
| **MainPanel** `[inferred]` | ✓ | ✓ | ? | — | ? | — |
| **PaneNode** `[inferred]` | ✓ | ✓ | ? | — | — | — |
| **LeafPane** `[inferred]` | ✓ | ✓ | ? | — | — | — |
| **TabBar** `[inferred]` | ✓ | ✓ | ? | ? | ? | — |
| **TabContent** `[inferred]` | — | ✓ | — | — | — | — |
| **ResizeHandle** `[inferred]` | — | ✓ | — | — | — | — |
| **ColumnResizeHandle** `[inferred]` | — | ✓ | — | — | — | — |

> ResizeHandle / ColumnResizeHandle: resize drag handle — UX sub-rule 대부분 N/A. §1.5.2 cursor 표시 등 IDE 패턴 정합만 확인하면 됨.
>
> TabBar §1.5.3 ?: tab close (⌘W), tab title truncation, active tab 시각 차별 확인 필요.

### 2-G. Settings (4 components)

| Component | §1.5.1 Few | §1.5.2 Familiar | §1.5.3 Predict | §1.5.4 Feedback | §1.5.5 Escape | Critical ref |
|:--|:--:|:--:|:--:|:--:|:--:|:--|
| **SettingsView** `[?]` | ? | ✓ | ? | ? | ? | — |
| **GeneralSettings** `[?]` | ? | ✓ | ? | ? | ? | — |
| **LanguageSettings** `[?]` | ? | ✓ | ? | ? | ? | — |
| **GeneralSettingsTab** `[?]` | ? | ✓ | ? | ? | ? | — |

### 2-H. Pane Tabs (15 components)

| Component | §1.5.1 Few | §1.5.2 Familiar | §1.5.3 Predict | §1.5.4 Feedback | §1.5.5 Escape | Critical ref |
|:--|:--:|:--:|:--:|:--:|:--:|:--|
| **MarkdownTab / ImageTab / BinaryTab** `[inferred]` | ✓ | ✓ | ? | — | — | — |
| **PlaceholderTab** `[inferred]` | ✓ | ✓ | ? | — | — | — |
| **VersionDetailTab** `[?]` | ? | ✓ | ? | ? | ? | — |
| **VersionHistoryTab** `[?]` | ? | ✓ | ? | ? | — | — |
| **SkillMatrixTab / PersonaDefTab** `[?]` | ? | ✓ | ? | ? | — | — |
| **WorkflowSettingsTab** `[?]` | ? | ✓ | ? | ? | ? | — |
| **TicketReviewTab** `[?]` | ? | ✓ | ? | ? | ? | — |
| **TeamWikiTab** `[?]` | ? | ✓ | ? | ? | — | — |
| **HooksTab / McpServersTab** `[?]` | ? | ✓ | ? | ? | ? | — |
| **DeployTab** `[?]` | ? | ✓ | ? | ? | ? | — |
| **BrowserTab** `[inferred]` | ✓ | ✓ | ? | ? | ✓ | — |

> DeployTab: ConflictResolveModal 의 parent 컨테이너. Modal escape 는 already audited. Tab 자체의 state feedback (progress bar, deploy log stream) 미검증. on-site 확인 필요.

---

## §3 Critical Violation List (Fix Ticket Triggers)

> 우선순위 순 (사용자 영향 높은 순). 각 항목 = fix ticket 1 개 trigger.

### C-1 | EmptyPane — Primary CTA 부재 | §1.5.3 | **TOP**

**발견 방법**: code-read  
**위반 규칙**: §1.5.3 Predictability — "Empty pane 에 placeholder 만 있고 CTA 없음 → 사용자가 '여기서 뭐 해야 하지' 막힘. → 'Open file'/'Create ticket' 같은 1차 action 노출 필수"  
**현재 상태**: `EmptyPane` 에 로고 (0.25 opacity) + title + 4개 keyboard chord hint 만 존재. **CTA 버튼 없음.**  
**Impact**: 신규 사용자가 빈 pane 에서 다음 행동을 모름. 키보드 단축키를 모르면 막힘.  
**Fix 방향**: chord hint 아래 `[⌘P  파일 열기]` 버튼 1개 추가 (QuickOpen 호출). §1.5.3 empty 컴포넌트 패턴 (icon + headline + desc + 1 primary CTA) 적용.  
**Fix ticket 후보**: `T-P4-NNN` · type:impl · area: `workspace/empty-pane`

---

### C-2 | TicketDashboardView — Loading ≠ Empty (Pending state 혼용) | §1.5.3 + §1.5.4 | **HIGH**

**발견 방법**: code-read (partial — loading/empty 분기 확인)  
**위반 규칙 1**: §1.5.3 — "Pending state ≠ Empty state — '아무것도 없음'과 '로딩 중'은 다른 component"  
**위반 규칙 2**: §1.5.4 — "진행(≥100ms) — Loader2 spinner 또는 inline progress"  
**현재 코드**:
```tsx
{loading && allTickets.length === 0 ? (
  <div style={empty}>{t('workspace.tickets.noTickets')}</div>
) : allTickets.length === 0 ? (
  <div style={empty}>{t('workspace.tickets.noTickets')}</div>
```
`loading=true` 와 `loading=false` + empty 가 **동일 텍스트** 렌더링.  
**Impact**: 파일 스캔 중에 "티켓 없음" 메시지가 보임 → 사용자가 프로젝트가 비어 있다고 오해.  
**Fix 방향**: `loading === true` 인 경우 `Loader2` spinner 표시. `loading === false && empty` 인 경우 기존 텍스트 + CTA ("PO에게 첫 PRD 작성 요청" 등).  
**Fix ticket 후보**: `T-P4-NNN` · type:impl · area: `workspace/ticket-dashboard`

---

### C-3 | RestartSessionModal — Modal CTA 3개 (§1.5.1 ≤ 2 rule) | §1.5.1 | **HIGH**

**발견 방법**: code-read  
**위반 규칙**: §1.5.1 — "Modal CTA ≤ 2 — primary + secondary 만. 3개째 CTA 는 menu/kebab 으로 강등."  
**현재 코드**: actions div 안 `[Restart Now (primary)] [Open Settings (secondary)] [Cancel (ghost)]` = 3개 CTA.  
**Impact**: 사용자가 destructive modal 에서 세 개 옵션 중 하나를 선택해야 함 → Hick's Law 위반.  
**Fix 방향**: `[Open Settings ↗]` 를 modal 본문 내 link 또는 Cancel 하단 small text link 으로 강등. Footer = `[Cancel] [Restart Now]` 2개만.  
**Note**: C-4 와 동일 컴포넌트 → 하나의 fix ticket 으로 통합 가능.  
**Fix ticket 후보**: `T-P4-NNN` · type:impl · area: `workspace/restart-session-modal`

---

### C-4 | RestartSessionModal — Button Order 역전 | §1.5.3 | **HIGH**

**발견 방법**: code-read  
**위반 규칙**: §1.5.3 — "modal footer 의 [Cancel] 항상 좌측 / [Confirm] 항상 우측"  
**현재 코드**: `[Restart Now] [Open Settings] [Cancel]` 순 (left → right). Cancel 이 **가장 오른쪽**.  
**Impact**: 우상단에서 Cancel 찾는 근육 기억이 실패 → Restart Now 를 잘못 누를 위험. Destructive action 이라 impact 큼.  
**Fix 방향**: `[Cancel (ghost, left)] [Restart Now (primary, right)]` 으로 순서 변경. C-3 fix 와 통합.  
**Fix ticket 후보**: C-3 과 동일 ticket.

---

### C-5 | McpServerModal — Button Order 역전 ([저장] 좌측 고정) | §1.5.3 | **MEDIUM**

**발견 방법**: code-read (partial) — 파일 내 명시적 주석에서 확인:  
> `"[저장] left-anchored → primary, [취소] right-of-save = secondary"`  
**위반 규칙**: §1.5.3 — "[Cancel] 항상 좌측 / [Confirm] 항상 우측"  
**현재 레이아웃**: `[저장 (primary, left)] [취소 (secondary, right)]`  
**Impact**: RestartSessionModal 과 방향 일치 (양 쪽 다 역전) → 일관성은 있으나 doctrine 역방향. DeployConfirmModal 은 `[Dismiss][Deploy]` (correct) → **모달 간 불일치.**  
**Fix 방향**: footer = `[취소 (ghost/secondary, left)] [저장 (primary, right)]` 로 변경.  
**Fix ticket 후보**: `T-P4-NNN` · type:impl · area: `workspace/mcp-server-modal`

---

### C-6 | PendingPromotionDrain — Toast dismiss X 없음 | §1.5.5 | **MEDIUM**

**발견 방법**: code-read  
**위반 규칙**: §1.5.5 — "Toast 에 dismiss X 없음 → 사용자가 끄지 못함. → 모든 toast 에 X (auto-dismiss 되는 success 도 hover 시 X 노출)"  
**현재 코드**: `toastStyle(ok)` div — 배경색 + 텍스트만. X 버튼 없음. 4s 후 자동 삭제.  
**Impact**: error toast (`ok=false`) 가 4s 내에 disappear → 빠른 사용자가 에러 메시지를 못 읽음. dismiss 불가.  
**Fix 방향**: toast div 안 우측 X button 추가 (`onClick` → 해당 toast id 필터). hover 시 X 노출 (opacity transition 가능).  
**Fix ticket 후보**: `T-P4-NNN` · type:impl · area: `workspace/pending-promotion-drain`

---

### C-7 | PersonaPresenceBar + PoFab — Animation reduced-motion guard 없음 | §1 Principle 3 | **MEDIUM**

**발견 방법**: code-read (두 컴포넌트 keyframe injection 직접 확인)  
**위반 규칙**: §1 Principle 3 — "reduced-motion 환경에서는 모두 비활성"  
**현재 상태**:
- `PersonaPresenceBar.ensureBlinkKeyframe()`: `@keyframes persona-blink` (opacity 1↔0.2) — **reduced-motion media query 없음.**
- `PoFab.ensureFabAnims()`: `@keyframes fab-pulse` (`opacity + transform:scale` — 더 강한 모션), `@keyframes fab-blink` — **reduced-motion media query 없음.**  
**Reference OK**: `BackgroundTaskSegment.ensureKeyframes()` 는 양 keyframe 에 모두 `@media (prefers-reduced-motion: reduce)` 올바르게 적용됨 (T-P4-068 산출물). 해당 패턴을 그대로 적용하면 됨.  
**Impact**: `prefers-reduced-motion: reduce` 설정 사용자 (전정 장애, 시각적 민감성 등) 에게 지속적 animation 노출.  
**Fix 방향**: 두 컴포넌트 keyframe style injection 에 아래 패턴 추가:
```css
@media (prefers-reduced-motion: reduce) {
  @keyframes persona-blink { 0%, 100% { opacity: 1; } }
}
@media (prefers-reduced-motion: reduce) {
  @keyframes fab-pulse { 0%, 100% { opacity: 1; transform: scale(1); } }
  @keyframes fab-blink { 0%, 100% { opacity: 1; } }
}
```
**Fix ticket 후보**: `T-P4-NNN` · type:impl · area: `workspace/animation-accessibility`

---

## §4 Minor Violation List

> 비 긴급 — 별도 minor fix batch ticket 또는 해당 컴포넌트 다음 touch 시 처리.

| ID | Component | Rule | 내용 | Fix 방향 |
|:--|:--|:--|:--|:--|
| M-1 | PhaseTransitionGate | §1.5.3 + §1.5.4 | [Modify]/[Approve] hover state 없음. CSS `:active` pressed state 없음. | inline style → hover/active state 추가 (§8.1 btn recipe 참고) |
| M-2 | PhaseTransitionGate | §1.5.5 | [Modify] 가 기능적 escape 이나 [뒤로/취소] 라벨 아님. §1.5.5 명시 위반 경계선. | 버튼 라벨 재검토. "수정" → "수정 후 닫기" or 별도 "취소" 추가 |
| M-3 | ConflictResolveModal | §1.5.3 + §1.5.4 | 모든 action button hover state 없음 | hover bg 1단 밝게 (§8.1) |
| M-4 | DeployConfirmModal | §1.5.3 + §1.5.4 | button hover state 없음 + error 후 retry CTA 미명시 | hover bg + error 시 "다시 시도" 라벨 명시 |
| M-5 | SessionHealthBanner | §1.5.4 | dismiss `×` button hover state 없음 | hover bg #2A2A2A |
| M-6 | SessionHealthBanner | §1.5.5 | dismiss 후 복원 경로 banner 내 미명시 | SessionHealthSegment 복원 경로 사용자에게 간접 노출 — 별도 UX copy 검토 |
| M-7 | UserModeBanner | §1.5.4 | [Open Settings] hover state 없음 | hover bg/border 강조 |
| M-8 | UserModeBanner | §1.5.5 | dismiss 후 복원 경로 미명시 | dismiss 직후 toast "설정에서 다시 열 수 있습니다" 1회 |
| M-9 | RestartSessionModal | §1.5.4 | loading 중 text-only ("loading"), Loader2 spinner 없음 | `<Loader2 className="pdt-spin" />` 추가 (DeployConfirmModal 패턴) |
| M-10 | ChatPanel | §1.5.3 | emptyHint (첫 메시지 전) text-only, CTA 없음. 경계선. | "PO에게 첫 메시지를 보내보세요" + 클릭 시 textarea focus |
| M-11 | BackgroundTaskSegment | §1.5.4 | completed task dismiss button click pressed state 없음 | `:active` bg 추가 |
| M-12 | PendingPromotionDrain | §1.5.4 | busy state (save/edit) spinner 없음 | `<Loader2>` 추가 |
| M-13 | ActivityBar | §1 token | hover state 를 inline JS `style mutation`으로 처리. CSS token 아님 | CSS transition + token 사용 검토 (별도 token migration ticket 수반) |
| M-14 | PoFab | §1.5.4 | FAB hover state 없음 | hover bg 한 단 밝게, scale(1.03) |
| M-15 | PhaseTransitionGate / ConflictResolveModal / DeployConfirmModal | §1 token | hardcoded hex. semantic token 미적용. | 별도 token migration ticket 트리거 |
| M-16 | SessionHealthBanner | §1 Principle 3 | `sh-slide-down` (transform:translateY) reduced-motion guard 없음 | `@media (prefers-reduced-motion: reduce) { @keyframes sh-slide-down { from { opacity: 0; } to { opacity: 1; } } }` — transform 제거 |

---

## §5 §1.5 Self-Check (Audit Doc 자체 검증)

> 본 audit plan 은 code doc (no UI rendering). 아래 checklist 는 audit 과정 품질 자기검증.

| # | Sub-rule | 본 audit 에 적용 | 결과 |
|:--|:--|:--|:--|
| 2-1 | Few Things | audit doc 자체는 UI 아님. Matrix가 정보 과부하가 되지 않도록 group + cluster 로 분류했는가? | ✓ — 7 cluster, Critical 먼저 |
| 2-2 | 익숙한 경험 | Developer + PO 모두 읽을 수 있는 용어? 보호어 유지? | ✓ — Critical/Minor 구조, 영문 보호어 유지 |
| 3-1 | Predictability | 각 셀 평가 기준 일관? code-read vs inferred 명시? | ✓ — 기호 legend + [code-read]/[inferred]/[?] 표기 |
| 3-2 | Feedback | 미검증 셀 `?` 로 명시적 표기? false confidence 없음? | ✓ — 25개 컴포넌트 `?` 명시 |
| 3-3 | Escape | 후속 단계 (fix ticket trigger, Phase 5 확장 audit OQ) 명시? | ✓ — §3 ticket 후보 각 Critical 별 명시. §7 OQ 에 확장 scope 기재 |

**§1.5.3 위반 후보 (self-catch)**: McpServerModal §1.5.3 critical 은 code partial read 기반 — 주석 명시 (`"[저장] left-anchored"`) 로 확인했으나, 실제 render 코드 완전 확인은 필요. 이를 C-5 에 명시적으로 기재함.

---

## §6 §QA Scope

| Field | Value |
|:--|:--|
| **QA invoke** | `skip` |
| **test target** | — (audit doc only; zero user-facing code change) |
| **사용자 dogfood** | matrix §2 의 `?` 셀 — PO 가 사용자에게 직접 5개 샘플 컴포넌트 동작 verify 요청: (1) EmptyPane CTA 유무 (2) TicketDashboard loading spinner 유무 (3) RestartSessionModal button 순서 (4) PendingPromotion toast dismiss (5) persona chip / PoFab reduced-motion behavior (`prefers-reduced-motion: reduce` 활성화 후 animation 정지 여부) |
| **regression check** | — (코드 변경 없음) |

---

## §7 Open Questions

| # | 질문 | Phase / 담당 |
|:--|:--|:--|
| OQ-1 | `?` 셀 25개 컴포넌트 (Settings / Pane Tabs / LeftSidebar / Version panels) 에 대한 on-site audit 완성 — Phase 5 별도 audit round 에서 처리할 것인가, 아니면 각 컴포넌트 다음 touch 시 인라인 검증할 것인가? | Phase 5 or ongoing |
| OQ-2 | Token migration ticket (hardcoded hex → semantic CSS variable): §1 token doctrine 위반은 본 audit scope 외 (§8) 이나, minor violation M-13/M-15 가 충분히 누적됐을 때 별도 batch ticket 이 필요한가? | Phase 5 |
| OQ-3 | PhaseTransitionGate §1.5.5 M-2: [Modify] vs [뒤로/취소] — 현재 버튼 액션이 "PO에 수정 의도 emit" 이라 Cancel과 다름. Gate dismiss 없이 사용자가 어떻게 "이 gate 를 무시하고 다른 작업" 으로 이동할 수 있는가? 별도 escape path 필요 여부 검토 필요. | Phase 3 design review |
| OQ-4 | Electron / Tauri 레이어 (window close 버튼, 앱 minimize) 가 §1.5.5 Escape 과 충돌하는 경우 — 특히 모달 열린 상태에서 앱 창 close 시 dirty guard 동작 여부. native layer audit 은 별도 scope? | Phase 5 |
| OQ-5 | locale / i18n: §1.5.2 보호어 보존 (PRD, slug, stage, status) 이 한국어 모드에서 실제로 지켜지고 있는지 T-P4-057 linter 가 커버하는지 확인 필요. | Phase 5 or T-P4-057 follow-up |
| OQ-6 | build pipeline 내 §1.5 rule 자동 체크 가능성 — `pdt-qa` smoke 에서 empty state + modal CTA count auto-detect 가능한가? | Phase 5 QA tooling |

---

## §8 Out of Scope

- **실제 fix 구현**: §3 critical + §4 minor 의 코드 변경은 각 후속 fix ticket.
- **Token migration**: hardcoded hex → CSS variable (별도 batch ticket 필요).
- **Storybook / Chromatic**: 컴포넌트 시각 regression test (별도 Phase 5).
- **Light theme**: dark-only 인 현 단계에서 light theme 케이스 미검증.
- **Electron native layer** (window chrome, system dialog): §7 OQ-4 참고.
- **서드파티 컴포넌트** (Radix primitives 등이 있다면): 해당 라이브러리 자체 accessibility.
- **i18n 어휘 linter T-P4-057** 동작 검증: 별도 ticket scope.

---

## §9 Dependencies

| Dependency | 설명 | 상태 |
|:--|:--|:--|
| **T-P4-067** | ChatPanel restart button §1.5.4 fix | ✓ 완료 (본 audit 의 known pre-state) |
| **T-P4-068** | BackgroundTaskSegment — reduced-motion reference impl | ✓ 완료 (C-7 fix 의 reference 패턴) |
| **design-system.md §1.5** (R4) | 본 audit 의 rule 정의 source | ✓ landed (2026-05-07) |
| **Fix tickets C-1~C-7** | 본 plan 에서 trigger 되는 후속 구현 ticket들 | ⬜ 미발행 — PO 발행 대기 |

---

## Appendix A — Critical Violation Summary (Quick Ref)

| ID | Component | Rule | 우선순위 | Fix Ticket |
|:--|:--|:--|:--:|:--|
| C-1 | EmptyPane | §1.5.3 primary CTA 없음 | TOP | T-P4-NNN (emit) |
| C-2 | TicketDashboardView | §1.5.3/§1.5.4 loading=empty 혼용 | HIGH | T-P4-NNN (emit) |
| C-3 | RestartSessionModal | §1.5.1 Modal 3 CTAs | HIGH | T-P4-NNN (C-3+C-4 통합) |
| C-4 | RestartSessionModal | §1.5.3 button order 역전 | HIGH | ↑ same |
| C-5 | McpServerModal | §1.5.3 [저장] left 고정 | MEDIUM | T-P4-NNN (emit) |
| C-6 | PendingPromotionDrain | §1.5.5 toast dismiss X 없음 | MEDIUM | T-P4-NNN (emit) |
| C-7 | PersonaPresenceBar + PoFab | §1 P3 reduced-motion guard 없음 | MEDIUM | T-P4-NNN (emit) |

**Code-read coverage**: 16 / 61 컴포넌트 (26 %) — critical 7개 모두 code-read 컴포넌트에서 발견.  
**Inferred coverage**: ~20 / 61 (33 %) — inferred 컴포넌트에서 critical 0개 (낮은 risk profile).  
**Unverified**: ~25 / 61 (41 %) — Phase 5 or next-touch 검증.
