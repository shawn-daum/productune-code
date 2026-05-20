# Plan: PersonaDefTab persona spec 편집 활성화 (T-P4-148)

version: v0.4-meta-dogfood | area: team/persona-def | created: 2026-05-20

---

## §Context

`PersonaDefTab.tsx` 는 T-P4-044 에서 Phase 4 preview-only 로 구현됨.
코드 최상단 주석 `// Phase 4 preview-only` + 로케일 키
`workspace.team.personaDef.previewNote` = "Phase 5 기능" 이 그 흔적.

현재 상태:
- `PERSONA_META` 에 hardcode 된 `modelSummary: 'opus / xhigh'` (정적 문자열)
- `sourcePath` = `~/.claude/agents/{personaId}.md` 만 표시 (클릭 불가)
- 편집 UI 없음

v0.4 Phase 5 deferral unlock 3/3:
persona def frontmatter (`model` / `default_effort` / `description`) 를 GUI 에서 편집 가능하게 하고,
해당 persona 에 할당된 skills 목록을 persona 탭 내에서 표시 + assignment 토글.

변경은 `~/.claude/agents/pdt-{persona}.md` 심링크 원본 파일(variants dir)에 atomic 기록.

---

## §Goals

- previewNote 로케일 키 제거 + "preview-only" 주석 제거
- IPC `settings:loadPersonaDef` / `settings:savePersonaDef` 추가
- IPC `skills:setPersonaAssignment` 추가 (기존 `skills:list` 재사용)
- PersonaDefTab: 편집 가능 영역 — `model`, `default_effort`, `description`
- PersonaDefTab: Skills 섹션 — assigned skills 토글 (path-inferred 충돌 경고 포함)
- 신규 i18n 키 (ko + en)

## §Non-goals

- `permissionMode` / `tools:` / `color:` 편집 (보안·복잡도 이유로 read-only 유지)
- 페르소나 body 전체 텍스트 편집 (별도 ticket)
- 신규 persona 추가 (4 + 1 user 고정)
- Skills 추가·제거 (skill 파일 자체 생성/삭제 — `inferPersonasFromPath` 일관성 risk)
- `pdt-po.md` 의 `variant` 구분 (po 는 단일 파일 — 동일 IPC 로직으로 처리 가능)

---

## §Approach

### A1 — Core util: `packages/core/src/agents/persona-def.ts` (신규)

**타입:**
```ts
export type PersonaModel   = 'sonnet' | 'opus' | 'haiku'
export type PersonaEffort  = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

export interface PersonaFrontmatter {
  name?:             string
  description?:      string
  model?:            PersonaModel
  default_effort?:   PersonaEffort   // 신규 optional 필드
  permissionMode?:   string
  tools?:            string
  color?:            string
  [key: string]:     unknown         // 기타 필드 그대로 보존
}

export interface ParsedPersonaDef {
  frontmatter: PersonaFrontmatter
  body: string                       // --- 이후 전체 본문
}
```

**`parsePersonaDef(content: string): ParsedPersonaDef`**
- `---\n...\n---` 블록 regex 추출
- 행별 `key: value` 파싱 (기존 `parseSkillFrontmatter` 패턴 재사용)
- body = `---` 블록 이후 나머지 텍스트

**`serializePersonaDef(parsed: ParsedPersonaDef): string`**
- frontmatter 키를 원래 순서 최대한 유지 (Object.entries 순서)
- `---\n{yaml}\n---\n{body}` 형식으로 재조립
- `default_effort` 미설정 시 serialize 에서 생략 (optional 필드)

**`resolveAgentFilePath(personaId: string): string`**
```ts
import fs from 'fs'
import path from 'path'
import os from 'os'

export function resolveAgentFilePath(personaId: string): string {
  const link = path.join(os.homedir(), '.claude', 'agents', `${personaId}.md`)
  try {
    return fs.realpathSync(link)   // symlink → variants/graphiti/pdt-designer.md 등
  } catch {
    return link                    // 심링크 아닐 때 원본 경로 사용
  }
}
```

> **중요**: `~/.claude/agents/` 파일은 variants dir 의 심링크.
> `tmp + rename` 방식 atomic write 는 심링크 자체를 덮어쓰므로
> 반드시 `realpathSync` 로 실제 경로 먼저 resolve 후 write.

