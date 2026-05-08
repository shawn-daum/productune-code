---
doc: design-system
owner: pdt-designer
status: draft
round: R4
date: 2026-05-07
applies_to: gui (Tauri WorkspaceShell + React panes)
theme: dark-only (light theme = Phase 5)
related_tickets:
  - T-P4-057  # i18n linter (어휘 가드)
  - T-P4-058  # modal surface
  - T-P4-059  # SessionHealthBanner
  - T-P4-041  # PO chat single-session
out_of_scope:
  - light theme
  - css-variable token migration (별도 ticket)
  - 컴포넌트 라이브러리 wrapper (별도 ticket)
  - storybook / chromatic (별도 ticket)
---

# productune GUI Design System (R4 spec)

> shadcn-style 모노크롬 + 의미 기반 token + lucide 아이콘. 본 문서는 **정의 only** —
> 실제 hardcode → CSS variable 마이그레이션은 후속 ticket 에서 처리. 모든 ticket /
> design doc / 코드 리뷰는 본 문서의 token 명을 single source of truth 로 참조.

---

## §1 Principles

1. **Token-driven** — 컴포넌트는 hex 가 아닌 semantic token (`--surface-modal`,
   `--persona-po`, `--status-blocked`) 만 참조한다. inline hex 는 마이그레이션 대상.
2. **Monochrome 우선** — neutral 그레이스케일이 베이스. accent / status / persona /
   stage / health 만 색을 가진다. 같은 화면에서 색을 가진 요소 4 종 초과 금지.
3. **Minimal motion** — 정보 변화 (loader, persona working blink) 외 장식 motion 금지.
   reduced-motion 환경에서는 모두 비활성.
4. **shadcn 패턴 차용** — Radix-style primitives + slot 합성. 단 현 단계에서는
   라이브러리화하지 않고 **패턴만** 채택 (네이밍·구조 정합).
5. **i18n 어휘 가드** — 한국어 모드에서도 보호어 enum (페르소나/Phase/stage/status/
   schema field/product name) 은 영문 보존. T-P4-057 linter 가 강제.
6. **Dark theme only (현 단계)** — light theme 은 Phase 5. 본 문서의 모든 hex 는
   dark surface 기준. 모든 token 명은 light theme 추가 시 그대로 재사용 가능하게
   추상화 (`--surface-modal` 자체는 테마 invariant, hex 만 교체).

---

## §1.5 UX principles (대원칙 2 + 3)

§1 은 시각/토큰 레이어. §1.5 는 **사용자 경험 레이어** — productune 전체의 UX 의사결정
doctrine. PRD / Discovery 영역인 대원칙 1 은 별도 (`docs/designer/*` doctrine).
본 절은 GUI 컴포넌트와 직접 매핑되는 **대원칙 2 (사용자는 우리가 아니다)** + **대원칙
3 (사용자를 당황시키지 말라)** 만 다룬다.

> 본 절은 **doctrine** — 컴포넌트 patch 는 별도 ticket. 하지만 신규 컴포넌트 / 신규
> 화면 PR 은 본 절 5 개 sub-rule 을 자기검증 항목으로 본다.

### 1.5.1 Few Things Per Page (Hick's Law) — 2-1

**정의**. 한 화면 (또는 한 pane) 의 결정 옵션 수가 늘어날수록 사용자 결정 시간은
log 증가한다. 필요한 만큼만 단순하게. 복잡한 task 는 **단계로 나눈다**.

**왜**. productune GUI 는 IDE-shell (left rail + multi-pane + multi-tab + right
chat) 이라 base 복잡도가 이미 높다. 각 pane 안에서마저 옵션을 쌓으면 사용자는 길을
잃는다.

**어디 적용 (productune 매핑)**.
- **Pane = 한 type 한 가지** — 한 pane 에 PRD viewer + ticket dashboard + activity
  log 같은 멀티 타입 금지. pane = 단일 콘텐츠 타입 (T-P4-046 split-pane 정합).
- **Split-pane = 사용자 명시 act 만** — 자동 split 금지. 사용자가 명시적으로 split
  요청해야 갈라진다 (IDE convention).
- **Progressive disclosure** — Quick Open (Cmd+P) / Command Palette (Cmd+Shift+P)
  로 고급 action 은 숨긴다. 평소엔 안 보이고, 호출 시에만 등장.
- **First-run wizard 단계화** — Engine / Wiki / API Key 를 한 화면에 다 안 넣고
  step 으로 분리 (T-P4-015 onboarding).
- **Modal CTA ≤ 2** — primary + secondary 만. 3 개째 CTA 는 menu / kebab 으로 강등.

**위반 사례 (anti-pattern)**.
- 한 pane 안에 ticket list + ticket detail + activity log 동시 노출 → split-pane
  으로 사용자가 명시적으로 분리하도록 유도해야 함.
- Modal 안 footer 에 [저장] [저장 후 닫기] [임시저장] [취소] 4 개 — 정보 위계
  미정의. → primary 1 + secondary 1 + 나머지는 menu.

### 1.5.2 익숙한 경험 + 점진적 정보 — 2-2

**정의**. 누구나 이해하기 쉬운 글. 익숙한 환경 = 복잡해도 OK / 생소한 환경 = 단순하게.
초기 화면 = 최소 정보 → 후기 화면 = 점차 늘림.

