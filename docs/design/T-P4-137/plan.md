# T-P4-137 · SkillMatrix: dynamic count + sort by overlap
**Slug**: skill-matrix-count-sort
**Date**: 2026-05-19
**Round**: phase4-r4
**Artifact**: plan (1/1)
**Status**: ready

---

## §1 Sources — verified before plan emit

### 1.1 Skill count source

| Location | Finding |
|:--|:--|
| `TeamPanel.tsx:42` | `const SKILLS_TOTAL = 11` — static, never updated |
| `TeamPanel.tsx:222` | `{t('workspace.team.section.skillsCount', { count: SKILLS_TOTAL })}` — renders the badge |
| `SkillMatrixTab.tsx:46` | `window.api.listSkills()` IPC already called on mount; returns live `SkillEntry[]` |
| `preload.ts:412` | `listSkills: () => ipcRenderer.invoke('skills:list')` — same IPC name |
| **Fix**: replace static const with dynamic `api.listSkills()` call in TeamPanel | |

### 1.2 Current sort order

`SkillMatrixTab.tsx:71–78` — `filteredSkills` useMemo applies search/filter predicates only. **Zero sort applied.** Render order = filesystem glob traversal order from `collectMdFiles` (depth-first alphabetical within each dir).

### 1.3 Persona mapping source

`main.ts:1389–1398` — `inferPersonasFromPath()` fallback fires for ALL phuryn skills (confirmed: **zero** phuryn SKILL.md files have explicit `personas:` frontmatter). Blanket rule: `if (filePath.includes('phuryn/pm-')) return ['po', 'designer']`.

mattpocock `productivity/` → `['po', 'designer', 'dev', 'qa']`.
mattpocock `engineering/` → `['dev']`.
mattpocock `misc/` → `['dev']`.

---

## §2 A — Dynamic skill count in TeamPanel

### Problem
`SKILLS_TOTAL = 11` drifts from reality. Post T-P4-124 the actual live count is whatever `listSkills()` returns (archive mv may or may not have run). Static constant = always stale.

### Fix spec

**Remove** (L40–42):
```ts
// ── Skills total (static) ────────────────────────────────────────────────────
const SKILLS_TOTAL = 11
```

**Add** inside `TeamPanel` component body (near top, after existing state declarations):
```ts
const [skillsTotal, setSkillsTotal] = useState<number | null>(null)

useEffect(() => {
  ;(window as any).api.listSkills()
    .then((entries: import('../../lib/types').SkillEntry[]) => setSkillsTotal(entries.length))
    .catch(() => setSkillsTotal(null))
}, [])
```

**Update badge** (L222):
```tsx
// Before:
{t('workspace.team.section.skillsCount', { count: SKILLS_TOTAL })}

// After:
{skillsTotal !== null
  ? t('workspace.team.section.skillsCount', { count: skillsTotal })
  : <span style={{ color: '#3A3A3A' }}>?</span>
}
```

**Loading state**: `null` → renders `?` in muted grey (`#3A3A3A`) until IPC resolves (~50ms on local FS, imperceptible).

**No localStorage cache**: `listSkills` is a synchronous FS scan via IPC; latency is < 100ms. Cache adds complexity for no user benefit.

**Type import**: `SkillEntry` is already imported in SkillMatrixTab. In TeamPanel, use inline `import()` in the `.then()` callback type annotation (avoids adding a new top-level import for a single type parameter). Alternative: `unknown[]` cast on entries and use `.length` only — simpler since we only need the count.

**Simpler alternative** (recommended — avoids the import dance):
```ts
useEffect(() => {
  ;(window as any).api.listSkills()
    .then((entries: unknown[]) => setSkillsTotal(entries.length))
    .catch(() => setSkillsTotal(null))
}, [])
```

---

## §3 B — Sort by persona-overlap count (descending)

### Target

`SkillMatrixTab.tsx:71–78` — `filteredSkills` useMemo.

### Sort key

`skill.personas.length` descending → skills checked in all 4 columns float to top; 0-column skills sink to bottom.
Tiebreak: `a.name.localeCompare(b.name)` (alphabetical within same overlap count — stable, predictable).

### Diff

```ts
// Before (line 78 return):
return true

// After — sort added inside useMemo return:
  return true
})
// ↓ add this line
.sort((a, b) => b.personas.length - a.personas.length || a.name.localeCompare(b.name))
```

Full useMemo block after change:
```ts
const filteredSkills = useMemo(() => {
  return skills.filter((skill) => {
    if (search && !skill.id.toLowerCase().includes(search.toLowerCase()) &&
                  !skill.name.toLowerCase().includes(search.toLowerCase())) return false
    if (assignedOnly && skill.personas.length === 0) return false
    if (personaFilter.size > 0 && !([...personaFilter].some((p) => skill.personas.includes(p)))) return false
    return true
  }).sort((a, b) => b.personas.length - a.personas.length || a.name.localeCompare(b.name))
}, [skills, search, personaFilter, assignedOnly])
```

