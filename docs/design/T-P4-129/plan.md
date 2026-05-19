# T-P4-129 — UI 잡일 plan: chevron 제거 + wiki i18n + emoji→lucide

**Ticket**: [T-P4-129](../../tickets/phase4/T-P4-129.md)  
**Created**: 2026-05-19 · **Author**: pdt-designer · **Status**: design plan (pre-impl)  
**Effort**: L1 · **Model**: sonnet

---

## §1 Chevron 제거 — 컴포넌트 위치 및 UX 결정

### 1.1 현재 구조

`TeamPanel.tsx` 의 nav row (Skills + Wiki·Memory) 두 곳에 `<ChevronRight size={12}>` 가 삽입돼 있음.

```tsx
// Skills nav row (line 154)
<ChevronRight size={12} color="#4a4a4a" style={{ flexShrink: 0 }} />
<span style={navRowLabel}>{t('workspace.team.section.skills')}</span>

// Wiki·Memory nav row (line 171)
<ChevronRight size={12} color="#4a4a4a" style={{ flexShrink: 0 }} />
<span style={navRowLabel}>{t('workspace.team.tab.wiki')}</span>
```

### 1.2 UX 판단

| 항목 | 판단 |
|:-----|:-----|
| 두 nav row 의 동작 | 클릭 → 메인 pane 에 탭 열기 (`openTab`). **collapsible 아님.** |
| chevron 의 의미 | 보통 chevron `>` = "하위 항목 있음 / expand 가능" 을 암시. 이 row 에서는 incorrect signal → 사용자 혼란 가능성. |
| 제거 후 click affordance | `cursor: pointer` + hover bg `#1A1A1A` 가 이미 적용돼 있어 클릭 가능성 충분히 전달됨. |
| collapse/expand 기능 | 두 row 모두 없음. 제거해도 기능 손실 0. |

**결정: `<ChevronRight>` 완전 제거. 동작 변경 없음.**

### 1.3 변경 대상

| 위치 | 변경 내용 |
|:-----|:---------|
| `TeamPanel.tsx` line 14 | `import { ChevronRight } from 'lucide-react'` — 전체 삭제 (다른 lucide 사용 없음) |
| `TeamPanel.tsx` line 154 | `<ChevronRight size={12} color="#4a4a4a" style={{ flexShrink: 0 }} />` 삭제 |
| `TeamPanel.tsx` line 171 | 동일 패턴 삭제 |

`navRowBtn` 스타일 (`gap: 5`) 은 그대로 유지 — icon 제거 후 label 이 좌측 정렬로 자연스럽게 이동.

---

## §2 i18n key 매핑 — `workspace.team.tab.wiki`

### 2.1 누락 확인

`TeamPanel.tsx` 가 `workspace.team.tab.wiki` 키를 두 곳에서 사용:
- line 169: `title={t('workspace.team.tab.wiki')}` (hover tooltip)
- line 172: `{t('workspace.team.tab.wiki')}` (visible label)

ko.json + en.json 모두 `workspace.team.tab` 객체 자체가 없음 → react-i18next 가 key literal 문자열을 그대로 반환 → 화면에 `workspace.team.tab.wiki` 노출.

### 2.2 기존 유사 키 현황

| 키 | ko | en | 비고 |
|:---|:---|:---|:-----|
| `workspace.team.section.wikiMemory` | "위키 / 메모리" | "Wiki / Memory" | 섹션 헤더용 (긴 버전) |
| `workspace.team.tab.wiki` | **없음** | **없음** | 네비 버튼 라벨 (추가 대상) |

### 2.3 확정 매핑

| 파일 | 키 경로 | 값 |
|:-----|:--------|:---|
| ko.json | `workspace.team.tab.wiki` | `"위키"` |
| en.json | `workspace.team.tab.wiki` | `"Wiki"` |

