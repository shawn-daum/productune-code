# T-P4-145 · Sidebar UX 4-bug fix
**Slug**: sidebar-ux-4bug
**Date**: 2026-05-20
**Round**: phase4-r4
**Artifact**: plan (1/1)
**Status**: ready
**Origin**: user feedback 2026-05-20 (p4 close 사전, bugs 1b/2/5/6)

---

## §0 Bug index + verdict

| # | Bug | File(s) | Verdict |
|:--|:--|:--|:--|
| 1b | VersionsPanel "지정 없음" row — count=0 일 때 표시됨 | `VersionsPanel.tsx` | **CONFIRM-ONLY** — `{unassignedCount > 0 && …}` guard 이미 L105 에 존재 |
| 2  | 현재 버전 카드 clickable cue 없음 | `VersionsPanel.tsx` | **CHANGE** — ChevronRight + hover border |
| 5  | Persona row → 잘못된 tab type (team-wiki) | `TeamPanel.tsx`, `PersonaDefTab.tsx` | **CHANGE** — `persona-def` 타입으로 route, PersonaDefTab 섹션 확장 |
| 6  | Wiki sub-row 4개 동일 tabId → remount 안 됨 | `TeamPanel.tsx` | **CHANGE** — tabId에 backend suffix 추가 |

---

## §1 Bug 1b — 지정 없음 row: verify only

**현황** (`VersionsPanel.tsx` L104–110):
```tsx
{unassignedCount > 0 && (
  <div style={{ ...sectionLabel, marginTop: 18 }}>
    <span style={unassignedLabel}>{t('workspace.versions.unassigned')}</span>
    <span style={unassignedBadge}>{unassignedCount}</span>
  </div>
)}
```
`unassignedCount > 0` 조건 이미 존재. PO mechanical 정정 이후 count=0 → row 미표시.
**코드 변경 불필요. impl 턴에서 스모크만.**

---

## §2 Bug 2 — ActiveVersionCard visual expand

### 2.1 문제

`ActiveVersionCard` (L116–134):
- `cursor: 'pointer'` + `onClick` 존재하나 시각적 clickability cue 없음.
- hover 시 border 변화 없음 (`transition: 'border-color 0.12s'` 선언되어 있으나 hover 스타일 연결 없음).
- 사용자: "이걸 눌러서 티켓 확인하세요 느낌" 미충족.

### 2.2 변경 명세

**파일**: `packages/gui/src/components/workspace/VersionsPanel.tsx`

**① Import 추가**:
```tsx
import { ChevronRight } from 'lucide-react'
```

**② `ActiveVersionCard` 내 상단 id row 구조 변경**:

현재:
```tsx
<div style={cardId}>{version.id}</div>
```

변경 후:
```tsx
<div style={cardIdRow}>
  <span style={cardId}>{version.id}</span>
  <ChevronRight size={12} color="#FF6B2B66" style={chevronStyle} />
</div>
```

**③ `ActiveVersionCard` 에 hover handler 추가**:
```tsx
<div
  style={selected ? cardActiveSelected : cardActive}
  onClick={onClick}
  onMouseEnter={(e) => {
    (e.currentTarget as HTMLDivElement).style.borderColor = '#FF6B2B'
  }}
  onMouseLeave={(e) => {
    (e.currentTarget as HTMLDivElement).style.borderColor = '#FF6B2B33'
  }}
>
```
> `selected` 상태일 때는 이미 `border: '1px solid #FF6B2B'` → hover 무시 무방 (동일 색).

**④ 스타일 변경**:

| const | property | 현재 | 변경 후 |
|:--|:--|:--|:--|
| `cardActive` | `padding` | `'10px 12px'` | `'12px 14px'` |
| — | 신규 | — | `cardIdRow`, `chevronStyle` |

```tsx
const cardIdRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  marginBottom: 4,
}

const chevronStyle: React.CSSProperties = {
  marginLeft: 'auto',
  flexShrink: 0,
  transition: 'color 0.12s',
}
```

> `ChevronRight` 의 color prop 은 hover JS 에서 직접 바꿀 수 없으므로 chevron 색은 항상 `#FF6B2B66`. border hover 만으로도 충분한 feedback. (색 변경 필요 시 useState selected 추가 — 현 scope 에서 불필요)