**Expected result after sort:**
1. Top tier — 4-persona skills (mattpocock `productivity/*` — caveman, grill-me, write-a-skill, handoff)
2. Mid tier — 2-persona skills (all phuryn `pm-*` skills → po + designer; alphabetical within)
3. Lower tier — 1-persona skills (mattpocock `engineering/*`, `misc/*` → dev only)
4. Bottom — 0-persona skills (if any survive — skills with no path match and no frontmatter)

---

## §4 Audit findings — PO·Designer overlap analysis

> **These are findings only. No code change in this ticket.** Persona mapping fix → separate follow-up ticket (OQ gate with user).

### Root cause

`inferPersonasFromPath` (main.ts:1396): `if (filePath.includes('phuryn/pm-')) return ['po', 'designer']` — blanket assignment for ALL 7 phuryn packs.

No phuryn SKILL.md has explicit `personas:` frontmatter (confirmed via grep: zero matches). Therefore all phuryn skills display both PO + Designer checkmarks regardless of actual relevance.

### Per-pack assessment

| Pack | Surviving skills | po+designer appropriate? | Recommendation |
|:--|:--|:--|:--|
| `pm-product-discovery` | user-research, jtbd, problem-statement, etc. | ✅ Yes — discovery is co-owned | keep `['po', 'designer']` |
| `pm-product-strategy` | lean-canvas, product-vision, value-proposition | ✅ Yes — designer uses in PRD clarity loop | keep `['po', 'designer']` |
| `pm-marketing-growth` | north-star-metric, value-prop-statements | ✅ Yes — designer uses in PRD loop | keep `['po', 'designer']` |
| `pm-go-to-market` | ideal-customer-profile, gtm-strategy | ⚠️ Borderline — ICP useful for UX targeting, gtm-strategy less so | keep `['po', 'designer']` tentatively; user may prefer `['po']` |
| `pm-market-research` | competitor-analysis, customer-journey-map, market-segments, market-sizing, sentiment-analysis, user-personas, user-segmentation | ⚠️ Mixed — `customer-journey-map` + `user-personas` = designer; rest = PO/analyst | split: designer on 2, po-only on 5 |
| `pm-data-analytics` | ab-test-analysis, cohort-analysis, sql-queries | ❌ No — data/SQL analysis is PO/analyst domain, not UX design | `['po']` only |
| `pm-execution` | wwas | ❌ No — retrospective analysis is PO domain | `['po']` only |

### Proposed fix to `inferPersonasFromPath` (for follow-up ticket)

```ts
// Replace single phuryn/pm-* rule with granular pack rules:
if (filePath.includes('phuryn/pm-data-analytics/')) return ['po']
if (filePath.includes('phuryn/pm-market-research/skills/customer-journey-map/')) return ['po', 'designer']
if (filePath.includes('phuryn/pm-market-research/skills/user-personas/')) return ['po', 'designer']
if (filePath.includes('phuryn/pm-market-research/')) return ['po']
if (filePath.includes('phuryn/pm-execution/')) return ['po']
if (filePath.includes('phuryn/pm-')) return ['po', 'designer']  // discovery, strategy, gtm, marketing-growth
```

**Impact**: removes ~11 false designer assignments (3 data-analytics + 5 market-research + 1 execution + 2 gtm if user agrees).

> OQ for user before implementing: confirm `pm-go-to-market` stays `po+designer` or drops to `po` only.

---

## §Out of scope

- Fixing `inferPersonasFromPath` persona assignments — audit findings only; follow-up ticket needed.
- Adding a `data-testid` attribute to the skills badge (QA smell test is sufficient).
- Updating i18n key `workspace.team.section.skillsCount` — no change to the key, only the `count` value becomes dynamic.
- `localStorage` cache for skill count — unnecessary for local IPC latency.

## §QA scope

| Field | Value |
|:--|:--|
| **QA invoke** | `manual smoke only` |
| **test target** | `TeamPanel` skills badge + `SkillMatrixTab` sort order |
| **사용자 dogfood** | (1) Team sidebar → Skills 배지 숫자가 실제 SkillMatrixTab row count 와 일치 확인. (2) SkillMatrixTab 열 때 4-persona skills (caveman 등) 최상단, 1-persona (dev-only engineering skills) 최하단 확인. (3) 검색어 입력 후에도 sort 유지 확인. |
| **regression check** | TeamPanel MCP servers section + persona active dot — 신규 useEffect 가 기존 effects 간섭 없음 확인. `filteredSkills` filter logic (search/personaFilter/assignedOnly) — sort chain 후 동일 필터 동작 확인. |
