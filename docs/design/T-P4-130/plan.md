# T-P4-130 — MCP 서버 섹션: Settings → 팀 패널 스킬 아래 이동

**Author:** pdt-designer · **Date:** 2026-05-19 · **Complexity:** L2

---

## §0 Context

사용자 directive (2026-05-19): "설정에 있는 mcp서버를 팀에 스킬 아래에 배치해주자."

MCP 서버는 AI 팀원(페르소나)들이 런타임에 사용하는 외부 도구다. 현재 Settings → MCP tab은 탐색 경로가 깊어 (ActivityBar → Settings 아이콘 → mcp sub-tab 클릭) 자주 열지 않게 된다. TeamPanel 안에 배치하면 "팀이 쓰는 도구"로 자연스럽게 그룹화되고 접근성이 높아진다.

---

## §1 현 컴포넌트 위치

### 1-A. 진입 경로 (현재)

```
ActivityBar "설정" 아이콘
  └─ SettingsView.tsx
       └─ tab "mcp" 클릭
            └─ openTab('mcp-servers', 'mcp-servers', ...)
                 └─ TabContent.tsx  case 'mcp-servers'
                      └─ McpServersTab.tsx   ← main pane 전체 화면
```

### 1-B. McpServersTab 기능 요약

| 기능 | 구현 위치 | 비고 |
|:--|:--|:--|
| 서버 목록 로드 | `api.mcpGetServers(projectDir)` IPC | 비동기, `useEffect` |
| 서버 행 렌더 | `<button>` row + `StatusBadge` | status: `ok/err/checking` |
| 행 클릭 | `setSelectedServer(server)` → `McpServerModal` | modal 재사용 |
| 빈 상태 | emptyWrap (icon + title + desc) | 대형 UI |
| 로딩 | `◌ 확인 중…` muted | |
| [+ 서버 추가] | Phase 5 disabled placeholder | 건드리지 않음 |

### 1-C. TeamPanel 현재 섹션 순서

```
TeamPanel.tsx
  ┣ <Section> "페르소나 (4)"     ← collapsible
  ┣ <div>    "스킬"             ← skillsNavBtn (non-collapsible, Section 아닌 div)
  ┗ <Section> "위키 / 메모리"   ← collapsible
```

**삽입 위치:** 스킬 row(`div sectionWrap`) 아래 + 위키/메모리 `<Section>` 위.

### 1-D. 관련 파일

| 파일 | 역할 |
|:--|:--|
| `TeamPanel.tsx` | 팀 사이드바 — **수정 대상** |
| `McpServersTab.tsx` | MCP main pane 탭 — **수정 없음** |
| `McpServerModal.tsx` | 서버 설정 modal — **수정 없음** |
| `SettingsView.tsx` | Settings nav — **수정 없음** (병행 유지) |
| `ko.json` / `en.json` | i18n — **신규 키 추가** |

---

## §2 이동 Plan — 컴포넌트 전략

### 옵션 A — McpServersTab 재사용 (main pane 탭으로 openTab)

TeamPanel MCP 섹션에서 서버 행 클릭 시 `openTab('mcp-servers', ...)` → main pane에 기존 `McpServersTab` 전체 화면 열기.

- pros: 구현 최소 (1–2줄 추가)
- **cons: UX 일관성 위반** — 팀 탭의 다른 항목(페르소나 행 → openTab persona-def, 스킬 → openTab skill-matrix)은 main pane 탭을 여는 패턴. **단, 빈 상태 UI가 main pane에만 적합**하고 팀 패널 사이드바에 "MCP 서버 목록 + modal"을 직접 내장하는 것이 요청 의도에 더 부합.

### 옵션 B — 인라인 로직 재구현 (추천) ✅

TeamPanel 안에 MCP 서버 목록 렌더 + McpServerModal 마운트를 직접 작성. `McpServersTab` 로직을 **복사하지 않고** 필요한 부분만 인라인:

