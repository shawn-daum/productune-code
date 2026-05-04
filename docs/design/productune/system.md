# Design System — productune GUI (Phase 4)

**Slug**: productune  **Created**: 2026-04-30  **Status**: draft

---

## 원칙

- **Dark-first**: 터미널 사용자의 눈에 익숙한 dark theme. Light mode 미지원 (Phase 4 MVP).
- **Orchestral identity**: 4 페르소나 = 4 색. PO(지휘자) orange, Designer purple, Developer blue, QA green.
- **정보 밀도 > 미니멀**: Electron 데스크톱 — 공간을 활용해 상태를 한눈에. 카드 위주.
- **코드 없이 작동**: 텍스트/다이어그램/카드 중심. 코드 diff 노출 최소화.

---

## Color

### Base
| Token | Hex | 용도 |
|---|---|---|
| `bg-base` | `#0F0F0F` | 앱 최외곽 배경 |
| `bg-surface` | `#1A1A1A` | 패널 / 사이드바 배경 |
| `bg-elevated` | `#242424` | 카드 / 모달 배경 |
| `bg-overlay` | `#2E2E2E` | 호버 / 선택 상태 |
| `border` | `#333333` | 구분선 / 테두리 |
| `border-subtle` | `#222222` | 약한 구분선 |

### Text
| Token | Hex | 용도 |
|---|---|---|
| `text-primary` | `#F0F0F0` | 주 텍스트 |
| `text-secondary` | `#A0A0A0` | 보조 텍스트 / 레이블 |
| `text-disabled` | `#505050` | 비활성 |
| `text-code` | `#E2E8F0` | 코드 / 경로 |

### Persona (Orchestral)
| Token | Hex | Persona |
|---|---|---|
| `persona-po` | `#FF6B2B` | pdt-po (PO / 지휘자) |
| `persona-designer` | `#A78BFA` | pdt-designer |
| `persona-developer` | `#38BDF8` | pdt-developer |
| `persona-qa` | `#34D399` | pdt-qa |

### Semantic
| Token | Hex | 용도 |
|---|---|---|
| `success` | `#22C55E` | 완료 / pass |
| `warning` | `#F59E0B` | 경고 / 검토 필요 |
| `error` | `#EF4444` | 오류 / fail |
| `info` | `#60A5FA` | 정보 |

### Stage (6-stage breadcrumb)
| Stage | Token | Hex |
|---|---|---|
| PRD | `stage-prd` | `#A78BFA` |
| Design | `stage-design` | `#F472B6` |
| Build | `stage-build` | `#38BDF8` |
| QA | `stage-qa` | `#34D399` |
| Deploy | `stage-deploy` | `#FB923C` |
| Operate | `stage-operate` | `#FBBF24` |

---

## Typography

### Font stack
```
UI:   -apple-system, 'SF Pro Text', 'Helvetica Neue', sans-serif
Mono: 'JetBrains Mono', 'Fira Code', 'Menlo', monospace
```

### Scale
| Token | Size | Weight | 용도 |
|---|---|---|---|
| `text-xs` | 11px | 400 | badge / timestamp |
| `text-sm` | 13px | 400 | 보조 레이블 / 메타 |
| `text-base` | 14px | 400 | 본문 / 채팅 메시지 |
| `text-md` | 15px | 500 | 카드 제목 |
| `text-lg` | 17px | 600 | 패널 헤더 |
| `text-xl` | 20px | 700 | 페이지 타이틀 |
| `text-mono` | 13px | 400 | 경로 / code / trace |

### Line height
- 산문: 1.6
- UI 레이블: 1.2
- 코드: 1.5

---

## Spacing

8px grid 기반.

| Token | Value |
|---|---|
| `space-1` | 4px |
| `space-2` | 8px |
| `space-3` | 12px |
| `space-4` | 16px |
| `space-6` | 24px |
| `space-8` | 32px |
| `space-12` | 48px |

---

## Border radius