**라벨 선택 근거**: nav row 버튼에는 `workspace.team.section.skills` = "스킬" (단어형) 과 대칭을 맞추어 짧은 단어형 "위키" / "Wiki" 사용. 긴 "위키 / 메모리" 는 탭 내부 섹션 헤더 역할로 구분.

### 2.4 삽입 위치 (nested JSON)

```jsonc
// ko.json  — workspace.team 객체 안
"tab": {
  "wiki": "위키"
}

// en.json — workspace.team 객체 안
"tab": {
  "wiki": "Wiki"
}
```

sibling 키들(`title`, `section`, `persona`, `wiki`, `activeDot`, `skillMatrix`, `personaDef`) 뒤에 추가.

---

## §3 Emoji → lucide-react 매핑 (TeamWikiTab)

### 3.1 현재 코드 구조

```tsx
// WikiRowProps
interface WikiRowProps {
  icon: string      // ← emoji 문자열
  label: string
  badge?: React.ReactNode
  onClick?: () => void
}

function WikiRow({ icon, label, badge, onClick }: WikiRowProps) {
  return (
    <button ...>
      <span style={wikiIcon}>{icon}</span>   {/* fontSize: 14 */}
      <span style={wikiLabel}>{label}</span>
      ...
    </button>
  )
}
```

### 3.2 확정 아이콘 매핑

| Row | 기존 소스 | 렌더 의도 | lucide 컴포넌트 | 선택 근거 |
|:----|:---------|:---------|:--------------|:---------|
| Wiki backend: `fs` | `'\u{1F5C4}'` (🗄) | 로컬 파일 캐비닛 | `FileText` | markdown 파일 개념 직결 |
| Wiki backend: `graphiti` | `'\u{1F9E0}'` (🧠) | 지식 그래프/AI | `BrainCircuit` | knowledge graph = circuit 연상 |
| Wiki backend: `keeper` | `'\u{1F4DA}'` (📚) | 에이전트 관리 위키 | `BookOpen` | 책 → wiki / 에이전트 관리 연상 |
| User memory | `"\u{1F9E0}"` (🧠) | 사용자 메모리 | `Brain` | 메모리/기억 직결. graphiti와 구분 (BrainCircuit ≠ Brain) |
| Project state | `"⚙️"` | 설정/상태 | `Settings2` | gear + lines = config/state |
| Promotion candidates | `"\u{1F4CC}"` (📌) | 핀/마킹 | `Pin` | 승급 후보 = 핀 마킹 |

### 3.3 컴포넌트 변경 스펙

**Props 타입 변경:**
```tsx
// Before
interface WikiRowProps {
  icon: string
  ...
}

// After
interface WikiRowProps {
  icon: React.ReactElement
  ...
}
```

**WikiRow JSX:**
```tsx
// Before
<span style={wikiIcon}>{icon}</span>

// After — fontSize 제거, SVG 정렬용 flex wrapper
<span style={wikiIconWrap}>{icon}</span>
```

**wikiIcon style 교체:**
```tsx
// Before
const wikiIcon: React.CSSProperties = {
  fontSize: 14,
  flexShrink: 0,
}

// After
const wikiIconWrap: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  flexShrink: 0,
  color: '#808080',   // --txt2 근사
}
```

**lucide import 추가:**
```tsx
import { FileText, BrainCircuit, BookOpen, Brain, Settings2, Pin } from 'lucide-react'
```

**Row 1 (wiki backend) — 조건부 아이콘:**
```tsx
const wikiBackendIcon: React.ReactElement =
  wikiBackend === 'graphiti' ? <BrainCircuit size={14} /> :
  wikiBackend === 'keeper'   ? <BookOpen size={14} /> :
                               <FileText size={14} />

<WikiRow icon={wikiBackendIcon} label={`Wiki: ${wikiBackendLabel}`} />
```

