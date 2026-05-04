# productune Phase 4 — 디자인 방향

**Slug**: phase4-planner-mode  **Created**: 2026-04-30  **Status**: 결정 (Round 1 / Phase 4 GUI base)
**PRD anchor**: [docs/prd/productune.md#phase-4--개발-비숙련-기획자-모드-planner-mode-future](../prd/productune.md#phase-4--개발-비숙련-기획자-모드-planner-mode-future)
**Round**: phase4-r5

> Phase 4 의 모든 GUI 작업이 따라야 할 디자인 결정 문서. 컴포넌트 단위 스펙이 아닌 **방향성 + 토큰 + 원칙**. Toss 디자인 시스템 ([toss.im](https://toss.im) / [SLASH 컨퍼런스 자료](https://toss.tech)) 의 "심플 + 신뢰감 + 여백 + 무장식" 정신을 차용하되, Toss 고유 자산 (Toss Product Sans, Toss Blue) 은 그대로 쓰지 않고 productune 고유 토큰으로 재정의.

---

## 0. 컨텍스트 — 누가, 어디서, 어떤 기분으로

| 항목 | 결정 |
|---|---|
| **사용자** | 기획자 개인 (non-developer planner). 팀 협업 도구 X — 1인 사용 데스크톱 앱. |
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

### 4.3 Electron 윈도우 기본 레이아웃

```
┌─────────────────────────────────────────────────────────────┐
│  Title bar (mac: traffic light, win/linux: custom 32px)     │
├──────────┬──────────────────────────────────┬───────────────┤
│          │                                  │               │
│ Sidebar  │       Main                       │  Side panel   │
│ 256px    │       (flex, min 720px)          │  (slide-in)   │
│          │                                  │  360px        │
│          │                                  │  optional     │
│          │                                  │               │
│          │                                  │               │
│          │                                  │               │
└──────────┴──────────────────────────────────┴───────────────┘
   Status bar (28px) — 페르소나 활동 / shell status / 동기화
```

| 영역 | 사이즈 | 비고 |
|---|---|---|
| **Title bar** | 32px (height) | Electron `titleBarStyle: 'hiddenInset'` (mac), 커스텀 (win/linux) |
| **Sidebar** | 256px (default), 64px (collapsed icon-only) | 프로젝트 / 채팅방 / 메모리 / 설정 |
| **Main** | flex, min-width 720px | 6-stage breadcrumb 상단 + 콘텐츠 |
| **Side panel** | 360px (slide-in) | env / wiki / skill viewer 등 (선택적) |
| **Status bar** | 28px (height) | 항상 표시. 페르소나 1줄 trace + shell badge + 자동저장 상태 |

**최소 윈도우 사이즈**: 1280×800. **기본**: 1440×900.

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
| **ticket card** | 티켓 보드 카드 | Surface 1 + `gray-200` 1px border + radius-lg + p `space-5` (20). hover 시 border `gray-300` + 약한 lift (translate Y -1px, transition 120ms). |
| **chat bubble** | PO/페르소나 메시지 | 페르소나별 좌측 4px accent bar + Surface 1 + radius-lg + p `space-4` (16). 사용자 메시지는 우측 정렬, `primary-50` bg (light) / `primary-950` bg (dark). |
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

```
┌─────────────────────────┐
│ [icon 18]  Label    [12]│  ← active = primary-600 4px left bar + primary-50 bg
└─────────────────────────┘
```

- **height**: 40px
- **padding**: 8/12
- **icon**: 18px, gray-500 (default) / primary-600 (active)
- **text**: body-sm + weight 500 (default) / 600 (active)
- **right meta** (count / dot): caption + gray-400
- **collapsed mode** (64px sidebar): icon only, hover 시 tooltip 우측 노출 (200ms delay).

### 5.6 Toast / Notification

우하단 stack. 한 번에 최대 3개.

- **사이즈**: width 360px, min height 56px.
- **구성**: 좌측 semantic icon (20px) + 본문 (title-3 + body-sm) + 우측 ✕ 버튼.
- **bg**: Surface 2 + shadow-lg + 1px border `gray-200` (light) / `gray-700` (dark).
- **semantic 강조**: 좌측 4px bar (semantic-500).
- **자동 dismiss**: success 4s, info 6s, warning 8s, error = 수동 dismiss only.
- **action 버튼**: 1개까지 (ghost button, 우측 정렬 footer).

### 5.7 6-stage breadcrumb (Phase 4 핵심)

```
[ PRD ]  →  [ Design ]  →  [ Build ]  →  [ QA ]  →  [ Deploy ]  →  [ Operate ]
                            ●─────────●
                            현재
```

- 메인 영역 상단 64px 바.
- 각 stage = 38px height pill (label + 12px icon).
- **상태**: 미진입 (gray-300 text + gray-100 bg) / 현재 (primary-600 text + primary-50 bg + 1px primary-300 border) / 완료 (success-500 check icon + gray-700 text + transparent bg).
- 화살표는 8px chevron (gray-400). 단순 텍스트 "→" 사용 X.

### 5.8 모달 / Popover

- **모달 bg**: 페이지 backdrop = `gray-950/40%` blur(8px). 내용 surface = Surface 2 + radius-xl + shadow-lg.
- **width**: sm 400 / md 560 / lg 720. 페이지 내 70% 이상 차지하지 않음.
- **닫기**: 우상단 ✕ (ghost button) + ESC + backdrop 클릭. 단, destructive confirm 은 backdrop 클릭 X.
- **Popover**: shadow-md + radius-md + 1px border. 화살표 (caret) 없음 (Toss 패턴).

---

## 6. 아이콘 — Lucide

[Lucide](https://lucide.dev) 채택. React 패키지 (`lucide-react`) 가 이미 사실상 표준이고, Toss-스타일 stroke 1.5–2 의 깨끗한 아웃라인.

**규칙**:
- **stroke-width 1.75** 통일 (Lucide 기본 2 보다 살짝 얇게 — Pretendard 와 시각 무게 매칭).
- **사이즈**: 14 / 16 / 18 / 20 / 24 / 32. UI 디폴트 16. 사이드바 18.
- **색**: 기본 `currentColor` — 부모 텍스트 색 상속. semantic 색은 명시적으로만 부여.
- **fill 사용 X** — 항상 outline. 단 dot / status 표시는 SVG circle (Lucide 외).

**금지**: 이모지 아이콘 사용 (✅/⚠️/🔴/🔒 같은 emoji 는 **데이터 / 문서** 표현용으로만 — UI button / nav / badge 의 시각 요소로는 Lucide 사용). PRD / 본 문서의 emoji 는 doc readability 용이지 GUI spec 이 아님.

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
| **Linear** | 키보드 우선 인터랙션, 즉각 반응 (instant feel), 절제된 모션 (120–160ms ease-out) |
| **Vercel Dashboard** | 코드 / 로그 표시의 dark surface 일관성, 토스트 / 사이드바 흐름 |
| **Notion** | 콘텐츠 영역 max-width 제약 + 가운데 정렬, 인라인 ghost button 패턴 |
| **Raycast** | 명령 팔레트 (⌘K) 의 단축키 우선 사고 — Phase 4 의 "command bar" 컴포넌트 (별도 라운드) 의 기준 |

---

## 9. 다음 단계 (이 결정 위에 올라가는 것)

본 문서는 **방향성 + 토큰** 까지. 다음 단계:

1. **컴포넌트 라이브러리 결정** — Radix UI primitives + 커스텀 스타일 (headless, Toss 미적용 가능) vs shadcn/ui (Tailwind 기반, 토큰 override) — Phase 4 Round 0 plan 단계 결정.
2. **모션 / 트랜지션 스펙** — 별도 design doc. duration / easing / 어떤 element 가 모션을 가지는가.
3. **6-stage breadcrumb 상세 spec** — 본 문서는 비주얼 원칙만. 인터랙션 / 상태 / 점프 가능 여부는 Phase 4 Round 4 (T-P4-040).
4. **Empty state 카탈로그** — "프로젝트 없음" / "티켓 없음" / "채팅 없음" / "검색 결과 없음" 케이스별 일관 패턴.
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
| **P0** | **Sidebar nav item** | 4px left bar active 패턴 + 256/64 collapse — shadcn 에 직접 매칭 컴포넌트 없음 |
| **P1 (Round 2 이후 자체화 검토)** | Toast / 6-stage breadcrumb / Status badge 류 | 이미 자체 spec 명확, shadcn 기반 위에 토큰만 override 로도 1차 충분 |
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
│   └── productune/      ← 100% 자체 컴포넌트 (Sidebar / Breadcrumb / EnvRow 등)
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

## 11. ⌘P Quick Open (Phase 4 MVP 포함, 확정)

> Round 6 (2026-04-30) 결정. 본 결정은 위 "9. 다음 단계" 의 implicit OQ ("명령 팔레트 우선순위") 와 Open questions 의 "명령 팔레트 (⌘K) 의 우선순위" 항목을 해소한다.

### 11.1 단축키 — ⌘K 가 아니라 **⌘P** (VS Code Quick Open 패턴)

**채택 사유**:

| 패턴 | 정신 | productune 적합도 |
|---|---|---|
| **⌘P (VS Code Quick Open)** | 탐색 (content-first) — "찾으면 나온다" | ✅ planner 도 직관적. 티켓 / PRD / 채팅방 / env / wiki / 디자인 docs 를 이름으로 즉시 점프 |
| ⌘K (Raycast / Linear) | 액션 (action-first) — "무엇을 시킬까" | ❌ 개발자 키보드 문화. planner 에게 진입 장벽 — "내가 할 수 있는 게 뭐지?" 부담 |

planner 의 멘탈 모델 = **"내가 만든 것 중에서 찾는다"**. 액션은 GUI 에서 발견 (사이드바 / breadcrumb / 버튼) 하고, 키보드는 탐색 가속에 한정.

레퍼런스: VS Code 의 `⌘P` (Quick Open) — 파일/심볼 검색이 본질, prefix 로 액션 모드 진입.

### 11.2 검색 대상 (productune 항목 7종)

| # | 종류 | 매칭 필드 | 표시 |
|---|---|---|---|
| 1 | **티켓** | `T-NNN` (id), 제목, status, round | id + 제목 + status badge + round |
| 2 | **PRD 섹션** | 파일명, h2/h3 제목, slug | 섹션 경로 + 제목 |
| 3 | **채팅방** | 라운드 / 토픽 / slug | 라벨 + 최근 활동 시각 |
| 4 | **ENV 변수 키** | key 이름, 적용 환경 | key + 환경 layer badge (🖥️/🔍/🚀) |
| 5 | **메모리 / wiki 항목** | tier (session/project/wiki) + 제목 + tag | tier 색상 + 제목 + tag |
| 6 | **디자인 docs** | `docs/design/*.md` 파일명 + h2 | 파일 경로 + 섹션 제목 |
| 7 | **액션** (`>` prefix) | 액션 라벨 (배포하기 / 새 채팅방 / ENV 추가 / 페르소나 호출 등) | `>` indicator + 라벨 + 단축키 hint |

기본 (prefix 없음) = **최근 열어본 항목** 표시 (VS Code 동일). 입력 시작하면 fuzzy match.

### 11.3 prefix 시스템

VS Code 와 호환되는 prefix 사고 방식:

| prefix | 의미 | 예 |
|---|---|---|
| (없음) | 전체 fuzzy 검색 (위 7종 통합) | `oauth` → 관련 티켓 + PRD 섹션 + ENV 키 동시 hit |
| **`>`** | 액션 모드 | `> deploy` → "배포하기" 액션 |
| **`#`** | 티켓만 | `#T-042` 또는 `#oauth` |
| **`@`** | 페르소나 호출 | `@designer 디자인 시스템 검토해줘` |
| **`/`** | 채팅방 점프 | `/round-2` |
| **`$`** | env 변수만 | `$STRIPE_KEY` |

prefix 는 미리 hint 로 노출 (예: 빈 입력 상태에서 `> 액션 / # 티켓 / @ 페르소나 / / 채팅방 / $ env` placeholder).

### 11.4 UI / 인터랙션

```
┌────────────────────────────────────────────────────┐
│ [🔍] 검색 또는 명령 (>액션, #티켓, @페르소나 ...)    │  ← input
├────────────────────────────────────────────────────┤
│ 최근                                                │  ← group header
│ ─ T-042  Google OAuth 설정                  [todo] │
│ ─ PRD: productune.md § Phase 4                     │
│ ─ /round-2                                  ●      │
│                                                    │
│ 티켓                                                │
│ ─ T-019  결제 모달 디자인                   [done] │
│ ─ T-031  env panel UI                       [...]  │
└────────────────────────────────────────────────────┘
   ↑↓ 이동   ↵ 열기   ⌘↵ 새 창   esc 닫기
```

| 항목 | 결정 |
|---|---|
| **위치** | 화면 상단 중앙 — 모달 형식, top: 15vh, width 640px (모바일 X) |
| **bg** | Surface 2 + shadow-lg + radius-xl (modal 토큰) |
| **input** | 56px height, 폰트 `body-lg`, placeholder `gray-400` |
| **결과 행** | 44px height (scroll 시 가독성), padding 12/16 |
| **그룹 헤더** | `label` token + `gray-500` + 그룹 간 8px gap |
| **selected 행** | `primary-50` bg (light) / `primary-950` bg (dark) + 좌측 2px primary-600 bar |
| **footer hint** | 28px height, `caption` token, gray-500 — `↑↓ 이동 / ↵ 열기 / ⌘↵ 새 창 / esc 닫기` |
| **결과 갯수** | 최대 8개 표시 + 스크롤. 8개 초과 시 footer 에 "+N개 더" |
| **빈 결과** | `body-sm` + gray-500 — `"<query>" 에 대한 결과 없음.` + `> 액션 으로 시작하면 명령을 실행할 수 있어요.` 힌트 |

### 11.5 구현 — cmdk + Electron globalShortcut

**라이브러리**: [cmdk](https://cmdk.paco.me) (shadcn 의 Command 컴포넌트와 동일 기반). Radix Dialog 위에 fuzzy search list — a11y / keyboard nav / focus trap 모두 내장.

**바인딩**: Electron `globalShortcut` 으로 `CommandOrControl+P` 등록. 앱 활성 상태에서만 reaction (VS Code 동작 호환). mac = `⌘P`, Windows/Linux = `Ctrl+P`.

**검색 backend**: in-memory index (Round 1 PoC) — po-state.json + docs/* 파일 트리 + env 메타 + 메모리 tier 를 watch 후 인덱스 업데이트. 1만 항목 미만이라 LRU + 단순 fuzzy (Fuse.js) 로 충분. 이상 규모 도달 시 SQLite FTS 로 이전.

**최근 항목**: `~/productune/recent.json` 에 LRU 50개 저장. tier 별 weighted (티켓 > PRD > 채팅방 > env > wiki > docs).

**액션 실행**: `>` prefix 매칭 시 액션 dispatcher 가 메인 앱 router 에 라우팅 — Round 2 의 [배포하기] / Round 3 의 [ENV 추가] / Round 4 의 [페르소나 호출] 등이 모두 등록 가능. 액션 등록은 `defineAction({ id, label, shortcut, run })` 형식.

### 11.6 접근성 / 단축키 일관성

- ⌘P 는 OS 의 **인쇄 (Print)** 단축키와 충돌. Electron 앱에서는 메뉴 인쇄 disable 또는 ⌘Shift+P 로 인쇄 이전 (VS Code 와 동일 정책). productune 은 인쇄 기능 X 이므로 충돌 X.
- ⌘Shift+P 는 **액션 전용 모드** (= `>` prefix 자동 입력 후 ⌘P 와 동일 패널) — VS Code 와 호환.
- esc 로 즉시 닫힘. 외부 클릭으로도 닫힘 (modal backdrop). enter 시 결과 항목 열기 + 자동 닫기.

### 11.7 Phase 4 MVP 포함 사유

| 사유 | 설명 |
|---|---|
| **탐색 가속이 곧 안심** | 다중 채팅방 / 티켓 / PRD 섹션 / env 가 늘어나면 사이드바 탐색만으로는 한계. ⌘P 가 없으면 planner 의 첫 dogfood 에서 "내가 어디에 뭘 적었지" 로 길을 잃음 |
| **GUI 무거움 완화** | "GUI-first" 라고 모든 행동을 마우스로만 강요하면 오히려 답답. 키보드 가속은 GUI 와 충돌하는 게 아니라 보완 |
| **단일 컴포넌트로 다목적** | cmdk + 7종 검색 통합 = 별도의 "전역 검색" / "명령 팔레트" / "최근 항목" 3개 화면을 하나로 |
| **구현 비용 낮음** | cmdk 라이브러리 + globalShortcut + 단순 인덱스 = 1주 미만 작업. Phase 4 의 GUI 마찰을 가장 저렴하게 줄이는 수단 |

> Phase 4 ROADMAP 의 어느 라운드에 들어가는가: **Round 4** (PO 채팅 + 풀 사이클 UI) — 멀티 채팅방 + 티켓 보드와 함께 등장해야 가치가 큼. 새 티켓 신설: **T-P4-045 ⌘P Quick Open (cmdk + 7종 인덱스 + globalShortcut + 액션 dispatcher)** — 추후 ROADMAP.md update 라운드에서 반영.

---

## Open questions

- 컴포넌트 라이브러리 채택: Radix primitives 직접 + 자체 스타일 vs shadcn/ui 기반 토큰 override — Phase 4 Round 0 plan 단계 결정.
- 모션 라이브러리: framer-motion vs CSS-only (스타일링 단순함 우선) — 별도 design doc.
- 명령 팔레트 (⌘K) 의 우선순위: Phase 4 MVP 포함 vs Phase 5 — PO 와 협의.
- 한국어 외 언어 지원 시점 (영어 UI string) — 본 디자인 시스템은 한글 metric 기준이라 영문 적용 시 type scale 재검토 필요. 현 단계 non-goal.
- 접근성 — color contrast 4.5:1 (WCAG AA) 보장 여부 검증 (특히 다크 모드 muted text). Round 0 검증 단계에 포함.

---

## Activity log

- **2026-04-30** — v1 결정. Toss 정신 차용 + Productune 고유 토큰 확정. Pretendard Variable / Productune Indigo (#4F46E5) / cool slate gray / 4px grid / Lucide / CSS variable 다크 모드 / 5 디자인 원칙 / 8 컴포넌트 원칙 명문화. PRD Phase 4 + ROADMAP Round 0–1 의 시각 base.
- **2026-04-30 (Round 6)** — §10 컴포넌트 라이브러리 전략 + §11 ⌘P Quick Open 두 결정 append. shadcn/ui 베이스 + 점진적 자체 교체 (P0: Button/Card/Badge/Sidebar nav item / P1: 토큰 override 충분 / P2: Combobox·Dialog 류 shadcn 유지). 컴포넌트 파일은 `src/components/ui/` 직접 소유. 명령 팔레트는 ⌘K 가 아닌 **⌘P** (VS Code Quick Open 패턴) — content-first 사고가 planner 에 적합. cmdk + Electron globalShortcut + 7종 검색 인덱스 + prefix 시스템 (`>` 액션 / `#` 티켓 / `@` 페르소나 / `/` 채팅방 / `$` env). Phase 4 MVP 포함, ROADMAP Round 4 의 신규 티켓 T-P4-045 후속 발행 예정.