| Token | Value | 용도 |
|---|---|---|
| `radius-sm` | 4px | 버튼 / 인풋 |
| `radius-md` | 8px | 카드 |
| `radius-lg` | 12px | 모달 / 패널 |
| `radius-full` | 9999px | 배지 / 아바타 |

---

## Components

### Button
```
Primary   : bg=persona-po  text=white  hover:opacity-90
Secondary : bg=bg-elevated  text=text-primary  border=border  hover:bg-overlay
Ghost     : bg=transparent  text=text-secondary  hover:bg-bg-elevated
Danger    : bg=error  text=white
```
Height: 32px (sm) / 36px (md) / 40px (lg). Padding: 12px 16px.

### Badge (Ticket status)
```
todo       : bg=#2A2A2A  text=#A0A0A0  border=#333
in-progress: bg=#1C3A5E  text=#38BDF8
review     : bg=#3B2A1A  text=#FB923C
done       : bg=#1A3A2A  text=#34D399
blocked    : bg=#3A1A1A  text=#EF4444
```
Font: text-xs, radius-full, padding: 2px 8px.

### Persona Badge
```
border-left: 3px solid <persona-color>
icon: persona initial (P / D / Dev / Q)
```

### Card (Ticket card)
```
bg: bg-elevated
border: 1px solid border
radius: radius-md
padding: space-4
hover: border-color → persona-color (dim 60%)
```

### Chat bubble
```
PO message  : bg=#1E1A16  border-left: 3px solid persona-po
System trace: bg=bg-surface  text=text-secondary  mono font  font-size=text-sm
User message: bg=bg-elevated  align=right
```

### Sidebar
```
width: 240px (collapsible → 48px icon-only)
bg: bg-surface
border-right: 1px solid border
```

### 6-stage Breadcrumb
```
layout: horizontal strip, full width, height 40px
bg: bg-surface
current stage: filled dot + label + persona-color underline
past stages: check + muted label
future stages: dim dot + dim label
connector: 1px dashed border
```

### Mermaid / Excalidraw viewer
```
bg: #111111
border: 1px solid border
radius: radius-md
controls: [source] [copy] [zoom+] [zoom-] [fit]
error fallback: mono text + error color border
```

---

## Layout (Electron window — IDE paradigm)

VSCode-faithful 4-column layout. 파일/콘텐츠가 중앙 + PO Chat이 우측 global.

```
┌─────────────────────────────────────────────────────────────┐
│ Titlebar (native macOS, 36px)                               │
├──[48]──┬────[260]────────────┬──────────────┬────[340]──────┤
│        │                     │              │               │
│ Acti-  │ Side Panel          │ Main Panel   │ PO Chat       │
│ vity   │  [Explorer]         │ (Tab system) │ (Global)      │
│ Bar    │   File tree         │              │               │
│        │  [Project]          │ 📄 file.md   │ [P] message   │
│ 📁 Ex  │   Round/Tickets     │ 🎨 Design    │ [sys] trace   │
│ ⚡ Pr  │   Preview           │ 📋 T-NNN     │ [you] reply   │
│ 🔍 Se  │  [Search]           │ 🌐 Preview   │               │
│ ──     │   results           │              │               │
│ 👥 Te  │  [Team]             │              │ input + send  │
│ ⚙ St   │   Personas/Skills   │              │               │
├────────┴─────────────────────┴──────────────┴───────────────┤
│ Status Bar (22px) — branch · stage · alerts · model · vercel│
└─────────────────────────────────────────────────────────────┘
```

| Column | Width | Notes |
|---|---|---|
| Activity Bar | 48px | fixed |
| Side Panel | 260px | collapsible (⌘B), min 200 / max 480 |
| Main Panel | flex-1 | tab system, min visible width |
| PO Chat | 340px | global, collapsible (⌘\), min 280 / max 600 |
| Status Bar | 22px | full width |

Window min size: 1024 × 680px. Default: 1280 × 800px.