**왜**. productune 사용자는 두 부류 — (a) developer (IDE 패턴 익숙) (b) PO /
designer / non-engineer (IDE 생소). 한 doctrine 으로 둘 다 잡으려면 **익숙한 패턴
차용 + 단계화** 가 답.

**어디 적용**.
- **IDE 패턴 차용 (developer)** — VSCode-style activity bar (좌 48px) / split-pane
  / Cmd+P quick open / 탭 / breadcrumb. T-P4-046 정합.
- **단계화 (non-engineer)** — onboarding wizard step / PRD R1 → R2 → R3 점진적
  clarity 수렴 / persona session stage gate.
- **한국어 어휘 + 영문 보호어** (§10) — non-engineer 는 한국어 본문, dev 어휘는
  영문 보존 (`PRD`, `slug`, `stage`).
- **초기 화면 = 최소 노출** — 첫 진입 시 PresenceBar / chat / empty pane 만. 고급
  feature (split / Quick Open / linter) 는 사용자가 학습한 후에 만난다.

**위반 사례**.
- First-run 진입 즉시 ticket dashboard + persona session view + chat 다 띄우기 →
  사용자 압도. → wizard 단계로 분리.
- 한국어 모드에서 "단계" 라고 번역해놓고 다른 곳에선 "stage" 영문 → 어휘 일관성
  깨짐. T-P4-057 linter 가 catch.

### 1.5.3 Predictability (예상 가능) — 3-1

**정의**. 시각 일관성 — 같은 의미는 같은 모양. empty page 도 placeholder + action
보여줘서 사용자가 "여기서 뭐 할 수 있는지" 즉시 알게.

**왜**. 사용자는 학습한 패턴으로 다음 행동을 예측한다. 예측이 깨지면 신뢰가 깨진다.

**어디 적용**.
- **시각 일관성 = §1 token 강제** — 같은 status 는 같은 색, 같은 stage 는 같은
  색 (§2.6 / §2.7). 예외 0.
- **Empty state 는 Empty 컴포넌트로** — 빈 pane / 빈 ticket list / 빈 promotion
  drain 모두 동일 패턴 (icon `--icon-2xl` + headline + 1-line description + 1
  primary CTA). T-P4-046 Empty pane component 가 본 doctrine 의 reference impl.
- **Pending state ≠ Empty state** — "아무것도 없음" 과 "로딩 중" 은 다른 component
  (PendingPromotionDrain 의 empty vs loading 분리 정합).
- **버튼 위치 일관** — modal footer 의 [Cancel] 항상 좌측 / [Confirm] 항상 우측.
  카드의 primary action 은 항상 우측 상단 또는 하단 우측.
- **Hover / focus 동작 일관** — 모든 button 은 hover 시 bg 한 단 밝게 (§8.1).

**위반 사례**.
- 같은 "blocked" 라벨이 어떤 화면은 빨강, 어떤 화면은 회색 → token 미적용.
- Empty pane 에 placeholder 만 있고 CTA 없음 → 사용자가 "여기서 뭐 해야 하지" 막힘.
  → "Open file" / "Create ticket" 같은 1 차 action 노출 필수.

### 1.5.4 Feedback (적재적소 알림) — 3-2

**정의**. 모든 사용자 action 은 **즉시 visual feedback** 받는다. task 완료 알림.
오류는 명확 + 대안 제시. writing 은 친근 / 비기술적 / non-threatening.

**왜**. 사용자가 클릭했는데 아무 반응 없으면 "버튼 눌린 거 맞나?" 의심한다. 신뢰
파괴.

**어디 적용**. 모든 action 은 다음 3 단계 중 하나 이상 visual feedback 의무.
1. **즉시 (≤ 100ms)** — 버튼 pressed state, hover-loss, ripple. CSS `:active`.
2. **진행 (≥ 100ms)** — Loader2 spinner (§9.2 `pdt-spin`) 또는 inline progress.
   non-blocking 은 toast 진행 알림.
3. **완료** — success toast (`--health-success`) / inline checkmark / banner
   (T-P4-059 SessionHealthBanner). 실패 시 `--health-error` + **대안 CTA** (예:
   "재시도" / "로그 보기" / "취소").

**Writing 톤**.
- 친근 — "저장됐습니다" (X "저장 작업 완료").
- 비기술적 — non-engineer 가 봐도 이해. stack trace 는 details 안에 접어 둠.
- Non-threatening — "오류 발생!" (X) → "잠시 문제가 생겼어요. 다시 시도해주세요"
  (O). 단 보호어 (`PRD`, `stage`, `slug`) 는 영문 그대로.

**컴포넌트 매핑**.
- Toast — task 비동기 완료, non-blocking notice.
- Inline confirm — 같은 컴포넌트 안에서 즉시 확인 (예: "저장됨 ✓" inline 라벨).
- SessionHealthBanner (T-P4-059) — session 수준 health (info/warn/error).
- Status pill 변화 — status `in-progress` → `done` 의 색 변화 자체가 feedback.
- Spinner — `Loader2` `pdt-spin` (`--motion-fast` 무관, 회전은 1s linear).

**위반 사례 (recent dogfood — 2026-05-07)**.
- ChatPanel 의 restart 버튼 클릭 시 IPC 호출은 됐지만 UI 변화 0 → 사용자 "뭐가
  된 건지 모르겠다". **본 doctrine catch 가능**. fix 방향 (별도 ticket): 클릭 즉시
  버튼 disabled + spinner / 완료 시 toast "session restarted" / 실패 시 inline
  error + retry CTA.