### 2.3 Wireframe — after

```
┌──────────────────────────────────────────────────┐
│  v0.4-meta-dogfood                           ›   │  ← id (orange, bold) + ChevronRight (right-aligned, muted)
│  Phase  Plan (2/5)                                │
│  3 tickets                                        │
│  ★ north star text…                              │  (if exists)
└──────────────────────────────────────────────────┘
  hover → border: #FF6B2B33 → #FF6B2B (via onMouseEnter)
```

**클릭 동작** 변경 없음: `openTab(tabIdForVersion(id), 'version-detail', { versionId: id }, id)`

---

## §3 Bug 5 — Persona row → PersonaDefTab

### 3.1 TeamPanel.tsx — handlePersonaClick 변경

**파일**: `packages/gui/src/components/workspace/TeamPanel.tsx`

```tsx
// BEFORE (L141–143):
const handlePersonaClick = (def: PersonaDef) => {
  openTab('team-wiki', 'team-wiki', { personaKey: def.key })
}

// AFTER:
const handlePersonaClick = (def: PersonaDef) => {
  openTab(
    `persona-def:${def.key}`,  // persona 별 distinct tabId
    'persona-def',
    { personaKey: def.key },
    t(def.nameKey),            // i18n persona name = tab label
  )
}
```

> `workspace.ts defaultTitle('persona-def', ...)` 는 `props?.persona` fallback → `title` 명시 전달로 **수정 불필요**.
> WorkspaceShell L605 `persona-def` 기존 호출 (`personaSlug` prop) **영향 없음**.

### 3.2 PersonaDefTab.tsx — personaKey prop 처리

**파일**: `packages/gui/src/components/workspace/main/panes/PersonaDefTab.tsx`

**① KEY_TO_ID 맵 추가** (PERSONA_META 위):
```tsx
const KEY_TO_ID: Record<string, string> = {
  po:       'pdt-po',
  designer: 'pdt-designer',
  dev:      'pdt-developer',
  qa:       'pdt-qa',
}
```

**② personaId 도출 변경** (L63 기존 `props?.persona` 에 fallback chain 추가):
```tsx
// BEFORE:
const personaId = (props?.persona as string) ?? ''

// AFTER:
const personaKeyProp = (props?.personaKey as string) ?? ''
const personaIdProp  = (props?.persona    as string) ?? ''
const personaId = personaIdProp || KEY_TO_ID[personaKeyProp] || ''
```
> `props?.persona` 경로(WorkspaceShell) 그대로 동작.

### 3.3 PersonaDefTab.tsx — 섹션 확장

**추가 imports** (파일 상단):
```tsx
import { useWorkspace } from '../../../../store/workspace'
import { FileText, ChevronRight as ChevRight } from 'lucide-react'
```

**store bindings** (컴포넌트 상단, `meta` null-check 이전):
```tsx
const poState   = useWorkspace((s) => s.poState)
const openTabFn = useWorkspace((s) => s.openTab)
```

---

#### §3.3.1 장기 기억 섹션 (LONG-TERM MEMORY)

persona 별 static config:
```tsx
const LT_MEMORY: Record<string, { path: string; tabId: string; title: string }[]> = {
  po:       [{ path: '~/.productune/po-memory.md',       tabId: 'user-memory',        title: 'User Memory' }],
  designer: [{ path: 'docs/designer/decisions.md',       tabId: 'designer-decisions', title: 'Designer Decisions' }],
  dev:      [{ path: 'docs/designer/feature-history.md', tabId: 'feature-history',    title: 'Feature History' }],
  qa:       [{ path: 'docs/qa/fail-patterns.md',         tabId: 'qa-fail-patterns',   title: 'QA Fail Patterns' }],
}
```

섹션 렌더링 (meta.key 기준 조회 → map):
```tsx
const ltRows = LT_MEMORY[meta.key] ?? []

// …
<div style={sectionSubHdr}>LONG-TERM MEMORY</div>
{ltRows.length === 0 && <div style={memoryEmpty}>—</div>}
{ltRows.map((cfg) => (
  <button
    key={cfg.tabId}
    style={memoryRow}
    onClick={() => openTabFn(cfg.tabId, 'markdown', { path: cfg.path, title: cfg.title }, cfg.title)}
    onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#1A1A1A' }}
    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
  >
    <FileText size={13} color="#505050" />
    <span style={memoryRowPath}>{cfg.path}</span>
    <ChevRight size={12} color="#505050" style={{ marginLeft: 'auto', flexShrink: 0 }} />
  </button>
))}
```