**`savePersonaDef(personaId, patch: Partial<PersonaFrontmatter>): void`**
- `resolveAgentFilePath(personaId)` → 실제 경로
- 현재 파일 read → `parsePersonaDef` → frontmatter 에 patch merge
- `patch` 허용 키: `model`, `default_effort`, `description` (그 외 무시 — 보안)
- `serializePersonaDef` → tmpPath(`<realPath>.tmp`) write → `fs.renameSync` (atomic)

**Export from `packages/core/src/index.ts`:**
```ts
export { parsePersonaDef, serializePersonaDef, resolveAgentFilePath, savePersonaDef } from './agents/persona-def'
export type { PersonaFrontmatter, ParsedPersonaDef, PersonaModel, PersonaEffort } from './agents/persona-def'
```

---

### A2 — IPC: `settings:loadPersonaDef` + `settings:savePersonaDef`

`packages/gui/electron/main.ts` — `// ── Settings IPC` 블록 하단에 추가:

```ts
// ── Persona def IPC (T-P4-148) ─────────────────────────────────────────────────

interface PersonaDefResult {
  ok: boolean
  frontmatter?: PersonaFrontmatter
  error?: string
}

ipcMain.handle(
  'settings:loadPersonaDef',
  (_event, personaId: string): PersonaDefResult => {
    try {
      const realPath = resolveAgentFilePath(personaId)
      const content = fs.readFileSync(realPath, 'utf-8')
      const { frontmatter } = parsePersonaDef(content)
      return { ok: true, frontmatter }
    } catch (e: any) {
      return { ok: false, error: e?.message ?? 'unknown' }
    }
  },
)

ipcMain.handle(
  'settings:savePersonaDef',
  (
    _event,
    personaId: string,
    patch: Partial<PersonaFrontmatter>,
  ): { ok: boolean; error?: string } => {
    try {
      savePersonaDef(personaId, patch)
      return { ok: true }
    } catch (e: any) {
      return { ok: false, error: e?.message ?? 'unknown' }
    }
  },
)
```

import 상단에 `parsePersonaDef`, `savePersonaDef`, `resolveAgentFilePath`, `PersonaFrontmatter` 추가.

---

### A3 — IPC: `skills:setPersonaAssignment`

`packages/gui/electron/main.ts` — `skills:list` 핸들러 이후에 추가:

```ts
interface SetPersonaAssignmentResult {
  ok: boolean
  conflictType?: 'path-inferred'   // 경고 — 처리는 됨, UI 에서 warning 표시
  error?: string
}

ipcMain.handle(
  'skills:setPersonaAssignment',
  (
    _event,
    skillId: string,           // SkillEntry.id (skills root 기준 상대 경로)
    personaKey: SkillPersona,
    assigned: boolean,
  ): SetPersonaAssignmentResult => {
    try {
      const skillsRoot = path.join(os.homedir(), '.claude', 'skills')
      const filePath = path.join(skillsRoot, skillId)
      const content = fs.readFileSync(filePath, 'utf-8')
      const fm = parseSkillFrontmatter(content)

      // 현재 personas 결정
      const inferred = inferPersonasFromPath(filePath)
      const isPathInferred = !fm.personas
      let personas: SkillPersona[] = isPathInferred
        ? inferred
        : (Array.isArray(fm.personas)
            ? fm.personas
            : String(fm.personas).split(',').map((s) => s.trim()).filter(Boolean)
          ).filter((p): p is SkillPersona =>
            p === 'po' || p === 'designer' || p === 'dev' || p === 'qa'
          )

      // assigned toggle
      if (assigned) {
        if (!personas.includes(personaKey)) personas = [...personas, personaKey]
      } else {
        personas = personas.filter((p) => p !== personaKey)
      }

      // frontmatter 에 personas: 명시적으로 기록 (path-inferred → explicit override)
      const newFm = { ...fm, personas: `[${personas.join(', ')}]` }
      const newFmBlock = Object.entries(newFm)
        .map(([k, v]) => `${k}: ${v}`)
        .join('\n')
      // body (--- 이후) 보존
      const bodyStart = content.indexOf('\n---', 3)
      const body = bodyStart >= 0 ? content.slice(bodyStart + 4) : ''
      const newContent = `---\n${newFmBlock}\n---${body}`

      // atomic write
      const tmpPath = `${filePath}.tmp`
      fs.writeFileSync(tmpPath, newContent, 'utf-8')
      fs.renameSync(tmpPath, filePath)

      return {
        ok: true,
        conflictType: isPathInferred ? 'path-inferred' : undefined,
      }
    } catch (e: any) {
      return { ok: false, error: e?.message ?? 'unknown' }
    }
  },
)
```