- Long-running task 에 spinner 만 있고 progress 정보 없음 → "끝났는지 멈췄는지
  모름". → toast 또는 banner 로 stage 알림 (`#3 of 5 personas done...`).

### 1.5.5 Escape (출구 제공) — 3-3

**정의**. 사용자는 우리 기대대로 안 움직인다. 모든 진입점에는 안심할 수 있는 **출구**
가 있어야 한다.

**왜**. 막다른 골목 = 사용자 불안. "여기서 빠져나갈 수 있나?" 가 답이 없으면 클릭
자체를 안 한다.

**어디 적용**. 모든 modal / overlay / 진입 pane 에 **최소 1 개 명시적 출구** 의무.
- **Esc 키** — 모든 modal / popover / Quick Open 에서 즉시 닫힘 (§8.5 Modal recipe
  보강). 단 **destructive confirm modal** 은 Esc 무효 + 명시적 [Cancel] 만 (실수
  방지).
- **외부 click** — modal backdrop click 으로 닫힘. 단 form 입력 진행 중인 modal 은
  "변경사항이 있습니다, 닫을까요?" confirm.
- **Cancel 버튼** — 모든 modal footer 에 [Cancel] (또는 [닫기]) 명시. footer 없는
  modal 은 우상단 X 아이콘 (`--icon-md`, `--text-muted`).
- **FAB 복원** — 닫은 chat / dismiss 한 banner 도 복원 가능. dismiss = 영구 삭제
  X, 복원 CTA (FAB 또는 menu) 노출.
- **Quick Open Esc** — Cmd+P palette 도 Esc 로 즉시 닫힘.
- **PhaseTransitionGate** — stage 진행 modal 도 [뒤로] / [Cancel] 명시. 일방통행
  금지.
- **Breadcrumb / back** — pane 안 깊은 view 는 ← 또는 breadcrumb 으로 한 단계
  뒤로. browser-style.

**위반 사례**.
- Modal 에 [Confirm] 만 있고 [Cancel] 없음 → 사용자 강제 결정. → Cancel 필수.
- Onboarding wizard step 3 에서 step 2 로 못 돌아감 → 일방통행. → [Back] 명시.
- Toast 에 dismiss X 없음 → 사용자가 끄지 못함. → 모든 toast 에 X (auto-dismiss
  되는 success 도 hover 시 X 노출).

### 1.5.6 Sub-rule 적용 체크리스트 (PR 자기검증)

신규 컴포넌트 / 신규 화면 PR 은 본 5 항목 self-check 후 머지.

| # | sub-rule | 체크 |
|---|---|---|
| 2-1 | Few Things | 한 pane / modal 의 primary action 수 ≤ 2. 복잡 task 는 단계 분리. |
| 2-2 | 익숙한 경험 | IDE 패턴 (dev) + 단계화 (non-engineer) 둘 다 만족. 어휘 보호어 유지. |
| 3-1 | Predictability | token 강제. empty state 는 Empty 컴포넌트 + CTA. 버튼 위치 일관. |
| 3-2 | Feedback | 모든 action 의 즉시/진행/완료 단계 중 1 개 이상 visual feedback. error → 대안 CTA. |
| 3-3 | Escape | Esc + Cancel + 외부 click + dismiss 복원 중 최소 1 개. destructive 는 Esc 무효 정책. |

> 본 체크리스트 위반 = designer review block. PR 본문에 self-check 결과 명시 권장.

---

## §2 Color tokens

### 2.1 Surface (배경 계층)

dark surface 5 등급. 화면이 깊어질수록 한 단계 밝아진다 (modal/popover 가 밑판보다
밝다 — 일반 dark theme convention).

| token | hex | 용도 | 현재 hardcode 출처 |
|---|---|---|---|
| `--surface-base` | `#0A0A0A` | app body alt 영역, 가장 깊은 바닥 | "alt `#0A0A0A`" |
| `--surface-body` | `#0F0F0F` | WorkspaceShell body bg | "body bg `#0F0F0F`" |
| `--surface-panel` | `#141414` | left/right pane, ticket dashboard column | "panel bg `#141414`" |
| `--surface-subpanel` | `#1A1A1A` | nested card, message bubble | "sub-panel `#1A1A1A`" |
| `--surface-modal` | `#1C1C20` | Dialog/Sheet/Popover (T-P4-058) | "modal `#1C1C20`" |

> 규칙: 같은 시각 레이어에서 인접한 두 surface 의 명도 차는 4 % 이상. modal 위에
> 또 modal 을 쌓지 않는다 (필요시 sheet → wizard step 으로 분기).

### 2.2 Border (외곽 / 구분선)

| token | hex | 용도 |
|---|---|---|
| `--border-subtle` | `#1A1A1A` | 같은 surface 내 약한 구분 |
| `--border-default` | `#1F1F1F` | panel 외곽, list item 구분선 |
| `--border-strong` | `#2A2A2A` | hover/focus, 카드 강조 |
| `--border-muted` | `#3A3A3A` | disabled / abandoned 영역 외곽 |

### 2.3 Text

본문은 4 등급. 보조 정보는 muted 이하만 사용.