---

#### §3.3.2 프로젝트 기억 섹션 (PROJECT MEMORY)

`poState` inline 파생 — 별도 IPC 불필요.

```tsx
const currentVersion = poState?.current_version ?? '—'
const ct = poState?.current_task
const activeTask = ct?.assignee_persona === meta.id
  ? (ct?.ticket_id ?? '—')
  : '—'
const promoCount = (poState?.pending_promotions ?? [])
  .filter((p) => p.persona === meta.id && p.status === 'pending').length
const lastSeen: string =
  ((poState as any)?.current_task?.persona_session_meta?.[meta.id]?.last_seen as string | undefined)
    ?.slice(0, 10) ?? '—'
```

렌더링: `metaRow` + `metaLabel` + `metaValue` 스타일 재사용:
```tsx
<div style={sectionSubHdr}>PROJECT MEMORY</div>
<div style={metaSection}>
  <div style={metaRow}>
    <span style={metaLabel}>current version</span>
    <span style={metaValue}>{currentVersion}</span>
  </div>
  <div style={metaRow}>
    <span style={metaLabel}>active task</span>
    <span style={metaValue}>{activeTask}</span>
  </div>
  <div style={metaRow}>
    <span style={metaLabel}>promo pending</span>
    <span style={metaValue}>{promoCount}</span>
  </div>
  <div style={metaRow}>
    <span style={metaLabel}>last seen</span>
    <span style={metaValue}>{lastSeen}</span>
  </div>
</div>
```

---

### 3.4 previewNote 제거

`previewNote` `<div>` (L116–118) 제거. 섹션 추가로 실질 데이터 제공하므로 "Phase 4 preview" 문구 불필요.

---

### 3.5 새 스타일 상수 (PersonaDefTab.tsx)

```tsx
const sectionSubHdr: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  color: '#3A3A3A',
  letterSpacing: '0.07em',
  textTransform: 'uppercase',
  borderTop: '1px solid #1E1E1E',
  padding: '10px 0 6px',
  marginTop: 4,
}

const memoryRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '5px 0',
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  width: '100%',
  textAlign: 'left',
}

const memoryRowPath: React.CSSProperties = {
  fontSize: 11,
  fontFamily: 'monospace',
  color: '#707070',
  flex: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const memoryEmpty: React.CSSProperties = {
  fontSize: 11,
  color: '#3A3A3A',
  padding: '4px 0',
  fontStyle: 'italic',
}
```

---

### 3.6 Wireframe — PersonaDefTab after

```
┌──────────────────────────────────────────────────────┐
│ ┌──┐  pdt-designer                     opus / xhigh  │
│ │ D│  PO-coordinated. UX/brand/DS…                   │
│ └──┘                                                  │
├──────────────────────────────────────────────────────┤
│  id              pdt-designer                         │
│  permissionMode  bypassPermissions                    │
│  mcpServers      graphiti                             │
│  source          ~/.claude/agents/pdt-designer.md     │
├─ LONG-TERM MEMORY ───────────────────────────────────┤
│  📄  docs/designer/decisions.md                   ›  │  ← button → markdown tab
├─ PROJECT MEMORY ─────────────────────────────────────┤
│  current version   v0.4-meta-dogfood                  │
│  active task       —                                  │
│  promo pending     2                                  │
│  last seen         2026-05-20                         │
└──────────────────────────────────────────────────────┘
```

---

## §4 Bug 6 — Wiki sub-row distinct tabs

### 4.1 TeamPanel.tsx — 4 openTab calls 수정

**파일**: `packages/gui/src/components/workspace/TeamPanel.tsx`

