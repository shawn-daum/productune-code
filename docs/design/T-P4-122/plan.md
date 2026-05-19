---
ticket_id: T-P4-122
title: "SkillMatrixTab — dedup supplementary docs + hidden dir filter"
type: impl
status: planned
assignee: pdt-developer
estimated_complexity: L1
model: sonnet
effort: low
created_at: 2026-05-18
---

# Plan — T-P4-122 SkillMatrixTab dedup

> L1 trivial. 1 file, 2 hunks. No plan-mode overhead needed.

## §1 Root cause

`packages/gui/electron/main.ts` — `skills:list` handler (L1279) calls
`collectMdFiles` (L1225) which **recursively collects every `.md` under
`~/.claude/skills/`**, then emits one `SkillEntry` per file.

Matt Pocock's convention: one skill = one **directory** containing `SKILL.md`
(entry point, has frontmatter `name` + `description`) + optional supplementary
docs (`DEEPENING.md`, `LANGUAGE.md`, `LOGIC.md`, `UI.md`, `AGENT-BRIEF.md`,
`OUT-OF-SCOPE.md`, `domain.md`, `issue-tracker-*.md`, etc. — **no frontmatter**,
just bare markdown). Supplementary docs are reference material for the skill
itself; they are not separate skills.

Two compounding issues:

| # | Problem | Concrete example |
|:--|:--|:--|
| 1 | All supplementary `.md` in a skill directory → individual entries | `improve-codebase-architecture/DEEPENING.md` / `LANGUAGE.md` / `INTERFACE-DESIGN.md` → 3 extra rows, all with `name` fallback = parent dirname `"improve-codebase-architecture"` |
| 2 | Hidden directories traversed | `mattpocock/.out-of-scope/` (3 md files, no frontmatter) → 3 spurious entries with `name` = `".out-of-scope"` |

## §2 Fix — 2 hunks in `packages/gui/electron/main.ts`

### Hunk A — `collectMdFiles` L1234: skip hidden directories

**Before** (L1232–1235):
```typescript
for (const entry of entries) {
  const fullPath = path.join(dir, entry.name)
  if (entry.isDirectory()) {
    collectMdFiles(fullPath, out)
```

**After**:
```typescript
for (const entry of entries) {
  const fullPath = path.join(dir, entry.name)
  if (entry.isDirectory() && !entry.name.startsWith('.')) {
    collectMdFiles(fullPath, out)
```

One character added: `&& !entry.name.startsWith('.')`. Skips `.out-of-scope/`,
`.git/`, `.DS_Store/` etc. automatically.

---

### Hunk B — `skills:list` handler L1286–1301: early-continue on missing frontmatter

**Before** (L1292–1301):
```typescript
const fm = parseSkillFrontmatter(content)

const id = filePath.slice(skillsRoot.length + 1).replace(/\\/g, '/')

const name = (fm.name as string | undefined)?.trim() ||
  path.basename(path.dirname(filePath))

const description = (fm.description as string | undefined)?.trim() || ''
```

**After**:
```typescript
const fm = parseSkillFrontmatter(content)

// Skip supplementary docs — only skill entry files carry both name + description.
const fmName = (fm.name as string | undefined)?.trim()
const fmDescription = (fm.description as string | undefined)?.trim()
if (!fmName || !fmDescription) continue

const id = filePath.slice(skillsRoot.length + 1).replace(/\\/g, '/')

const name = fmName
const description = fmDescription
```

Removes the `path.basename(path.dirname(filePath))` name-fallback (was the
cause of all duplicated parent-dir names). Now `name` and `description` are only
set when both are present in frontmatter — any file without both is silently
skipped.

**Choice rationale — frontmatter filter over `SKILL.md` filename filter:**

Frontmatter `name + description` present ↔ "this file is a skill entry" is
Matt Pocock-convention-independent. A future skill with a non-`SKILL.md` entry
filename (or a third-party skill pack using `index.md`) still works. The filename
approach would need updating every time a new convention appears.

## §3 Expected outcome (entry counts)

Before fix (observed):
- `improve-codebase-architecture`: 4 entries (SKILL + DEEPENING + LANGUAGE + INTERFACE-DESIGN)
- `prototype`: 3 entries (SKILL + LOGIC + UI)
- `setup-matt-pocock-skills`: 5 entries (SKILL + domain + issue-tracker-* × 3 + triage-labels)
- `triage`: 3 entries (SKILL + AGENT-BRIEF + OUT-OF-SCOPE)
- `tdd`: 6 entries (SKILL + 5 supplementary)
- `grill-with-docs`: 3 entries (SKILL + ADR-FORMAT + CONTEXT-FORMAT)
- `.out-of-scope/`: 3 entries (question-limits + mainstream-issue-trackers-only + setup-skill-verify-mode)
- Various `README.md` / `CONTEXT.md` / `CLAUDE.md` at root: 3+ entries

After fix:
- Every skill directory → exactly **1 entry** (its `SKILL.md`)
- `.out-of-scope/` → **0 entries** (hidden dir skipped)
- Root-level meta files (`CONTEXT.md`, `CLAUDE.md`, `README.md`) → **0 entries** (no frontmatter `name+description`)

## §4 Self-verify checklist (for developer)

After change:

1. `npm run typecheck` (or `tsc --noEmit`) in `packages/gui` — must pass.
2. In Electron dev mode: open Skills Matrix tab → verify `improve-codebase-architecture` appears exactly once with correct description.
3. Verify `prototype`, `setup-matt-pocock-skills`, `triage`, `tdd`, `grill-with-docs` each appear exactly once.
4. Verify zero rows whose name is `.out-of-scope` or equals a parent dir name (e.g. `triage`, `prototype` as plain string without description).

## §Out of scope

- SkillMatrixTab styling / column changes.
- Frontmatter schema extension (adding `personas:` to skills that lack it).
- `phuryn/` or other skill packs — same fix applies automatically.
- Sorting / grouping skills by persona in UI.

## §QA scope

| Field | Value |
|:--|:--|
| **QA invoke** | `manual smoke only` |
| **test target** | `skills:list` IPC handler — `collectMdFiles` return size + SkillMatrixTab row count |
| **사용자 dogfood** | SkillMatrixTab 열어서 `improve-codebase-architecture` 1회만 출현 / `.out-of-scope` 행 없음 확인 |
| **regression check** | `packages/gui/electron/main.ts` — `skills:list` handler; no other handler touched |