| token | hex | 용도 | WCAG (vs `--surface-body` `#0F0F0F`) |
|---|---|---|---|
| `--text-primary` | `#E8E8EA` | 본문, headline | 14.6 : 1 → AAA |
| `--text-emphasis` | `#F0F0F0` | 강조 라벨, 활성 탭 | 15.7 : 1 → AAA |
| `--text-secondary` | `#C8C8CC` | 보조 본문, helper | 11.0 : 1 → AAA |
| `--text-muted` | `#A0A0A0` | metadata, timestamp | 7.4 : 1 → AAA |
| `--text-faint` | `#707070` | placeholder, disabled hint | 4.0 : 1 → AA (large only) |
| `--text-disabled` | `#505050` | disabled body | 2.4 : 1 → ✗ (decorative only) |
| `--text-ghost` | `#3A3A3A` | divider 라벨, 잔영 | 1.6 : 1 → ✗ (non-text only) |

> `#3A3A3A` / `#505050` 는 텍스트로 쓰지 말 것 (status `todo`/`abandoned` column
> header 의 dot/badge 는 OK — 본문 아님).

### 2.4 Accent / Brand

| token | hex | alias | 용도 |
|---|---|---|---|
| `--brand-orange` | `#FF6B2B` | productune 브랜드 | 로고, 주요 CTA |
| `--accent` | `#FF6B2B` | = `--brand-orange` = `--persona-po` | primary action, focus ring |

> **alias 정합** — productune 브랜드 오렌지는 PO 페르소나 색과 동일하다. 의도된
> 정합 (PO 가 사용자 face-to-product). 코드에서는 맥락에 맞는 token 을 골라 쓴다:
> 브랜드/CTA 맥락 → `--accent`, 페르소나 식별 맥락 → `--persona-po`.

### 2.5 Persona

| token | hex | 페르소나 | 용도 |
|---|---|---|---|
| `--persona-po` | `#FF6B2B` | PO | PresenceBar dot, message border, 주요 CTA |
| `--persona-designer` | `#A78BFA` | designer | 동상 |
| `--persona-dev` | `#38BDF8` | developer | 동상 |
| `--persona-qa` | `#34D399` | qa | 동상 |

### 2.6 Stage (PRD/Design/Build/QA/Deploy/Operate)

PRD/Design/Build 는 코드에서 확정. QA/Deploy/Operate 는
`stage-mapping.ts` 에 정의됨 — 본 spec 은 자리만 잡고 hex 는 코드 정합 후 확정한다
(open question 참조).

| token | hex | stage | 비고 |
|---|---|---|---|
| `--stage-prd` | `#A78BFA` | PRD | designer 페르소나 색과 동일 (PRD = designer 책임) |
| `--stage-design` | `#F472B6` | Design | pink 400 |
| `--stage-build` | `#38BDF8` | Build | dev 페르소나 색과 동일 |
| `--stage-qa` | TBD | QA | `stage-mapping.ts` 정합 필요 (OQ-1) |
| `--stage-deploy` | TBD | Deploy | 동상 |
| `--stage-operate` | TBD | Operate | 동상 |

### 2.7 Status (ticket lifecycle)

TicketDashboardView column header 기준.

| token | hex | status | 의미 |
|---|---|---|---|
| `--status-todo` | `#505050` | todo | 미착수 (neutral) |
| `--status-in-progress` | `#FF6B2B` | in-progress | 진행 중 (= accent — 주의 환기) |
| `--status-review` | `#E0B040` | review | 리뷰 대기 (warm) |
| `--status-done` | `#60B860` | done | 완료 (success) |
| `--status-blocked` | `#E04040` | blocked | 차단 (error) |
| `--status-abandoned` | `#3A3A3A` | abandoned | 폐기 (ghost) |

### 2.8 Health / Feedback

T-P4-059 SessionHealthBanner 기준. 일반 toast/inline 메시지에도 동일 적용.

| token | hex | 용도 |
|---|---|---|
| `--health-info` | `#38BDF8` | 정보, 안내 (= `--persona-dev` 와 동일 hex — 의미 충돌 없음, 맥락 분리) |
| `--health-success` | `#34D399` | 성공 (= `--persona-qa` 와 동일 hex) |
| `--health-warn` | `#FBBF24` | 경고 |
| `--health-error` | `#EF4444` | 오류 |

> `--health-info` / `--health-success` 의 hex 가 persona 와 겹치는 것은 의도. 토큰
> 명을 맥락에 맞게 분리하면 향후 light theme / 색약 대응에서 분리 변경 가능.

### 2.9 Contrast 표 (요약)

`--surface-body #0F0F0F` 위 텍스트 contrast (WCAG 2.2):

| text token | ratio | level | 용도 가이드 |
|---|---|---|---|
| `--text-primary` | 14.6:1 | AAA | 본문 OK |
| `--text-secondary` | 11.0:1 | AAA | 본문 OK |
| `--text-muted` | 7.4:1 | AAA | metadata OK |
| `--text-faint` | 4.0:1 | AA large | 18px+ 또는 14px bold 만 |
| `--text-disabled` | 2.4:1 | ✗ | 비활성 시각 only — 정보 전달 X |
| `--accent` `#FF6B2B` | 5.4:1 | AA | 본문 가능, 18px+ 권장 |
| `--persona-designer` `#A78BFA` | 7.6:1 | AAA | OK |
| `--persona-dev` `#38BDF8` | 7.5:1 | AAA | OK |
| `--persona-qa` `#34D399` | 9.8:1 | AAA | OK |
| `--health-error` `#EF4444` | 4.7:1 | AA | OK |
| `--health-warn` `#FBBF24` | 11.0:1 | AAA | OK |

