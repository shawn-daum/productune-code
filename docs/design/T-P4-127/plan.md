# T-P4-127 — SkillMatrix header labels + Persona role i18n unification

**Author:** pdt-designer · **Date:** 2026-05-19 · **Complexity:** L1

---

## §Problem

Two cosmetic consistency bugs in the Team sidebar and Skill Matrix tab:

1. **SkillMatrix column headers** — persona columns render single initials `P / D / D / Q`.
   Designer and Dev both show `D`, making them indistinguishable.
2. **Persona panel role descriptions** — `ko.json` has mixed Korean/English:
   `designer.role = "Plan, Design"` and `qa.role = "Test, Validation"` are English inside
   a Korean locale file. User sees inconsistent text when language = 한글.

---

## §Current state

### SkillMatrixTab.tsx — lines 22–23

```ts
const PERSONA_INITIALS: Record<PersonaCol, string> = {
  po: 'P', designer: 'D', dev: 'D', qa: 'Q'
}
```

Column style (`thPersona`): `width: 40` — too narrow for 3-char labels.

Render (thead, lines 211–215):
```tsx
<th key={p} style={thPersona}>
  <span style={{ ...personaDot, background: PERSONA_COLORS[p] }} />
  {PERSONA_INITIALS[p]}
</th>
```

### locales/ko.json — workspace.team.persona (lines 343–360)

```json
"po":       { "name": "PO",       "role": "프로덕트 오너"  },  ← Korean ✓
"designer": { "name": "Designer", "role": "Plan, Design"   },  ← English ✗
"developer":{ "name": "Developer","role": "코드 작성"       },  ← Korean ✓
"qa":       { "name": "QA",       "role": "Test, Validation"},  ← English ✗
```

### locales/en.json — workspace.team.persona (lines 343–360)

```json
"po":       { "name": "PO",       "role": "Product owner"  },  ← OK
"designer": { "name": "Designer", "role": "Plan, Design"   },  ← OK
"developer":{ "name": "Developer","role": "Code authoring" },  ← OK
"qa":       { "name": "QA",       "role": "Test, Validation"},  ← OK
```

`en.json` requires **no changes**.

---

## §Fix 1 — SkillMatrix column headers

### 1a. PERSONA_INITIALS

```diff
-const PERSONA_INITIALS: Record<PersonaCol, string> = { po: 'P', designer: 'D', dev: 'D', qa: 'Q' }
+const PERSONA_INITIALS: Record<PersonaCol, string> = { po: 'PO', designer: 'Des', dev: 'Dev', qa: 'QA' }
```

Labels are persona abbreviations — language-agnostic, no i18n key needed.

### 1b. thPersona column width

```diff
 const thPersona: React.CSSProperties = {
-  width: 40,
+  width: 52,
   textAlign: 'center',
   ...
 }
```

`tdCheck` matches `thPersona` width — update in tandem:

```diff
 const tdCheck: React.CSSProperties = {
-  width: 40,
+  width: 52,
   textAlign: 'center',
   ...
 }
```

---

## §Fix 2 — ko.json persona role unification

Two lines in `packages/gui/src/locales/ko.json`:

```diff
 "designer": {
   "name": "Designer",
-  "role": "Plan, Design"
+  "role": "기획 · 디자인"
 },
 ...
 "qa": {
   "name": "QA",
-  "role": "Test, Validation"
+  "role": "테스트 · 검증"
 }
```

---

## §Files to touch

| File | Change |
|:--|:--|
| `packages/gui/src/components/workspace/main/panes/SkillMatrixTab.tsx` | `PERSONA_INITIALS` + `thPersona.width` + `tdCheck.width` |
| `packages/gui/src/locales/ko.json` | `designer.role` + `qa.role` values |

`en.json` — no change. `TeamPanel.tsx` — no change (already uses i18n keys).

---

## §Out of scope

- Filter chip labels in toolbar (currently renders raw `{p}` key — separate concern)
- i18n-keying the column header abbreviations (unnecessary: abbreviations are lang-neutral)
- `en.json` persona descriptions (already consistent)

---

## §QA scope

| Field | Value |
|:--|:--|
| **QA invoke** | `manual smoke only` |
| **test target** | `SkillMatrixTab` column headers + `TeamPanel` persona role text (lang=ko) |
| **사용자 dogfood** | 언어 = 한글 상태에서 Team 사이드바 열어 Designer/QA role 텍스트 확인; Skill Matrix 탭에서 PO/Des/Dev/QA 헤더 확인 |
| **regression check** | `thPersona` / `tdCheck` width 변경 → 기존 row-column 정렬 틀어짐 없는지 시각 확인 |