---

### A4 — Preload: `packages/gui/electron/preload.ts`

settings 블록 끝에 추가:

```ts
loadPersonaDef: (personaId: string): Promise<PersonaDefResult> =>
  ipcRenderer.invoke('settings:loadPersonaDef', personaId),

savePersonaDef: (
  personaId: string,
  patch: Partial<PersonaFrontmatter>,
): Promise<{ ok: boolean; error?: string }> =>
  ipcRenderer.invoke('settings:savePersonaDef', personaId, patch),
```

skills 블록 끝에 추가:

```ts
setPersonaAssignment: (
  skillId: string,
  personaKey: string,
  assigned: boolean,
): Promise<SetPersonaAssignmentResult> =>
  ipcRenderer.invoke('skills:setPersonaAssignment', skillId, personaKey, assigned),
```

---

### A5 — UI: `PersonaDefTab.tsx` 개편

**상단 주석 제거:**
```tsx
// ── Static persona metadata (T-P4-044 dispatch target, Phase 4 preview-only) ─
```
→ `// ── Static persona metadata ─` 로 교체

**새 state:**
```tsx
const [def, setDef]                = useState<PersonaFrontmatter | null>(null)
const [draft, setDraft]            = useState<{ model?: string; effort?: string; description?: string }>({})
const [editing, setEditing]        = useState(false)
const [saving, setSaving]          = useState(false)
const [saveStatus, setSaveStatus]  = useState<'idle' | 'success' | 'error'>('idle')
const [saveError, setSaveError]    = useState<string | null>(null)
const [skills, setSkills]          = useState<SkillEntry[]>([])
```

**useEffect — mount 시 loadPersonaDef + skills:list:**
```tsx
useEffect(() => {
  window.api.loadPersonaDef(meta.id).then((res) => {
    if (res.ok && res.frontmatter) setDef(res.frontmatter)
  })
  window.api.listSkills().then(setSkills)
}, [meta.id])
```

**Header modelBadge → dynamic:**
- `def` 로드 전: 기존 `meta.modelSummary` fallback
- `def` 로드 후: `{def.model ?? meta.modelSummary.split('/')[0].trim()} / {def.default_effort ?? '—'}`

**"SPEC" 섹션 추가 (description + model + effort):**

Edit 모드 전: 정적 표시 (기존 metaRow 스타일)
Edit 모드: `<select>` (model/effort) + `<textarea>` (description)

```
[SPEC 섹션 레이아웃]
─ description │ <표시 or textarea> ─
─ model       │ <표시 or select>   ─
─ effort      │ <표시 or select>   ─
─ (read-only) permissionMode / source ─

[편집 버튼 바]
┌──────────────────────────┐
│  [Edit]  → editing 전     │
│  [Save] [Cancel] → 편집 중 │
└──────────────────────────┘
```

save success: 1.5초 green banner `saveSuccess` 후 `idle`
save error: red banner + `saveError` 메시지

**Skills 섹션 ("ASSIGNED SKILLS"):**
- `skills` 리스트 필터: `s.personas.includes(meta.key)` → assigned, 나머지 → unassigned
- assigned skills 행: 이름 + toggle 버튼 (×)
  - path-inferred (`conflictType === 'path-inferred'`) unassign 시: 아이콘 경고 + tooltip `skillConflictWarning`
- 하단 "+" 버튼 → unassigned skill 목록 드롭다운 (간단한 리스트, Esc 닫힘)
- toggle 즉시 호출 `window.api.setPersonaAssignment(skillId, meta.key, assigned)`
- 로딩 중 행 opacity 0.5