> non-text UI (border/icon) 는 WCAG 1.4.11 의 3:1 만 충족하면 된다. 위 표 기준
> 모든 status/persona/stage 색이 통과.

---

## §3 Spacing scale

8px 그리드 + 4px sub-step. 14/18 같은 비-그리드 값은 **점진적으로** 그리드로 정렬한다
(본 round 강제 X — 마이그레이션 ticket 로 분리).

| token | px | rem | 권장 용도 |
|---|---|---|---|
| `--space-0` | 0 | 0 | reset |
| `--space-0-5` | 2 | 0.125 | hairline |
| `--space-1` | 4 | 0.25 | icon gap, badge padding y |
| `--space-1-5` | 6 | 0.375 | tight inline gap |
| `--space-2` | 8 | 0.5 | default inline gap, button padding y |
| `--space-2-5` | 10 | 0.625 | (legacy — 8 또는 12 로 정렬 권장) |
| `--space-3` | 12 | 0.75 | card padding inner |
| `--space-3-5` | 14 | 0.875 | (legacy — 12 또는 16 로 정렬 권장) |
| `--space-4` | 16 | 1.0 | section gap, default panel padding |
| `--space-4-5` | 18 | 1.125 | (legacy) |
| `--space-5` | 20 | 1.25 | column gap |
| `--space-6` | 24 | 1.5 | major section gap |
| `--space-7` | 28 | 1.75 | (legacy) |
| `--space-8` | 32 | 2.0 | hero spacing |
| `--space-10` | 40 | 2.5 | hero spacing |
| `--space-12` | 48 | 3.0 | activity bar 폭, modal outer |

### 3.1 현재 hardcode → token 매핑 (마이그레이션 hint)

| hardcode | → token |
|---|---|
| `4px` | `--space-1` |
| `6px` | `--space-1-5` |
| `8px` | `--space-2` |
| `10px` | `--space-2-5` (or 정렬 → 8/12) |
| `12px` | `--space-3` |
| `14px` | `--space-3-5` (or 정렬 → 12/16) |
| `16px` | `--space-4` |
| `18px` | `--space-4-5` (or 정렬 → 16/20) |
| `20px` | `--space-5` |
| `24px` | `--space-6` |
| `28px` | `--space-7` (or 정렬 → 24/32) |
| `32px` | `--space-8` |
| `40px` | `--space-10` |

---

## §4 Typography

### 4.1 Family

```
--font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue",
             Arial, sans-serif;
--font-mono: ui-monospace, "SF Mono", "Menlo", "Consolas", monospace;
```

> WorkspaceShell 의 현행 stack 유지. 한국어 fallback 은 OS 기본 (Apple SD Gothic
> Neo / Malgun Gothic) — 명시 X (시스템 위임).

### 4.2 Size scale

| token | px | 권장 용도 |
|---|---|---|
| `--text-2xs` | 9 | (legacy — 11 로 정렬 권장) |
| `--text-xs` | 10 | micro label, status pill (uppercase tracking) |
| `--text-xs-plus` | 11 | timestamp, breadcrumb |
| `--text-sm` | 12 | helper, secondary metadata |
| `--text-base` | 13 | body default (dense panes) |
| `--text-md` | 14 | body comfortable, button label |
| `--text-md-plus` | 15 | dialog body |
| `--text-lg` | 18 | section heading |
| `--text-xl` | 22 | pane title |
| `--text-2xl` | 28 | route headline |
| `--text-3xl` | 32 | onboarding headline |
| `--text-display` | 48 | hero (first-run wizard) |

### 4.3 Weight

| token | value | 용도 |
|---|---|---|
| `--weight-regular` | 400 | body |
| `--weight-medium` | 500 | label, button |
| `--weight-semibold` | 600 | heading, active state |
| `--weight-bold` | 700 | strong emphasis |
| `--weight-extrabold` | 800 | display only (`--text-display`) |

### 4.4 Line-height

| token | value | 용도 |
|---|---|---|
| `--leading-tight` | 1.3 | heading, hero |
| `--leading-snug` | 1.4 | dense list item |
| `--leading-normal` | 1.5 | body default |
| `--leading-relaxed` | 1.6 | long-form (PRD preview) |

### 4.5 Letter-spacing

| token | em | 용도 |
|---|---|---|
| `--tracking-normal` | 0 | body |
| `--tracking-tight` | -0.01 | display heading (선택) |
| `--tracking-wide` | 0.02 | secondary metadata |
| `--tracking-wider` | 0.04 | small uppercase label |
| `--tracking-widest` | 0.06 | status pill, tab label |
| `--tracking-extreme` | 0.08 | (legacy — 0.06 로 정렬 권장) |

### 4.6 Pair recipes (자주 쓰이는 조합)

| name | font | size | weight | tracking | line-height |
|---|---|---|---|---|---|
| `body` | sans | `--text-md` | regular | normal | normal |
| `body-dense` | sans | `--text-base` | regular | normal | snug |
| `metadata` | sans | `--text-sm` | regular | wide | snug |
| `label` | sans | `--text-md` | medium | normal | snug |
| `pill` | sans | `--text-xs` | semibold | widest | tight (uppercase) |
| `heading-pane` | sans | `--text-xl` | semibold | normal | tight |
| `heading-section` | sans | `--text-lg` | semibold | normal | tight |
| `display-onboarding` | sans | `--text-display` | extrabold | tight | tight |

