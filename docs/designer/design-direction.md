# productune Phase 4 — 디자인 방향

**Slug**: phase4-gui-full-cycle  **Created**: 2026-04-30  **Status**: 결정 (Round 1 / Phase 4 GUI base)
**PRD anchor**: [docs/prd/productune.md#phase-4--terminal-무의존-gui-풀-사이클-future](../prd/productune.md#phase-4--terminal-무의존-gui-풀-사이클-future)
**Round**: phase4-r5

> Phase 4 의 모든 GUI 작업이 따라야 할 디자인 결정 문서. 컴포넌트 단위 스펙이 아닌 **방향성 + 토큰 + 원칙**. Toss 디자인 시스템 ([toss.im](https://toss.im) / [SLASH 컨퍼런스 자료](https://toss.tech)) 의 "심플 + 신뢰감 + 여백 + 무장식" 정신을 차용하되, Toss 고유 자산 (Toss Product Sans, Toss Blue) 은 그대로 쓰지 않고 productune 고유 토큰으로 재정의.

---

## 0. 컨텍스트 — 누가, 어디서, 어떤 기분으로

| 항목 | 결정 |
|---|---|
| **사용자** | 기획자 개인 (비-개발자, non-developer). 팀 협업 도구 X — 1인 사용 데스크톱 앱. |
| **플랫폼** | Electron desktop (React/TypeScript renderer, Vite). mac/Windows/Linux. |
| **다크 모드** | 지원. system default 따라가기 + 사용자 수동 토글 가능. |
| **첫인상 목표** | **안심**. 압도되지 않고, 유치하지 않고, 무거운 기업 도구 같지도 않은 — "조용한 신뢰감". |
| **사용 시간대** | 하루 1–4시간 집중 사용. 눈이 피로하지 않을 것. |
| **언어** | 한국어 우선, 영어 부분 혼용 (티켓 ID, 페르소나 명, 코드 식별자). |

---

## 1. 디자인 원칙 (5개)

> 결정의 근거. 컴포넌트 단위 의사결정에서 충돌이 있을 때 이 5개로 결심한다.

1. **여백을 줄이려 하지 않는다 (Whitespace as feature)**
   정보 밀도 높이는 게 목표가 아님. 한 화면에 한 가지 결정이 명확히 보이도록. 빈 공간은 "비어있음" 이 아니라 "다음 행동을 위한 호흡".

2. **장식 0, 의미 100 (No decoration)**
   그라디언트 / 입체감 / 패턴 / 일러스트 적극 회피. 색은 의미가 있을 때만 (primary action, status, semantic). 그림자도 elevation 의 신호일 때만.

3. **글자가 UI 의 주인 (Typography-first)**
   아이콘 / 색 / 박스가 아니라 **타이포그래피 위계** 가 정보 구조를 만든다. weight 와 크기 차이만으로도 hierarchy 가 작동해야 함.

4. **신뢰감은 일관성에서 (Consistency over cleverness)**
   같은 의미는 항상 같은 색 / 같은 weight / 같은 간격. 화면마다 다르게 멋부리지 않는다. "예측 가능함" = 안심.

5. **개발 어휘 노출 0 (Hide the engineering)**
   git, branch, commit, PR, env, deploy 같은 단어가 GUI 표면에 등장하지 않는다 (PRD Round 2 / Round 3 정책). 디자인은 그 추상화를 자연스럽게 해야 함 — "버튼 눌렀더니 뭔가 됐다" 가 아니라 "내가 한 일이 잘 저장됐다".

---

## 2. 컬러 시스템

### 2.1 Primary — Productune Indigo

Toss Blue (#3182F6) 와 차별화. 약간 더 깊고 차가운 indigo 계열로 "조율 (tune)" 의 정적 신뢰감을 표현.

| 토큰 | Hex | 용도 |
|---|---|---|
| `primary-50` | `#EEF2FF` | hover 배경, badge 배경 (light) |
| `primary-100` | `#E0E7FF` | selected 배경 (light) |
| `primary-200` | `#C7D2FE` | disabled primary, border 강조 |
| `primary-300` | `#A5B4FC` | secondary 강조선 |
| `primary-400` | `#818CF8` | dark mode hover |
| `primary-500` | `#6366F1` | dark mode 보조 |
| **`primary-600`** | **`#4F46E5`** | **메인 — primary button, link, focus ring** |
| `primary-700` | `#4338CA` | hover/pressed (light) |
| `primary-800` | `#3730A3` | active/pressed |
| `primary-900` | `#312E81` | 매우 강한 강조 (드물게) |
| `primary-950` | `#1E1B4B` | dark mode primary 배경 강조 |

**다크 모드 메인**: `primary-500` (#6366F1) — `primary-600` 은 다크 배경에서 채도가 너무 강해 보임.

**Mockup accent (2026-05-06)**: mockup `--po: #FF6B2B` 는 PO 페르소나 / Activity Bar active 인디케이터 / status bar / primary CTA 의 **PO-orange accent** 로 사용. Primary Indigo 와 별도 채널 — Indigo 는 글로벌 primary, PO-orange 는 PO 세션 / 자동저장 / send 버튼 등 "PO-channel" 의미. 두 색의 동시 노출 영역은 status bar 1곳으로 한정.

### 2.2 Neutrals — Productune Gray (cool slate)

차가운 slate 계열. 따뜻한 회색 (warm gray) 은 "친근함" 보다 "오래된 도구" 처럼 느껴질 수 있어 차가운 쪽 선택. 11단계.

| 토큰 | Hex | 용도 |
|---|---|---|
| `gray-0` | `#FFFFFF` | 순백 (light bg) |
| `gray-50` | `#F8FAFC` | page bg (light) |
| `gray-100` | `#F1F5F9` | surface (card 배경) |
| `gray-200` | `#E2E8F0` | border (subtle) |
| `gray-300` | `#CBD5E1` | border (default), divider |
| `gray-400` | `#94A3B8` | placeholder, icon (muted) |
| `gray-500` | `#64748B` | secondary text |
| `gray-600` | `#475569` | body text (보조) |
| `gray-700` | `#334155` | body text (메인) |
| `gray-800` | `#1E293B` | heading (light) |
| `gray-900` | `#0F172A` | strongest text (light) |
| `gray-950` | `#020617` | page bg (dark) |

### 2.3 Semantic

의미가 명확한 4종만. "info" 는 primary 와 혼동 없게 sky 계열로 분리.

| 토큰 | Light Hex | Dark Hex | 용도 |
|---|---|---|---|
| `success-500` | `#10B981` | `#34D399` | env ✅ 동기, QA pass, 자동저장 완료 |
| `warning-500` | `#F59E0B` | `#FBBF24` | env ⚠️ 미동기, confidence < 0.7, 외부 의존성 미충족 |
| `error-500` | `#F43F5E` | `#FB7185` | env 🔴 누락, 빌드 실패, main push 차단 |
| `info-500` | `#0EA5E9` | `#38BDF8` | 외부 문서 fetch 안내, "마지막 업데이트: N시간 전" 배너 |

semantic 색은 모두 **fill 보다 outline + tinted bg** 로 사용 (Toss 패턴). 예: 에러 토스트 = `error-500` 1px border + `error-500/8% bg` + `error-700 text` (light) / `error-300 text` (dark).

### 2.4 레이어 정의 (Background / Surface / Border / Text)

| 레이어 | Light | Dark |
|---|---|---|
| **Background (page)** | `gray-50` (#F8FAFC) | `gray-950` (#020617) |
| **Surface 1 (card, panel)** | `gray-0` (#FFFFFF) | `gray-900` (#0F172A) |
| **Surface 2 (elevated, modal)** | `gray-0` + shadow-md | `gray-800` (#1E293B) |
| **Surface inset (input)** | `gray-50` | `gray-900` |
| **Border subtle** | `gray-200` | `gray-800` |
| **Border default** | `gray-300` | `gray-700` |
| **Border strong (focus)** | `primary-600` | `primary-500` |
| **Text primary** | `gray-900` | `gray-50` |
| **Text body** | `gray-700` | `gray-200` |
| **Text muted** | `gray-500` | `gray-400` |
| **Text disabled** | `gray-400` | `gray-600` |

### 2.5 그림자

elevation 신호일 때만. 매우 절제 — Toss 처럼 1–2 단계만.

| 토큰 | Light | Dark |
|---|---|---|
| `shadow-sm` | `0 1px 2px 0 rgb(15 23 42 / 0.04)` | `0 1px 2px 0 rgb(0 0 0 / 0.4)` |
| `shadow-md` | `0 4px 12px -2px rgb(15 23 42 / 0.08)` | `0 4px 12px -2px rgb(0 0 0 / 0.5)` |
| `shadow-lg` | `0 12px 32px -8px rgb(15 23 42 / 0.12)` | `0 12px 32px -8px rgb(0 0 0 / 0.6)` |

`shadow-lg` 는 modal / popover 에만. 카드 / 버튼은 그림자 X (border 만).

---

## 3. 타이포그래피

### 3.1 폰트 — Pretendard (Variable)

[Pretendard](https://github.com/orioncactus/pretendard) 채택. 사유:
- Toss Product Sans 를 그대로 쓸 수 없음 (라이선스).
- 한국어 UI 의 사실상 표준 — 한글 자형 균형 + 영문 (Inter 기반) 자연스러운 혼용.
- Variable font 로 weight 100–900 무단계 조정 가능 (번들 한 개로 전체 위계).
- OFL 라이선스로 상업 사용 자유.

**번들**: `Pretendard-Variable` (woff2). subset 은 KR + Latin 만. font-display: swap.

**fallback 스택**:
```css
font-family: 'Pretendard Variable', Pretendard, -apple-system, BlinkMacSystemFont,
  'Apple SD Gothic Neo', 'Noto Sans KR', system-ui, sans-serif;
```

### 3.2 Type scale

데스크톱 기준. 모바일 지원 X 이므로 단순 단일 scale.

| 토큰 | size / weight / lh / tracking | 용도 |
|---|---|---|
| `display` | 32px / 700 / 1.25 / -0.02em | 환영 / 큰 모달 / empty state hero |
| `title-1` | 24px / 700 / 1.3 / -0.02em | 페이지 타이틀, PRD 제목 |
| `title-2` | 20px / 600 / 1.35 / -0.015em | 섹션 헤더, 모달 타이틀 |
| `title-3` | 17px / 600 / 1.4 / -0.01em | 카드 타이틀, 패널 헤더 |
| `body-lg` | 16px / 400 / 1.6 / 0 | 본문 (긴 텍스트, PRD 렌더) |
| **`body`** | **15px / 400 / 1.55 / 0** | **기본 본문 (UI 디폴트)** |
| `body-sm` | 14px / 400 / 1.5 / 0 | 보조 설명, 폼 도움말 |
| `caption` | 13px / 400 / 1.4 / 0 | 메타데이터, 타임스탬프, footer |
| `label` | 12px / 500 / 1.3 / 0.01em | 폼 레이블, badge, tag |
| `code` | 13px / 400 / 1.5 / 0 | 인라인 코드, 티켓 ID, 페르소나 명 |

> **중요**: 한글은 영문보다 시각적으로 무거워 보임. heading 에 음수 letter-spacing 적용으로 답답함 완화 (Toss 패턴). 본문은 0 그대로 — 가독성 우선.

### 3.3 Weight 사용 규칙

Pretendard variable 의 weight 4단계만 사용 — 무분별한 weight 혼용 금지.

| Weight | 명칭 | 용도 |
|---|---|---|
| **400** | Regular | 본문, body 전반 |
| **500** | Medium | 강조 (인라인), label, 비활성 버튼 |
| **600** | SemiBold | 카드 타이틀, 작은 heading |
| **700** | Bold | display, title-1, primary button 텍스트 |

Light (300) / ExtraBold (800+) 사용 X — 시각적 노이즈만 추가.

### 3.4 코드 폰트

`'JetBrains Mono', 'D2Coding', 'SF Mono', Menlo, monospace` — 티켓 ID, 페르소나 식별자, 인라인 코드. JetBrains Mono 우선 (한글 fallback 자연스러움).

---

## 4. 스페이싱 & 레이아웃

### 4.1 4px base grid

모든 간격 / 사이즈 = 4 의 배수. 예외 X.

| 토큰 | px | 주 용도 |
|---|---|---|
| `space-1` | 4 | 아이콘-텍스트 사이 (촘촘) |
| `space-2` | 8 | 인라인 요소 간 |
| `space-3` | 12 | 폼 필드 내부 (label-input) |
| **`space-4`** | **16** | **기본 — 컴포넌트 내부 padding** |
| `space-5` | 20 | 카드 내부 padding |
| `space-6` | 24 | 카드 간격, 섹션 내부 |
| `space-8` | 32 | 섹션 간격 |
| `space-10` | 40 | 큰 영역 분리 |
| `space-12` | 48 | 페이지 여백 (바깥 gutter) |
| `space-16` | 64 | hero / empty state 위아래 |

### 4.2 모서리 반경 (radius)

| 토큰 | px | 용도 |
|---|---|---|
| `radius-sm` | 6 | badge, tag, 인라인 코드 배경 |
| **`radius-md`** | **10** | **버튼, input, 작은 카드** |
| `radius-lg` | 14 | 카드, 패널 |
| `radius-xl` | 20 | modal, popover |
| `radius-full` | 9999 | avatar, dot indicator, 둥근 토글 |

> Toss 보다 0.5–1px 더 큰 radius. 차가운 slate + indigo 조합에서 너무 각진 모서리는 차가워 보임 — 살짝 부드럽게.

### 4.3 Electron 윈도우 기본 레이아웃 (mockup 기준)

> **2026-05-06 갱신 (mockup-as-source)**: `docs/artifacts/v0.4/productune/mockups/mockup.html` 을 spec 의 진실로 채택. 이전 4-column (48 / 240 / 1fr / 360) + 위쪽 단독 breadcrumb 행 → **mockup 의 Activity Bar 48px / Side Panel 260px / Main 가변 split-pane / Right Panel (PO Chat) 340px** 로 갱신. **상단 단독 breadcrumb 행 제거** — Stage 는 Project tab 내부 strip 으로 + Right Panel 의 ctx 라인 stage chip 으로 노출 (이중 노출 = 의도적, 사용자가 어떤 panel 을 보고 있어도 stage 가 시야에 있음).

```
┌────────────────────────────────────────────────────────────────────────────┐
│ Title bar 36px — traffic dots / Quick Open trigger (⌘P) center           │
├──┬──────────────┬───────────────────────────────────────┬──────────────────┤
│A │ Side panel   │ Main panel                            │ Right panel      │
│B │ 260px        │ (split-capable, dynamic panes + tabs) │ 340px            │
│ 4│              │                                       │                  │
│ 8│ ─ 4 tabs:    │  hbox / vbox 재귀 split tree          │  PO Chat (단일)  │
│ p│   Explorer   │  각 leaf = pane (탭 bar + 컨텐츠)     │                  │
│ x│   Project    │  pane resize handle 4px (col / row)   │  rp-hdr (35px)   │
│  │   Team       │                                       │  rp-ctx (stage)  │
│ +│   Settings   │  pane 컨텐츠 = tab dispatcher:        │  rp-msgs flex    │
│ ┌│              │   markdown / preview / env-view /     │  rp-input        │
│ logo (top)      │   ticket-review / persona-def /       │                  │
│ ┘│              │   skill-matrix / design-gate /        │  minimize / X    │
│  │              │   terminal / browser                  │  토글 가능       │
├──┴──────────────┴───────────────────────────────────────┴──────────────────┤
│ Status bar 22px — full width — PO-orange bg                                │
└────────────────────────────────────────────────────────────────────────────┘
```

| 영역 | 사이즈 | 비고 |
|---|---|---|
| **Title bar** | 36px (height) | mac traffic light + 가운데 Quick Open trigger (`⌘P`, min 640 / max 900px) |
| **Activity Bar** | 48px (width, 고정) | 상단 logo (24px) + **4 아이콘 — Explorer / Project / Team / Settings**. active 표시 = 좌측 2px PO-orange bar (`::before`). Lucide-react 매핑: FolderTree / LayoutDashboard / Users / Settings (mockup inline SVG → 구현 시 lucide-react 동등 아이콘) |
| **Side panel** | 260px (width, 고정 — collapsed 시 0) | Activity Bar 선택에 따라 탭 view 전환 (`sp-view.active`). 탭 동일 아이콘 재클릭 = 토글 (collapsed/expanded). 탭별 내용은 §4.3.1 |
| **Main panel** | 1fr (가변, min 150×100 per pane) | **split-capable** — `hbox` / `vbox` 재귀 트리. 각 leaf pane = tab bar + 컨텐츠. pane 내부에 split-right / split-down / close-pane 버튼. drag-and-drop tab reorder + cross-pane move. 빈 pane = empty state (Quick Open / 탭 추가 단축키 안내) |
| **Right panel (PO Chat)** | 340px (width, 고정 — collapsed 시 0) | **단일 PO 세션 고정** (2026-05-06). header (rp-hdr 35px) + ctx 라인 (stage chip + round-N + active ticket) + 메시지 list (페르소나별 좌측 2px accent bar) + textarea + persona selector + Send. **minimize / close 버튼 — 닫혀도 우하단 FAB (`💬 PO`) 로 항시 재호출 가능** |
| **Status bar** | 22px (height) | **full width — Activity Bar / Side / Main / Right 모두 위에 걸침**. PO-orange bg. 좌측: branch-like 식별자 (작업 식별 — 사용자 어휘로 매핑) / PO active dot / Design Review pending. 우측: ticket count / model badge / vercel status |

**최소 윈도우 사이즈**: 1280×800. **기본**: 1440×900. (mockup 기본 설계가 1440 너비 가정.)

**상단 단독 breadcrumb 행 제거 근거 (2026-05-06)**: 4-column 레이아웃에서 상단 breadcrumb 행 (64px) 은 Right Panel 위쪽에 시각적 공백을 만들고, Main 의 split-pane 시스템과 경쟁. Stage 정보는 (a) Project tab 의 Stage strip, (b) Right Panel 의 ctx 라인 stage chip 두 군데에서 의도적으로 중복 노출 — 사용자는 Project tab 또는 PO Chat 둘 중 하나는 항상 본다는 가정.

**PO chat 우측 고정 결정 근거 (2026-05-04 유지)**: 어떤 stage / 어떤 main pane 컨텐츠에서든 사용자가 PO 에게 즉시 질문할 수 있어야 한다. chat 이 Main 영역과 같은 split-pane 트리에 들어가면 ticket-review / 디자인 리뷰가 표시될 때 chat 이 사라짐. 우측 고정으로 두 영역이 독립적 폭을 유지. 단 사용자가 임시로 polished view 를 원할 때 minimize → FAB 로 회수 가능.

#### 4.3.1 Side panel — 4 tab 컨텐츠

| 탭 | sp-hdr 라벨 | 본문 구조 | 매핑 ticket |
|---|---|---|---|
| **Explorer** | `Explorer` + `+` 새 프로젝트 버튼 | 검색 박스 (정규식 `.*` / 대소문자 `Aa` / 단어 `W` 토글) + 파일 트리. Quick Open ⌘P 와 별도, 트리 기반 nav. 검색 모드 진입 시 검색 결과 행 (filename + line + match highlight) 노출 | T-P4-045 |
| **Project** | `Project` + 우측 프로젝트 slug | (a) **Stage strip** — sdot-item 6개 (PRD / Design / Build / QA / Deploy / Operate, done/cur/pending 상태). (b) **Rounds** — round-N pp-row + sub-items (PRD / Design Gate / Tickets (N) / QA Verdict). 각 sub-item 클릭 = main 에 해당 tab 열기. (c) **Preview** — Local (localhost:3000) / Vercel preview. (d) **Recent Activity** — Dev/Designer turn 정보 mono-font 1행. | T-P4-040 (Stage strip) / T-P4-043 (Tickets) / T-P4-047 (전체) |
| **Team** | `Team` | (a) **Personas (4)** — avatar(p-avatar) + name + role + model. 클릭 = persona-def tab 열기. (b) **Skills** — sp-row 일부 + `Matrix ↗` 링크. (c) **Wiki / Memory** — User memory / Project state / Promotion candidates (warn badge for count) | T-P4-044 / T-P4-049 |
| **Settings** | `Settings` | (a) **Environment** — Project .env / Project secrets / User global (vars 카운트). (b) **Models** — Catalog. (c) **MCP Servers** — graphiti / figma / linear (s-badge ok/err). (d) **Hooks** — PreToolUse / PostToolUse (ok 카운트). T-P4-024 의 git workflow 토글도 본 탭으로 통합. | T-P4-024 / T-P4-048 |

#### 4.3.2 Main panel — pane / tab dispatcher

mockup 의 7+2 pane 타입을 dispatcher 로 라우팅. `openTab(tabId, type, props)` API 가 tab 을 active pane 에 추가.

| Tab type | 컨텐츠 | 사용처 |
|---|---|---|
| `markdown` | md-toolbar (crumb + edit/preview 토글) + md-view (h1/h2/code/table 렌더) + md-edit (mono editor) | PRD / 티켓 / Wiki / 메모리 파일 |
| `preview` | prev-chrome (URL bar + Local/Vercel toggle-grp) + prev-body (iframe placeholder) | Project tab 의 Preview 클릭 |
| `env-view` | layer 선택 + env-table (key/value/mask) | Settings 의 Environment 항목 |
| `ticket-review` | tr-body (ticket body + persona Activity 표) + tr-actions (승인/수정/거절 footer) | Project tab 의 ticket pp-row 클릭 |
| `persona-def` | pd-header (avatar/name/role/model) + edit/preview 토글 + pd-content (페르소나 정의 md) | Team tab 의 persona-row 클릭 |
| `skill-matrix` | sm-toolbar + sm-table (skill × persona 체크박스 그리드) + sm-add | Team tab 의 `Matrix ↗` |
| `design-gate` | dg-tabs (System / Flow / Wireframe / Mockup) + dg-body (산출물 viewer) + dg-footer (승인/수정/다시 작업 액션) | Project tab 의 Design Gate pp-row |
| `terminal` | term-content (mono, blink cursor) | Pane 의 `> Terminal` 버튼 |
| `browser` | browser-chrome (URL bar) + browser-body | Pane 의 🌐 버튼 |

Pane operations: `splitRight` / `splitDown` / `closePane` / `setActivePane` / drag-tab-to-pane (pane-drop-zone glow). 빈 pane (`empty-state`) = Quick Open + 단축키 안내 텍스트.

#### 4.3.3 Right panel — PO Chat

```
┌─────────────────────────────────────┐
│ rp-hdr 35px                         │
│ [P] PO Chat            ─  ×        │
├─────────────────────────────────────┤
│ rp-ctx — [Build chip] round-3 · T-001 in review │
├─────────────────────────────────────┤
│ rp-msgs (flex 1, scroll)            │
│  ┌ trace ─ → new task ...          │
│  ┌ po (orange border-l) ─ 메시지   │
│  ┌ designer (purple)   ─           │
│  ┌ dev (sky)           ─           │
│  ┌ qa (green)          ─           │
│  ┌ user (right-aligned, no border) │
├─────────────────────────────────────┤
│ rp-ta (textarea, mono fallback)     │
│ [@ pdt-po ▼]              [↑ Send] │
└─────────────────────────────────────┘
```

메시지 타입별 좌측 border 색 (CSS variable):
- po → `var(--po)` `#FF6B2B`
- designer → `var(--designer)` `#A78BFA`
- dev → `var(--dev)` `#38BDF8`
- qa → `var(--qa)` `#34D399`
- trace → no border, mono caption gray
- user → no border, right-aligned, gray-overlay bg

Persona selector (`@ pdt-po / @ pdt-designer / @ pdt-developer / @ pdt-qa`) 는 다음 메시지의 위임 대상. `/` 명령어 prefix 는 향후 (slash command palette).

### 4.4 콘텐츠 폭 제약

긴 텍스트 가독성 위해 readable-width 제약:
- PRD / 디자인 산출물 본문: `max-width: 720px` (한글 약 50–60자/줄)
- 채팅 메시지: `max-width: 640px`
- 티켓 카드 grid: `min 320px` × `max 420px` per card

---

## 5. 컴포넌트 스타일 원칙

> 본 섹션은 **원칙** 만 정의. 실제 prop / variant / state 매트릭스는 컴포넌트 라이브러리 구현 라운드 (Phase 4 Round 0–1) 에서 별도 design doc.

### 5.1 Button

4종만. **무분별한 variant 추가 금지.**

| Variant | Light bg / text / border | Hover | Pressed | Disabled |
|---|---|---|---|---|
| **primary** | `primary-600` / `gray-0` / 없음 | `primary-700` | `primary-800` | `primary-200` bg, `gray-0` text |
| **secondary** | `gray-100` / `gray-900` / `gray-200` 1px | `gray-200` bg | `gray-300` bg | `gray-100` bg, `gray-400` text |
| **ghost** | 투명 / `gray-700` / 없음 | `gray-100` bg | `gray-200` bg | `gray-400` text |
| **destructive** | `error-500` / `gray-0` / 없음 | `error-600` | `error-700` | 표시 X (대신 confirm modal) |

- **사이즈 3종**: `sm` (28h, 12px text), `md` (36h, 15px text — **기본**), `lg` (44h, 16px text)
- **Padding**: `sm` 8/12, `md` 10/16, `lg` 12/20
- **Radius**: `radius-md` (10px) 통일. 둥근/사각 토글 X.
- **Focus ring**: `outline: 2px solid primary-600; outline-offset: 2px;` — 모든 variant 공통.
- **아이콘+텍스트**: 아이콘 16px (sm/md), 18px (lg). 아이콘-텍스트 gap = `space-2` (8px).
- **Loading**: 텍스트 그대로 + 좌측 spinner 16px. 텍스트 사라뜨리지 않음 (위치 점프 방지).

### 5.2 Input / Textarea

```
[ Label (label token, gray-700) ]
[ ┌──────────────────────────────────┐ ]
[ │  Input                           │ ]
[ └──────────────────────────────────┘ ]
[ Helper text (caption, gray-500) ]
```

- **Default**: `gray-50` bg + `gray-300` 1px border + `gray-900` text + radius-md.
- **Hover**: border `gray-400`.
- **Focus**: border `primary-600` (2px inset 대신 1px + outer ring `primary-600/24%`). bg → `gray-0`.
- **Error**: border `error-500` + helper text `error-600`.
- **Disabled**: bg `gray-100`, text `gray-400`, border `gray-200`.
- **Padding**: 10/14 (sm), 12/16 (md — 기본), 14/18 (lg).
- **Placeholder**: `gray-400`. 절대 영구 label 대용으로 쓰지 않음.

Textarea: 동일 토큰 + 최소 height 96px + resize: vertical only.

### 5.3 Card

3종 — 용도별 약한 차별화.

| 종류 | 용도 | 스타일 |
|---|---|---|
| **ticket row/card** | Project 탭 ticket row + Main `ticket-review` card | Surface 1 + `gray-200` 1px border + radius-lg + p `space-5` (20). hover 시 border `gray-300` + 약한 lift (translate Y -1px, transition 120ms). 독립형 ticket board 는 만들지 않음. |
| **chat bubble** | PO/페르소나 메시지 | 페르소나별 좌측 2px accent bar (mockup `cm-bubble`) + Surface 1 + radius-lg (좌상은 0) + p `space-3` (12). 사용자 메시지는 우측 정렬, gray-overlay bg. |
| **env var row** | env table row | bg 없음 (table 배경에 의존), 행 높이 44px, row hover `gray-50`. status badge 좌측 8px gap. |

공통:
- **그림자 없음** (border 만으로 elevation 표현). 모달 / popover 만 shadow.
- **selected**: `primary-600` 2px border + `primary-50` bg (light).
- **drag handle / context menu**: hover 시에만 우측 노출.

### 5.4 Badge / Status indicator

크기 2종, 모두 `radius-sm`.

| 종류 | 사이즈 | 토큰 |
|---|---|---|
| **dot** | 8px circle | semantic 색 단색 |
| **pill** | 22px height, padding 2/8, label token | bg = `<color>-50` (light) / `<color>-950` (dark), text = `<color>-700` (light) / `<color>-300` (dark) |

env 4종 badge:
- ✅ 전체 동기 → success
- ⚠️ prod 없음 → warning
- 🔴 로컬 없음 → error
- 🔒 secret → gray-700 (의미적 색 X — 단순 마스크 표시)

복잡 상태 (티켓 status: todo / in-progress / review / done / blocked / abandoned) 도 동일 pill 시스템:
- todo → gray
- in-progress → info
- review → warning
- done → success
- blocked → error
- abandoned → gray (strikethrough text)

### 5.5 Sidebar nav item

mockup 의 `pp-row` / `set-row` / `persona-row` 가 통일된 nav item 패턴.

```
┌─────────────────────────┐
│ [icon 18]  Label    [12]│  ← active = primary-600 4px left bar + primary-50 bg
└─────────────────────────┘
```

- **height**: 28–32px (mockup 의 dense pp-row) — 데스크탑 dense list 의도. 일반 sidebar item 은 36px.
- **padding**: 8/12 (top sec) + 8/20+ (sub) — pp-row 의 indent 시스템과 정합.
- **icon**: 16px, gray-500 (default) / primary-600 (active)
- **text**: body-sm + weight 500 (default) / 600 (active)
- **right meta** (count / dot / sbadge): caption + gray-400 / `pp-badge` 시스템 (warn = `#3a2200 bg / warning text`)
- **collapsed mode** (Side panel collapsed = 0px): tab 자체가 사라지는 게 아니라 sidebar 전체가 0 폭 + Activity Bar 만 노출.

### 5.6 Toast / Notification

우하단 stack. 한 번에 최대 3개.

- **사이즈**: width 360px, min height 56px.
- **구성**: 좌측 semantic icon (20px) + 본문 (title-3 + body-sm) + 우측 ✕ 버튼.
- **bg**: Surface 2 + shadow-lg + 1px border `gray-200` (light) / `gray-700` (dark).
- **semantic 강조**: 좌측 4px bar (semantic-500).
- **자동 dismiss**: success 4s, info 6s, warning 8s, error = 수동 dismiss only.
- **action 버튼**: 1개까지 (ghost button, 우측 정렬 footer).

### 5.7 Stage strip + ctx chip (Phase 4 핵심)

> **2026-05-06 갱신**: 위쪽 단독 breadcrumb 행 제거. Stage 표시 = (a) Project tab 의 Stage strip 인라인 (mockup `stage-strip`), (b) Right Panel ctx 라인의 stage chip (mockup `stage-chip`) — 두 군데에서 노출.

Project tab Stage strip:
```
[ ●PRD ]  ›  [ ●Design ]  ›  [ ●Build ]  ›  [ ○QA ]
   done        done           cur            pending
```

- 각 stage = `sdot-item` 22–24px height, 5px dot + 10px label.
- **상태**: pending (gray-300 dot, txt3) / cur (stage-build color dot + bg `#1f2a3a` + bright text) / done (gray-500 dot + muted text).
- 화살표 = `›` chevron (#333, 9px). 단순 텍스트.
- mockup 은 4개 노출 + 가로 스크롤 — 6-stage 전체는 hover 시 expand 또는 horizontal scroll.

Right Panel ctx 의 stage chip:
- pill (1px 6px / 10px label / 600 weight) + stage 색 bg (예: Build = `#1f2a3a` + `var(--stage-build)`).
- 같은 행에 `round-N · T-NNN <action>` 콘텍스트 노출.

### 5.8 모달 / Popover

- **모달 bg**: 페이지 backdrop = `gray-950/40%` blur(8px). 내용 surface = Surface 2 + radius-xl + shadow-lg.
- **width**: sm 400 / md 560 / lg 720. 페이지 내 70% 이상 차지하지 않음.
- **닫기**: 우상단 ✕ (ghost button) + ESC + backdrop 클릭. 단, destructive confirm 은 backdrop 클릭 X.
- **Popover**: shadow-md + radius-md + 1px border. 화살표 (caret) 없음 (Toss 패턴).

---

## 6. 아이콘 — Lucide-react

[Lucide](https://lucide.dev) / `lucide-react` 채택 (2026-05-06 결정). Toss-스타일 stroke 1.5–2 의 깨끗한 아웃라인 + React tree-shake 가능.

**Mockup → lucide-react 매핑** (mockup 의 inline SVG 는 design intent 만, 구현 시 lucide-react 로 일괄 교체):

| mockup 영역 | mockup SVG 의도 | lucide-react 매핑 |
|---|---|---|
| Activity Bar — Explorer | 폴더+서브트리 | `FolderTree` |
| Activity Bar — Project | 카드+행 | `LayoutDashboard` |
| Activity Bar — Team | 사람 2명 | `Users` |
| Activity Bar — Settings | 톱니 | `Settings` |
| Activity Bar — Logo | 체크된 원 | `CircleCheck` (PO accent color override) |
| 검색 input | 돋보기 | `Search` |
| Stage strip — done | 채워진 dot | `Circle` filled / 자체 dot |
| Stage strip — current | 강조 dot | 동일 + bg |
| Pane buttons — split right | 박스+세로선 | `PanelRight` 또는 `SquareSplitHorizontal` |
| Pane buttons — split down | 박스+가로선 | `PanelBottom` 또는 `SquareSplitVertical` |
| Pane buttons — terminal | 터미널 prompt | `SquareTerminal` |
| Pane buttons — browser | 지구본 | `Globe` |
| Pane / tab close | × | `X` |
| Right panel — minimize | ─ | `Minus` |
| Right panel — close | × | `X` |
| Right panel — send | ↑ | `ArrowUp` 또는 `Send` |
| Quick Open trigger | 돋보기 | `Search` |
| Status bar — branch dot | 동그라미체크 | `GitBranch` 또는 자체 dot |
| Status bar — vercel | 검증 dot | 자체 dot |
| pp-badge / s-badge / sbadge | 텍스트 only | 아이콘 X |

**규칙**:
- **stroke-width 1.75** 통일 (Lucide 기본 2 보다 살짝 얇게 — Pretendard 와 시각 무게 매칭).
- **사이즈**: 14 / 16 / 18 / 20 / 24 / 32. UI 디폴트 16. Activity Bar 20. Side panel 16.
- **색**: 기본 `currentColor` — 부모 텍스트 색 상속. semantic 색은 명시적으로만 부여.
- **fill 사용 X** — 항상 outline. 단 dot / status 표시는 SVG circle (Lucide 외).

**금지**: 이모지 아이콘 사용 (✅/⚠️/🔴/🔒 같은 emoji 는 **데이터 / 문서** 표현용으로만 — UI button / nav / badge 의 시각 요소로는 Lucide 사용). PRD / 본 문서의 emoji 는 doc readability 용이지 GUI spec 이 아님. mockup 의 `📄` `🎨` `📋` `🌐` `☁` `🧠` `⚙` `📌` `💬` 는 **임시 placeholder** — 모두 lucide-react 로 교체 (FileText / Palette / ClipboardList / Globe / Cloud / Brain / Settings2 / Pin / MessageCircle).

---

## 7. 다크 모드 전략

### 7.1 구현 방식

**CSS Custom Properties + `data-theme` 속성** — Tailwind `dark:` 변형 의존 X (Tailwind 사용해도 토큰 자체는 CSS variable 로).

```css
:root {
  --color-bg: #F8FAFC;
  --color-surface: #FFFFFF;
  --color-text: #0F172A;
  /* ... 전체 토큰 ... */
}

[data-theme="dark"] {
  --color-bg: #020617;
  --color-surface: #0F172A;
  --color-text: #F8FAFC;
  /* ... */
}
```

### 7.2 적용 우선순위

1. **사용자 명시 선택** (설정 저장: `light` | `dark` | `system`) — localStorage + Electron preferences.
2. **system default** (`system` 일 때): `prefers-color-scheme` + `nativeTheme` (Electron) 동기.
3. **즉시 반영**: 테마 변경 시 `<html data-theme="...">` 갱신만 — re-render X. 트랜지션 X (깜빡임 방지).

### 7.3 다크 모드 디자인 차이

다크는 light 의 단순 색 반전 X. 별도 디자인 결정:
- **Surface 가 더 진해짐** (gray-900) — pure black 회피, 눈 부담 ↓.
- **Primary 한 단계 밝게** (`primary-500` 사용) — 다크 배경에서 `primary-600` 은 채도 과해 보임.
- **Border 더 흐릿하게** (`gray-800`) — 다크에서는 강한 border 가 시끄러움.
- **Shadow 더 진하게** (alpha 0.4–0.6) — dark surface 위에서 약한 shadow 는 보이지 않음.
- **Semantic 색 한 단계 밝게** (success-400, error-400 등) — saturation 보존.

> **Mockup 은 다크 모드 only** — light 모드 mockup 은 별도 라운드. 다크 baseline (mockup 의 `--bg-base #0F0F0F` / `--bg-surface #111` / `--bg-elevated #1e1e1e` / `--border #2d2d2d`) 은 본 문서의 dark token 과 정합 — `gray-950` ≈ `#0F0F0F` 영역, `gray-900` ≈ `#111`.

### 7.4 스크린샷 / 코드 블록

다크 모드 사용자가 light 화면 스크린샷 캡처할 일 빈번 (설명 / 공유 목적). 코드 블록은 항상 dark surface (`gray-900` bg + `gray-100` text) 로 — light/dark mode 무관 일관.

---

## 8. 레퍼런스 & 차용 원칙 — Toss에서 무엇을 가져오고 무엇을 가져오지 않는가

### 8.1 ✅ 차용

| 항목 | 차용 이유 |
|---|---|
| **여백 우선 + 무장식 정신** | productune 의 "안심" 톤과 1:1 정합 |
| **타이포그래피 위계 + 음수 tracking** | 한글 UI 의 사실상 표준 — 한글 답답함 완화 |
| **카드 = border only, 그림자 X** | "조용한 신뢰감" 의 시각 표현 |
| **semantic 색은 outline + tinted bg** | 강한 fill 의 시각 노이즈 회피 |
| **Modal/popover 만 shadow-lg** | elevation 의 의미 보존 |
| **status pill 시스템 (dot + label)** | 익숙함 + 확장성 |
| **사이드바 4px left bar 강조 패턴** | 강력하고 절제된 active 표현 |

### 8.2 ❌ 차용하지 않음

| 항목 | 사유 + productune 대안 |
|---|---|
| **Toss Product Sans** | 라이선스 / 외부 사용 금지 → **Pretendard Variable** |
| **Toss Blue (#3182F6)** | 브랜드 혼동 + 클론 인상 → **Productune Indigo (#4F46E5)** |
| **Toss 일러스트 톡톡톡 캐릭터** | "유치하지 않게" 원칙 위배 → **일러스트 0**, empty state 도 텍스트 + 작은 lucide 아이콘 |
| **모바일 최적화 (큰 터치 타겟, 풀폭 버튼)** | desktop 앱 — 터치 X → **데스크톱 sizing 우선 (36h button 기본)** |
| **Toss 의 큰 둥근 모서리 (16+)** | 차가운 slate + indigo 와 시각 부조화 → **radius-md 10, radius-lg 14** |
| **다채로운 카테고리 컬러** (송금/결제 등 색 코드) | 1인 도구 — 카테고리 색 불필요 → **단색 + semantic 만** |
| **금융 신뢰성 표현 (자물쇠 / 검정 안전 톤)** | 개발 도구 — 보안 톤 강조 X → **조용한 indigo 단일 강조** |

### 8.3 다른 영감 소스

| 도구 | 가져오는 점 |
|---|---|
| **VS Code** | Activity Bar (48px, icon list) + Side Panel (탭 view) + Main 의 split-pane + Quick Open ⌘P. mockup 전체 골격. |
| **Linear** | 키보드 우선 인터랙션, 즉각 반응 (instant feel), 절제된 모션 (120–160ms ease-out) |
| **Vercel Dashboard** | 코드 / 로그 표시의 dark surface 일관성, 토스트 / 사이드바 흐름 |
| **Notion** | 콘텐츠 영역 max-width 제약 + 가운데 정렬, 인라인 ghost button 패턴 |
| **Raycast** | 명령 팔레트 (⌘K) 의 단축키 우선 사고 — Phase 4 의 "command bar" 컴포넌트 (별도 라운드) 의 기준 |
| **cmux** | Main panel 의 dynamic split + tab dispatcher 패턴 — pane resize / drag-tab-to-pane / empty-state placeholder |

---

## 9. 다음 단계 (이 결정 위에 올라가는 것)

본 문서는 **방향성 + 토큰** 까지. 다음 단계:

1. **컴포넌트 라이브러리 결정** — Radix UI primitives + 커스텀 스타일 (headless, Toss 미적용 가능) vs shadcn/ui (Tailwind 기반, 토큰 override) — Phase 4 Round 0 plan 단계 결정.
2. **모션 / 트랜지션 스펙** — 별도 design doc. duration / easing / 어떤 element 가 모션을 가지는가.
3. **Stage strip 상세 spec** — 본 문서는 비주얼 원칙만. 인터랙션 / 상태 / 점프 가능 여부는 Phase 4 Round 4 (T-P4-040 = Project tab 의 Stage strip + Right Panel chip). 상단 standalone breadcrumb 는 제외.
4. **Empty state 카탈로그** — "프로젝트 없음" / "티켓 없음" / "채팅 없음" / "검색 결과 없음" / "빈 pane" 케이스별 일관 패턴.
5. **다크 모드 토큰 검증** — 실제 Electron 빌드 후 mac/Windows/Linux 별 색 표현 차이 검증 (Round 0 T-P4-003).

---

## 10. 컴포넌트 라이브러리 전략 (확정)

> Round 6 (2026-04-30) 결정. 본 결정은 위 "9. 다음 단계 — 1번 컴포넌트 라이브러리 결정" 항목을 해소한다.

### 10.1 채택 — shadcn/ui 베이스 + 점진적 자체 교체

**초기 빠른 구축 + 시간이 가면서 productune 고유 자산으로 대체** 하는 하이브리드 전략. "처음부터 자체 라이브러리" 와 "끝까지 shadcn 의존" 둘 다 회피.

| 단계 | 전략 |
|---|---|
| **초기** | shadcn/ui (Radix primitives 기반) 로 즉시 구축 — Button / Input / Dialog / Toast / Dropdown / Tabs / Tooltip / Popover 등 standard 컴포넌트 |
| **중기** | Toss 정신 + design-direction.md 와 충돌하는 컴포넌트부터 직접 교체. 토큰은 본 문서 그대로, 컴포넌트 구현만 자체화 |
| **장기** | 자주 노출 + 브랜드 직결 컴포넌트는 모두 자체 구현. 복잡한 인터랙션 컴포넌트 (Combobox / DatePicker / Dialog 의 a11y 처리) 는 shadcn 유지 |

### 10.2 교체 우선순위

자주 노출되고 브랜드 인상을 결정하는 컴포넌트부터 자체화:

| 우선순위 | 컴포넌트 | 사유 |
|---|---|---|
| **P0 (Round 0–1 내 자체화)** | **Button** | 모든 화면에 등장. primary 색 / radius / focus ring 가 brand impression 의 80% |
| **P0** | **Card** (ticket / chat bubble / env row) | 본 문서 5.3 의 3종 분기는 shadcn 기본 Card 로 표현 부족 |
| **P0** | **Badge** (env 4종 + 티켓 6종 status) | 본 문서 5.4 의 dot+pill 시스템은 shadcn 기본 Badge 와 다름 |
| **P0** | **Sidebar nav item** | pp-row 의 dense + indent + sbadge 시스템 — shadcn 에 직접 매칭 컴포넌트 없음 |
| **P0 (mockup 기반 신규)** | **WorkspaceShell** (4-region grid) + **ActivityBarTab** + **PaneTree** + **POChatPanel** | mockup 의 핵심 골격 — shadcn 외부, 자체 구현 |
| **P1 (Round 2 이후 자체화 검토)** | Toast / Stage strip / Status badge 류 | 이미 자체 spec 명확, shadcn 기반 위에 토큰만 override 로도 1차 충분 |
| **P2 (shadcn 유지)** | **Combobox / DatePicker / Dialog / Dropdown / Popover / Tooltip** | a11y / focus trap / keyboard nav 가 까다로움. Radix primitives 가 이미 잘 처리 — 재발명 비용 큼 |
| **P2** | **Quick Open (cmdk 기반)** | §11 — shadcn 의 Quick Open 패턴 + cmdk 라이브러리 그대로 사용 |

### 10.3 소유권 — `src/components/ui/` 에 직접 보유

shadcn 의 핵심 철학 = **node_modules 외부에 컴포넌트 파일 직접 소유**. productune 도 동일:

```
packages/gui/src/
├── components/
│   ├── ui/              ← shadcn 패턴: 컴포넌트 파일 직접 소유, 자유롭게 수정
│   │   ├── button.tsx   ← 초기 shadcn 코드 → 점진적으로 자체 구현으로 교체
│   │   ├── card.tsx
│   │   ├── badge.tsx
│   │   ├── dialog.tsx   ← P2 → shadcn 그대로 유지 (Radix 의존)
│   │   └── ...
│   └── productune/      ← 100% 자체 컴포넌트 (WorkspaceShell / ActivityBar / PaneTree / POChatPanel / StageStrip 등)
└── styles/
    └── tokens.css       ← 본 문서의 컬러/타이포/스페이싱 토큰 (CSS variables)
```

`node_modules` 에 의존하지 않으므로 자유롭게 수정 가능. 각 컴포넌트가 단일 파일 (`.tsx`) 이므로 점진적 교체 시 diff 검증 용이.

### 10.4 토큰 일관성 — 본 문서가 단일 진실

shadcn 기본 토큰 (Tailwind preset 의 slate / indigo 등) 은 **사용 X**. 본 문서 §2–§4 의 토큰을 CSS custom properties 로 정의 + `tailwind.config.ts` 에서 토큰 매핑:

```ts
// tailwind.config.ts (요지)
theme: {
  extend: {
    colors: {
      'primary': 'var(--color-primary-600)',
      'primary-hover': 'var(--color-primary-700)',
      // ... 본 문서 §2 의 모든 토큰
    },
    borderRadius: {
      'sm': 'var(--radius-sm)',  // 6
      'md': 'var(--radius-md)',  // 10
      // ...
    },
    spacing: {
      // 본 문서 §4.1 의 4px base
    },
  }
}
```

shadcn 컴포넌트가 사용하는 모든 토큰은 본 문서 토큰으로만 resolve. 이로써 "shadcn 기본 룩" 이 그대로 노출되는 일은 없음.

### 10.5 구현 절차 (Round 0)

1. `pnpm add` shadcn CLI + Tailwind + Radix 의존성 설치 (Round 0 T-P4-003 부속).
2. `tailwind.config.ts` 에 본 문서 토큰 매핑 + `tokens.css` 작성.
3. `npx shadcn@latest add button card badge dialog toast dropdown tabs tooltip popover` 등 P0+P1 컴포넌트 일괄 추가 → `src/components/ui/` 에 파일 생성.
4. 추가된 파일들의 토큰 / 색상 / radius 를 본 문서 기준으로 즉시 patch (이 시점에 shadcn 기본 룩 제거).
5. P0 컴포넌트 (Button / Card / Badge / Sidebar nav item) 는 Round 0–1 내 자체 구현으로 1차 교체 — `src/components/ui/` 의 해당 파일을 자체 코드로 rewrite (인터페이스는 동일 유지 → 호출부 변경 X).

---

## 11. ⌘P Quick Open + 단축키 통합 (Phase 4 MVP 포함, 확정)

> Round 6 (2026-04-30) 결정. 본 결정은 위 "9. 다음 단계" 의 implicit OQ ("명령 팔레트 우선순위") 와 Open questions 의 "명령 팔레트 (⌘K) 의 우선순위" 항목을 해소한다.
> **2026-05-06 갱신 (mockup-as-source)**: mockup 의 단축키 시스템 통합 — Title bar 의 Quick Open trigger 가 ⌘P, Activity Bar 의 Explorer 토글이 ⌘⇧E 등.

### 11.0 Mockup 단축키 통합 표

| 단축키 | 동작 | mockup 출처 |
|---|---|---|
| `⌘P` | Quick Open 모달 (전역 검색 / 명령) | Title bar trigger `qo-trigger` |
| `⌘⇧P` | 액션 모드 (`>` prefix 자동) | §11.6 (VS Code 호환) |
| `⌘⇧E` | Explorer 탭 토글 | Activity Bar tooltip "Explorer (⌘⇧E)" |
| `⌘⇧F` | Explorer 검색 박스 focus | 추론 — VS Code 호환 |
| `⌘\` | 현재 pane right-split | 추론 — VS Code 호환 |
| `⌘K ⌘\` | 현재 pane down-split | 추론 — VS Code 호환 |
| `⌘W` | 현재 tab close | empty-state 안내 |
| `⌘1` ~ `⌘4` | Activity Bar 탭 직접 (Explorer / Project / Team / Settings) | Mockup 명시 X — UX 일관 |
| `Esc` | 모달 닫기 / Quick Open 닫기 | qo-overlay 동작 |
| `Enter` (chat) | PO Chat 메시지 전송 | rp-input |
| `Shift+Enter` (chat) | PO Chat 줄바꿈 | rp-input |

(보안 / 인쇄와 충돌하는 OS 단축키는 §11.6 의 정책 그대로 — 인쇄 disable.)

### 11.1 단축키 — ⌘K 가 아니라 **⌘P** (VS Code Quick Open 패턴)

**채택 사유**:

| 패턴 | 정신 | productune 적합도 |
|---|---|---|
| **⌘P (VS Code Quick Open)** | 탐색 (content-first) — "찾으면 나온다" | ✅ 사용자도 직관적. 티켓 / PRD / PO 세션 / env / wiki / 디자인 docs 를 이름으로 즉시 점프 |
| ⌘K (Raycast / Linear) | 액션 (action-first) — "무엇을 시킬까" | ❌ 개발자 키보드 문화. 비-개발자에게 진입 장벽 — "내가 할 수 있는 게 뭐지?" 부담 |

사용자의 멘탈 모델 = **"내가 만든 것 중에서 찾는다"**. 액션은 GUI 에서 발견 (사이드바 / Activity Bar / 버튼) 하고, 키보드는 탐색 가속에 한정.

레퍼런스: VS Code 의 `⌘P` (Quick Open) — 파일/심볼 검색이 본질, prefix 로 액션 모드 진입.

### 11.2 검색 대상 (productune 항목 7종)

| # | 종류 | 매칭 필드 | 표시 |
|---|---|---|---|
| 1 | **티켓** | `T-NNN` (id), 제목, status, round | id + 제목 + status badge + round |
| 2 | **PRD 섹션** | 파일명, h2/h3 제목, slug | 섹션 경로 + 제목 |
| 3 | **PO 세션** | 프로젝트 slug, 최근 메시지 요약 | "PO 세션 — 메시지 N개" + 최근 활동 시각 (단일 세션) |
| 4 | **ENV 변수 키** | key 이름, 적용 환경 | key + 환경 layer badge (🖥️/🔍/🚀) |
| 5 | **메모리 / wiki 항목** | tier (session/project/wiki) + 제목 + tag | tier 색상 + 제목 + tag |
| 6 | **디자인 docs** | `docs/artifacts/*.md` 파일명 + h2 | 파일 경로 + 섹션 제목 |
| 7 | **액션** (`>` prefix) | 액션 라벨 (배포하기 / ENV 추가 / 페르소나 호출 등) | `>` indicator + 라벨 + 단축키 hint |

기본 (prefix 없음) = **최근 열어본 항목** 표시 (VS Code 동일). 입력 시작하면 fuzzy match.

### 11.3 prefix 시스템

VS Code 와 호환되는 prefix 사고 방식:

| prefix | 의미 | 예 |
|---|---|---|
| (없음) | 전체 fuzzy 검색 (위 7종 통합) | `oauth` → 관련 티켓 + PRD 섹션 + ENV 키 동시 hit |
| **`:`** | 줄 이동 | `:42` → 현재 파일 42 줄 |
| **`@`** | 심볼 (또는 페르소나 호출) | `@po`, `@designer` |
| **`%`** | 텍스트 검색 (Explorer 검색과 별도) | `% TODO` |
| **`>`** | 액션 모드 | `> deploy` → "배포하기" 액션 |
| **`#`** | 티켓만 | `#T-042` 또는 `#oauth` |
| **`$`** | env 변수만 | `$STRIPE_KEY` |

prefix 는 미리 hint 로 노출 (mockup `qo-input` placeholder = "파일명 검색 (: 줄이동, @ 심볼, % 텍스트검색, > 명령)").

### 11.4 UI / 인터랙션

```
┌────────────────────────────────────────────────────┐
│ [🔍] 검색 또는 명령 (>액션, #티켓, @페르소나 ...)    │  ← input
├────────────────────────────────────────────────────┤
│ 최근                                                │  ← group header
│ ─ T-042  Google OAuth 설정                  [todo] │
│ ─ PRD: productune.md § Phase 4                     │
│ ─ PO 세션 — 메시지 47개                    ●      │
│                                                    │
│ 티켓                                                │
│ ─ T-019  결제 모달 디자인                   [done] │
│ ─ T-031  env panel UI                       [...]  │
└────────────────────────────────────────────────────┘
   ↑↓ 이동   ↵ 열기   ⌘↵ 새 창   esc 닫기
```

| 항목 | 결정 |
|---|---|
| **위치** | 화면 상단 중앙 — 모달 형식, top: 60px (mockup `qo-overlay padding-top:60px`), width 600px (mockup) / 모바일 X |
| **bg** | Surface 2 + shadow-lg + radius-lg (mockup `qo-box` + 1px border) |
| **input** | 40px height (mockup), 폰트 `body-sm`, placeholder `gray-400` |
| **결과 행** | 28px height (dense, mockup), padding 6/14 |
| **그룹 헤더** | `qo-section-hdr` token + `gray-500` + 그룹 간 8px gap |
| **selected 행** | `#094771` bg (mockup, VS Code blue) — 본 문서 token: `primary-100` (light) / `primary-950` (dark) |
| **footer hint** | mockup 은 footer 없음. selected 행에 right kbd hint 인라인 |
| **결과 갯수** | 최대 70vh 까지 + 스크롤 |
| **빈 결과** | `body-sm` + gray-500 — `"<query>" 에 대한 결과 없음.` + `> 액션 으로 시작하면 명령을 실행할 수 있어요.` 힌트 |

### 11.5 구현 — cmdk + Electron globalShortcut

**라이브러리**: [cmdk](https://cmdk.paco.me) (shadcn 의 Command 컴포넌트와 동일 기반). Radix Dialog 위에 fuzzy search list — a11y / keyboard nav / focus trap 모두 내장.

**바인딩**: Electron `globalShortcut` 으로 `CommandOrControl+P` 등록. 앱 활성 상태에서만 reaction (VS Code 동작 호환). mac = `⌘P`, Windows/Linux = `Ctrl+P`.

**검색 backend**: in-memory index (Round 1 PoC) — po-state.json + docs/* 파일 트리 + env 메타 + 메모리 tier 를 watch 후 인덱스 업데이트. 1만 항목 미만이라 LRU + 단순 fuzzy (Fuse.js) 로 충분. 이상 규모 도달 시 SQLite FTS 로 이전.

**최근 항목**: `~/productune/recent.json` 에 LRU 50개 저장. tier 별 weighted (티켓 > PRD > PO 세션 > env > wiki > docs).

**액션 실행**: `>` prefix 매칭 시 액션 dispatcher 가 메인 앱 router 에 라우팅 — Round 2 의 [배포하기] / Round 3 의 [ENV 추가] / Round 4 의 [페르소나 호출] 등이 모두 등록 가능. 액션 등록은 `defineAction({ id, label, shortcut, run })` 형식.

### 11.6 접근성 / 단축키 일관성

- ⌘P 는 OS 의 **인쇄 (Print)** 단축키와 충돌. Electron 앱에서는 메뉴 인쇄 disable 또는 ⌘Shift+P 로 인쇄 이전 (VS Code 와 동일 정책). productune 은 인쇄 기능 X 이므로 충돌 X.
- ⌘Shift+P 는 **액션 전용 모드** (= `>` prefix 자동 입력 후 ⌘P 와 동일 패널) — VS Code 와 호환.
- esc 로 즉시 닫힘. 외부 클릭으로도 닫힘 (modal backdrop). enter 시 결과 항목 열기 + 자동 닫기.

### 11.7 Phase 4 MVP 포함 사유

| 사유 | 설명 |
|---|---|
| **탐색 가속이 곧 안심** | 티켓 / PRD 섹션 / env 가 늘어나면 사이드바 탐색만으로는 한계. ⌘P 가 없으면 사용자의 첫 dogfood 에서 "내가 어디에 뭘 적었지" 로 길을 잃음 |
| **GUI 무거움 완화** | "GUI-first" 라고 모든 행동을 마우스로만 강요하면 오히려 답답. 키보드 가속은 GUI 와 충돌하는 게 아니라 보완 |
| **단일 컴포넌트로 다목적** | cmdk + 7종 검색 통합 = 별도의 "전역 검색" / "명령 팔레트" / "최근 항목" 3개 화면을 하나로 |
| **구현 비용 낮음** | cmdk 라이브러리 + globalShortcut + 단순 인덱스 = 1주 미만 작업. Phase 4 의 GUI 마찰을 가장 저렴하게 줄이는 수단 |

> Phase 4 ROADMAP 의 어느 라운드에 들어가는가: **Round 4** (PO 채팅 + 풀 사이클 UI) — 단일 PO 세션 + Project 탭 ticket rows / Main split-pane tabs 와 함께 등장해야 가치가 큼. 신규 티켓: ROADMAP §Round 4 의 mockup-as-source 갱신 시 별도 ticket-id 부여.

---

## 12. 어휘 노출 정책 — Activity Bar / Side panel 탭 이름 (2026-05-06 결정)

mockup 은 `Explorer / Project / Team / Settings` 영문 어휘. 이는 **개발자 reference + tooltip + design doc** 안에서는 OK 이지만, **사용자 화면 (실제 ActivityBar tooltip / 모바일 alt 등)** 에서는 한글 우선:

| mockup 영문 (design doc) | 사용자 화면 (구현) | 비고 |
|---|---|---|
| Explorer | **탐색** | tooltip 한글 + 단축키 `⌘⇧E` |
| Project | **프로젝트** | tooltip 한글, sp-hdr 라벨도 "프로젝트" |
| Team | **팀** | tooltip 한글, persona 어휘는 한글 (PO/Designer/Developer/QA → 'PO/디자이너/개발자/QA') |
| Settings | **설정** | tooltip 한글 |

**디자인 doc 안에서는 영문 tab 이름 (Explorer/Project/Team/Settings) 유지** — 코드 식별자 (`activeIcon='explorer'` 같은) 와 1:1 매칭, 디자이너 ↔ 개발자 reference 일관성. 사용자 화면 string 은 i18n 통해 한글로 출력.

mockup 의 `Skills` / `Wiki / Memory` / `Personas` / `Recent Activity` / `Stage` / `Rounds` / `Preview` / `Environment` / `Models` / `MCP Servers` / `Hooks` 등 sp-sec-hdr 영문 라벨도 동일 정책 — design doc 영문, 사용자 화면 한글 (스킬 / 위키·메모리 / 페르소나 / 최근 활동 / 단계 / 라운드 / 미리보기 / 환경 변수 / 모델 / MCP 서버 / 훅).

---

## Open questions

- 컴포넌트 라이브러리 채택: Radix primitives 직접 + 자체 스타일 vs shadcn/ui 기반 토큰 override — Phase 4 Round 0 plan 단계 결정.
- 모션 라이브러리: framer-motion vs CSS-only (스타일링 단순함 우선) — 별도 design doc.
- 명령 팔레트 (⌘K) 의 우선순위: Phase 4 MVP 포함 vs Phase 5 — PO 와 협의.
- 한국어 외 언어 지원 시점 (영어 UI string) — 본 디자인 시스템은 한글 metric 기준이라 영문 적용 시 type scale 재검토 필요. 현 단계 non-goal.
- 접근성 — color contrast 4.5:1 (WCAG AA) 보장 여부 검증 (특히 다크 모드 muted text). Round 0 검증 단계에 포함.
- mockup 의 `pp-row` dense 28px height 가 데스크탑 sidebar nav 36px 표준과 충돌 — Round 4 plan 단계에서 확정 (현재 결정: dense 채택, 일반 sidebar 는 36px 유지).
- Light mode mockup 부재 — 다크 baseline 만으로 dogfood 진입, light mode 는 별도 라운드.

---

## Activity log

- **2026-04-30** — v1 결정. Toss 정신 차용 + Productune 고유 토큰 확정. Pretendard Variable / Productune Indigo (#4F46E5) / cool slate gray / 4px grid / Lucide / CSS variable 다크 모드 / 5 디자인 원칙 / 8 컴포넌트 원칙 명문화. PRD Phase 4 + ROADMAP Round 0–1 의 시각 base.
- **2026-04-30 (Round 6)** — §10 컴포넌트 라이브러리 전략 + §11 ⌘P Quick Open 두 결정 append. shadcn/ui 베이스 + 점진적 자체 교체 (P0: Button/Card/Badge/Sidebar nav item / P1: 토큰 override 충분 / P2: Combobox·Dialog 류 shadcn 유지). 컴포넌트 파일은 `src/components/ui/` 직접 소유. 명령 팔레트는 ⌘K 가 아닌 **⌘P** (VS Code Quick Open 패턴) — content-first 사고가 비-개발자 사용자에 적합. cmdk + Electron globalShortcut + 7종 검색 인덱스 + prefix 시스템 (`>` 액션 / `#` 티켓 / `@` 페르소나 / `$` env). Phase 4 MVP 포함, ROADMAP Round 4 의 신규 티켓 T-P4-045 후속 발행 예정.
- **2026-05-04** — Slug / PRD anchor 갱신 (planner-mode → gui-full-cycle). 사용자 설명에서 "planner" 분기 어휘 제거. §11 Quick Open 적합도 설명 갱신.
- **2026-05-04 (layout 결정)** — §4.3 Electron 윈도우 기본 레이아웃 재작성. 3-column (Sidebar 256px + Main + Side panel optional) → **4-column grid 48/240/1fr/360 (ActivityBar + Side panel + Center workspace + PO chat panel)**. PO chat panel 360px 항상 우측 고정 (slide-in 없음). ActivityBar 48px 신규 — 당시 초안은 채팅방/산출물/설정 아이콘이었고, 이후 mockup-source 에서 Explorer/Project/Team/Settings 로 확정. 이전 "Sidebar 256px collapse 64px" 개념은 Side panel 240px 고정 + ActivityBar 48px 로 분리. 기존 stale: 3-column 레이아웃 표, "Side panel 선택적 slide-in" 설명.
- **2026-05-06 (단일 PO 세션)** — GUI multi-chatroom 모델 → single PO session per project. §4.3 ActivityBar 표 갱신 (Explorer / Project / Team / Settings, 채팅방 목록 제거). §11.1 Quick Open 적합도 설명 갱신 ("채팅방" → "PO 세션"). §11.2 검색 대상 표 3번 갱신 ("채팅방 라운드/토픽 slug" → "PO 세션 — 메시지 N개 단일 세션"). §11.3 prefix 표 `/채팅방` 행 제거 (단일 세션 이므로 점프 대상 없음), placeholder hint 갱신. §11.4 UI 예시 "/round-2" → "PO 세션 — 메시지 47개" 로 갱신. §11.5 LRU weight "채팅방" → "PO 세션". §11.7 MVP 포함 사유 "다중 채팅방" 어휘 제거.
- **2026-05-06 (mockup-as-source 정렬)** — `docs/artifacts/v0.4/productune/mockups/mockup.html` 을 spec 의 진실로 채택. **§4.3 전면 재작성** — 4-region 레이아웃 (Activity Bar 48 / Side 260 / Main 가변 split-pane / Right 340), **상단 단독 breadcrumb 행 제거**, Stage = Project tab strip + Right Panel ctx chip 이중 노출. §4.3.1 Side panel 4-tab (Explorer / Project / Team / Settings) 본문 구조 명시. §4.3.2 Main pane dispatcher (markdown/preview/env-view/ticket-review/persona-def/skill-matrix/design-gate/terminal/browser) 신규. §4.3.3 Right panel PO Chat 메시지 타입별 색상 + minimize/close/FAB 명시. §2.1 PO-orange accent 채널 분리 (Indigo = primary, PO-orange = PO/auto-save/CTA). §5.5 Sidebar nav item dense 모드 추가. §5.7 Stage strip + ctx-chip 으로 재정의. **§6 lucide-react 채택 + mockup SVG → lucide-react 매핑 표 추가**. §8.3 영감 소스에 VS Code / cmux 추가. §10.2 P0 에 WorkspaceShell / ActivityBarTab / PaneTree / POChatPanel 추가. §10.3 자체 컴포넌트 디렉터리 예시 갱신. **§11.0 mockup 단축키 통합 표** 추가 (⌘⇧E Explorer 토글 등). §11.4 Quick Open UI 토큰 mockup 정합 갱신 (top 60px / width 600px / 결과 행 28px). **§12 어휘 노출 정책** 신설 — design doc 영문 / 사용자 화면 한글 매핑. Open questions 에 mockup-source dense / light-mode 부재 항목 추가.