**Row 2–4:**
```tsx
<WikiRow icon={<Brain size={14} />}    label={t('workspace.team.wiki.userMemory')} ... />
<WikiRow icon={<Settings2 size={14} />} label={t('workspace.team.wiki.projectState')} ... />
<WikiRow icon={<Pin size={14} />}      label={t('workspace.team.wiki.promotionCandidates')} ... />
```

---

## §4 Literal escape 노출 root cause 분석

### 4.1 증상

화면에 `\u{1F9E0}` / `\u{1F4CC}` 텍스트가 문자 그대로 노출 (emoji 렌더 실패).

### 4.2 원인 분석

| 가설 | 설명 | 가능성 |
|:----|:-----|:------|
| **ES2018 escape 미지원** | `\u{...}` (중괄호 포함) 는 ES2015+ 문법. 구버전 WebKit/JavaScriptCore 에서 parse 시 literal 로 처리 가능. Tauri WebView(macOS WebKit) 버전에 따라 재현 가능. | **높음** |
| 빌드 트랜스파일 이슈 | Vite/esbuild 가 target 설정에 따라 `\u{XXXXX}` → 별도 표현으로 변환 중 일부 환경에서 오작동. | 중간 |
| 스크린샷 도구 rendering | 화면 캡처 도구 자체가 emoji 를 literal 로 표시하는 경우 (실제 UI 는 정상). | 낮음 |

### 4.3 영구 fix

**emoji 자체를 제거** (→ lucide SVG 교체) 하면 `\u{}` escape 해석 의존성이 완전히 사라짐. SVG 기반 lucide 아이콘은 폰트/플랫폼/WebView 버전에 무관하게 일관 렌더됨.

`⚙️` (U+2699 + variation selector) 는 emoji 폰트 의존. `Settings2` SVG 로 교체하면 동일하게 해소.

---

## §5 변경 파일 요약

| 파일 | 변경 내용 | 예상 줄 수 |
|:-----|:---------|:---------|
| `TeamPanel.tsx` | ChevronRight import 삭제 + 두 곳 `<ChevronRight>` 삭제 | −4 줄 |
| `TeamWikiTab.tsx` | lucide import 추가, WikiRowProps.icon 타입 변경, wikiIcon→wikiIconWrap 스타일, 4 row icon props 교체 | ~+12 / −8 줄 |
| `ko.json` | `workspace.team.tab.wiki` 키 1개 추가 | +3 줄 |
| `en.json` | `workspace.team.tab.wiki` 키 1개 추가 | +3 줄 |

**코드 변경 총합**: 4 파일, ~18 줄 — L1 적정.

---

## §6 §1.5 UX self-check

| 원칙 | 적용 | 결과 |
|:-----|:-----|:-----|
| Few Things / Hick's Law | chevron 제거 → 시각 노이즈 감소 | ✅ |
| Familiar | lucide 아이콘 = productune 전체 관용 패턴 | ✅ |
| Predictability | click affordance (hover bg) 유지됨 | ✅ |
| Feedback | 아이콘 교체는 상태 feedback 관련 없음 | N/A |
| Escape | 변경 없음 | N/A |

---

## §QA scope

| Field | Value |
|:--|:--|
| **QA invoke** | `manual smoke only` |
| **test target** | `TeamPanel` Skills/Wiki nav row 시각 + `TeamWikiTab` 4-row 아이콘 |
| **사용자 dogfood** | Team 사이드바 → Skills·Wiki row 셰브론 없음 확인; Wiki 탭 → 4 row lucide 아이콘 확인; ko 모드 Wiki nav row = "위키", en = "Wiki" |
| **regression check** | `TeamPanel` click-to-open (skill-matrix / team-wiki 탭) 동작 이상 없음 |

---

## Persona Activity

| Time | Persona | Model/Effort | Action | Result |
|:-----|:--------|:-------------|:-------|:-------|
| 2026-05-19T00:00:00Z | pdt-designer | sonnet/low | plan-author | T-P4-129 UI 잡일 plan 작성 (chevron / i18n / emoji→lucide / root cause) |