---

## §5 Border radius

| token | px | 용도 |
|---|---|---|
| `--radius-xs` | 2 | hairline pill, mini badge |
| `--radius-sm` | 3 | (legacy — `--radius-xs` 또는 `--radius-md` 로 정렬) |
| `--radius-md` | 4 | input, button (default) |
| `--radius-lg` | 6 | card, message bubble |
| `--radius-xl` | 8 | modal, panel |
| `--radius-pill` | 20 | pill / chip |
| `--radius-full` | 9999 | avatar, dot |

> 한 컴포넌트 안에서 라디우스를 두 개 이상 섞지 말 것 (모달 8px 안의 버튼 4px 는
> OK — **다른 계층**이라 허용).

---

## §6 Elevation (shadow)

dark theme 에서 shadow 는 깊이라기보다 "modal 분리"용. 4 단만 운용.

| token | value | 용도 |
|---|---|---|
| `--elev-0` | none | 평면, 본문 |
| `--elev-sm` | `0 2px 8px rgba(0,0,0,0.4)` | tooltip, inline popover |
| `--elev-md` | `0 6px 18px rgba(0,0,0,0.45)` | FAB, dropdown |
| `--elev-lg` | `0 12px 32px rgba(0,0,0,0.5)` | dialog/sheet (T-P4-058) |

> dark theme 은 빛이 반대 방향이 아니라 "위에서 떨어지는 어둠 차단" 메타포.
> shadow 색은 검정 단일, 알파만 조정. light theme 추가 시 알파만 재계산.

---

## §7 Iconography

### 7.1 라이브러리

- **default = `lucide-react@1.14.0`** (이미 commit `a505e74` 에서 채택, memory 명시).
- **컬러 emoji 금지** — accessibility / 폰트 일관성. 이모지가 필요한 자리는 lucide
  아이콘 + 색 token 으로 대체.

### 7.2 Stroke width

| token | value | 용도 |
|---|---|---|
| `--icon-stroke-decorative` | 1.5 | 큰 hero 아이콘, 장식 |
| `--icon-stroke-soft` | 1.75 | dense pane 의 inline 아이콘 |
| `--icon-stroke-default` | 2 | 기본값 — 버튼, 메뉴, presence dot |
| `--icon-stroke-accent` | 2.25 | 강조 (selected tab, active CTA) |
| `--icon-stroke-bold` | 3 | 작은 사이즈 (≤12px) 가독성 보강 |

> 같은 행/그룹의 아이콘은 stroke 를 통일한다.

### 7.3 Size

| token | px | 용도 |
|---|---|---|
| `--icon-xs` | 12 | inline chip, 작은 버튼 (stroke 3) |
| `--icon-sm` | 14 | dense list, secondary action |
| `--icon-md` | 16 | default — button, menu |
| `--icon-lg` | 20 | activity bar, primary nav |
| `--icon-xl` | 22 | section header |
| `--icon-2xl` | 32 | empty state, onboarding step |
| `--icon-hero` | 48 | first-run wizard hero |

> `9 / 11 / 15` 는 legacy — 다음 마이그레이션에서 정렬 (12/14/16 로 흡수).

### 7.4 Color

- 기본 = `currentColor` (텍스트 색 상속).
- 의미를 가질 때 token 명시 (`--persona-*`, `--status-*`, `--health-*`).
- decorative 는 `--text-muted` 또는 `--text-faint`.

---

## §8 Components (token recipes)

본 단계는 라이브러리화 X. 기존 컴포넌트가 같은 token 조합을 쓰도록 spec 만 정의한다.

### 8.1 Button

| variant | bg | text | border | radius | padding | size |
|---|---|---|---|---|---|---|
| `primary` | `--accent` | `#0F0F0F` | none | `--radius-md` | `--space-2` × `--space-4` | `body` |
| `secondary` | `--surface-subpanel` | `--text-primary` | `--border-default` | `--radius-md` | 동상 | 동상 |
| `ghost` | transparent | `--text-secondary` | none | `--radius-md` | 동상 | 동상 |
| `destructive` | `--health-error` | `#0F0F0F` | none | `--radius-md` | 동상 | 동상 |

hover: bg 한 단 밝게 / border `--border-strong`.
focus-visible: outline `2px solid --accent`, offset `2px`.
disabled: opacity 0.4, cursor not-allowed.

> **§1.5.4 Feedback 정합** — 모든 button 은 `:active` pressed state + async action
> 시 inline `Loader2` (§9.2 `pdt-spin`) 의무. action 직후 무반응 = §1.5.4 위반.

### 8.2 Pill / Chip

uppercase, `pill` typography recipe, `--radius-pill`, padding `--space-1` × `--space-2-5`.

| variant | bg | text |
|---|---|---|
| status | `--status-*` 의 12% alpha | `--status-*` |
| stage | `--stage-*` 의 12% alpha | `--stage-*` |
| persona | `--persona-*` 의 12% alpha | `--persona-*` |
| neutral | `--surface-subpanel` | `--text-secondary` |

> ChatPanel 의 `rp-ctx` chip = stage variant. PersonaPresenceBar dot = persona variant
> (단 dot 은 chip 아닌 `--radius-full` 6px 원).

### 8.3 Tab