```tsx
// BEFORE (L198–218) — 동일 tabId 'team-wiki' → 같은 tab 재사용, backend prop 변경 미반영:
onClick={() => openTab('team-wiki', 'team-wiki', { backend: 'fs' })}
onClick={() => openTab('team-wiki', 'team-wiki', { backend: 'userMemory' })}
onClick={() => openTab('team-wiki', 'team-wiki', { backend: 'projectState' })}
onClick={() => openTab('team-wiki', 'team-wiki', { backend: 'promo' })}

// AFTER — backend suffix로 distinct tabId, title 명시 (tab bar label):
onClick={() => openTab('team-wiki:fs',          'team-wiki', { backend: 'fs' },          t('workspace.team.wikiMenu.fs'))}
onClick={() => openTab('team-wiki:userMemory',   'team-wiki', { backend: 'userMemory' },  t('workspace.team.wikiMenu.userMemory'))}
onClick={() => openTab('team-wiki:projectState', 'team-wiki', { backend: 'projectState' },t('workspace.team.wikiMenu.projectState'))}
onClick={() => openTab('team-wiki:promo',        'team-wiki', { backend: 'promo' },       t('workspace.team.wikiMenu.promo'))}
```

**메커니즘**: `openTab` 은 tabId 기준 global dedup. 4개 distinct tabId → 4개 독립 tab. ✓

**TeamWikiTab.tsx 변경 없음**: `paneProps?.backend` 이미 분기 처리됨. ✓

---

## §5 §1.5 UX self-check

| 원칙 | 확인 |
|:--|:--|
| Few Things (§1.5.1) | 각 변경이 1개 UX issue 해결. PersonaDefTab 섹션 추가 — progressive (스크롤 가능, 한 pane 단일 타입 유지) ✓ |
| Familiar (§1.5.2) | ChevronRight = IDE 표준 "more detail" 신호. memoryRow = 기존 WikiRow 패턴 재사용 ✓ |
| Predictability (§1.5.3) | 각 wiki sub-row → distinct tab = 동작이 row별 일관. Persona 클릭 → persona-scope 탭 = 예상 가능 ✓ |
| Feedback (§1.5.4) | Bug 2: hover border 변화 = 클릭 가능 신호 ✓ |
| Escape (§1.5.5) | 새 tab = 닫기 버튼 있음. 모달 없음 ✓ |

위반 없음.

---

## §Out of scope

- WorkspaceShell `persona-def` 기존 route (L605, `personaSlug`) — 수정 불필요.
- PersonaDefTab 내 skills 인라인 목록 (`listSkills()` IPC 필요) — 별도 ticket.
- 파일 내용 inline read (새 IPC `readFile` 필요) — 별도 ticket.
- `workspace.ts defaultTitle('persona-def', ...)` — title 명시 전달로 수정 불필요.
- per-persona 기억 파일 경로 표준화 — 별도 설계.
- i18n key: 섹션 헤더("LONG-TERM MEMORY", "PROJECT MEMORY") 하드코딩 허용 — 미래 i18n ticket 대상.

---

## §QA scope

| Field | Value |
|:--|:--|
| **QA invoke** | `manual smoke only` |
| **test target** | `VersionsPanel.ActiveVersionCard` · `TeamPanel.handlePersonaClick` · `PersonaDefTab` (personaKey routing + sections) · `TeamPanel` wiki sub-rows 4개 |
| **사용자 dogfood** | (1) Versions 패널: "지정 없음" row 미표시. (2) 현재 버전 카드 hover → border 밝아짐 + chevron 표시, 클릭 → version-detail tab 열림. (3) Persona row 클릭 → persona name label tab 열림, 장기 기억·프로젝트 기억 섹션 표시, LONG-TERM MEMORY row 클릭 → markdown tab. (4) 위키 메모리 4 sub-row 클릭 → tab bar 에 라벨 다른 4개 tab 각각 열림. |
| **regression check** | WorkspaceShell `persona-def` 기존 경로 (`props?.persona`) 영향 없음 (KEY_TO_ID fallback chain). `team-wiki` 단일 id 기존 사용처 없음 (TeamPanel only). |

---

## §Open Questions

- OQ-A: 장기 기억 파일 경로 — 현재 persona별 static config. 향후 `~/.productune/<persona>-memory.md` 표준화 시 config 교체.
- OQ-B: PersonaDefTab skills 인라인 표시 (`listSkills` + persona filter) — 별도 ticket 권장.