- `useState<McpServerEntry[]>` + `useState(loading)` + `useState(selectedServer)`
- `useEffect` → `api.mcpGetServers(project?.projectDir)` IPC (McpServersTab과 동일)
- 서버 행: `<button style={personaRowStyle 변형}>` — TeamPanel row 스타일 통일
- `StatusBadge` 재사용: `McpServersTab`에서 import 하거나 TeamPanel 내 inline 정의 (component가 아닌 단순 span 수준 → inline이 간결)
- `McpServerModal`: 기존 컴포넌트 그대로 import + mount
- 빈 상태: 대형 emptyWrap 대신 muted 1줄 텍스트 (`workspace.team.mcp.empty`)

**결론:** 옵션 B 채택. 사이드바 밀도에 맞게 compact하게 렌더하면서, modal은 그대로 재사용.

### 인라인 구조 스케치 (TeamPanel 추가 영역)

```
<Section title="MCP 서버" storageKey="mcp">
  {loading && <muted 1줄>}
  {!loading && servers.length === 0 && <muted 1줄 "연결된 MCP 서버 없음">}
  {!loading && servers.map(server =>
    <button style={mcpRowStyle} onClick={() => setSelected(server)}>
      <span style={mcpName}>{server.name}</span>
      <StatusDot status={server.status} />
    </button>
  )}
  {selected && <McpServerModal server={selected} onClose={...} onSaved={...} />}
</Section>
```

`StatusDot`: 원(●/✗/◌) + 색상만 — TeamPanel 밀도에 맞게 텍스트 레이블 없이 dot만 표시. (StatusBadge의 텍스트 레이블은 main pane 공간에서 적합, 사이드바 28px row에는 dot만으로 충분.)

---

## §3 Settings MCP tab — 유지 vs. 제거

### 대안 A — 유지 (병행) ✅ 추천

`SettingsView` 의 `mcp` sub-tab을 그대로 남겨 둠. Settings → MCP tab → main pane `McpServersTab` 경로를 유지.

- **pros:** 접근 경로 2개 = 사용자 선택 폭 넓음. 설정 경로로 진입하는 사용자(고급 사용자 / onboarding 후 처음 설정 시) 영향 없음. 회귀 리스크 0.
- **cons:** 두 경로 중복. 사소.

### 대안 B — Settings MCP tab 제거

SettingsView에서 `mcp` 항목 삭제, TeamPanel 경로만 남김.

- **pros:** UI 단순화.
- **cons:** "설정" 탭에서 MCP 서버를 찾는 기존 사용자 패턴 깨짐. 메뉴 항목이 사라지는 회귀. 팀 패널 = 사이드바 → 매우 작은 공간에서 모달만 열어 설정하는 구조 → main pane 전체 화면의 설정 UI를 대체하기에 UX 공간이 부족할 수 있음.

**결정: 대안 A (유지, 병행).** Settings MCP tab은 `SettingsView.tsx` 에서 건드리지 않음. 팀 패널은 "빠른 확인 + modal 편집" 경로, Settings은 "전체 화면 설정 탭" 경로로 역할 분리.

---

## §4 TeamPanel — 섹션 간 spacing / divider / collapse

### 현 Section 패턴

```tsx
function Section({ title, storageKey, children, right }: SectionProps) {
  // localStorage collapse 상태 유지
  // <button> secHdrBtn → chevron ▶/▼ + title
  // {!collapsed && <div>{children}</div>}
}

const sectionWrap: React.CSSProperties = {
  display: 'flex', flexDirection: 'column',
  borderBottom: '1px solid #1E1E1E',   // ← 섹션 구분선
}
```

### MCP 섹션 적용

- MCP 섹션: `<Section title={t('workspace.team.section.mcpServers')} storageKey="mcp">` — 기존 `Section` 컴포넌트 그대로 사용. `borderBottom: '1px solid #1E1E1E'` 자동 적용됨.
- collapse 기본값: `false` (열린 상태) — 서버가 없는 경우 빈 상태 1줄만 보이므로 높이 부담 없음.
- storageKey `"mcp"` → `localStorage: workspace.team.collapsed.mcp`.