세로 (left rail) / 가로 둘 다 동일 token. active `--text-emphasis` + 하단 2px
`--accent` underline. inactive `--text-muted`. hover `--text-secondary`.

### 8.4 Banner (T-P4-059 SessionHealthBanner)

좌측 4px solid bar (= `--health-*`). bg = `--surface-subpanel`. icon = lucide
matching (`Info`/`AlertTriangle`/`AlertOctagon`/`CheckCircle2`), stroke 2, size 16,
color = `--health-*`. body = `body-dense` recipe.

> **§1.5.5 Escape 정합** — banner 는 우측 상단 dismiss X (`--icon-sm`,
> `--text-muted`) 의무. dismiss 후 복원 경로 (FAB 또는 menu) 필수.

### 8.5 Modal / Dialog (T-P4-058)

| 항목 | token |
|---|---|
| backdrop | `rgba(0,0,0,0.6)` |
| surface | `--surface-modal` |
| border | `--border-strong` |
| radius | `--radius-xl` |
| elevation | `--elev-lg` |
| header pad | `--space-5` `--space-6` `--space-3` |
| body pad | `--space-3` `--space-6` |
| footer pad | `--space-3` `--space-6` `--space-5` |
| close icon | lucide `X`, `--icon-md`, stroke 2, color `--text-muted` |

> **§1.5.5 Escape 정합** — 모든 modal 은 (a) Esc 키 (b) backdrop click (c) 우상단
> X (d) footer [Cancel] 중 **최소 2 개** 출구 의무. **destructive confirm modal**
> 은 (a) Esc 무효 + (d) [Cancel] 명시 정책 (실수 방지). form 입력 진행 modal 의
> backdrop click 은 "변경사항 confirm" 거쳐야 닫힘.

### 8.6 PersonaPresenceBar (참고 — 기존 코드)

각 페르소나 row: dot (8px circle, `--persona-*`) + name (`label` recipe,
`--text-primary`) + 상태 라벨 (`metadata`, `--text-muted`).
`working` 상태 = dot 에 `persona-blink` animation (§9 참조).

### 8.7 StageStrip

수평 6 stage. 현재 stage = `--stage-*` filled bar + `pill` 라벨. 비활성 stage =
`--border-default` outline + `--text-faint` 라벨.

### 8.8 PhaseTransitionGate

modal 패턴 위에 stage from→to 표시. stage 색은 `--stage-*` token,
라벨은 보호어 (영문 보존, §10).

> **§1.5.5 Escape 정합** — gate modal 도 [뒤로] / [Cancel] 명시 의무. 일방통행
> stage 진행 금지.

### 8.9 Empty pane (T-P4-046)

| 항목 | token |
|---|---|
| surface | `--surface-panel` |
| icon | lucide matching, `--icon-2xl`, stroke `--icon-stroke-decorative`, color `--text-faint` |
| headline | `heading-section` recipe, `--text-secondary` |
| description | `body-dense` recipe, `--text-muted`, 1 line |
| primary CTA | `secondary` button (§8.1) |

> **§1.5.3 Predictability 정합** — 모든 빈 pane / 빈 list 는 본 컴포넌트 사용.
> placeholder-only 금지, primary CTA 의무 (사용자 다음 행동 명시).

---

## §9 Motion

### 9.1 Tokens

| token | value | 용도 |
|---|---|---|
| `--motion-fast` | 120ms | hover, focus |
| `--motion-base` | 180ms | toggle, accordion |
| `--motion-slow` | 240ms | modal enter/exit |
| `--easing-standard` | `cubic-bezier(0.2, 0, 0, 1)` | 일반 |
| `--easing-emphasized` | `cubic-bezier(0.3, 0, 0, 1)` | modal |

### 9.2 Allowed animations

| name | spec | 용도 |
|---|---|---|
| `pdt-spin` | `1s linear infinite`, 360° rotate | lucide `Loader2` |
| `persona-blink` | `0.8s ease-in-out infinite alternate`, opacity 0.4 → 1.0 | PresenceBar `working` dot |
| `banner-slide-in` | `--motion-slow --easing-standard`, translateY(-8px) → 0 + opacity | SessionHealthBanner 진입 |
| `modal-fade-scale` | `--motion-slow --easing-emphasized`, opacity + scale(0.98) → 1 | Dialog |

> 위 4 개 외 추가 motion 은 **PR 단계에서 designer 리뷰 필요**.

### 9.3 prefers-reduced-motion

```css
@media (prefers-reduced-motion: reduce) {
  /* spin/blink/slide/fade-scale 모두 duration 1ms + iteration-count 1 */
}
```

리듀스드 모션에서는 spinner 도 회전 정지 — Loader2 아이콘은 `--health-info` 색
정적 표시 + aria-live 로 진행 알림.

---

## §10 i18n & 어휘 가드

### 10.1 보호어 enum (영문 보존)

한국어 모드에서도 **번역하지 않는다**. T-P4-057 i18n linter 가 강제.

| 카테고리 | 보호어 |
|---|---|
| 페르소나 | `PO`, `designer`, `developer`, `qa` |
| Phase | `Phase 1`, `Phase 2`, `Phase 3`, `Phase 4`, `Phase 5` |
| Stage | `PRD`, `Design`, `Build`, `QA`, `Deploy`, `Operate` |
| Status | `todo`, `in-progress`, `review`, `done`, `blocked`, `abandoned` |
| Schema field | `slug`, `round`, `prd_path`, `tickets`, `ambiguity_score`, `confidence` 등 |
| Product name | `productune`, `pdt-*` (persona slug) |

