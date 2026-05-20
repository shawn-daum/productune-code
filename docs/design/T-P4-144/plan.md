# T-P4-144 · misc-bugs: MCP status badge 제거 + Kanban card 너비 수정
**Slug**: misc-bugs-mcp-badge-card-width
**Date**: 2026-05-20
**Round**: phase4-r4
**Artifact**: plan (1/1)
**Status**: ready
**Origin**: user feedback 2026-05-20 (bug #3 + bug #4)

---

## §1 Sources — verified before plan emit

### 1.1 Bug 3 — MCP status badge 무기한 "확인 중"

| Item | Value |
|:--|:--|
| File | `packages/gui/src/components/workspace/main/panes/McpServersTab.tsx` |
| Root cause | `loadServers()` L47: `raw.map((s) => ({ ...s, status: 'checking' }))` — 항상 `checking` 세팅 |
| Why it stays | `mcp:testConnection` IPC handler = Phase 5 structural stub. 이 컴포넌트에서 호출 자체 없음 → `status` 절대 `ok` / `err` 로 바뀌지 않음 |
| Current render | `StatusBadge` (L125–L149) → `status === 'checking'` → `◌ 확인 중` 영구 표시 |
| §1.5 위반 | §1.5.4 Feedback: 의미 없는 spinner = false feedback. 제거가 옳음 |

**Decision: Option a — StatusBadge 전체 제거.**
- Option b ("등록됨 ✓") 는 실제 연결 검증 없이 false positive 위험.
- Option c ("검증 미지원 Phase 5") 는 사용자에게 불필요한 implementation detail 노출.
- Option a: 서버 이름 + source tier pill 만 표시. 단순·정직·§1.5 준수.

### 1.2 Bug 4 — Kanban card 너비 초과 + 가로 스크롤

| Item | Value |
|:--|:--|
| File | `packages/gui/src/components/workspace/TicketDashboardView.tsx` |
| Grid | `kanban`: `repeat(7, minmax(160px, 1fr))` — 전체 kanban 가로 스크롤 OK |
| Column | `column`: `overflow: 'hidden'` 있음 — 하지만 내부 `columnBody` 가 독립 scroll context |
| Root cause 1 | `columnBody`: `overflowY: auto` 만 있고 **`overflowX` 미설정** → 기본값 `visible` → 카드 내용이 column 경계 밖으로 노출 |
| Root cause 2 | `card`: flex item 에 `minWidth: 0` 없음 → flex item 기본 `min-width: auto` = content size → 카드가 컬럼보다 넓어질 수 있음 |
| Root cause 3 | `cardTitle`: `overflowWrap` / `wordBreak` 없음 → 긴 한글 제목 · T-P4-NNN prefix 가 한 줄로 확장 |

---

## §2 Implementation spec

### 2.1 Bug 3: McpServersTab.tsx — StatusBadge 제거

**제거 대상 (4가지)**:

| 대상 | 위치 | 처리 |
|:--|:--|:--|
| `McpStatus` 타입 | L15 | 삭제 |
| `McpServerEntry.status` 필드 | L28 | 삭제 (`source` 까지만) |
| `status: 'checking'` spread | L47 | `raw.map((s) => ({ ...s }))` 또는 직접 타입 맞춤 |
| `<StatusBadge ... />` JSX | L89 | 삭제 |
| `StatusBadge` 함수 컴포넌트 | L125–L149 | 전체 삭제 |
| `badgeBase` 스타일 상수 | L208–L211 | 삭제 |

**변경 후 `rowBtn` 구성:**
```tsx
<button key={server.name} style={rowBtn} onClick={() => setSelectedServer(server)}>
  <span style={serverNameStyle}>{server.name}</span>
  <span style={tierPill}>[{server.source}]</span>
</button>
```

**`McpServerEntry` interface after:**
```typescript
export interface McpServerEntry {
  name: string
  config: {
    type?: 'stdio' | 'sse' | 'http'
    command?: string
    args?: string[]
    url?: string
    env?: Record<string, string>
  }
  source: 'productune' | 'local' | 'project'
  // status 필드 제거 — Phase 5 에서 testConnection 구현 시 재추가
}
```

> **Phase 5 note**: `mcp:testConnection` 실제 구현 시 `status` 필드 + `StatusBadge` 재추가. 현재는 인터페이스에서 제거해 타입 불일치 방지.

**`loadServers()` after:**
```typescript
const raw: Array<McpServerEntry> =
  (await api.mcpGetServers?.(project?.projectDir)) ?? []
setServers(raw)
```

`McpServerModal` 이 `McpServerEntry` 를 props 로 받으므로 타입 변경 영향 확인 필요 (status 필드 미사용이면 호환).

### 2.2 Bug 4: TicketDashboardView.tsx — 3개 스타일 수정

**변경 1 — `columnBody`**: `overflowX: 'hidden'` 추가

```typescript
const columnBody: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  padding: 8,
  overflowY: 'auto',
  overflowX: 'hidden',   // ← 추가 (T-P4-144)
}
```

**변경 2 — `card`**: `minWidth: 0`, `overflow: 'hidden'` 추가

```typescript
const card: React.CSSProperties = {
  background: '#141414',
  border: '1px solid #1A1A1A',
  borderRadius: 4,
  padding: '8px 10px',
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  minWidth: 0,           // ← 추가: flex item 기본 min-width:auto 재정의 (T-P4-144)
  overflow: 'hidden',    // ← 추가: 내용 clipping (T-P4-144)
}
```

**변경 3 — `cardTitle`**: `overflowWrap: 'break-word'` 추가

```typescript
const cardTitle: React.CSSProperties = {
  fontSize: 12,
  color: '#E0E0E0',
  lineHeight: 1.4,
  overflowWrap: 'break-word',  // ← 추가: 긴 한글·영문 줄바꿈 (T-P4-144)
}
```

**변경 없는 항목**:
- `kanban`: `overflowX: 'auto'` 유지 (7컬럼 전체 가로 스크롤은 의도된 동작)
- `column`: `overflow: 'hidden'` 이미 있음 — 유지
- `cardBottomRow`: `flexWrap: 'wrap'` 이미 있음 — chip 줄바꿈 OK
- `cardTopRow`: `justifyContent: 'space-between'` — `cardVersion` 이미 `textOverflow: 'ellipsis'` 있음 — 변경 불필요

---

## §3 §1.5 self-check

| 원칙 | 확인 |
|:--|:--|
| Few Things (§1.5.1) | Bug 3: 불필요한 상태 UI 1개 제거 → 행당 요소 감소 ✓ |
| Familiar (§1.5.2) | Bug 4: 카드가 컬럼 경계 안에 머묾 = 표준 kanban 동작 ✓ |
| Predictability (§1.5.3) | Bug 3: "확인 중" 영구 표시 → 사용자 혼란 제거 ✓ |
| Feedback (§1.5.4) | Bug 3: false feedback 제거 > 오해를 부르는 feedback ✓ |
| Escape (§1.5.5) | 해당 없음 — 모달 flow 변경 없음 |

---

## §Out of scope

- Phase 5 `mcp:testConnection` 실제 IPC 구현 (process spawn + health ping).
- `StatusBadge` Phase 5 재설계 — 별도 Phase 5 ticket.
- Kanban 컬럼 수 변경 (7 status columns 유지).
- `minWidth(160px)` grid 값 조정 — 현재 값 충분, 변경 안 함.
- i18n 변경 — `settings.mcp.statusChecking` 키는 loading spinner (탭 로딩 중) 에도 쓰임 → 키 삭제 않음. `StatusBadge` 만 제거.

---

## §QA scope

| Field | Value |
|:--|:--|
| **QA invoke** | `manual smoke only` |
| **test target** | `McpServersTab` status badge 부재 + `TicketDashboardView` card 너비 |
| **사용자 dogfood** | (1) Settings → MCP 탭 열기: 서버 행에 "◌ 확인 중" 없음, 이름 + `[local]`/`[project]`/`[productune]` 만 보임. (2) Kanban 탭: 티켓 카드가 컬럼 경계 안에 머물고, 긴 제목은 줄바꿈됨. 컬럼 내부 가로 스크롤 없음. |
| **regression check** | `McpServerModal`: server prop 에서 `status` 필드 참조 여부 확인 (미사용이면 호환). Kanban `done` / `abandoned` 컬럼 빈 상태(—) 정상 표시. |

## §Build verify

```bash
pnpm -F gui build
# expect: 0 TS errors — McpServerEntry status 필드 제거 후 McpServerModal 타입 호환 확인 포함
```