**스타일 상수 추가:**
```ts
const editBar: React.CSSProperties = {
  display: 'flex', gap: 6, justifyContent: 'flex-end',
  marginTop: 12, paddingTop: 8,
  borderTop: '1px solid #1E1E1E',
}

const btnPrimary: React.CSSProperties = {
  fontSize: 11, padding: '4px 12px',
  background: '#2A2A2A', color: '#E0E0E0',
  border: '1px solid #3A3A3A', borderRadius: 4,
  cursor: 'pointer',
}

const btnSecondary: React.CSSProperties = {
  ...btnPrimary,
  background: 'transparent', color: '#707070',
}

const inputField: React.CSSProperties = {
  fontSize: 11, color: '#E0E0E0',
  background: '#1A1A1A',
  border: '1px solid #2E2E2E', borderRadius: 3,
  padding: '3px 6px', width: '100%',
  fontFamily: 'inherit',
}

const selectField: React.CSSProperties = {
  ...inputField, cursor: 'pointer',
}

const successBanner: React.CSSProperties = {
  fontSize: 10, color: '#6EE7A0',
  padding: '4px 0', marginTop: 4,
}

const errorBanner: React.CSSProperties = {
  fontSize: 10, color: '#E04040',
  padding: '4px 0', marginTop: 4,
}
```

---

### A6 — i18n: `ko.json` + `en.json`

`workspace.team.personaDef` 섹션 교체 (기존 `previewNote` 제거):

| key | ko | en |
|:--|:--|:--|
| `editBtn` | `편집` | `Edit` |
| `saveBtn` | `저장` | `Save` |
| `cancelBtn` | `취소` | `Cancel` |
| `modelLabel` | `model` | `model` |
| `effortLabel` | `기본 effort` | `default effort` |
| `descriptionLabel` | `role` | `role` |
| `specSection` | `SPEC` | `SPEC` |
| `skillsSection` | `할당된 SKILLS` | `ASSIGNED SKILLS` |
| `skillAssignAdd` | `스킬 추가…` | `Add skill…` |
| `saveSuccess` | `저장됨` | `Saved` |
| `saveError` | `저장 실패: {{error}}` | `Save failed: {{error}}` |
| `skillConflictWarning` | `경로 추론 할당 — 재시작 후에도 유지됨` | `Path-inferred — may persist after restart` |
| `effortNotSet` | `미설정 (PO 기본값)` | `not set (PO default)` |

총 13개 신규 키, 1개 제거 (`previewNote`).

---

### A7 — Build

```bash
pnpm -F core build && pnpm -F gui build
# TypeScript error 0
```

---

## §Out of scope

- `permissionMode` / `tools:` / `color:` 편집
- 페르소나 body 전체 텍스트 에디터
- 신규 persona 추가 (4 + 1 고정)
- Skills 파일 자체 추가·제거
- `default_effort` 필드 실제 dispatch 연동 (PO 는 여전히 per-call override 가능 — 이 필드는 hint 목적)

---

## §QA scope

| Field | Value |
|:--|:--|
| **QA invoke** | `manual smoke only` |
| **test target** | `PersonaDefTab` — Edit mode: spec fields + skills assignment |
| **사용자 dogfood** | (1) 팀 탭 → 페르소나 클릭 → SPEC 섹션 표시 확인. (2) Edit 클릭 → model select 변경 → Save → 재로드 후 반영. (3) skill × → unassign → skills:list 재호출 후 미표시. (4) path-inferred skill unassign → 경고 아이콘 확인. |
| **regression check** | `skills:list` IPC 응답 형태 변경 없음. `settings:loadRules` / `settings:saveRules` 영향 없음. 심링크 원본 파일 write 후 `~/.claude/agents/` 심링크 파손 여부 확인. |

---

## §Open Questions

| id | 질문 | 기본값 |
|:--|:--|:--|
| OQ-A | `default_effort` 필드를 PO dispatch 시 자동 참조? 현재는 hint 목적만. | hint-only (PO override 항상 우선) |
| OQ-B | `pdt-po.md` 는 `packages/core/agents/pdt-po.md` (단일, 비variant). `realpathSync` 실패 시 fallback 으로 원본 경로 사용 — 이 경우 write 가능 여부. | fallback 허용 (main.ts 내 coreDir 경로) |