### 10.2 사용자 가시 한국어 패턴

- 동사형 라벨은 한국어 명사형 권장 ("저장" / "취소" / "닫기").
- 전문 용어는 보호어 그대로 + 한국어 보조 설명 ("PRD 초안 — 제품 요구 명세").
- 시간/숫자 포맷은 OS locale 위임 (`Intl.DateTimeFormat`, `Intl.NumberFormat`).

### 10.3 코드 레벨 정합

- 컴포넌트 내 hard-coded 영문/한글 텍스트는 i18n 키 경유. 보호어는 키 값에 영문
  그대로 들어간다 (`stage.qa.label = "QA"`).

---

## §11 Migration plan (개요)

본 문서는 **정의 only**. 실제 hardcode → token 마이그레이션은 별도 ticket 으로
운영한다 (PO 가 Round 4 enh 또는 Phase 5 로 큐잉).

권장 마이그레이션 순서:

1. **§2 Color** — 가장 영향 큼. CSS variable 정의 (`globals.css` 또는 동등 위치)
   + StageStrip / PersonaPresenceBar / TicketDashboardView / SessionHealthBanner /
   Modal 부터 교체.
2. **§7 Iconography** — lucide stroke / size token 적용. 동시에 컬러 emoji 잔재
   제거 grep.
3. **§3 Spacing** + **§5 Radius** — 8px 그리드 정렬과 함께 진행. legacy 값
   (10/14/18/28) 은 정렬 PR 1 회로 흡수.
4. **§4 Typography** — recipe 화 (`text-pill`, `text-body-dense` utility class).
5. **§6 Elevation** + **§9 Motion** — 마지막. shadow/animation 은 사용처가 적어
   영향 작음.
6. **§1.5 UX principles 정합 audit** — 별도 ticket. recent dogfood (ChatPanel
   restart button feedback 부재) 같은 위반을 grep + 컴포넌트 patch.

각 단계마다 separate ticket. visual regression (스크린샷) 은 후속 storybook ticket
도착 후.

---

## Open questions

- **OQ-1** — `--stage-qa` / `--stage-deploy` / `--stage-operate` hex 값을
  `stage-mapping.ts` 에서 확정 후 §2.6 표 채우기. 본 spec 에서는 자리만 확보.
- **OQ-2** — `--text-faint` `#707070` 의 large-text-only 정책을 i18n 한국어 본문
  (16px regular) 에서 어떻게 표기할지 — 한국어 hinting 가독성 별도 검증 필요.
- **OQ-3** — productune 브랜드 오렌지 = PO 페르소나 색 alias 의 향후 분리 가능성.
  Phase 5 light theme 에서 PO 페르소나는 색 그대로, 브랜드는 별도 hex 로 분리할지
  PO 결정 필요.
- **OQ-4** — `health-info` / `health-success` hex 가 persona 와 겹치는 것을 의도된
  alias 로 둘지 분리할지 — 색약 사용자 검증 후 결정.
- **OQ-5** — 본 spec 의 token 명을 CSS custom property 네임으로 그대로 쓸지,
  Tailwind config 의 `theme.extend.colors` 키로 매핑할지 — 마이그레이션 ticket 의
  technical decision (developer 페르소나 검토 필요).
- **OQ-6** — §1.5 sub-rule 체크리스트를 PR template 에 강제 항목으로 박을지,
  designer review checklist 로만 둘지 — Phase 4 close 전 결정.

---

## Implementation notes (참고용 — 본 spec 은 코드 변경 X)

- CSS variable 정의 위치는 `:root` (또는 dark theme `.theme-dark` 클래스) 한 곳.
  light theme 추가 시 `.theme-light` 에 동일 토큰을 다른 hex 로 재정의.
- token 명은 BEM-ish dash 케이스 유지 (`--surface-modal`). camelCase 또는 dot
  구분자는 사용 금지 (CSS variable 호환성).
- Tailwind 사용 시 `tailwind.config` 의 `theme.extend.{colors,spacing,fontSize,
  borderRadius,boxShadow,transitionTimingFunction}` 에 매핑하고 컴포넌트는
  `bg-surface-modal` `text-text-primary` 같은 utility 만 쓴다.
- alpha 변형 (status pill 의 12% 등) 은 `color-mix(in oklab, var(--status-done)
  12%, transparent)` 또는 사전 계산된 별도 token (`--status-done-bg`) 으로 대응.
  마이그레이션 ticket 에서 결정.

---

## References (현재 코드 출처)

- `WorkspaceShell` — font-family stack 출처
- `StageStrip` — stage color 출처
- `PersonaPresenceBar` — persona color, blink animation 출처
- `ChatPanel` — message border (persona), `rp-ctx` chip (stage) 출처. **restart
  button feedback 부재** — §1.5.4 위반 dogfood 사례 (별도 ticket 으로 fix).
- `TicketDashboardView` — status color 출처
- `SessionHealthBanner` (T-P4-059) — health color, banner 패턴 출처
- `Modal` (T-P4-058) — `--surface-modal` 출처
- `Empty pane` (T-P4-046) — §1.5.3 Predictability empty state reference
- `lucide-react@1.14.0` — 아이콘 라이브러리 (commit `a505e74`)
- `docs/designer/decisions.md` — 관련 design decisions log