### 섹션 순서 (최종)

```
<Section>  페르소나 (4)       ← 기존
<div>      스킬               ← 기존 (skillsNavBtn, non-Section)
<Section>  MCP 서버           ← 신규 추가 ← HERE
<Section>  위키 / 메모리      ← 기존 (아래로 밀림)
```

### 행 높이 / 폰트

- 서버 행: `height: 28px` (팀 패널 내 모든 row 통일)
- serverName 폰트: `fontSize: 12, color: '#C0C0C0'` (WikiRow label 스타일과 동일)
- StatusDot: `fontSize: 10, flexShrink: 0` — right-aligned, dot 기호만 (● ok=#4ADE80 / ✗ err=#EF4444 / ◌ checking=#707070)
- hover: `background: '#1A1A1A'` (팀 패널 내 다른 행들과 동일)

---

## §5 i18n 신규 키

### ko.json — `workspace.team` 블록 내 추가

```json
"section": {
  // 기존 키 유지...
  "mcpServers": "MCP 서버"
},
"mcp": {
  "empty": "연결된 MCP 서버 없음"
}
```

### en.json — 동일 경로

```json
"section": {
  // 기존 키 유지...
  "mcpServers": "MCP Servers"
},
"mcp": {
  "empty": "No MCP servers configured"
}
```

기존 `settings.mcp.*` 키군은 변경 없음 — `McpServersTab` + `McpServerModal` 에서 계속 사용.

---

## §6 UX consistency check (§1.5)

| 원칙 | 적용 |
|:--|:--|
| **Few things** | Section 1개 추가; 기존 `Section` 컴포넌트 + `McpServerModal` 재사용 — 신규 UI 최소 |
| **Familiar** | `Section` collapse 패턴, 28px row, hover 배경 — 팀 패널 기존 행과 동일 |
| **Predictability** | 스킬 아래 = "팀이 쓰는 도구" 그룹; 페르소나/스킬과 같은 사이드바 위치 |
| **Feedback** | 행 hover `#1A1A1A`; StatusDot 색상(green/red/muted); 클릭 → modal 즉시 open |
| **Escape** | modal: Esc + backdrop click close (기존 McpServerModal 그대로) |

§1.5 위반 없음.

---

## §7 파일 변경 목록

| 파일 | 변경 유형 | 내용 |
|:--|:--|:--|
| `packages/gui/src/components/workspace/TeamPanel.tsx` | **MODIFY** | MCP 섹션 추가 (useState + useEffect + JSX Section + McpServerModal) |
| `packages/gui/src/locales/ko.json` | **MODIFY** | `workspace.team.section.mcpServers`, `workspace.team.mcp.empty` 추가 |
| `packages/gui/src/locales/en.json` | **MODIFY** | 동일 키 영문 추가 |
| 나머지 모든 파일 | **변경 없음** | McpServersTab, McpServerModal, SettingsView, TabContent 수정 없음 |

---

## §Out of scope

- `McpServersTab.tsx` 내부 변경 (행 디자인, status badge, [+ 서버 추가] Phase 5 lock)
- `SettingsView.tsx` MCP tab 제거 (유지 결정)
- MCP 서버 추가 / 삭제 UI
- TeamPanel 의 다른 섹션 재배치

---

## §QA scope

| Field | Value |
|:--|:--|
| **QA invoke** | `manual smoke only` |
| **test target** | `TeamPanel` MCP 섹션 렌더링 + `McpServerModal` 재사용 동작 |
| **사용자 dogfood** | 팀 탭 → 스킬 아래 "MCP 서버" 섹션 확인; 서버 행 클릭 → McpServerModal 노출 → Esc/저장 동작; Settings → MCP tab 경로 병행 동작 확인 |
| **regression check** | `SettingsView` → mcp tab → mcp-servers main pane 탭 오픈 정상 (제거되지 않았음) |
